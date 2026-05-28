/**
 * 管理端真实指标聚合（仅基于业务表与 users.json）
 */
const analytics = require('./analytics-engine');
const dataDb = require('./admin-data-db');
const cache = require('./admin-cache');

const RISK_HIGH_PATTERNS = [/刑事|诈骗|拘留|逮捕|重伤|死亡|高利贷|非法集资|黑社会|威胁|暴力/];
const RISK_SENSITIVE = [/未成年人|家暴|性侵|自杀|精神病人|国家安全/];

function dayStr(d) {
  return d.toISOString().slice(0, 10);
}

function parseRange(range) {
  const today = new Date();
  const end = dayStr(today);
  if (range === 'today') {
    return { from: end, to: end, days: 1 };
  }
  if (range === 'month') {
    const fromD = new Date(today);
    fromD.setDate(fromD.getDate() - 29);
    return { from: dayStr(fromD), to: end, days: 30 };
  }
  if (range === 'custom' && range.from && range.to) {
    return { from: range.from, to: range.to, days: 7 };
  }
  const fromD = new Date(today);
  fromD.setDate(fromD.getDate() - 6);
  return { from: dayStr(fromD), to: end, days: 7 };
}

function loadUsers(loadPlatformUsers) {
  return (loadPlatformUsers() || []).filter(function (u) {
    return (u.userType || 'user') !== 'admin';
  });
}

function countLoginsToday(behaviorLogs, users, today) {
  const set = {};
  behaviorLogs.forEach(function (b) {
    if (String(b.createdAt || '').slice(0, 10) !== today) return;
    if (b.action === 'user_login' || b.action === 'login') {
      if (b.userId) set[b.userId] = 1;
    }
  });
  users.forEach(function (u) {
    const la = u.lastLoginAt || u.lastActiveAt;
    if (la && String(la).slice(0, 10) === today) set[u.id] = 1;
  });
  return Object.keys(set).length;
}

function newUsersInRange(users, from, to) {
  return users.filter(function (u) {
    const c = String(u.createdAt || '').slice(0, 10);
    return c >= from && c <= to;
  }).length;
}

function avgApiResponseMs(sinceIso) {
  const logs = dataDb.listMonitor({ since: sinceIso });
  const api = logs.filter(function (r) {
    return r.type === 'api' && r.durationMs > 0 && r.statusCode < 500;
  });
  if (!api.length) return 0;
  const sum = api.reduce(function (s, r) { return s + r.durationMs; }, 0);
  return Math.round(sum / api.length);
}

function ocrStatsForDay(day) {
  const list = dataDb.readOcrRecords();
  const dayList = list.filter(function (r) {
    return String(r.createdAt || '').slice(0, 10) === day;
  });
  const success = dayList.filter(function (r) { return r.status === 'success'; });
  const failed = dayList.filter(function (r) { return r.status === 'failed'; });
  const dur = dayList.filter(function (r) { return (r.durationMs || 0) > 0; });
  const avgMs = dur.length
    ? Math.round(dur.reduce(function (s, r) { return s + r.durationMs; }, 0) / dur.length)
    : 0;
  const rate = dayList.length
    ? Math.round((success.length / dayList.length) * 100)
    : 0;
  return {
    todayCount: dayList.length,
    successRate: rate,
    avgDurationMs: avgMs,
    failedCount: failed.length,
    totalCount: list.length
  };
}

function detectAndLogRisk(text, ctx) {
  const t = String(text || '');
  if (!t || t.length < 4) return null;
  let level = null;
  let keywords = [];
  RISK_HIGH_PATTERNS.forEach(function (re) {
    if (re.test(t)) {
      level = 'high';
      keywords.push(re.source.replace(/\\/g, '').slice(0, 12));
    }
  });
  RISK_SENSITIVE.forEach(function (re) {
    if (re.test(t)) {
      level = level || 'high';
      keywords.push('敏感议题');
    }
  });
  if (!level && /异常|频繁|批量|恶意/.test(t + (ctx.action || ''))) {
    level = 'mid';
  }
  if (!level) return null;
  return dataDb.appendRiskWarning({
    userId: ctx.userId || 'guest',
    level: level,
    title: String(t).slice(0, 80),
    source: ctx.source || 'auto',
    keywords: keywords,
    relatedId: ctx.relatedId || ''
  });
}

function buildStats(loadPlatformUsers, wsConnections) {
  const cacheKey = cache.key(['stats', dayStr(new Date()), wsConnections || 0]);
  return cache.wrap(function () {
    const today = dayStr(new Date());
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 6);
    const fromWeek = dayStr(weekAgo);
    const users = loadUsers(loadPlatformUsers);
    const behavior = dataDb.listBehavior({ limit: 5000 });
    const consultToday = dataDb.listConsult({ day: today }).length;
    const faguiToday = behavior.filter(function (b) {
      return String(b.createdAt || '').slice(0, 10) === today &&
        (b.action === 'regulation_search' || b.action === 'ai_fagui');
    }).length;
    const docToday = dataDb.listDocumentGenerate({ day: today }).length;
    const ocr = ocrStatsForDay(today);
    const riskToday = dataDb.listRiskWarnings({ day: today });
    const riskHigh = riskToday.filter(function (r) { return r.level === 'high'; }).length;
    const sinceHour = new Date(Date.now() - 3600000).toISOString();
    const avgMs = avgApiResponseMs(sinceHour) || avgApiResponseMs(
      new Date(Date.now() - 86400000).toISOString()
    );

    return {
      onlineUsers: dataDb.countOnlineUsers(wsConnections),
      todayActive: countLoginsToday(behavior, users, today),
      newUsersWeek: newUsersInRange(users, fromWeek, today),
      consultToday: consultToday,
      faguiToday: faguiToday,
      documentToday: docToday,
      wenshiToday: docToday,
      ocrToday: ocr.todayCount,
      ocrSuccessRate: ocr.successRate,
      ocrAvgDurationMs: ocr.avgDurationMs,
      ocrFailedToday: ocr.failedCount,
      riskAlerts: riskToday.length,
      riskHigh: riskHigh,
      avgResponseMs: avgMs,
      systemStatus: avgMs > 0 && avgMs < 3000 ? 'healthy' : (avgMs === 0 ? 'healthy' : 'degraded'),
      totalUsers: users.length,
      updatedAt: new Date().toISOString()
    };
  }, cacheKey, 25000);
}

function seriesByDay(getter, days, fromDate) {
  const labels = [];
  const values = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = fromDate ? new Date(fromDate) : new Date();
    if (!fromDate) d.setDate(d.getDate() - i);
    else {
      d.setTime(new Date(fromDate).getTime());
      d.setDate(d.getDate() + (days - 1 - i));
    }
    const key = dayStr(d);
    labels.push(key.slice(5));
    values.push(getter(key));
  }
  return { labels: labels, values: values };
}

function chartSeries(range, loadPlatformUsers) {
  const r = parseRange(range);
  const cacheKey = cache.key(['charts', r.from, r.to]);
  return cache.wrap(function () {
    const consult = [];
    const ocr = [];
    const documents = [];
    const labels = [];
    const d0 = new Date(r.from + 'T00:00:00');
    const d1 = new Date(r.to + 'T00:00:00');
    for (let t = d0.getTime(); t <= d1.getTime(); t += 86400000) {
      const key = dayStr(new Date(t));
      labels.push(key.slice(5));
      consult.push(dataDb.listConsult({ day: key }).length);
      ocr.push(dataDb.readOcrRecords().filter(function (o) {
        return String(o.createdAt || '').slice(0, 10) === key;
      }).length);
      documents.push(dataDb.listDocumentGenerate({ day: key }).length);
    }
    const users = loadUsers(loadPlatformUsers);
    const growthValues = [];
    const riskValues = [];
    for (let t = d0.getTime(); t <= d1.getTime(); t += 86400000) {
      const key = dayStr(new Date(t));
      growthValues.push(users.filter(function (u) {
        return String(u.createdAt || '').slice(0, 10) === key;
      }).length);
      riskValues.push(dataDb.listRiskWarnings({ day: key }).length);
    }

    return {
      labels: labels,
      consult: consult,
      ocr: ocr,
      documents: documents,
      userGrowth: { labels: labels.slice(), values: growthValues },
      riskTrend: { labels: labels.slice(), values: riskValues },
      range: r
    };
  }, cacheKey, 55000);
}

function categoryBreakdownFromConsult() {
  const list = dataDb.listConsult({});
  const cats = {};
  list.forEach(function (c) {
    const id = c.category || 'other';
    cats[id] = (cats[id] || 0) + 1;
  });
  return Object.keys(cats).map(function (k) {
    return { name: k, label: analytics.categoryLabel(k), value: cats[k] };
  }).sort(function (a, b) { return b.value - a.value; });
}

function keywordCloudFromData(limit) {
  const freq = {};
  dataDb.listConsult({}).forEach(function (c) {
    (c.keywords || []).forEach(function (k) {
      if (k && k.length >= 2) freq[k] = (freq[k] || 0) + 1;
    });
    const q = String(c.question || '');
    (q.match(/[\u4e00-\u9fa5]{2,8}/g) || []).forEach(function (w) {
      if (w.length >= 2) freq[w] = (freq[w] || 0) + 1;
    });
  });
  return Object.keys(freq)
    .sort(function (a, b) { return freq[b] - freq[a]; })
    .slice(0, limit || 36)
    .map(function (k) { return { name: k, value: freq[k] }; });
}

function hourlyHeatmap(behavior) {
  const hours = [];
  for (let h = 0; h < 24; h++) hours.push(0);
  (behavior || dataDb.listBehavior({ limit: 8000 })).forEach(function (b) {
    const d = new Date(b.createdAt);
    if (!isNaN(d.getTime())) hours[d.getHours()]++;
  });
  return hours;
}

function moduleUsageFromBehavior() {
  const labels = {
    consult: '法律咨询',
    case: '案件分析',
    document: '文书生成',
    regulation: '法规检索',
    ocr: 'OCR识别',
    pufa: '普法学习',
    page: '页面访问',
    auth: '用户认证',
    upload: '文件上传',
    system: '系统'
  };
  const map = {};
  dataDb.listBehavior({ limit: 8000 }).forEach(function (b) {
    const m = b.module || 'system';
    map[m] = (map[m] || 0) + 1;
  });
  return Object.keys(map)
    .sort(function (a, b) { return map[b] - map[a]; })
    .slice(0, 10)
    .map(function (k) {
      return { module: k, label: labels[k] || k, value: map[k] };
    });
}

function riskBreakdownFromLogs() {
  const r = { low: 0, mid: 0, high: 0 };
  dataDb.listRiskWarnings({ limit: 5000 }).forEach(function (row) {
    const lv = row.level || 'mid';
    if (r[lv] != null) r[lv]++;
    else r.mid++;
  });
  return [
    { name: 'low', label: '低风险', value: r.low },
    { name: 'mid', label: '中风险', value: r.mid },
    { name: 'high', label: '高风险', value: r.high }
  ];
}

function funnelFromTables() {
  const consult = dataDb.listConsult({}).length;
  const reg = dataDb.listBehavior({ limit: 8000 }).filter(function (b) {
    return b.action === 'regulation_search' || b.action === 'ai_fagui';
  }).length;
  const doc = dataDb.listDocumentGenerate({}).length;
  return [
    { name: '法律咨询', value: consult },
    { name: '法规检索', value: reg },
    { name: '文书生成', value: doc }
  ];
}

function dwellFromBehavior() {
  const labels = [];
  const values = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = dayStr(d);
    labels.push(key.slice(5));
    const dayRows = dataDb.listBehavior({ limit: 8000 }).filter(function (b) {
      return String(b.createdAt || '').slice(0, 10) === key && (b.durationMs || 0) > 0;
    });
    const avg = dayRows.length
      ? Math.round(dayRows.reduce(function (s, b) { return s + b.durationMs; }, 0) / dayRows.length / 1000)
      : 0;
    values.push(avg);
  }
  return { labels: labels, values: values };
}

function generateInsights(stats, charts, categories) {
  const insights = [];
  const cats = categories || [];
  if (cats[0] && cats[0].value > 0) {
    insights.push('「' + (cats[0].label || cats[0].name) + '」类咨询累计 ' +
      cats[0].value + ' 次，为当前最高频法律问题类型。');
  }
  if (stats.consultToday > 0) {
    insights.push('今日已完成 ' + stats.consultToday + ' 次法律咨询（数据来自 consult_records）。');
  }
  if (stats.faguiToday > 0) {
    insights.push('今日法规检索 ' + stats.faguiToday + ' 次，检索关键词已写入行为日志。');
  }
  if (stats.ocrToday > 0) {
    var ocrLine = '今日 OCR ' + stats.ocrToday + ' 次';
    if (stats.ocrSuccessRate != null) ocrLine += '，成功率 ' + stats.ocrSuccessRate + '%';
    if (stats.ocrFailedToday > 0) ocrLine += '，失败 ' + stats.ocrFailedToday + ' 次';
    insights.push(ocrLine + '。');
  }
  const heat = hourlyHeatmap();
  let peak = 0;
  let peakH = 0;
  heat.forEach(function (v, i) { if (v > peak) { peak = v; peakH = i; } });
  if (peak > 0) {
    insights.push('全站活跃高峰在 ' + peakH + ':00 时段（共 ' + peak + ' 条行为记录）。');
  }
  if (stats.riskAlerts > 0) {
    insights.push('风险预警库今日新增 ' + stats.riskAlerts + ' 条，其中高风险 ' +
      (stats.riskHigh || 0) + ' 条，请在风险中心复核。');
  }
  if (stats.avgResponseMs > 0) {
    insights.push('近 1 小时 API 平均响应 ' + stats.avgResponseMs + ' ms。');
  }
  const docTypes = {};
  dataDb.listDocumentGenerate({}).forEach(function (d) {
    const t = d.docType || '其他';
    docTypes[t] = (docTypes[t] || 0) + 1;
  });
  const topDoc = Object.keys(docTypes).sort(function (a, b) {
    return docTypes[b] - docTypes[a];
  })[0];
  if (topDoc) {
    insights.push('热门文书类型：「' + topDoc + '」（累计 ' + docTypes[topDoc] + ' 份）。');
  }
  return insights.length
    ? insights
    : ['暂无足够真实业务数据，请在前台完成登录、咨询、检索或 OCR 后查看分析。'];
}

function userPortrait(stats, categories, moduleUsage) {
  const cats = categories || categoryBreakdownFromConsult();
  const usage = moduleUsage || moduleUsageFromBehavior();
  const heat = hourlyHeatmap();
  let peakH = 0;
  let peak = 0;
  heat.forEach(function (v, i) { if (v > peak) { peak = v; peakH = i; } });
  return {
    topCategory: cats[0] ? cats[0].label : '—',
    peakHour: peak > 0 ? (peakH + ':00') : '—',
    topModule: usage[0] ? usage[0].label : '—',
    riskLevel: (stats.riskHigh || 0) > 3 ? '偏高' : ((stats.riskAlerts || 0) > 0 ? '关注' : '平稳'),
    activeScore: Math.min(100, (stats.todayActive || 0) * 5 + (stats.consultToday || 0) * 2)
  };
}

function behaviorFeed(limit) {
  return dataDb.listBehavior({ limit: limit || 40 }).map(function (b) {
    return {
      id: b.id,
      user: b.userName || b.userId || '用户',
      userId: b.userId,
      time: b.createdAt,
      action: b.action,
      actionLabel: behaviorActionLabel(b.action),
      ip: b.ip || '—',
      sourcePage: b.sourcePage || '—',
      result: b.result || 'success',
      message: formatBehaviorMessage(b)
    };
  });
}

function behaviorActionLabel(action) {
  const map = {
    user_login: '用户登录',
    user_logout: '退出登录',
    user_register: '用户注册',
    page_visit: '页面访问',
    ocr: 'OCR识别',
    ai_wenshi: '文书生成',
    ai_chat: '法律咨询',
    ai_case: '案件分析',
    ai_fagui: '法规检索',
    regulation_search: '法规检索',
    file_upload: '上传文件',
    admin_login: '管理端登录'
  };
  return map[action] || action;
}

function formatBehaviorMessage(b) {
  const u = b.userName || b.userId || '用户';
  const detail = String(b.detail || '').slice(0, 60);
  return u + ' · ' + behaviorActionLabel(b.action) +
    (detail ? '：' + detail : '') +
    ' [' + (b.result === 'success' ? '成功' : '失败') + ']';
}

module.exports = {
  parseRange: parseRange,
  buildStats: buildStats,
  chartSeries: chartSeries,
  categoryBreakdownFromConsult: categoryBreakdownFromConsult,
  keywordCloudFromData: keywordCloudFromData,
  hourlyHeatmap: hourlyHeatmap,
  moduleUsageFromBehavior: moduleUsageFromBehavior,
  riskBreakdownFromLogs: riskBreakdownFromLogs,
  funnelFromTables: funnelFromTables,
  dwellFromBehavior: dwellFromBehavior,
  generateInsights: generateInsights,
  userPortrait: userPortrait,
  behaviorFeed: behaviorFeed,
  detectAndLogRisk: detectAndLogRisk,
  ocrStatsForDay: ocrStatsForDay,
  avgApiResponseMs: avgApiResponseMs
};

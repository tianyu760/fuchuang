/**
 * 用户画像 · 行为聚合 / 在线状态 / 自动标签
 */
const dataDb = require('./admin-data-db');
const analytics = require('./analytics-engine');

const MODULE_LABEL = {
  consult: '法律咨询',
  document: '文书生成',
  regulation: '法规检索',
  ocr: 'OCR识别',
  pufa: '普法学习',
  page: '页面浏览',
  auth: '账号认证',
  system: '系统'
};

function behaviorForUser(userId, limit) {
  return dataDb.listBehavior({ limit: limit || 800 }).filter(function (b) {
    return b.userId === userId;
  });
}

function consultForUser(userId) {
  return dataDb.listConsult({}).filter(function (c) {
    return c.userId === userId;
  }).sort(function (a, b) {
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
}

function resolveOnlineStatus(lastActiveIso, presenceAt) {
  const ts = Math.max(
    lastActiveIso ? new Date(lastActiveIso).getTime() : 0,
    presenceAt || 0
  );
  if (!ts || isNaN(ts)) {
    return { onlineStatus: 'offline', onlineLabel: '离线' };
  }
  const diff = Date.now() - ts;
  if (diff < 5 * 60 * 1000) {
    return { onlineStatus: 'online', onlineLabel: '在线' };
  }
  if (diff < 30 * 60 * 1000) {
    return { onlineStatus: 'away', onlineLabel: '离开' };
  }
  return { onlineStatus: 'offline', onlineLabel: '离线' };
}

function topKeywords(consults, behavior) {
  const freq = {};
  const bump = function (w) {
    if (!w || w.length < 2) return;
    freq[w] = (freq[w] || 0) + 1;
  };
  consults.forEach(function (c) {
    (c.keywords || []).forEach(bump);
    (String(c.question || '').match(/[\u4e00-\u9fa5]{2,6}/g) || []).forEach(bump);
  });
  behavior.forEach(function (b) {
    const t = String(b.detail || b.action || '');
    (t.match(/[\u4e00-\u9fa5]{2,6}/g) || []).forEach(bump);
  });
  return Object.keys(freq).sort(function (a, b) { return freq[b] - freq[a]; }).slice(0, 8);
}

function modulePreference(behavior) {
  const map = {};
  behavior.forEach(function (b) {
    const m = b.module || 'system';
    map[m] = (map[m] || 0) + 1;
  });
  return Object.keys(map).sort(function (a, b) { return map[b] - map[a]; })
    .slice(0, 6).map(function (k) {
      return { module: k, label: MODULE_LABEL[k] || k, count: map[k] };
    });
}

function activityScore(behavior, consults) {
  const days = {};
  behavior.forEach(function (b) {
    days[String(b.createdAt || '').slice(0, 10)] = 1;
  });
  consults.forEach(function (c) {
    days[String(c.createdAt || '').slice(0, 10)] = 1;
  });
  const activeDays = Object.keys(days).length;
  return Math.min(100, activeDays * 8 + behavior.length + consults.length * 3);
}

function hourlyActivity(behavior) {
  const hours = new Array(24).fill(0);
  behavior.forEach(function (b) {
    const h = parseInt(String(b.createdAt || '').slice(11, 13), 10);
    if (!isNaN(h) && h >= 0 && h < 24) hours[h]++;
  });
  return hours;
}

function categoryDistribution(consults) {
  const cats = {};
  consults.forEach(function (c) {
    const k = c.category || 'other';
    cats[k] = (cats[k] || 0) + 1;
  });
  return Object.keys(cats).map(function (k) {
    return { label: analytics.categoryLabel(k), name: k, value: cats[k] };
  }).sort(function (a, b) { return b.value - a.value; });
}

function mergeAutoTags(base, profile) {
  const tags = (base || []).slice();
  const add = function (t) {
    if (t && tags.indexOf(t) < 0) tags.push(t);
  };
  if (profile.consultCount >= 5) add('高频咨询用户');
  if (profile.activityScore >= 60) add('活跃用户');
  if (profile.riskLevel === 'high') add('潜在高风险');
  if (profile.ocrCount >= 3) add('OCR高频用户');
  if (profile.documentCount >= 3) add('文书依赖用户');
  const hours = profile.hourlyActivity || [];
  const night = hours.slice(22).concat(hours.slice(0, 6)).reduce(function (s, n) { return s + n; }, 0);
  const day = hours.slice(6, 22).reduce(function (s, n) { return s + n; }, 0);
  if (night > day && night >= 3) add('夜间活跃用户');
  return tags.slice(0, 10);
}

function buildSuggestion(profile) {
  const area = profile.topLegalArea && profile.topLegalArea !== '—' ? profile.topLegalArea : '综合法律';
  if (profile.riskLevel === 'high') {
    return '该用户存在高风险咨询记录，建议运营人员重点关注并安排法务复核。';
  }
  if (profile.consultCount >= 3 && area.indexOf('劳动') >= 0) {
    return '该用户近期频繁咨询劳动合同问题，建议推送劳动仲裁与维权普法内容。';
  }
  if (profile.documentCount >= 2) {
    return '该用户对文书生成依赖较高，可推荐模板库与常用文书快捷入口。';
  }
  if (profile.ocrCount >= 2) {
    return '该用户经常使用 OCR 识别，可优化扫描类文档的识别引导流程。';
  }
  return '该用户主要关注「' + area + '」领域，建议持续推送相关法规解读与案例内容。';
}

function buildUserProfile(platformUser, meta, presenceMap) {
  const userId = platformUser.id;
  const behavior = behaviorForUser(userId, 500);
  const consults = consultForUser(userId);
  const presenceAt = presenceMap && presenceMap[userId] ? presenceMap[userId] : 0;

  const lastFromBehavior = behavior[0] && behavior[0].createdAt;
  const lastActiveAt = [meta.lastActiveAt, lastFromBehavior, platformUser.lastLoginAt]
    .filter(Boolean)
    .sort()
    .reverse()[0] || platformUser.createdAt;

  const online = resolveOnlineStatus(lastActiveAt, presenceAt);
  const recentBehavior = behavior.slice(0, 16).map(function (b) {
    return {
      time: b.createdAt,
      action: b.action,
      label: MODULE_LABEL[b.module] || b.action,
      module: b.module,
      detail: String(b.detail || '').slice(0, 80),
      result: b.result
    };
  });

  const riskCounts = { low: 0, mid: 0, high: 0 };
  consults.forEach(function (c) {
    const lv = c.riskLevel || 'mid';
    if (riskCounts[lv] != null) riskCounts[lv]++;
    else riskCounts.mid++;
  });
  let riskLevel = meta.riskLevel || 'low';
  if (riskCounts.high > 0) riskLevel = 'high';
  else if (riskCounts.mid > riskCounts.low) riskLevel = 'mid';

  const cats = {};
  consults.forEach(function (c) {
    const k = c.category || 'other';
    cats[k] = (cats[k] || 0) + 1;
  });
  const topCat = Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; })[0];

  const documentCount = dataDb.listDocumentGenerate({}).filter(function (d) {
    return d.userId === userId;
  }).length;
  const ocrCount = behavior.filter(function (b) {
    return b.module === 'ocr' || b.action === 'ocr' || String(b.action).indexOf('ocr') >= 0;
  }).length;

  const lastIp = (behavior.find(function (b) { return b.ip; }) || {}).ip || '';

  const core = {
    id: userId,
    name: platformUser.name || platformUser.nickname || '用户',
    email: platformUser.email,
    status: platformUser.status === 'banned' || meta.status === 'banned' ? 'banned' : 'active',
    createdAt: platformUser.createdAt,
    lastLoginAt: platformUser.lastLoginAt || lastActiveAt,
    lastActiveAt: lastActiveAt,
    onlineStatus: online.onlineStatus,
    onlineLabel: online.onlineLabel,
    consultCount: consults.length || meta.consultCount || 0,
    riskLevel: riskLevel,
    riskLabel: riskLevel === 'high' ? '高风险' : riskLevel === 'low' ? '低风险' : '中风险',
    tags: meta.tags || [],
    registerSource: meta.registerSource || platformUser.registerSource || '平台注册',
    activityScore: activityScore(behavior, consults),
    preferences: modulePreference(behavior),
    topKeywords: topKeywords(consults, behavior),
    topLegalArea: topCat ? analytics.categoryLabel(topCat) : '—',
    loginLocation: lastIp ? String(lastIp).replace('::ffff:', '') : '—',
    portrait: {
      type: topCat ? analytics.categoryLabel(topCat) + '关注型' : '综合型用户',
      activeLevel: activityScore(behavior, consults) >= 60 ? '高活跃' :
        activityScore(behavior, consults) >= 25 ? '中活跃' : '低活跃',
      peakHours: (function () {
        const h = hourlyActivity(behavior);
        let best = 0;
        for (let i = 1; i < h.length; i++) {
          if (h[i] > h[best]) best = i;
        }
        return h[best] > 0 ? best + '时' : '—';
      })()
    },
    recentBehavior: recentBehavior,
    documentCount: documentCount,
    ocrCount: ocrCount,
    hourlyActivity: hourlyActivity(behavior),
    categoryDistribution: categoryDistribution(consults),
    featureRanking: modulePreference(behavior),
    recentConsults: consults.slice(0, 8).map(function (c) {
      return {
        id: c.id,
        question: String(c.question || '').slice(0, 120),
        category: analytics.categoryLabel(c.category),
        riskLevel: c.riskLevel,
        createdAt: c.createdAt
      };
    }),
    recentDocuments: dataDb.listDocumentGenerate({}).filter(function (d) {
      return d.userId === userId;
    }).slice(0, 6).map(function (d) {
      return {
        title: d.title || d.docType || '文书',
        status: d.status,
        createdAt: d.createdAt
      };
    })
  };

  core.tags = mergeAutoTags(core.tags, core);
  core.suggestion = buildSuggestion(core);
  return core;
}

function enrichUserRow(platformUser, meta, presenceMap) {
  const p = buildUserProfile(platformUser, meta || {}, presenceMap);
  const initial = String(p.name || p.email || 'U').trim()[0] || 'U';
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    status: p.status,
    consultCount: p.consultCount,
    riskLevel: p.riskLevel,
    riskLabel: p.riskLabel,
    lastActiveAt: p.lastActiveAt,
    createdAt: p.createdAt,
    tags: p.tags,
    activityScore: p.activityScore,
    topLegalArea: p.topLegalArea,
    onlineStatus: p.onlineStatus,
    onlineLabel: p.onlineLabel,
    avatarInitial: initial,
    documentCount: p.documentCount,
    ocrCount: p.ocrCount
  };
}

module.exports = {
  buildUserProfile: buildUserProfile,
  enrichUserRow: enrichUserRow,
  resolveOnlineStatus: resolveOnlineStatus
};

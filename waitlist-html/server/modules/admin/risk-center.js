/**
 * 风险预警中心 · 全量业务数据扫描 + 状态闭环
 */
const dataDb = require('./admin-data-db');
const metrics = require('./admin-metrics');
const store = require('./admin-store');
const analytics = require('./analytics-engine');
const logCenter = require('./log-center');
const settingsRuntime = require('./settings-runtime');

const RISK_TYPES = {
  consult: '法律咨询',
  ocr: 'OCR识别',
  document: '文书生成',
  regulation: '法规冲突',
  behavior: '用户行为'
};

const REPEALED_LAW_HINTS = [
  '中华人民共和国合同法',
  '中华人民共和国物权法',
  '中华人民共和国继承法',
  '中华人民共和国民法通则',
  '中华人民共和国婚姻法'
];

const SENSITIVE_RE = /刑事|诈骗|拘留|逮捕|非法集资|高利贷|暴力|威胁|洗钱|传销|黑社会/;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeLevel(lv) {
  const s = String(lv || 'mid').trim();
  if (s === 'medium') return 'mid';
  if (s === 'high' || s === 'mid' || s === 'low') return s;
  return 'mid';
}

function levelToApi(lv) {
  return normalizeLevel(lv) === 'mid' ? 'medium' : normalizeLevel(lv);
}

function filterLevelParam(raw) {
  if (!raw || raw === 'all') return '';
  return normalizeLevel(raw);
}

function toApiRow(rec) {
  const type = rec.riskType || 'consult';
  return {
    id: rec.id,
    title: rec.title || '风险事件',
    type: type,
    level: levelToApi(rec.level),
    sourceModule: rec.sourceModule || RISK_TYPES[type] || '系统',
    description: rec.content || rec.title || '',
    status: rec.status || 'pending',
    createdAt: rec.createdAt || new Date().toISOString(),
    relatedId: rec.relatedId || '',
    userId: rec.userId,
    userName: rec.userName,
    link: rec.link || '',
    riskType: type,
    content: rec.content || '',
    keywords: rec.keywords || []
  };
}

function emptyOverview() {
  return {
    totalRisk: 0,
    highRisk: 0,
    mediumRisk: 0,
    lowRisk: 0,
    unresolvedRisk: 0,
    total: 0,
    pending: 0,
    processing: 0,
    resolved: 0,
    todayNew: 0
  };
}

function levelScore(lv, id) {
  const base = lv === 'high' ? 82 : lv === 'low' ? 28 : 55;
  let h = 0;
  String(id || '').split('').forEach(function (c) { h = (h + c.charCodeAt(0)) % 17; });
  return Math.min(99, base + h);
}

function statusMapFromDb() {
  const map = {};
  dataDb.listRiskWarnings({ limit: 5000 }).forEach(function (r) {
    map[r.id] = r;
  });
  return map;
}

function applyPersisted(item, map) {
  const saved = map[item.id];
  if (saved) {
    item.status = saved.status || item.status;
    item.adminNote = saved.adminNote || '';
    item.handledAt = saved.handledAt || '';
    if (saved.status === 'resolved') item.status = 'resolved';
    else if (saved.status === 'processing') item.status = 'processing';
  }
  return item;
}

function makeRisk(opts) {
  const lv = normalizeLevel(opts.level);
  return {
    id: opts.id,
    title: opts.title || '风险事件',
    riskType: opts.riskType || 'consult',
    riskTypeLabel: RISK_TYPES[opts.riskType] || opts.riskType,
    level: lv,
    status: opts.status || 'pending',
    createdAt: opts.createdAt || new Date().toISOString(),
    sourceModule: opts.sourceModule || RISK_TYPES[opts.riskType] || '系统',
    relatedId: opts.relatedId || '',
    userId: opts.userId || 'guest',
    userName: opts.userName || opts.userId || '访客',
    content: opts.content || '',
    keywords: opts.keywords || [],
    source: opts.source || 'scan',
    link: opts.link || ''
  };
}

function buildAiAnalysis(item) {
  const text = String(item.content || item.title || '');
  const enriched = analytics.enrichEvent(item.riskType, {
    preview: text,
    userId: item.userId
  });
  const lv = item.level || enriched.riskLevel || 'mid';
  const score = levelScore(lv, item.id);
  let reason = '';
  let legalBasis = '';
  let suggestion = '';
  let needsReview = lv === 'high';

  if (item.riskType === 'ocr') {
    reason = 'OCR 识别置信度偏低或文本结构异常，可能影响后续法律分析准确性。';
    legalBasis = '《最高人民法院关于民事诉讼证据的若干规定》关于电子数据真实性的要求。';
    suggestion = '建议人工核对原件扫描质量，必要时重新上传高清文件并复核提取结果。';
  } else if (item.riskType === 'consult') {
    reason = '咨询内容涉及敏感法律议题或高风险关键词，需关注合法性与证据充分性。';
    legalBasis = '相关法律法规及司法解释（视具体案由确定）。';
    suggestion = '建议引导用户补充证据材料，必要时升级人工法务复核。';
  } else if (item.riskType === 'document') {
    reason = '文书可能存在引用条款不当、逻辑冲突或 AI 生成质量波动。';
    legalBasis = '《民法典》及程序法关于起诉/答辩格式与主张要件的规定。';
    suggestion = '建议对照模板检查诉讼请求、事实理由与证据清单的一致性。';
  } else if (item.riskType === 'regulation') {
    reason = '检测到可能引用已废止或已整合的法律法规，存在法律适用错误风险。';
    legalBasis = '《立法法》及新法优于旧法、后法优于前法原则。';
    suggestion = '请改用《中华人民共和国民法典》等现行有效法律条文。';
  } else if (item.riskType === 'behavior') {
    reason = '用户行为频次或模式异常，可能存在批量操作或非正常使用。';
    legalBasis = '平台服务协议及网络安全相关规范。';
    suggestion = '建议关注该账号操作日志，必要时限制高频自动化访问。';
  } else {
    reason = '系统规则命中潜在法律风险特征。';
    legalBasis = '平台风控规则与业务合规要求。';
    suggestion = '请人工审核并记录处理结果。';
  }

  if (SENSITIVE_RE.test(text)) {
    needsReview = true;
    reason += ' 内容含刑事/诈骗等高风险表述。';
  }

  const recommendedRegulations = [];
  if (/劳动|工资|辞退|工伤/.test(text)) {
    recommendedRegulations.push('《中华人民共和国劳动合同法》');
  }
  if (/借贷|借款|利息/.test(text)) {
    recommendedRegulations.push('《中华人民共和国民法典》合同编');
  }
  if (/消费|欺诈|退货/.test(text)) {
    recommendedRegulations.push('《中华人民共和国消费者权益保护法》');
  }
  if (!recommendedRegulations.length) {
    recommendedRegulations.push('《中华人民共和国民法典》');
  }

  return {
    score: score,
    level: lv,
    reason: reason,
    legalBasis: legalBasis,
    suggestion: suggestion,
    needsReview: needsReview,
    recommendedRegulations: recommendedRegulations,
    keywords: enriched.keywords || item.keywords || []
  };
}

function scanOcrRisks() {
  const policy = settingsRuntime.getRiskPolicy();
  const items = [];
  dataDb.readOcrRecords().forEach(function (rec) {
    let conf = rec.confidence;
    if (conf == null && rec.status === 'failed') conf = 0;
    if (typeof conf === 'number' && conf > 1) conf = conf / 100;
    const lowConf = conf != null && conf < policy.ocrConfThreshold;
    const failed = rec.status === 'failed' || rec.success === false;
    const highRisk = rec.riskLevel === 'high';
    if (!lowConf && !failed && !highRisk) return;
    if (lowConf && !policy.includeLowConfOcr && !failed && !highRisk) return;

    const title = failed
      ? 'OCR 识别失败：' + (rec.fileName || '文件')
      : lowConf
        ? 'OCR 低置信度：' + (rec.fileName || '文件')
        : 'OCR 高风险内容：' + (rec.fileName || '文件');

    items.push(makeRisk({
      id: 'rsk_ocr_' + rec.id,
      title: title,
      riskType: 'ocr',
      level: failed || highRisk ? 'high' : 'mid',
      createdAt: rec.createdAt,
      relatedId: rec.id,
      userId: rec.userId,
      userName: rec.userName,
      content: rec.riskAnalysis || rec.summary || rec.textPreview || '',
      keywords: rec.keywords || [],
      source: 'ocr_module',
      link: 'ocr.html?id=' + encodeURIComponent(rec.id)
    }));
  });
  return items;
}

function scanConsultRisks() {
  const policy = settingsRuntime.getRiskPolicy();
  const items = [];
  dataDb.listConsult({}).forEach(function (c) {
    const q = String(c.question || '');
    if (q.length < 4) return;
    const lv = normalizeLevel(c.riskLevel);
    const sensitive = SENSITIVE_RE.test(q);
    if (sensitive) { /* always include */ }
    else if (lv === 'high') { /* include */ }
    else if (lv === 'mid' && policy.includeMidConsult) { /* include */ }
    else if (lv === 'low' && policy.includeLowConsult) { /* include */ }
    else return;

    items.push(makeRisk({
      id: 'rsk_cst_' + c.id,
      title: (sensitive ? '敏感咨询：' : '咨询风险：') + q.slice(0, 48),
      riskType: 'consult',
      level: sensitive ? 'high' : lv,
      createdAt: c.createdAt,
      relatedId: c.id,
      userId: c.userId,
      userName: c.userName || c.userId,
      content: q,
      keywords: c.keywords || [],
      source: 'consult_module',
      link: 'consultations.html?q=' + encodeURIComponent(q.slice(0, 40))
    }));
  });
  return items;
}

function scanDocumentRisks() {
  const items = [];
  dataDb.listDocumentGenerate({}).forEach(function (d) {
    const failed = d.status === 'failed' || d.status === 'error';
    const title = String(d.title || d.docType || '');
    const suspicious = /异常|错误|缺失|无效/.test(title + (d.error || ''));
    if (!failed && !suspicious) return;

    items.push(makeRisk({
      id: 'rsk_doc_' + d.id,
      title: failed ? '文书生成失败：' + title.slice(0, 40) : '文书异常：' + title.slice(0, 40),
      riskType: 'document',
      level: failed ? 'high' : 'mid',
      createdAt: d.createdAt,
      relatedId: d.id,
      userId: d.userId,
      content: d.error || title,
      source: 'document_module',
      link: 'documents.html'
    }));
  });
  return items;
}

function scanRegulationRisks() {
  const items = [];
  const texts = [];

  dataDb.listConsult({}).forEach(function (c) {
    texts.push({ text: c.question, id: c.id, type: 'consult' });
  });
  dataDb.readOcrRecords().forEach(function (r) {
    texts.push({ text: r.fullText || r.textPreview, id: r.id, type: 'ocr' });
  });

  texts.forEach(function (row) {
    const t = String(row.text || '');
    if (!t) return;
    REPEALED_LAW_HINTS.forEach(function (law) {
      if (t.indexOf(law) < 0) return;
      items.push(makeRisk({
        id: 'rsk_reg_' + row.type + '_' + row.id + '_' + law.slice(0, 6),
        title: '法规冲突：引用可能已废止的「' + law + '」',
        riskType: 'regulation',
        level: 'mid',
        createdAt: new Date().toISOString(),
        relatedId: row.id,
        content: '文本中提及「' + law + '」，该法已整合入民法典或不再单独施行。',
        source: 'regulation_scan',
        link: 'regulations.html'
      }));
    });
  });
  return items;
}

function scanBehaviorRisks() {
  const items = [];
  const byUser = {};
  const windowMs = 10 * 60 * 1000;
  const now = Date.now();

  dataDb.listBehavior({ limit: 12000 }).forEach(function (b) {
    const t = new Date(b.createdAt).getTime();
    if (now - t > windowMs) return;
    const uid = b.userId || 'guest';
    if (!byUser[uid]) byUser[uid] = { count: 0, actions: [], userName: b.userName };
    byUser[uid].count++;
    byUser[uid].actions.push(b.action);
  });

  Object.keys(byUser).forEach(function (uid) {
    const u = byUser[uid];
    if (u.count < 25) return;
    items.push(makeRisk({
      id: 'rsk_beh_' + uid + '_' + today(),
      title: '用户行为异常：10分钟内 ' + u.count + ' 次操作',
      riskType: 'behavior',
      level: u.count > 50 ? 'high' : 'mid',
      createdAt: new Date().toISOString(),
      userId: uid,
      userName: u.userName || uid,
      content: '高频操作类型：' + u.actions.slice(0, 8).join('、'),
      source: 'behavior_scan',
      link: 'users.html'
    }));
  });
  return items;
}

function scanAutoFromEvents() {
  return metrics.scanAutoRisks(store.listLogs({})).map(function (r) {
    return makeRisk({
      id: r.id,
      title: r.title,
      riskType: 'consult',
      level: r.level,
      createdAt: r.time,
      userId: r.user,
      userName: r.user,
      content: r.title,
      source: r.source || 'auto',
      relatedId: r.relatedId || ''
    });
  });
}

function collectAllRisks() {
  const map = statusMapFromDb();
  const merged = {};
  const push = function (list) {
    list.forEach(function (item) {
      const applied = applyPersisted(item, map);
      if (!merged[applied.id] || String(applied.createdAt) > String(merged[applied.id].createdAt)) {
        merged[applied.id] = applied;
      }
    });
  };

  push(scanOcrRisks());
  push(scanConsultRisks());
  push(scanDocumentRisks());
  push(scanRegulationRisks());
  push(scanBehaviorRisks());
  push(scanAutoFromEvents());

  dataDb.listRiskWarnings({ limit: 5000 }).forEach(function (r) {
    if (merged[r.id]) return;
    merged[r.id] = applyPersisted(makeRisk({
      id: r.id,
      title: r.title,
      riskType: r.riskType || r.category || 'consult',
      level: r.level,
      status: r.status || 'pending',
      createdAt: r.createdAt,
      userId: r.userId,
      userName: r.userId,
      content: r.detail || r.title,
      keywords: r.keywords || [],
      source: 'db',
      relatedId: r.relatedId || ''
    }), map);
  });

  return Object.keys(merged).map(function (k) { return merged[k]; })
    .sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
}

function buildOverview() {
  const all = collectAllRisks();
  const day = today();
  const todayNew = all.filter(function (r) {
    return String(r.createdAt || '').slice(0, 10) === day;
  }).length;

  const counts = { high: 0, mid: 0, low: 0 };
  const statusCounts = { pending: 0, processing: 0, resolved: 0 };

  all.forEach(function (r) {
    counts[r.level] = (counts[r.level] || 0) + 1;
    const st = r.status || 'pending';
    if (statusCounts[st] != null) statusCounts[st]++;
    else statusCounts.pending++;
  });

  const unresolved = (statusCounts.pending || 0) + (statusCounts.processing || 0);

  return {
    totalRisk: all.length,
    highRisk: counts.high || 0,
    mediumRisk: counts.mid || 0,
    lowRisk: counts.low || 0,
    unresolvedRisk: unresolved,
    total: all.length,
    midRisk: counts.mid || 0,
    todayNew: todayNew,
    resolved: statusCounts.resolved || 0,
    pending: statusCounts.pending || 0,
    processing: statusCounts.processing || 0,
    updatedAt: new Date().toISOString()
  };
}

function list(opts) {
  opts = opts || {};
  let rows = collectAllRisks();

  if (opts.level && opts.level !== 'all') {
    const lv = filterLevelParam(opts.level);
    rows = rows.filter(function (r) { return r.level === lv; });
  }
  if (opts.riskType && opts.riskType !== 'all') {
    rows = rows.filter(function (r) { return r.riskType === opts.riskType; });
  }
  if (opts.status && opts.status !== 'all') {
    rows = rows.filter(function (r) { return (r.status || 'pending') === opts.status; });
  }
  if (opts.keyword) {
    const q = String(opts.keyword).toLowerCase();
    rows = rows.filter(function (r) {
      return (r.title && r.title.toLowerCase().indexOf(q) >= 0) ||
        (r.content && r.content.toLowerCase().indexOf(q) >= 0);
    });
  }

  const page = Math.max(1, parseInt(opts.page, 10) || 1);
  const pageSize = Math.min(100, parseInt(opts.pageSize, 10) || 20);
  const total = rows.length;
  const start = (page - 1) * pageSize;

  return {
    list: rows.slice(start, start + pageSize).map(toApiRow),
    total: total,
    page: page,
    pageSize: pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  };
}

function getDetail(id) {
  const item = collectAllRisks().find(function (r) { return r.id === id; });
  if (!item) return null;

  const aiAnalysis = buildAiAnalysis(item);
  return Object.assign({}, toApiRow(item), {
    aiAnalysis: aiAnalysis,
    handling: {
      suggestion: aiAnalysis.suggestion,
      needsReview: aiAnalysis.needsReview,
      recommendedRegulations: aiAnalysis.recommendedRegulations
    },
    timeline: [
      { time: item.createdAt, event: '风险触发', detail: item.title },
      item.status === 'resolved'
        ? { time: item.handledAt || item.createdAt, event: '已处理', detail: item.adminNote || '标记为已解决' }
        : null
    ].filter(Boolean)
  });
}

function buildStatistics(range) {
  const all = collectAllRisks();
  const days = range === 'month' ? 30 : range === 'week' ? 7 : 14;
  const labels = [];
  const trend = { high: [], mid: [], low: [] };
  const byType = {};
  const byModule = {};

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    labels.push(key.slice(5));
    const dayItems = all.filter(function (r) {
      return String(r.createdAt || '').slice(0, 10) === key;
    });
    trend.high.push(dayItems.filter(function (r) { return r.level === 'high'; }).length);
    trend.mid.push(dayItems.filter(function (r) { return r.level === 'mid'; }).length);
    trend.low.push(dayItems.filter(function (r) { return r.level === 'low'; }).length);
  }

  all.forEach(function (r) {
    const t = r.riskType || 'other';
    byType[t] = (byType[t] || 0) + 1;
    const m = r.sourceModule || t;
    byModule[m] = (byModule[m] || 0) + 1;
  });

  const levelCounts = { high: 0, mid: 0, low: 0 };
  all.forEach(function (r) {
    const lv = normalizeLevel(r.level);
    levelCounts[lv]++;
  });

  return {
    labels: labels,
    trend: trend,
    levelDistribution: [
      { level: 'high', value: levelCounts.high },
      { level: 'medium', value: levelCounts.mid },
      { level: 'low', value: levelCounts.low }
    ],
    byType: Object.keys(byType).map(function (k) {
      return { key: k, label: RISK_TYPES[k] || k, value: byType[k] };
    }),
    byModule: Object.keys(byModule).map(function (k) {
      return { label: k, value: byModule[k] };
    }),
    breakdown: metrics.riskBreakdownFromLogs(),
    updatedAt: new Date().toISOString()
  };
}

function buildDashboard(opts) {
  return {
    overview: buildOverview(),
    list: list(opts || { page: 1, pageSize: 20 }),
    statistics: buildStatistics((opts && opts.range) || 'week'),
    realtime: buildRealtime(15),
    updatedAt: new Date().toISOString()
  };
}

function buildRealtime(limit) {
  limit = limit || 20;
  const cutoff = Date.now() - 24 * 3600000;
  return collectAllRisks()
    .filter(function (r) {
      const t = new Date(r.createdAt).getTime();
      return t >= cutoff && (r.level === 'high' || r.status === 'pending');
    })
    .slice(0, limit)
    .map(function (r) {
      return Object.assign({}, r, {
        message: '[' + (RISK_TYPES[r.riskType] || r.riskType) + '] ' + r.title,
        severity: r.level
      });
    });
}

function updateStatus(id, status, adminNote) {
  const valid = ['pending', 'processing', 'resolved', 'ignored'];
  if (valid.indexOf(status) < 0) {
    const err = new Error('无效状态');
    err.statusCode = 400;
    throw err;
  }

  const detail = getDetail(id) || { id: id, title: '风险事件', level: 'mid', riskType: 'consult' };
  try {
    logCenter.createLog({
      actionType: 'update',
      module: 'risk',
      actionName: status === 'resolved' ? '风险已处理' : status === 'ignored' ? '忽略风险' : '风险处理中',
      targetId: id,
      description: adminNote || detail.title,
      userId: detail.userId,
      userName: detail.userName,
      status: 'success',
      requestData: { status: status, note: adminNote },
      responseData: { id: id }
    });
  } catch (e) { /* non-blocking */ }

  return dataDb.upsertRiskWarning({
    id: id,
    title: detail.title,
    level: normalizeLevel(detail.level),
    riskType: detail.riskType || detail.type,
    category: detail.riskType,
    status: status,
    userId: detail.userId,
    relatedId: detail.relatedId,
    detail: detail.content,
    keywords: detail.keywords || [],
    adminNote: adminNote || '',
    handledAt: status === 'resolved' ? new Date().toISOString() : '',
    source: detail.source || 'admin',
    createdAt: detail.createdAt || new Date().toISOString()
  });
}

module.exports = {
  buildOverview: buildOverview,
  list: list,
  getDetail: getDetail,
  buildStatistics: buildStatistics,
  buildRealtime: buildRealtime,
  buildDashboard: buildDashboard,
  updateStatus: updateStatus,
  collectAllRisks: collectAllRisks,
  emptyOverview: emptyOverview,
  toApiRow: toApiRow,
  RISK_TYPES: RISK_TYPES
};

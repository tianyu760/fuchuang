/**
 * 管理端数据存储（JSON，不修改 users.json 结构）
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const analytics = require('./analytics-engine');

const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'admin');
const USERS_FILE = path.join(__dirname, '..', '..', 'users.json');

const FILES = {
  admins: path.join(DATA_DIR, 'admins.json'),
  userMeta: path.join(DATA_DIR, 'user-meta.json'),
  systemEventLog: path.join(DATA_DIR, 'system-event-log.json'),
  events: path.join(DATA_DIR, 'analytics-events.json'),
  ocrRecords: path.join(DATA_DIR, 'ocr-records.json'),
  docRecords: path.join(DATA_DIR, 'document-records.json'),
  regulations: path.join(DATA_DIR, 'regulations.json'),
  visits: path.join(DATA_DIR, 'visit-stats.json'),
  revision: path.join(DATA_DIR, 'data-revision.json'),
  pufaReadStats: path.join(DATA_DIR, 'pufa-read-stats.json')
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(file, fallback) {
  ensureDataDir();
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) { /* ignore */ }
  return fallback;
}

function writeJson(file, data) {
  ensureDataDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

function hashPwd(pwd) {
  return crypto.createHash('sha256').update(pwd + 'fayi_admin_salt_2026').digest('hex');
}

function initDefaults() {
  ensureDataDir();
  if (!fs.existsSync(FILES.admins)) {
    writeJson(FILES.admins, [{
      id: 'admin_1',
      email: 'admin@fayi.local',
      name: '系统管理员',
      password: hashPwd('admin123'),
      role: 'super_admin',
      createdAt: new Date().toISOString()
    }]);
  }
  ['userMeta', 'events', 'ocrRecords', 'docRecords', 'visits'].forEach(function (key) {
    const map = {
      userMeta: FILES.userMeta,
      events: FILES.events,
      ocrRecords: FILES.ocrRecords,
      docRecords: FILES.docRecords,
      visits: FILES.visits
    };
    const f = map[key];
    if (!fs.existsSync(f)) {
      writeJson(f, key === 'visits' ? { daily: {}, total: 0 } : []);
    }
  });
  if (!fs.existsSync(FILES.regulations)) {
    writeJson(FILES.regulations, [
      { id: 'law_1', title: '中华人民共和国民法典', category: '民事', content: '…', updatedAt: new Date().toISOString() }
    ]);
  }
  if (!fs.existsSync(FILES.systemEventLog)) {
    writeJson(FILES.systemEventLog, []);
  }
}

initDefaults();

function loadPlatformUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
  } catch (e) { /* ignore */ }
  return [];
}

function getUserMetaMap() {
  const list = readJson(FILES.userMeta, []);
  const map = {};
  list.forEach(function (m) { map[m.userId] = m; });
  return map;
}

function saveUserMetaList(list) {
  writeJson(FILES.userMeta, list);
}

function bumpDataRevision() {
  const r = readJson(FILES.revision, { seq: 0, at: 0 });
  r.seq = (r.seq || 0) + 1;
  r.at = Date.now();
  writeJson(FILES.revision, r);
  return r.seq;
}

function getDataRevision() {
  const r = readJson(FILES.revision, { seq: 0, at: 0 });
  return { seq: r.seq || 0, at: r.at || 0 };
}

function pickEventType(module, action, detail) {
  if (detail && detail.type) return detail.type;
  if (module === 'consult' && action === 'ask') return 'ai_chat';
  if (module === 'case' && action === 'analyze') return 'ai_case';
  if (module === 'document' && action === 'generate') return 'ai_wenshi';
  if (module === 'regulation' && action === 'search') return 'ai_fagui';
  if (module === 'ocr' && action === 'recognize') return 'ocr';
  if (module === 'upload' && action === 'upload') return 'file_upload';
  if (module === 'pufa' && action === 'visit') return 'law_edu_visit';
  if (module === 'auth' && action === 'login') return 'user_login';
  if (module === 'auth' && action === 'register') return 'user_register';
  if (module === 'auth' && action === 'admin_login') return 'admin_login';
  if (module === 'page' && action === 'visit') return 'page_visit';
  return 'system_event';
}

function mapTypeToModuleAction(type) {
  switch (type) {
    case 'ai_chat': return { module: 'consult', action: 'ask' };
    case 'ai_case': return { module: 'case', action: 'analyze' };
    case 'ai_wenshi': return { module: 'document', action: 'generate' };
    case 'ai_fagui': return { module: 'regulation', action: 'search' };
    case 'ocr': return { module: 'ocr', action: 'recognize' };
    case 'law_edu_visit': return { module: 'pufa', action: 'visit' };
    case 'user_login': return { module: 'auth', action: 'login' };
    case 'user_register': return { module: 'auth', action: 'register' };
    case 'admin_login': return { module: 'auth', action: 'admin_login' };
    case 'page_visit': return { module: 'page', action: 'visit' };
    default: return { module: 'system', action: String(type || 'unknown') };
  }
}

function normalizeSystemEvent(entry) {
  const now = new Date().toISOString();
  const detail = entry && entry.detail && typeof entry.detail === 'object' ? entry.detail : {};
  return {
    id: (entry && entry.id) || ('sel_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
    user_id: (entry && entry.user_id) || (detail && detail.userId) || 'guest',
    module: (entry && entry.module) || 'system',
    action: (entry && entry.action) || 'unknown',
    detail: detail,
    timestamp: (entry && entry.timestamp) || now,
    status: (entry && entry.status) || 'success',
    duration: Number((entry && entry.duration) || 0)
  };
}

function readSystemEventLogs() {
  const logs = readJson(FILES.systemEventLog, []);
  if (Array.isArray(logs) && logs.length) {
    return logs.map(normalizeSystemEvent);
  }

  // 兼容旧 analytics-events：首次读取时迁移到统一 system_event_log
  const legacy = readJson(FILES.events, []);
  if (!Array.isArray(legacy) || !legacy.length) return [];
  const migrated = legacy.map(function (e) {
    const detail = { type: e.type, payload: e.payload || {} };
    const ma = mapTypeToModuleAction(e.type);
    return normalizeSystemEvent({
      id: e.id,
      user_id: (e.payload && e.payload.userId) || 'guest',
      module: ma.module,
      action: ma.action,
      detail: detail,
      timestamp: e.createdAt,
      status: (e.payload && e.payload.success === false) ? 'failed' : 'success',
      duration: Number((e.payload && e.payload.duration) || 0)
    });
  });
  writeJson(FILES.systemEventLog, migrated);
  return migrated;
}

function readEventStream() {
  return readSystemEventLogs().map(function (log) {
    const detail = log.detail || {};
    const payload = detail.payload && typeof detail.payload === 'object'
      ? detail.payload
      : detail;
    return {
      id: log.id,
      type: pickEventType(log.module, log.action, detail),
      payload: payload || {},
      createdAt: log.timestamp,
      module: log.module,
      action: log.action,
      userId: log.user_id,
      status: log.status,
      duration: log.duration
    };
  });
}

function appendSystemEvent(entry) {
  const list = readSystemEventLogs();
  const row = normalizeSystemEvent(entry || {});
  list.push(row);
  if (list.length > 10000) list.splice(0, list.length - 10000);
  writeJson(FILES.systemEventLog, list);
  bumpDataRevision();
  return row;
}

function logEvent(type, payload) {
  const enriched = analytics.enrichEvent(type, payload || {});
  const ma = mapTypeToModuleAction(type);
  return appendSystemEvent({
    id: 'sel_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    user_id: enriched.userId || 'guest',
    module: ma.module,
    action: ma.action,
    detail: {
      type: type,
      payload: enriched
    },
    timestamp: new Date().toISOString(),
    status: enriched.success === false ? 'failed' : 'success',
    duration: Number(enriched.duration || 0)
  });
}

function bumpVisit(page) {
  const v = readJson(FILES.visits, { daily: {}, total: 0 });
  const day = new Date().toISOString().slice(0, 10);
  v.total = (v.total || 0) + 1;
  v.daily[day] = (v.daily[day] || 0) + 1;
  writeJson(FILES.visits, v);
  logEvent('page_visit', { page: page || '' });
}

function appendOcrRecord(rec) {
  const list = readJson(FILES.ocrRecords, []);
  list.unshift(Object.assign({ id: 'ocr_' + Date.now(), createdAt: new Date().toISOString() }, rec));
  if (list.length > 500) list.length = 500;
  writeJson(FILES.ocrRecords, list);
  bumpDataRevision();
}

function appendDocRecord(rec) {
  const list = readJson(FILES.docRecords, []);
  list.unshift(Object.assign({ id: 'doc_' + Date.now(), createdAt: new Date().toISOString() }, rec));
  if (list.length > 500) list.length = 500;
  writeJson(FILES.docRecords, list);
  bumpDataRevision();
}

function getPublicityReads() {
  try {
    const lawStore = require('../law-education/law-store');
    return lawStore.getPublicityStats();
  } catch (e) {
    return { todayReads: 0, totalReads: 0 };
  }
}

function statsOverview() {
  const users = loadPlatformUsers();
  const events = readEventStream();
  const ocrList = readJson(FILES.ocrRecords, []);
  const docList = readJson(FILES.docRecords, []);
  const visits = readJson(FILES.visits, { daily: {}, total: 0 });
  const pub = getPublicityReads();
  const today = new Date().toISOString().slice(0, 10);
  const todayEvents = events.filter(function (e) { return (e.createdAt || '').slice(0, 10) === today; });
  const countType = function (t) { return events.filter(function (e) { return e.type === t; }).length; };
  const countTypeToday = function (t) { return todayEvents.filter(function (e) { return e.type === t; }).length; };
  const ocrSuccess = ocrList.filter(function (r) { return r.success !== false; }).length;
  const ocrRate = ocrList.length ? Math.round((ocrSuccess / ocrList.length) * 100) : 100;

  const risk = riskBreakdown();
  const riskMid = (risk.find(function (r) { return r.name === 'mid'; }) || {}).value || 0;
  const riskHigh = (risk.find(function (r) { return r.name === 'high'; }) || {}).value || 0;
  const platformUsers = users.filter(function (u) { return (u.userType || 'user') !== 'admin'; });

  return {
    totalUsers: platformUsers.length,
    riskMid: riskMid,
    riskHigh: riskHigh,
    todayVisits: visits.daily[today] || countTypeToday('page_visit') || 0,
    aiCalls: countType('ai_chat') + countType('ai_wenshi') + countType('ai_fagui') + countType('ai_case'),
    aiCallsToday: countTypeToday('ai_chat') + countTypeToday('ai_wenshi') + countTypeToday('ai_fagui') + countTypeToday('ai_case'),
    ocrCount: ocrList.length,
    ocrToday: todayEvents.filter(function (e) { return e.type === 'ocr'; }).length,
    ocrSuccessRate: ocrRate,
    consultCount: countType('ai_chat') + countType('ai_case'),
    consultToday: countTypeToday('ai_chat') + countTypeToday('ai_case'),
    documentCount: docList.length,
    documentToday: countTypeToday('ai_wenshi'),
    pufaReadsToday: pub.todayReads || 0,
    pufaReadsTotal: pub.totalReads || 0,
    systemStatus: 'healthy',
    onlineUsers: Math.max(1, users.filter(function (u) {
      return u && u.id;
    }).length),
    faguiToday: countTypeToday('ai_fagui'),
    wenshiToday: countTypeToday('ai_wenshi'),
    updatedAt: new Date().toISOString(),
    revision: getDataRevision()
  };
}

function riskBreakdown() {
  const events = readEventStream();
  const r = { low: 0, mid: 0, high: 0 };
  events.forEach(function (e) {
    const lv = (e.payload && e.payload.riskLevel) || 'mid';
    if (r[lv] != null) r[lv]++;
    else r.mid++;
  });
  return [
    { name: 'low', label: '低风险', value: r.low },
    { name: 'mid', label: '中风险', value: r.mid },
    { name: 'high', label: '高风险', value: r.high }
  ];
}

function keywordCloud(limit) {
  const events = readEventStream();
  const freq = {};
  events.forEach(function (e) {
    const keys = (e.payload && e.payload.keywords) || [];
    keys.forEach(function (k) {
      if (k && k.length >= 2) freq[k] = (freq[k] || 0) + 1;
    });
  });
  return Object.keys(freq)
    .sort(function (a, b) { return freq[b] - freq[a]; })
    .slice(0, limit || 40)
    .map(function (k) { return { name: k, value: freq[k] }; });
}

function topQuestions(limit) {
  const events = readEventStream();
  const freq = {};
  events.forEach(function (e) {
    if (e.type !== 'ai_chat' && e.type !== 'ai_fagui' && e.type !== 'ai_wenshi') return;
    const q = (e.payload && (e.payload.preview || e.payload.keyword || e.payload.title)) || '';
    const key = String(q).trim().slice(0, 60);
    if (key.length < 4) return;
    freq[key] = (freq[key] || 0) + 1;
  });
  return Object.keys(freq)
    .sort(function (a, b) { return freq[b] - freq[a]; })
    .slice(0, limit || 8)
    .map(function (q) { return { question: q, count: freq[q] }; });
}

function bumpPufaRead(entry) {
  const st = readJson(FILES.pufaReadStats, {
    todayReadCount: 0,
    totalReadCount: 0,
    videoPlayCount: 0,
    articleViewCount: 0,
    todayVisitors: 0,
    lastDay: '',
    topics: {}
  });
  const today = new Date().toISOString().slice(0, 10);
  if (st.lastDay !== today) {
    st.todayReadCount = 0;
    st.todayVisitors = 0;
    st.lastDay = today;
  }
  const kind = (entry && entry.kind) || 'page';
  st.todayReadCount = (st.todayReadCount || 0) + 1;
  st.totalReadCount = (st.totalReadCount || 0) + 1;
  if (kind === 'video') st.videoPlayCount = (st.videoPlayCount || 0) + 1;
  if (kind === 'article') st.articleViewCount = (st.articleViewCount || 0) + 1;
  if (kind === 'page') st.todayVisitors = (st.todayVisitors || 0) + 1;
  const topicKey = String((entry && (entry.category || entry.title)) || '普法浏览').trim();
  if (topicKey) {
    st.topics = st.topics || {};
    st.topics[topicKey] = (st.topics[topicKey] || 0) + 1;
  }
  writeJson(FILES.pufaReadStats, st);
  logEvent('law_edu_visit', {
    title: (entry && entry.title) || '',
    category: (entry && entry.category) || '',
    kind: kind
  });
  bumpDataRevision();
  return st;
}

function getMergedPublicityStats(lawStore) {
  const law = lawStore && lawStore.getPublicityStats
    ? lawStore.getPublicityStats()
    : { todayReads: 0, totalReads: 0, hotTopics: [], topArticles: [] };
  const local = readJson(FILES.pufaReadStats, {
    todayReadCount: 0,
    totalReadCount: 0,
    videoPlayCount: 0,
    articleViewCount: 0,
    topics: {}
  });
  const topicMap = {};
  (law.hotTopics || []).forEach(function (t) {
    if (t) topicMap[t] = (topicMap[t] || 0) + 10;
  });
  Object.keys(local.topics || {}).forEach(function (k) {
    topicMap[k] = (topicMap[k] || 0) + local.topics[k];
  });
  const hotTopics = Object.keys(topicMap)
    .sort(function (a, b) { return topicMap[b] - topicMap[a]; })
    .slice(0, 3)
    .map(function (k) {
      return k.length > 14 ? k.slice(0, 12) + '…' : k;
    });
  return {
    todayReads: Math.max(law.todayReads || 0, local.todayReadCount || 0),
    totalReads: (law.totalReads || 0) + (local.totalReadCount || 0),
    videoPlayCount: local.videoPlayCount || 0,
    articleViewCount: local.articleViewCount || 0,
    todayVisitors: local.todayVisitors || 0,
    hotTopics: hotTopics.length ? hotTopics : (law.hotTopics || []).slice(0, 3),
    topArticles: law.topArticles || []
  };
}

function buildRealtimePayload(lawStore) {
  const publicity = getMergedPublicityStats(lawStore);
  const stats = statsOverview();
  return {
    revision: stats.revision,
    serverTime: new Date().toISOString(),
    stats: stats,
    charts: chartSeries(7),
    charts30: chartSeries(30),
    categories: categoryBreakdown(),
    consultHotspots: consultationHotspots(6),
    moduleUsage: moduleUsageRanking(8),
    risks: riskBreakdown(),
    keywords: keywordCloud(36),
    topQuestions: topQuestions(10),
    feed: realtimeFeed(30),
    publicity: {
      todayReads: publicity.todayReads,
      hotTopics: publicity.hotTopics,
      topArticles: publicity.topArticles,
      totalReads: publicity.totalReads,
      videoPlayCount: publicity.videoPlayCount,
      articleViewCount: publicity.articleViewCount,
      todayVisitors: publicity.todayVisitors
    },
    system: {
      apiStatus: 'online',
      ocrStatus: stats.ocrSuccessRate >= 80 ? 'normal' : 'degraded',
      eventTotal: readSystemEventLogs().length
    }
  };
}

function chartSeries(days) {
  days = days || 7;
  const events = readEventStream();
  const labels = [];
  const consult = [];
  const ocr = [];
  const docs = [];
  const pufa = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    labels.push(key.slice(5));
    const dayEv = events.filter(function (e) { return (e.createdAt || '').slice(0, 10) === key; });
    consult.push(dayEv.filter(function (e) {
      return e.type === 'ai_chat' || e.type === 'ai_case' || e.type === 'ai_fagui';
    }).length);
    ocr.push(dayEv.filter(function (e) { return e.type === 'ocr'; }).length);
    docs.push(dayEv.filter(function (e) { return e.type === 'ai_wenshi'; }).length);
    pufa.push(dayEv.filter(function (e) { return e.type === 'law_edu_visit' || e.type === 'page_visit'; }).length);
  }
  return { labels, consult, ocr, documents: docs, pufa };
}

function categoryBreakdown() {
  const events = readEventStream();
  const cats = { labor: 0, marriage: 0, contract: 0, campus: 0, fraud: 0, consumer: 0, other: 0 };
  events.forEach(function (e) {
    const c = (e.payload && e.payload.category) || analytics.classifyCategory(analytics.collectText(e.type, e.payload));
    if (cats[c] != null) cats[c]++;
    else cats.other++;
  });
  return Object.keys(cats)
    .filter(function (k) { return cats[k] > 0; })
    .map(function (k) {
      return { name: k, label: analytics.categoryLabel(k), value: cats[k] };
    });
}

function consultationHotspots(limit) {
  const list = categoryBreakdown()
    .slice()
    .sort(function (a, b) { return b.value - a.value; })
    .slice(0, limit || 6);
  return list.map(function (x) {
    return {
      name: x.name,
      label: x.label,
      value: x.value
    };
  });
}

function moduleUsageRanking(limit) {
  const labels = {
    consult: '法律咨询',
    case: '案件分析',
    document: '文书生成',
    regulation: '法规检索',
    ocr: 'OCR识别',
    pufa: '普法学习',
    page: '页面访问',
    auth: '用户认证',
    system: '系统事件'
  };
  const map = {};
  readSystemEventLogs().forEach(function (e) {
    map[e.module] = (map[e.module] || 0) + 1;
  });
  return Object.keys(map)
    .sort(function (a, b) { return map[b] - map[a]; })
    .slice(0, limit || 8)
    .map(function (k) {
      return { module: k, label: labels[k] || k, value: map[k] };
    });
}

const MODULE_SOURCE_LABEL = {
  consult: '法律咨询',
  case: '案件分析',
  document: '文书生成',
  regulation: '法规检索',
  ocr: 'OCR识别',
  pufa: '普法学习',
  page: '页面访问',
  auth: '用户认证',
  system: '系统'
};

function riskLevelLabel(lv) {
  if (lv === 'high') return '高风险';
  if (lv === 'low') return '低风险';
  return '中风险';
}

function realtimeFeed(limit) {
  const TYPE_LABEL = {
    ai_chat: '法律咨询', ai_case: '案件分析', ai_wenshi: '文书生成',
    ai_fagui: '法规检索', ocr: 'OCR识别', law_edu_visit: '普法学习',
    file_upload: '资料上传', user_login: '用户登录', user_register: '用户注册',
    page_visit: '页面访问', system_event: '系统事件'
  };
  return readEventStream().slice(-(limit || 20)).reverse().map(function (e) {
    const p = e.payload || {};
    const risk = p.riskLevel || 'mid';
    return {
      id: e.id,
      type: e.type,
      typeLabel: TYPE_LABEL[e.type] || e.type,
      moduleSource: MODULE_SOURCE_LABEL[e.module] || TYPE_LABEL[e.type] || e.module,
      message: formatEventMessage(e),
      time: e.createdAt,
      riskLevel: risk,
      riskLabel: riskLevelLabel(risk),
      category: p.category,
      categoryLabel: analytics.categoryLabel(p.category),
      keywords: (p.keywords || []).slice(0, 3)
    };
  });
}

function logOperationFromClient(body) {
  const type = (body && body.type) || 'system_event';
  const content = String((body && body.content) || '').trim();
  const level = (body && body.level) || 'mid';
  const meta = (body && body.meta) || {};
  return logEvent(type, Object.assign({}, meta, {
    preview: content,
    keyword: content,
    title: content,
    fileName: meta.fileName,
    riskLevel: level === 'low' || level === 'high' ? level : 'mid'
  }));
}

function formatEventMessage(e) {
  const p = e.payload || {};
  switch (e.type) {
    case 'ai_chat': return '用户发起法律咨询：' + (p.preview || '新会话');
    case 'ai_wenshi': return '法律文书生成：' + (p.title || '文书');
    case 'ai_fagui': return '法规检索：' + (p.keyword || '');
    case 'ai_case': return '案件分析完成，风险 ' + (p.risk || '—');
    case 'ocr': return '上传' + (p.fileName ? '「' + p.fileName + '」' : '文件') + '并完成文字提取';
    case 'file_upload': return '用户上传资料：' + (p.fileName || p.title || '文件');
    case 'law_edu_visit':
      if (p.title) return '浏览普法内容《' + p.title + '》';
      return '访问普法宣传页面';
    case 'page_visit': return '访问页面：' + (p.page || '站点');
    case 'user_register': return '新用户注册：' + (p.email || '');
    case 'user_login': return '用户登录：' + (p.email || '');
    case 'admin_login': return '管理员登录控制台';
    default: return e.type;
  }
}

function listLogs(opts) {
  opts = opts || {};
  let events = readEventStream();
  if (opts.type) events = events.filter(function (e) { return e.type === opts.type; });
  if (opts.search) {
    const q = String(opts.search).toLowerCase();
    events = events.filter(function (e) { return JSON.stringify(e).toLowerCase().indexOf(q) >= 0; });
  }
  return events.slice().reverse();
}

module.exports = {
  FILES, readJson, writeJson, hashPwd, loadPlatformUsers,
  getUserMetaMap, saveUserMetaList, logEvent, bumpVisit,
  appendOcrRecord, appendDocRecord, statsOverview, chartSeries,
  categoryBreakdown, consultationHotspots, moduleUsageRanking, realtimeFeed, listLogs, initDefaults,
  bumpDataRevision, getDataRevision, buildRealtimePayload,
  riskBreakdown, keywordCloud, topQuestions,
  bumpPufaRead, getMergedPublicityStats, logOperationFromClient
};

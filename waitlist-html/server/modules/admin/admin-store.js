/**
 * 管理端数据存储（JSON，不修改 users.json 结构）
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const analytics = require('./analytics-engine');
const dataDb = require('./admin-data-db');
const metrics = require('./admin-metrics');
const cache = require('./admin-cache');
const settingsRuntime = require('./settings-runtime');
const { fixFileName, ensureUtf8String } = require('../../lib/encoding-utils');
let realtimeHub = null;

function setRealtimeHub(hub) {
  realtimeHub = hub;
}

function notifyRealtime() {
  cache.invalidatePrefix('stats');
  cache.invalidatePrefix('charts');
  bumpDataRevision();
  if (realtimeHub && realtimeHub.broadcast) {
    try {
      realtimeHub.broadcast(buildRealtimePayload());
    } catch (e) { /* ignore */ }
  }
}

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

function migrateLegacyTablesOnce() {
  const flag = path.join(DATA_DIR, '.migrated-v4.json');
  if (fs.existsSync(flag)) return;
  const events = readEventStream();
  const consultList = dataDb.listConsult({});
  if (!consultList.length) {
    events.forEach(function (e) {
      if (e.type !== 'ai_chat' && e.type !== 'ai_case') return;
      const p = e.payload || {};
      dataDb.appendConsult({
        id: e.id,
        userId: p.userId || e.userId || 'guest',
        question: p.preview || p.question || '',
        keywords: p.keywords || [],
        category: p.category || 'other',
        riskLevel: p.riskLevel || 'mid',
        createdAt: e.createdAt
      });
    });
  }
  const docLogs = dataDb.listDocumentGenerate({});
  if (!docLogs.length) {
    readJson(FILES.docRecords, []).forEach(function (d) {
      dataDb.appendDocumentGenerate({
        id: d.id,
        userId: d.userId || 'guest',
        docType: d.docType || d.type || '文书',
        title: d.title || '',
        status: 'success',
        createdAt: d.createdAt
      });
    });
  }
  const behavior = dataDb.listBehavior({ limit: 1 });
  if (!behavior.length) {
    readSystemEventLogs().slice(-3000).forEach(function (log) {
      const detail = log.detail || {};
      const p = detail.payload || detail;
      recordBehaviorFromEvent(log.module, log.action, p, {
        userId: log.user_id,
        status: log.status,
        duration: log.duration,
        timestamp: log.timestamp,
        ip: p.ip || '',
        sourcePage: p.page || ''
      });
    });
  }
  writeJson(flag, { at: new Date().toISOString() });
}

function recordBehaviorFromEvent(module, action, payload, extra) {
  if (!settingsRuntime.isOperationTrackingEnabled()) return null;
  extra = extra || {};
  const p = payload || {};
  const actionMap = {
    login: 'user_login',
    register: 'user_register',
    ask: 'ai_chat',
    analyze: 'ai_case',
    generate: 'ai_wenshi',
    search: 'regulation_search',
    recognize: 'ocr',
    upload: 'file_upload',
    visit: 'page_visit',
    admin_login: 'admin_login'
  };
  const act = actionMap[action] || action || 'system_event';
  return dataDb.appendBehavior({
    userId: p.userId || extra.userId || 'guest',
    userName: p.email || p.userName || '',
    action: act,
    module: module || 'system',
    result: extra.status === 'failed' ? 'failed' : 'success',
    ip: extra.ip || p.ip || '',
    sourcePage: extra.sourcePage || p.page || '',
    detail: p.preview || p.keyword || p.title || p.fileName || '',
    durationMs: Number(extra.duration || p.duration || 0) * (extra.duration > 1000 ? 1 : 1000),
    createdAt: extra.timestamp || new Date().toISOString()
  });
}

function recordBehavior(row) {
  const entry = dataDb.appendBehavior(row);
  notifyRealtime();
  return entry;
}

function touchHeartbeat(session) {
  const wsN = realtimeHub ? realtimeHub.connectionCount() : 0;
  dataDb.touchPresence(session);
  return { online: dataDb.countOnlineUsers(wsN) };
}

function recordApiMonitor(row) {
  return dataDb.appendMonitor(Object.assign({ type: 'api' }, row));
}

function recordSystemError(type, message, extra) {
  dataDb.appendMonitor({
    type: type || 'error',
    message: String(message || '').slice(0, 500),
    path: (extra && extra.path) || '',
    method: (extra && extra.method) || '',
    statusCode: (extra && extra.statusCode) || 500,
    durationMs: (extra && extra.durationMs) || 0
  });
  dataDb.appendBehavior({
    userId: (extra && extra.userId) || 'system',
    action: type || 'system_error',
    module: 'system',
    result: 'failed',
    detail: String(message || '').slice(0, 200),
    ip: (extra && extra.ip) || ''
  });
  notifyRealtime();
}

migrateLegacyTablesOnce();

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
    case 'risk_handle': return { module: 'risk', action: 'update' };
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

function appendSystemEvent(entry, silent) {
  const list = readSystemEventLogs();
  const row = normalizeSystemEvent(entry || {});
  list.push(row);
  if (list.length > 10000) list.splice(0, list.length - 10000);
  writeJson(FILES.systemEventLog, list);
  if (!silent) bumpDataRevision();
  return row;
}

function logEvent(type, payload, reqMeta) {
  settingsRuntime.maybePruneLogs();
  if (!settingsRuntime.isSystemLogEnabled()) {
    return {
      id: 'log_skipped',
      timestamp: new Date().toISOString(),
      skipped: true,
      reason: 'system_log_disabled'
    };
  }
  const enriched = analytics.enrichEvent(type, payload || {});
  const ma = mapTypeToModuleAction(type);
  const row = appendSystemEvent({
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
  }, true);

  const meta = reqMeta || {};
  recordBehaviorFromEvent(ma.module, ma.action, enriched, {
    userId: enriched.userId,
    status: enriched.success === false ? 'failed' : 'success',
    duration: enriched.duration,
    ip: meta.ip || enriched.ip,
    sourcePage: meta.page || enriched.page,
    timestamp: row.timestamp
  });

  if (type === 'ai_chat' || type === 'ai_case') {
    dataDb.appendConsult({
      userId: enriched.userId || 'guest',
      question: enriched.preview || enriched.question || '',
      keywords: enriched.keywords || [],
      category: enriched.category || 'other',
      riskLevel: enriched.riskLevel || 'mid',
      createdAt: row.timestamp
    });
    metrics.detectAndLogRisk(
      (enriched.preview || '') + ' ' + (enriched.analysis || ''),
      { userId: enriched.userId, source: 'consult', relatedId: row.id }
    );
  }
  if (type === 'ai_fagui') {
    const kw = enriched.keyword || enriched.query || enriched.preview || '';
    if (kw) {
      dataDb.appendConsult({
        userId: enriched.userId || 'guest',
        question: kw,
        keywords: [String(kw).slice(0, 40)],
        category: enriched.category || 'other',
        riskLevel: 'low',
        createdAt: row.timestamp
      });
    }
  }
  if (type === 'ai_wenshi') {
    dataDb.appendDocumentGenerate({
      userId: enriched.userId || 'guest',
      docType: enriched.docType || enriched.title || '法律文书',
      title: enriched.title || '',
      status: 'success',
      createdAt: row.timestamp
    });
  }

  notifyRealtime();
  return row;
}

function bumpVisit(page, reqMeta) {
  const v = readJson(FILES.visits, { daily: {}, total: 0 });
  const day = new Date().toISOString().slice(0, 10);
  v.total = (v.total || 0) + 1;
  v.daily[day] = (v.daily[day] || 0) + 1;
  writeJson(FILES.visits, v);
  logEvent('page_visit', { page: page || '' }, reqMeta || {});
}

function normalizeOcrStatus(rec) {
  var status = rec.status;
  if (status === 'processing' || status === 'success' || status === 'failed') {
    if (status === 'processing' && rec.createdAt) {
      var ageMs = Date.now() - new Date(rec.createdAt).getTime();
      if (ageMs > 3 * 60 * 1000) {
        return rec.success === false ? 'failed' : 'success';
      }
    }
    return status;
  }
  if (rec.success === false) return 'failed';
  if (rec.processing) return 'processing';
  return 'success';
}

function ocrDedupeKey(rec) {
  var name = String(rec.fileName || '').toLowerCase().replace(/\s+/g, '');
  return (rec.userId || 'guest') + '|' + name;
}

function fileTypeFromName(name) {
  const m = String(name || '').match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toUpperCase() : 'FILE';
}

function resolveUserDisplay(userId) {
  if (!userId || userId === 'guest') return '访客';
  const users = loadPlatformUsers();
  const u = users.find(function (x) { return x.id === userId || x.email === userId; });
  if (u) return u.name || u.nickname || (u.email && u.email.split('@')[0]) || userId;
  return String(userId).length > 20 ? String(userId).slice(0, 12) + '…' : userId;
}

function enrichOcrAnalytics(rec) {
  const text = String(rec.correctedText || rec.fullText || rec.textPreview || '');
  const enriched = analytics.enrichEvent('ocr', {
    preview: text,
    fileName: rec.fileName,
    userId: rec.userId
  });
  const keywords = (enriched.keywords || []).slice(0, 12);
  const category = enriched.category || analytics.classifyCategory(text);
  const riskLevel = enriched.riskLevel || 'low';
  let riskAnalysis = '未检测到明显高风险表述。';
  if (riskLevel === 'high') {
    riskAnalysis = '文本涉及刑事、诈骗、暴力等高风险表述，建议人工复核并留存证据。';
  } else if (riskLevel === 'mid') {
    riskAnalysis = '存在合同违约、劳动争议等中等风险要素，可结合类案进一步分析。';
  }
  if (keywords.length) {
    riskAnalysis += ' 关键词：' + keywords.slice(0, 5).join('、') + '。';
  }
  const summary = text.replace(/\s+/g, ' ').trim().slice(0, 160) || '（无提取文本）';
  let confidence = rec.confidence;
  if (typeof confidence !== 'number') {
    if (rec.status === 'failed') confidence = 0;
    else if (rec.status === 'processing') confidence = null;
    else confidence = Math.min(99, Math.max(72, 78 + Math.min(20, (rec.lines || 0) * 2)));
  }
  return {
    userName: rec.userName || resolveUserDisplay(rec.userId),
    fileType: rec.fileType || fileTypeFromName(rec.fileName),
    confidence: confidence,
    riskLevel: riskLevel,
    legalCategory: analytics.categoryLabel(category),
    legalCategoryId: category,
    keywords: keywords,
    riskAnalysis: riskAnalysis,
    summary: summary
  };
}

function normalizeOcrRecord(rec) {
  const status = normalizeOcrStatus(rec);
  const ocrType = rec.ocrType || rec.source || 'general';
  const base = Object.assign({}, rec, {
    status: status,
    ocrType: ocrType,
    fileName: fixFileName(rec.fileName || ''),
    durationMs: typeof rec.durationMs === 'number' ? rec.durationMs : 0,
    lines: rec.lines || 0,
    fileUrl: rec.fileUrl || '',
    fullText: ensureUtf8String(rec.fullText || rec.textPreview || ''),
    correctedText: ensureUtf8String(rec.correctedText || ''),
    textPreview: ensureUtf8String(rec.textPreview || '')
  });
  return Object.assign(base, enrichOcrAnalytics(base));
}

function appendOcrRecord(rec) {
  const list = readJson(FILES.ocrRecords, []);
  const row = normalizeOcrRecord(Object.assign({
    id: 'ocr_' + Date.now(),
    createdAt: new Date().toISOString()
  }, rec));
  list.unshift(row);
  if (list.length > 500) list.length = 500;
  writeJson(FILES.ocrRecords, list);
  dataDb.writeTable(dataDb.TABLES.ocrRecords, list);
  recordBehaviorFromEvent('ocr', 'recognize', {
    userId: row.userId,
    fileName: row.fileName,
    preview: row.textPreview
  }, {
    userId: row.userId,
    status: row.status === 'failed' ? 'failed' : 'success',
    duration: row.durationMs
  });
  if (row.status === 'failed') {
    recordSystemError('ocr_error', row.errorMessage || 'OCR failed', { userId: row.userId });
  } else if (settingsRuntime.isAutoAnalysisEnabled()) {
    metrics.detectAndLogRisk(row.fullText || row.textPreview || '', {
      userId: row.userId,
      source: 'ocr',
      relatedId: row.id
    });
  }
  notifyRealtime();
  return row;
}

function getOcrById(id) {
  const list = readJson(FILES.ocrRecords, []);
  const found = list.find(function (r) { return r.id === id; });
  return found ? normalizeOcrRecord(found) : null;
}

function updateOcrRecord(id, patch) {
  const list = readJson(FILES.ocrRecords, []);
  const idx = list.findIndex(function (r) { return r.id === id; });
  if (idx === -1) return null;
  list[idx] = normalizeOcrRecord(Object.assign({}, list[idx], patch, { updatedAt: new Date().toISOString() }));
  writeJson(FILES.ocrRecords, list);
  dataDb.writeTable(dataDb.TABLES.ocrRecords, list);
  bumpDataRevision();
  return list[idx];
}

function listOcrRecords(opts) {
  opts = opts || {};
  const page = Math.max(1, parseInt(opts.page, 10) || 1);
  const pageSize = Math.min(50, parseInt(opts.pageSize, 10) || 15);
  let list = readJson(FILES.ocrRecords, []).map(function (r) { return normalizeOcrRecord(r); });

  const search = (opts.search || '').trim().toLowerCase();
  if (search) {
    list = list.filter(function (r) {
      const blob = [r.fileName, r.textPreview, r.fullText, r.correctedText, r.userId, r.userName, r.ocrType, r.legalCategory].join(' ').toLowerCase();
      return blob.indexOf(search) >= 0;
    });
  }

  if (opts.status && opts.status !== 'all') {
    list = list.filter(function (r) { return r.status === opts.status; });
  }

  if (opts.ocrType && opts.ocrType !== 'all') {
    list = list.filter(function (r) { return r.ocrType === opts.ocrType; });
  }

  if (opts.riskLevel && opts.riskLevel !== 'all') {
    list = list.filter(function (r) { return (r.riskLevel || 'low') === opts.riskLevel; });
  }

  const dateFrom = opts.dateFrom ? String(opts.dateFrom).slice(0, 10) : '';
  const dateTo = opts.dateTo ? String(opts.dateTo).slice(0, 10) : '';
  if (dateFrom) {
    list = list.filter(function (r) { return (r.createdAt || '').slice(0, 10) >= dateFrom; });
  }
  if (dateTo) {
    list = list.filter(function (r) { return (r.createdAt || '').slice(0, 10) <= dateTo; });
  }

  var seen = {};
  list = list.filter(function (r) {
    var key = ocrDedupeKey(r);
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });

  const total = list.length;
  const start = (page - 1) * pageSize;
  return {
    list: list.slice(start, start + pageSize),
    total: total,
    page: page,
    pageSize: pageSize
  };
}

function getOcrStats() {
  const today = new Date().toISOString().slice(0, 10);
  const base = metrics.ocrStatsForDay(today);
  const list = readJson(FILES.ocrRecords, []).map(normalizeOcrRecord);
  const processingList = list.filter(function (r) {
    return (r.createdAt || '').slice(0, 10) === today && r.status === 'processing';
  });
  const todayList = list.filter(function (r) { return (r.createdAt || '').slice(0, 10) === today; });
  const riskDocs = todayList.filter(function (r) {
    return r.riskLevel === 'high' || r.riskLevel === 'mid';
  }).length;
  return Object.assign({}, base, {
    processingCount: processingList.length,
    totalCount: list.length,
    riskDocumentCount: riskDocs,
    modelStatus: 'online',
    modelLabel: '腾讯云 OCR'
  });
}

function appendDocRecord(rec) {
  const row = Object.assign({ id: 'doc_' + Date.now(), createdAt: new Date().toISOString() }, rec);
  const list = readJson(FILES.docRecords, []);
  list.unshift(row);
  if (list.length > 500) list.length = 500;
  writeJson(FILES.docRecords, list);
  dataDb.appendDocumentGenerate({
    id: row.id,
    userId: row.userId || 'guest',
    docType: row.docType || row.type || '法律文书',
    title: row.title || '',
    status: 'success',
    createdAt: row.createdAt
  });
  notifyRealtime();
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
  const wsN = realtimeHub ? realtimeHub.connectionCount() : 0;
  const core = metrics.buildStats(loadPlatformUsers, wsN);
  const pub = getPublicityReads();
  const risk = metrics.riskBreakdownFromLogs();
  const riskMid = (risk.find(function (r) { return r.name === 'mid'; }) || {}).value || 0;
  const today = new Date().toISOString().slice(0, 10);
  const visits = readJson(FILES.visits, { daily: {}, total: 0 });
  const consultCount = dataDb.listConsult({}).length;
  const documentCount = dataDb.listDocumentGenerate({}).length;
  const ocrCount = dataDb.readOcrRecords().length;
  const faguiCount = metrics.faguiTotalFromBehavior();
  const aiCalls = consultCount + faguiCount + documentCount + ocrCount;
  return Object.assign({}, core, {
    riskMid: riskMid,
    todayVisits: visits.daily[today] || 0,
    aiCalls: aiCalls,
    aiCallsToday: (core.consultToday || 0) + (core.faguiToday || 0) +
      (core.documentToday || 0) + (core.ocrToday || 0),
    documentCount: documentCount,
    consultCount: consultCount,
    ocrCount: ocrCount,
    faguiCount: faguiCount,
    pufaReadsToday: pub.todayReads || 0,
    pufaReadsTotal: pub.totalReads || 0,
    revision: getDataRevision(),
    serverTime: new Date().toISOString()
  });
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
  const merged = metrics.keywordCloudFromData(limit || 48);
  if (merged.length) return merged;
  const events = readEventStream();
  const freq = {};
  const bump = function (k, n) {
    if (!k || String(k).length < 2) return;
    const key = String(k).trim();
    freq[key] = (freq[key] || 0) + (n || 1);
  };
  events.forEach(function (e) {
    const p = e.payload || {};
    (p.keywords || []).forEach(function (k) { bump(k, 2); });
    const text = [p.preview, p.keyword, p.title].filter(Boolean).join(' ');
    (text.match(/[\u4e00-\u9fa5]{2,6}/g) || []).forEach(function (w) { bump(w, 1); });
    if (p.keyword) String(p.keyword).split(/[\s,，、；;]+/).forEach(function (k) { bump(k, 2); });
  });
  return Object.keys(freq)
    .sort(function (a, b) { return freq[b] - freq[a]; })
    .slice(0, limit || 48)
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

function buildRealtimePayload(lawStore, range) {
  const publicity = getMergedPublicityStats(lawStore);
  const stats = statsOverview();
  const events = readEventStream();
  const charts7 = metrics.chartSeries(range || 'week', loadPlatformUsers);
  const charts30 = metrics.chartSeries('month', loadPlatformUsers);
  const categories = metrics.categoryBreakdownFromConsult();
  const moduleUsage = metrics.moduleUsageFromBehavior();
  const insights = metrics.generateInsights(stats, charts7, categories);
  const riskEvents = metrics.listEnhancedRisks(20).map(function (r) {
    return {
      id: r.id,
      title: r.title,
      time: r.createdAt,
      level: r.level,
      type: r.type || '风险预警',
      user: r.user || r.userId || '系统监测',
      source: r.source
    };
  });
  return {
    revision: stats.revision,
    serverTime: new Date().toISOString(),
    stats: stats,
    events: events,
    charts: charts7,
    charts30: charts30,
    userGrowth30: charts30.userGrowth || { labels: charts30.labels || [], values: [] },
    hourlyHeatmap: metrics.hourlyHeatmap(),
    dwellSeries: metrics.dwellFromBehavior(),
    categories: categories,
    consultHotspots: categories.slice(0, 6),
    moduleUsage: moduleUsage,
    risks: metrics.riskBreakdownFromLogs(),
    keywords: keywordCloud(48),
    topQuestions: topQuestions(10),
    feed: metrics.behaviorFeed(40),
    insights: insights,
    riskEvents: riskEvents,
    regulationHeat: metrics.regulationHeatFromBehavior(24),
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
      apiStatus: stats.systemStatus === 'healthy' ? 'online' : 'degraded',
      ocrStatus: (stats.ocrSuccessRate || 0) >= 80 ? 'normal' : 'degraded',
      eventTotal: readSystemEventLogs().length,
      responseMs: stats.avgResponseMs || 0
    }
  };
}

function chartSeries(daysOrRange) {
  if (typeof daysOrRange === 'number') {
    return metrics.chartSeries(daysOrRange >= 28 ? 'month' : 'week', loadPlatformUsers);
  }
  return metrics.chartSeries(daysOrRange || 'week', loadPlatformUsers);
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
  }), { ip: meta.ip, page: meta.page });
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
  appendOcrRecord, getOcrById, updateOcrRecord, listOcrRecords, getOcrStats,
  appendDocRecord, statsOverview, chartSeries,
  categoryBreakdown, consultationHotspots, moduleUsageRanking, realtimeFeed, listLogs, initDefaults,
  bumpDataRevision, getDataRevision, buildRealtimePayload,
  riskBreakdown, keywordCloud, topQuestions,
  bumpPufaRead, getMergedPublicityStats, logOperationFromClient,
  setRealtimeHub, recordBehavior, touchHeartbeat, recordApiMonitor, recordSystemError,
  formatEventMessage: formatEventMessage,
  dataDb: dataDb
};

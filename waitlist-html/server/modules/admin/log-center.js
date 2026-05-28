/**
 * 系统日志中心 · 统一结构 / 查询 / 写入 / 去重
 */
const store = require('./admin-store');
const dataDb = require('./admin-data-db');
const settingsRuntime = require('./settings-runtime');

const MODULE_LABELS = {
  ocr: 'OCR',
  document: '文书',
  consult: '咨询',
  regulation: '法规',
  risk: '风控',
  operation: '运营',
  pufa: '运营',
  auth: '系统',
  system: '系统',
  page: '系统',
  case: '咨询',
  upload: 'OCR'
};

const DEDUP_MS = 30000;
const dedupCache = new Map();

function today() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeModule(mod) {
  const m = String(mod || 'system').toLowerCase();
  if (m === 'law-education' || m === 'law_education') return 'operation';
  if (m === '风控' || m === 'risk-center') return 'risk';
  return m;
}

function inferActionType(action, eventType) {
  const a = String(action || '').toLowerCase();
  const t = String(eventType || '').toLowerCase();
  if (a === 'login' || a === 'admin_login' || a === 'register' || t.indexOf('login') >= 0) return 'login';
  if (a === 'delete' || t.indexOf('delete') >= 0) return 'delete';
  if (a === 'update' || a === 'processing' || a === 'resolved' || a === 'ignored') return 'update';
  if (a === 'visit' || a === 'search' || a === 'view' || a === 'query' || a === 'ask' && t === 'ai_fagui') return 'query';
  if (a === 'generate' || a === 'recognize' || a === 'upload' || a === 'ask' || a === 'create') return 'create';
  if (t === 'page_visit') return 'query';
  return 'query';
}

function actionNameFromEvent(e, payload) {
  if (payload.actionName) return String(payload.actionName);
  const msg = store.formatEventMessage({ type: e.type, payload: payload });
  if (msg && msg !== e.type) return msg;
  const map = {
    ask: '提交咨询',
    generate: '生成文书',
    recognize: 'OCR识别',
    search: '查询法规',
    login: '用户登录',
    admin_login: '管理员登录',
    visit: '访问页面',
    upload: '上传文件',
    update: '更新记录',
    delete: '删除记录',
    view: '查看详情'
  };
  return map[e.action] || map[payload.action] || e.action || '系统操作';
}

function safeJson(data) {
  if (data == null) return null;
  if (typeof data === 'string') {
    try { return JSON.parse(data); } catch (err) { return { raw: data }; }
  }
  try {
    return JSON.parse(JSON.stringify(data));
  } catch (err) {
    return { raw: String(data) };
  }
}

function linkForModule(mod, targetId) {
  if (!targetId) return '';
  switch (normalizeModule(mod)) {
    case 'ocr': return 'ocr.html?id=' + encodeURIComponent(targetId);
    case 'document': return 'documents.html?id=' + encodeURIComponent(targetId);
    case 'consult': return 'consultations.html?id=' + encodeURIComponent(targetId);
    case 'regulation': return 'regulations.html?id=' + encodeURIComponent(targetId);
    case 'risk': return 'risks.html?id=' + encodeURIComponent(targetId);
    default: return '';
  }
}

function eventToRow(e) {
  const p = e.payload || {};
  const mod = normalizeModule(e.module);
  const actionType = p.actionType || inferActionType(e.action, e.type);
  const targetId = p.targetId || p.relatedId || p.recordId || p.ocrId || p.docId || '';
  const userName = p.userName || p.email || p.nickname || e.userId || 'guest';

  return {
    id: e.id,
    actionType: actionType,
    module: mod,
    moduleLabel: MODULE_LABELS[mod] || mod,
    actionName: actionNameFromEvent(e, p),
    userId: e.userId || p.userId || 'guest',
    userName: userName,
    targetId: targetId,
    description: p.description || p.preview || p.keyword || p.title || store.formatEventMessage(e) || '',
    requestData: safeJson(p.requestData != null ? p.requestData : p.request),
    responseData: safeJson(p.responseData != null ? p.responseData : p.response),
    status: e.status === 'failed' ? 'failed' : 'success',
    createdAt: e.createdAt,
    ipAddress: p.ip || p.ipAddress || '',
    link: p.link || linkForModule(mod, targetId),
    eventType: e.type,
    duration: e.duration || 0
  };
}

function collectAllEvents() {
  return store.listLogs({});
}

function shouldDedup(body) {
  const mod = normalizeModule(body.module);
  const name = String(body.actionName || '').trim();
  const uid = String(body.userId || 'guest');
  if (!name) return false;
  const highFreq = mod === 'page' || mod === 'system' || name.indexOf('访问') >= 0 || body.actionType === 'query';
  if (!highFreq && body.actionType !== 'query') return false;
  const key = mod + '|' + name + '|' + uid;
  const now = Date.now();
  const prev = dedupCache.get(key);
  if (prev && now - prev < DEDUP_MS) return true;
  dedupCache.set(key, now);
  if (dedupCache.size > 5000) {
    dedupCache.forEach(function (t, k) {
      if (now - t > DEDUP_MS * 2) dedupCache.delete(k);
    });
  }
  return false;
}

function mapActionTypeToEvent(actionType, module) {
  const mod = normalizeModule(module);
  if (actionType === 'login') return 'user_login';
  if (mod === 'ocr' && actionType === 'create') return 'ocr';
  if (mod === 'document' && actionType === 'create') return 'ai_wenshi';
  if (mod === 'consult' && actionType === 'create') return 'ai_chat';
  if (mod === 'regulation' && actionType === 'query') return 'ai_fagui';
  if (mod === 'risk' && actionType === 'update') return 'risk_handle';
  if (mod === 'operation') return 'law_edu_visit';
  return 'system_event';
}

function createLog(body, reqMeta) {
  body = body || {};
  const mod = normalizeModule(body.module);
  if (!settingsRuntime.isOperationTrackingEnabled() && mod !== 'system') {
    return { skipped: true, reason: 'operation_tracking_disabled' };
  }
  if (shouldDedup(body)) {
    return { skipped: true, reason: 'dedup' };
  }

  const eventType = body.eventType || mapActionTypeToEvent(body.actionType, mod);
  const payload = {
    userId: body.userId || (reqMeta && reqMeta.userId) || 'guest',
    userName: body.userName || '',
    email: body.userName || body.userId,
    actionName: body.actionName || '',
    actionType: body.actionType || 'query',
    targetId: body.targetId || '',
    relatedId: body.targetId || '',
    description: body.description || '',
    requestData: body.requestData,
    responseData: body.responseData,
    preview: body.description || body.actionName || '',
    success: body.status !== 'failed',
    ip: body.ipAddress || (reqMeta && reqMeta.ip) || ''
  };

  const row = store.logEvent(eventType, payload, {
    ip: payload.ip,
    page: body.sourcePage || ''
  });

  return eventToRow({
    id: row.id,
    type: eventType,
    payload: Object.assign({}, payload, {
      requestData: body.requestData,
      responseData: body.responseData
    }),
    createdAt: row.timestamp,
    module: mod,
    action: body.action || body.actionType,
    userId: row.user_id,
    status: row.status,
    duration: row.duration
  });
}

function filterEvents(events, opts) {
  opts = opts || {};
  let rows = events;

  if (opts.module && opts.module !== 'all') {
    const m = normalizeModule(opts.module);
    rows = rows.filter(function (e) { return normalizeModule(e.module) === m; });
  }
  if (opts.actionType && opts.actionType !== 'all') {
    rows = rows.filter(function (e) {
      const p = e.payload || {};
      const at = p.actionType || inferActionType(e.action, e.type);
      return at === opts.actionType;
    });
  }
  if (opts.userId) {
    rows = rows.filter(function (e) {
      return String(e.userId || (e.payload && e.payload.userId) || '') === String(opts.userId);
    });
  }
  if (opts.status && opts.status !== 'all') {
    rows = rows.filter(function (e) {
      const st = e.status === 'failed' ? 'failed' : 'success';
      return st === opts.status;
    });
  }
  if (opts.dateFrom) {
    rows = rows.filter(function (e) {
      return String(e.createdAt || '').slice(0, 10) >= String(opts.dateFrom).slice(0, 10);
    });
  }
  if (opts.dateTo) {
    rows = rows.filter(function (e) {
      return String(e.createdAt || '').slice(0, 10) <= String(opts.dateTo).slice(0, 10);
    });
  }
  if (opts.keyword || opts.search) {
    const q = String(opts.keyword || opts.search).toLowerCase();
    rows = rows.filter(function (e) {
      const row = eventToRow(e);
      const hay = [
        row.actionName, row.description, row.userName, row.userId,
        row.moduleLabel, row.targetId
      ].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  return rows;
}

function list(opts) {
  opts = opts || {};
  const events = filterEvents(collectAllEvents(), opts);
  const page = Math.max(1, parseInt(opts.page, 10) || 1);
  const pageSize = Math.min(100, parseInt(opts.pageSize, 10) || 20);
  const total = events.length;
  const start = (page - 1) * pageSize;

  return {
    list: events.slice(start, start + pageSize).map(eventToRow),
    total: total,
    page: page,
    pageSize: pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  };
}

function getDetail(id) {
  const e = collectAllEvents().find(function (r) { return r.id === id; });
  if (!e) return null;
  const row = eventToRow(e);
  const p = e.payload || {};
  return Object.assign({}, row, {
    rawEvent: { type: e.type, action: e.action, payload: p },
    timeline: [{ time: row.createdAt, event: row.actionName, detail: row.description }]
  });
}

function buildOverview() {
  const all = collectAllEvents();
  const day = today();
  let todayCount = 0;
  let successCount = 0;
  let failedCount = 0;
  const moduleFreq = {};

  all.forEach(function (e) {
    const d = String(e.createdAt || '').slice(0, 10);
    if (d === day) todayCount++;
    if (e.status === 'failed') failedCount++;
    else successCount++;
    const mod = normalizeModule(e.module);
    moduleFreq[mod] = (moduleFreq[mod] || 0) + 1;
  });

  let topModule = '';
  let topCount = 0;
  Object.keys(moduleFreq).forEach(function (k) {
    if (moduleFreq[k] > topCount) {
      topCount = moduleFreq[k];
      topModule = k;
    }
  });

  return {
    totalLogs: all.length,
    todayCount: todayCount,
    successCount: successCount,
    failedCount: failedCount,
    topModule: topModule,
    topModuleLabel: MODULE_LABELS[topModule] || topModule || '—',
    topModuleCount: topCount,
    updatedAt: new Date().toISOString()
  };
}

function emptyOverview() {
  return {
    totalLogs: 0,
    todayCount: 0,
    successCount: 0,
    failedCount: 0,
    topModule: '',
    topModuleLabel: '—',
    topModuleCount: 0
  };
}

module.exports = {
  list: list,
  getDetail: getDetail,
  buildOverview: buildOverview,
  createLog: createLog,
  eventToRow: eventToRow,
  emptyOverview: emptyOverview,
  MODULE_LABELS: MODULE_LABELS
};

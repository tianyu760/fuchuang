/**
 * 管理端业务数据表（JSON 持久化，结构对齐关系型表）
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'admin');

const TABLES = {
  userBehaviorLogs: path.join(DATA_DIR, 'user-behavior-logs.json'),
  consultRecords: path.join(DATA_DIR, 'consult-records.json'),
  documentGenerateLogs: path.join(DATA_DIR, 'document-generate-logs.json'),
  riskWarningLogs: path.join(DATA_DIR, 'risk-warning-logs.json'),
  systemMonitorLogs: path.join(DATA_DIR, 'system-monitor-logs.json'),
  onlinePresence: path.join(DATA_DIR, 'online-presence.json'),
  ocrRecords: path.join(DATA_DIR, 'ocr-records.json')
};

const MAX = {
  behavior: 15000,
  consult: 8000,
  document: 5000,
  risk: 3000,
  monitor: 20000,
  presence: 5000
};

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readTable(file, fallback) {
  ensureDir();
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) { /* ignore */ }
  return fallback;
}

function writeTable(file, data) {
  ensureDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

function newId(prefix) {
  return prefix + '_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
}

function trimList(list, max) {
  if (list.length > max) list.splice(0, list.length - max);
}

function initTables() {
  ensureDir();
  Object.keys(TABLES).forEach(function (k) {
    const f = TABLES[k];
    if (!fs.existsSync(f)) {
      writeTable(f, k === 'onlinePresence' ? { sessions: [] } : []);
    }
  });
}

initTables();

function appendBehavior(row) {
  const list = readTable(TABLES.userBehaviorLogs, []);
  const entry = Object.assign({
    id: newId('ubl'),
    userId: 'guest',
    userName: '',
    action: 'unknown',
    module: 'system',
    result: 'success',
    ip: '',
    sourcePage: '',
    detail: '',
    createdAt: new Date().toISOString()
  }, row || {});
  list.push(entry);
  trimList(list, MAX.behavior);
  writeTable(TABLES.userBehaviorLogs, list);
  return entry;
}

function listBehavior(opts) {
  opts = opts || {};
  let list = readTable(TABLES.userBehaviorLogs, []).slice();
  if (opts.since) {
    const t = new Date(opts.since).getTime();
    list = list.filter(function (r) { return new Date(r.createdAt).getTime() >= t; });
  }
  if (opts.action) {
    list = list.filter(function (r) { return r.action === opts.action; });
  }
  list.sort(function (a, b) {
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
  const limit = opts.limit || 100;
  return list.slice(0, limit);
}

function appendConsult(row) {
  const list = readTable(TABLES.consultRecords, []);
  const entry = Object.assign({
    id: newId('cst'),
    userId: 'guest',
    question: '',
    keywords: [],
    category: 'other',
    riskLevel: 'mid',
    createdAt: new Date().toISOString()
  }, row || {});
  list.push(entry);
  trimList(list, MAX.consult);
  writeTable(TABLES.consultRecords, list);
  return entry;
}

function listConsult(opts) {
  opts = opts || {};
  let list = readTable(TABLES.consultRecords, []);
  const day = opts.day;
  if (day) {
    list = list.filter(function (r) { return String(r.createdAt || '').slice(0, 10) === day; });
  }
  const from = opts.from;
  const to = opts.to;
  if (from) {
    list = list.filter(function (r) { return String(r.createdAt || '').slice(0, 10) >= from; });
  }
  if (to) {
    list = list.filter(function (r) { return String(r.createdAt || '').slice(0, 10) <= to; });
  }
  return list;
}

function appendDocumentGenerate(row) {
  const list = readTable(TABLES.documentGenerateLogs, []);
  const entry = Object.assign({
    id: newId('dgl'),
    userId: 'guest',
    docType: '文书',
    title: '',
    status: 'success',
    createdAt: new Date().toISOString()
  }, row || {});
  list.unshift(entry);
  trimList(list, MAX.document);
  writeTable(TABLES.documentGenerateLogs, list);
  return entry;
}

function listDocumentGenerate(opts) {
  opts = opts || {};
  let list = readTable(TABLES.documentGenerateLogs, []);
  const day = opts.day;
  if (day) {
    list = list.filter(function (r) { return String(r.createdAt || '').slice(0, 10) === day; });
  }
  const from = opts.from;
  const to = opts.to;
  if (from) list = list.filter(function (r) { return String(r.createdAt || '').slice(0, 10) >= from; });
  if (to) list = list.filter(function (r) { return String(r.createdAt || '').slice(0, 10) <= to; });
  return list;
}

function appendRiskWarning(row) {
  const list = readTable(TABLES.riskWarningLogs, []);
  const entry = Object.assign({
    id: newId('rsk'),
    userId: 'guest',
    level: 'high',
    title: '',
    source: 'auto',
    keywords: [],
    createdAt: new Date().toISOString()
  }, row || {});
  list.unshift(entry);
  trimList(list, MAX.risk);
  writeTable(TABLES.riskWarningLogs, list);
  return entry;
}

function listRiskWarnings(opts) {
  opts = opts || {};
  let list = readTable(TABLES.riskWarningLogs, []);
  if (opts.day) {
    list = list.filter(function (r) { return String(r.createdAt || '').slice(0, 10) === opts.day; });
  }
  if (opts.level) {
    list = list.filter(function (r) { return r.level === opts.level; });
  }
  return list.slice(0, opts.limit || 50);
}

function appendMonitor(row) {
  const list = readTable(TABLES.systemMonitorLogs, []);
  const entry = Object.assign({
    id: newId('mon'),
    type: 'api',
    path: '',
    method: 'GET',
    statusCode: 200,
    durationMs: 0,
    message: '',
    createdAt: new Date().toISOString()
  }, row || {});
  list.push(entry);
  trimList(list, MAX.monitor);
  writeTable(TABLES.systemMonitorLogs, list);
  return entry;
}

function listMonitor(opts) {
  opts = opts || {};
  let list = readTable(TABLES.systemMonitorLogs, []);
  if (opts.type) list = list.filter(function (r) { return r.type === opts.type; });
  if (opts.since) {
    const t = new Date(opts.since).getTime();
    list = list.filter(function (r) { return new Date(r.createdAt).getTime() >= t; });
  }
  return list;
}

function touchPresence(session) {
  const data = readTable(TABLES.onlinePresence, { sessions: [] });
  const sessions = data.sessions || [];
  const userId = session.userId || 'guest';
  const now = Date.now();
  const fiveMin = 5 * 60 * 1000;
  const filtered = sessions.filter(function (s) {
    return now - (s.at || 0) < fiveMin;
  });
  const idx = filtered.findIndex(function (s) {
    return s.userId === userId && (session.connectionId ? s.connectionId === session.connectionId : true);
  });
  const row = {
    userId: userId,
    userName: session.userName || '',
    ip: session.ip || '',
    sourcePage: session.sourcePage || '',
    at: now,
    connectionId: session.connectionId || ''
  };
  if (idx >= 0) filtered[idx] = row;
  else filtered.push(row);
  trimList(filtered, MAX.presence);
  writeTable(TABLES.onlinePresence, { sessions: filtered });
  return filtered.length;
}

function countOnlineUsers(wsConnections) {
  const data = readTable(TABLES.onlinePresence, { sessions: [] });
  const now = Date.now();
  const fiveMin = 5 * 60 * 1000;
  const active = (data.sessions || []).filter(function (s) {
    return now - (s.at || 0) < fiveMin;
  });
  const userSet = {};
  active.forEach(function (s) {
    if (s.userId && s.userId !== 'guest') userSet[s.userId] = 1;
  });
  const fromHeartbeat = Object.keys(userSet).length;
  const wsCount = typeof wsConnections === 'number' ? wsConnections : 0;
  return Math.max(fromHeartbeat, wsCount);
}

function readOcrRecords() {
  return readTable(TABLES.ocrRecords, []);
}

module.exports = {
  TABLES: TABLES,
  initTables: initTables,
  appendBehavior: appendBehavior,
  listBehavior: listBehavior,
  appendConsult: appendConsult,
  listConsult: listConsult,
  appendDocumentGenerate: appendDocumentGenerate,
  listDocumentGenerate: listDocumentGenerate,
  appendRiskWarning: appendRiskWarning,
  listRiskWarnings: listRiskWarnings,
  appendMonitor: appendMonitor,
  listMonitor: listMonitor,
  touchPresence: touchPresence,
  countOnlineUsers: countOnlineUsers,
  readOcrRecords: readOcrRecords,
  readTable: readTable,
  writeTable: writeTable
};

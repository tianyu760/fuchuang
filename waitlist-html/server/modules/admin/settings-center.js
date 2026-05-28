/**
 * 平台配置中心 · 分层 settings 持久化
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '..', 'data', 'admin', 'platform-settings.json');

const DEFAULTS = {
  system: {
    platformName: '法绎法律科技',
    logoUrl: '',
    themeColor: '#38bdf8',
    defaultLanguage: 'zh-CN',
    timezone: 'Asia/Shanghai'
  },
  ai: {
    ocrEnabled: true,
    documentAiEnabled: true,
    riskSensitivity: 'medium',
    regulationRecommend: true,
    autoAnalysis: true
  },
  data: {
    logRetentionDays: 30,
    cacheTtlMinutes: 5,
    systemLogEnabled: true,
    operationTracking: true,
    allowDataExport: true
  },
  security: {
    loginCaptcha: true,
    adminLevel: 'standard',
    ipWhitelist: '',
    confirmSensitiveOps: true,
    sensitiveOpLog: true
  }
};

const MODULES = ['system', 'ai', 'data', 'security'];

function ensureDir() {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readAll() {
  ensureDir();
  try {
    if (fs.existsSync(FILE)) {
      const raw = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
      return mergeDefaults(raw);
    }
  } catch (e) {
    console.warn('[settings-center] read failed', e.message);
  }
  return mergeDefaults({});
}

function mergeDefaults(partial) {
  const out = {};
  MODULES.forEach(function (key) {
    out[key] = Object.assign({}, DEFAULTS[key], partial[key] || {});
  });
  out.updatedAt = partial.updatedAt || new Date().toISOString();
  return out;
}

function writeAll(data) {
  ensureDir();
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf-8');
  try {
    const runtime = require('./settings-runtime');
    runtime.invalidate();
    runtime.maybePruneLogs();
  } catch (e) { /* ignore */ }
  return data;
}

function getModule(name) {
  if (MODULES.indexOf(name) < 0) return null;
  const all = readAll();
  return all[name];
}

function updateModule(name, patch) {
  if (MODULES.indexOf(name) < 0) {
    const err = new Error('未知配置模块');
    err.statusCode = 400;
    throw err;
  }
  const all = readAll();
  all[name] = Object.assign({}, DEFAULTS[name], all[name], patch || {});
  writeAll(all);
  return all[name];
}

function getAll() {
  return readAll();
}

function resetModule(name) {
  if (MODULES.indexOf(name) < 0) return null;
  const all = readAll();
  all[name] = Object.assign({}, DEFAULTS[name]);
  writeAll(all);
  return all[name];
}

function resetAll() {
  const data = mergeDefaults({});
  writeAll(data);
  return data;
}

/** 运行时读取（供其他模块使用） */
function getRuntime() {
  return readAll();
}

module.exports = {
  DEFAULTS: DEFAULTS,
  MODULES: MODULES,
  getModule: getModule,
  updateModule: updateModule,
  getAll: getAll,
  resetModule: resetModule,
  resetAll: resetAll,
  getRuntime: getRuntime
};

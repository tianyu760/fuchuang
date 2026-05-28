/**
 * 平台配置运行时 · 供业务模块读取（带短缓存）
 */
const fs = require('fs');
const path = require('path');
const settingsCenter = require('./settings-center');

const EVENT_LOG_FILE = path.join(__dirname, '..', '..', 'data', 'admin', 'system-event-log.json');
const CACHE_MS = 2500;

let cached = null;
let cachedAt = 0;
let lastPruneAt = 0;

function invalidate() {
  cached = null;
  cachedAt = 0;
}

function get() {
  if (cached && Date.now() - cachedAt < CACHE_MS) return cached;
  cached = settingsCenter.getRuntime();
  cachedAt = Date.now();
  return cached;
}

function mod(name) {
  return get()[name] || {};
}

function normalizeIp(ip) {
  const s = String(ip || '').trim();
  if (!s) return '';
  if (s.indexOf(',') >= 0) return normalizeIp(s.split(',')[0]);
  if (s.startsWith('::ffff:')) return s.slice(7);
  return s;
}

function isOcrEnabled() {
  return mod('ai').ocrEnabled !== false;
}

function isDocumentAiEnabled() {
  return mod('ai').documentAiEnabled !== false;
}

function isRegulationRecommendEnabled() {
  return mod('ai').regulationRecommend !== false;
}

function isAutoAnalysisEnabled() {
  return mod('ai').autoAnalysis !== false;
}

function isSystemLogEnabled() {
  return mod('data').systemLogEnabled !== false;
}

function isOperationTrackingEnabled() {
  return mod('data').operationTracking !== false;
}

function isDataExportAllowed() {
  return mod('data').allowDataExport !== false;
}

function isLoginCaptchaRequired() {
  return mod('security').loginCaptcha !== false;
}

function isSensitiveOpsConfirmRequired() {
  return mod('security').confirmSensitiveOps !== false;
}

function isSensitiveOpLogEnabled() {
  return mod('security').sensitiveOpLog !== false;
}

function getCacheTtlMs() {
  const mins = parseInt(mod('data').cacheTtlMinutes, 10);
  if (!mins || mins < 1) return 5 * 60 * 1000;
  return Math.min(120, mins) * 60 * 1000;
}

function getLogRetentionDays() {
  const d = parseInt(mod('data').logRetentionDays, 10);
  if (!d || d < 1) return 30;
  return Math.min(365, d);
}

function isIpAllowed(ip) {
  const raw = String(mod('security').ipWhitelist || '').trim();
  if (!raw) return true;
  const normalized = normalizeIp(ip);
  if (!normalized) return true;
  if (normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost') {
    return true;
  }
  const list = raw.split(/[,;\s]+/).map(function (s) { return s.trim(); }).filter(Boolean);
  return list.some(function (entry) {
    return normalized === entry || normalized.indexOf(entry) === 0;
  });
}

function getRiskPolicy() {
  const sens = String(mod('ai').riskSensitivity || 'medium').toLowerCase();
  if (sens === 'high') {
    return {
      ocrConfThreshold: 0.85,
      includeMidConsult: true,
      includeLowConsult: true,
      includeLowConfOcr: true
    };
  }
  if (sens === 'low') {
    return {
      ocrConfThreshold: 0.55,
      includeMidConsult: false,
      includeLowConsult: false,
      includeLowConfOcr: false
    };
  }
  return {
    ocrConfThreshold: 0.7,
    includeMidConsult: true,
    includeLowConsult: false,
    includeLowConfOcr: true
  };
}

function getPublicConfig() {
  const sys = mod('system');
  const ai = mod('ai');
  const data = mod('data');
  return {
    platformName: sys.platformName || '法绎法律科技',
    themeColor: sys.themeColor || '#38bdf8',
    defaultLanguage: sys.defaultLanguage || 'zh-CN',
    timezone: sys.timezone || 'Asia/Shanghai',
    features: {
      ocrEnabled: isOcrEnabled(),
      documentAiEnabled: isDocumentAiEnabled(),
      regulationRecommend: isRegulationRecommendEnabled(),
      autoAnalysis: isAutoAnalysisEnabled(),
      allowDataExport: isDataExportAllowed()
    }
  };
}

function maybePruneLogs() {
  const now = Date.now();
  if (now - lastPruneAt < 60000) return;
  lastPruneAt = now;
  const days = getLogRetentionDays();
  const cutoff = new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
  try {
    if (!fs.existsSync(EVENT_LOG_FILE)) return;
    const list = JSON.parse(fs.readFileSync(EVENT_LOG_FILE, 'utf-8'));
    if (!Array.isArray(list) || !list.length) return;
    const kept = list.filter(function (row) {
      const ts = row.timestamp || row.createdAt || '';
      return String(ts) >= cutoff;
    });
    if (kept.length < list.length) {
      fs.writeFileSync(EVENT_LOG_FILE, JSON.stringify(kept, null, 2), 'utf-8');
      console.log('[settings-runtime] pruned system logs:', list.length - kept.length, 'rows, keep', days, 'days');
    }
  } catch (e) {
    console.warn('[settings-runtime] prune logs failed', e.message);
  }
}

module.exports = {
  invalidate: invalidate,
  get: get,
  getPublicConfig: getPublicConfig,
  isOcrEnabled: isOcrEnabled,
  isDocumentAiEnabled: isDocumentAiEnabled,
  isRegulationRecommendEnabled: isRegulationRecommendEnabled,
  isAutoAnalysisEnabled: isAutoAnalysisEnabled,
  isSystemLogEnabled: isSystemLogEnabled,
  isOperationTrackingEnabled: isOperationTrackingEnabled,
  isDataExportAllowed: isDataExportAllowed,
  isLoginCaptchaRequired: isLoginCaptchaRequired,
  isSensitiveOpsConfirmRequired: isSensitiveOpsConfirmRequired,
  isSensitiveOpLogEnabled: isSensitiveOpLogEnabled,
  getCacheTtlMs: getCacheTtlMs,
  getLogRetentionDays: getLogRetentionDays,
  isIpAllowed: isIpAllowed,
  getRiskPolicy: getRiskPolicy,
  maybePruneLogs: maybePruneLogs
};

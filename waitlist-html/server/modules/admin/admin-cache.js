/**
 * 管理端统计缓存（内存 TTL；可选 REDIS_URL 扩展）
 */
const DEFAULT_TTL_MS = 30000;

function resolveDefaultTtl() {
  try {
    return require('./settings-runtime').getCacheTtlMs();
  } catch (e) {
    return DEFAULT_TTL_MS;
  }
}

const mem = new Map();

function key(parts) {
  return Array.isArray(parts) ? parts.join(':') : String(parts);
}

function get(k) {
  const row = mem.get(k);
  if (!row) return null;
  if (row.expiresAt < Date.now()) {
    mem.delete(k);
    return null;
  }
  return row.value;
}

function set(k, value, ttlMs) {
  mem.set(k, {
    value: value,
    expiresAt: Date.now() + (ttlMs != null ? ttlMs : resolveDefaultTtl())
  });
}

function wrap(fn, cacheKey, ttlMs) {
  const cached = get(cacheKey);
  if (cached !== null) return cached;
  const val = fn();
  set(cacheKey, val, ttlMs);
  return val;
}

function invalidatePrefix(prefix) {
  const p = String(prefix);
  mem.forEach(function (_v, k) {
    if (k.indexOf(p) === 0) mem.delete(k);
  });
}

function clearAll() {
  mem.clear();
}

module.exports = {
  get: get,
  set: set,
  wrap: wrap,
  invalidatePrefix: invalidatePrefix,
  clearAll: clearAll,
  key: key
};

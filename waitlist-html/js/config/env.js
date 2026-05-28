/**
 * 前端 API 基址（非 Vite 项目：通过 meta / window 注入，勿写死 localhost）
 * 开发：在 .env.example 参考 FAYI_API_BASE，并在 HTML meta 或控制台设置：
 *   window.FAYI_API_BASE = 'http://127.0.0.1:3002';
 */
(function (global) {
  function readMeta(name) {
    if (typeof document === 'undefined') return '';
    var el = document.querySelector('meta[name="' + name + '"]');
    return el && el.getAttribute('content') ? String(el.getAttribute('content')).trim() : '';
  }

  function normalizeOrigin(base) {
    if (!base) return '';
    return String(base).replace(/\/+$/, '');
  }

  function resolveApiBase() {
    if (global.FAYI_API_BASE) return normalizeOrigin(global.FAYI_API_BASE);
    var meta = readMeta('fayi-api-base');
    if (meta) return normalizeOrigin(meta);
    var loc = typeof location !== 'undefined' ? location : {};
    if (loc.port === '3002') return loc.protocol + '//' + loc.host;
    var host = loc.hostname || '127.0.0.1';
    return 'http://' + host + ':3002';
  }

  function resolveAdminApiBase(apiBase) {
    if (global.FAYI_ADMIN_API_BASE) return normalizeOrigin(global.FAYI_ADMIN_API_BASE);
    var meta = readMeta('fayi-admin-api');
    if (meta) return normalizeOrigin(meta);
    return apiBase + '/api/admin';
  }

  var apiBase = resolveApiBase();
  var adminApiBase = resolveAdminApiBase(apiBase);

  global.FayiEnv = {
    apiBase: apiBase,
    adminApiBase: adminApiBase,
    getServerOrigin: function () { return apiBase; },
    getAdminApiBase: function () { return adminApiBase; }
  };
})(typeof window !== 'undefined' ? window : global);

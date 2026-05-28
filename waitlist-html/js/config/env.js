/**
 * 前端 API 基址（非 Vite 项目：通过 meta / window 注入，勿写死 localhost）
 * 开发：在 .env.example 参考 FAYI_API_BASE，并在 HTML meta 或控制台设置：
 *   window.FAYI_API_BASE = 'http://127.0.0.1:3002';
 * 管理端默认 3003：npm run server:admin
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

  function isAdminPage() {
    var loc = typeof location !== 'undefined' ? location : {};
    var p = loc.pathname || '';
    return /\/admin(\/|$)/.test(p) || /admin-login\.html$/i.test(p);
  }

  function resolveApiBase() {
    if (global.FAYI_API_BASE) return normalizeOrigin(global.FAYI_API_BASE);
    var meta = readMeta('fayi-api-base');
    if (meta) return normalizeOrigin(meta);
    var loc = typeof location !== 'undefined' ? location : {};
    if (loc.port === '3002' || loc.port === '3003') return loc.protocol + '//' + loc.host;
    var host = loc.hostname || '127.0.0.1';
    return 'http://' + host + (isAdminPage() ? ':3003' : ':3002');
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

  function loadPublicSettings() {
    if (!global.fetch) return;
    fetch(apiBase + '/api/settings/public', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (body) {
        if (body && body.data) global.FayiPublicSettings = body.data;
      })
      .catch(function () { /* optional */ });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', loadPublicSettings);
    } else {
      loadPublicSettings();
    }
  }
})(typeof window !== 'undefined' ? window : global);

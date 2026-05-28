/**
 * 管理端 API（/api/admin）— 经 FayiHttp 统一拦截
 */
(function (global) {
  var TOKEN_KEY = 'fayi_admin_token';

  function resolveServerOrigin() {
    if (global.FayiEnv && FayiEnv.apiBase) return FayiEnv.apiBase;
    if (global.FAYI_API_BASE) return String(global.FAYI_API_BASE).replace(/\/$/, '');
    var metaApi = typeof document !== 'undefined'
      ? document.querySelector('meta[name="fayi-api-base"]')
      : null;
    if (metaApi && metaApi.getAttribute('content')) {
      return metaApi.getAttribute('content').replace(/\/$/, '');
    }
    var loc = typeof location !== 'undefined' ? location : {};
    if (loc.port === '3002') return loc.protocol + '//' + loc.host;
    var host = loc.hostname || '127.0.0.1';
    return 'http://' + host + ':3002';
  }

  function resolveAdminApiBase() {
    if (global.FayiEnv && FayiEnv.adminApiBase) return FayiEnv.adminApiBase;
    if (global.FAYI_ADMIN_API_BASE) {
      return String(global.FAYI_ADMIN_API_BASE).replace(/\/$/, '');
    }
    var meta = typeof document !== 'undefined'
      ? document.querySelector('meta[name="fayi-admin-api"]')
      : null;
    if (meta && meta.getAttribute('content')) {
      return meta.getAttribute('content').replace(/\/$/, '');
    }
    return resolveServerOrigin() + '/api/admin';
  }

  var API = resolveAdminApiBase();
  var SERVER_ORIGIN = resolveServerOrigin();
  var INFO_KEY = 'fayi_admin_info';
  var VERIFIED_KEY = 'fayi_admin_permission_verified';
  var FIXED_ADMIN_CODE = 'manager';

  function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
  function setToken(t) {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  }
  function clearToken() {
    setToken('');
    localStorage.removeItem(INFO_KEY);
    localStorage.removeItem(VERIFIED_KEY);
  }

  function getAdminInfo() {
    try {
      var raw = localStorage.getItem(INFO_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function setAdminInfo(user) {
    if (!user) {
      localStorage.removeItem(INFO_KEY);
      return;
    }
    localStorage.setItem(INFO_KEY, JSON.stringify({
      id: user.id,
      email: user.email,
      nickname: user.nickname || user.name,
      name: user.name || user.nickname,
      userType: 'admin',
      identityCode: FIXED_ADMIN_CODE,
      role: 'admin',
      adminPermissionVerified: true
    }));
    localStorage.setItem(VERIFIED_KEY, '1');
  }

  function onUnauthorized() {
    clearToken();
    var onAdminPage = /admin-dashboard\.html/.test(location.pathname) || /admin-dashboard\.html/.test(location.href);
    if (onAdminPage && global.FayiToast) {
      FayiToast('登录已过期，请重新登录', 'error');
      window.setTimeout(function () {
        window.location.replace('admin-login.html');
      }, 800);
    }
  }

  function request(method, path, body) {
    if (!global.FayiHttp) {
      return Promise.reject(new Error('HTTP 客户端未加载，请刷新页面'));
    }
    var headers = {};
    var token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    var opts = {
      method: method,
      headers: headers,
      onUnauthorized: onUnauthorized
    };
    if (body !== undefined) opts.body = body;
    return FayiHttp.request(API + path, opts);
  }

  function loginRequest(email, password, identityCode) {
    return FayiHttp.post(API + '/auth/login', {
      email: email,
      password: password,
      identityCode: identityCode
    }, { silent: false });
  }

  function loginByCodeRequest(identityCode) {
    return FayiHttp.post(API + '/auth/code-login', {
      identityCode: identityCode
    }, { silent: false });
  }

  global.FayiAdminAuth = {
    TOKEN_KEY: TOKEN_KEY,
    INFO_KEY: INFO_KEY,
    FIXED_ADMIN_CODE: FIXED_ADMIN_CODE,
    getToken: getToken,
    setToken: setToken,
    clearToken: clearToken,
    getAdminInfo: getAdminInfo,
    setAdminInfo: setAdminInfo,
    isLoggedIn: function () {
      var info = getAdminInfo();
      var verified = localStorage.getItem(VERIFIED_KEY) === '1';
      return !!getToken() && verified && info && (info.role === 'admin' || info.userType === 'admin');
    },
    requireAuth: function () {
      if (!getToken()) {
        window.location.replace('admin-login.html');
        return false;
      }
      if (localStorage.getItem(VERIFIED_KEY) !== '1') {
        clearToken();
        window.location.replace('admin-login.html');
        return false;
      }
      var info = getAdminInfo();
      if (!info || (info.role !== 'admin' && info.userType !== 'admin')) {
        clearToken();
        window.location.replace('admin-login.html');
        return false;
      }
      return true;
    },
    logout: function () {
      clearToken();
      window.location.href = 'admin-login.html';
    }
  };

  global.FayiAdminApi = {
    getToken: getToken,
    setToken: setToken,
    clearToken: clearToken,
    getAdminInfo: getAdminInfo,
    setAdminInfo: setAdminInfo,
    login: function (email, password, identityCode) {
      return loginRequest(email, password, identityCode);
    },
    loginByCode: function (identityCode) {
      return loginByCodeRequest(identityCode);
    },
    me: function () { return request('GET', '/auth/me'); },
    overview: function () { return request('GET', '/dashboard/overview'); },
    users: function (q) {
      var qs = '?page=' + (q.page || 1) + '&pageSize=' + (q.pageSize || 10);
      if (q.search) qs += '&search=' + encodeURIComponent(q.search);
      return request('GET', '/users' + qs);
    },
    setUserStatus: function (id, status) {
      return request('PUT', '/users/' + id + '/status', { status: status });
    },
    deleteUser: function (id) { return request('DELETE', '/users/' + id); },
    consultations: function (q) {
      var qs = '?page=' + (q.page || 1) + '&pageSize=' + (q.pageSize || 10);
      if (q.search) qs += '&search=' + encodeURIComponent(q.search);
      return request('GET', '/consultations' + qs);
    },
    documents: function (q) {
      return request('GET', '/documents?page=' + (q.page || 1) + '&pageSize=' + (q.pageSize || 10));
    },
    deleteDocument: function (id) { return request('DELETE', '/documents/' + id); },
    regulations: function () { return request('GET', '/regulations'); },
    saveRegulation: function (data, id) {
      if (id) return request('PUT', '/regulations/' + id, data);
      return request('POST', '/regulations', data);
    },
    deleteRegulation: function (id) { return request('DELETE', '/regulations/' + id); },
    lawArticles: function (q) {
      var qs = q && q.search ? '?search=' + encodeURIComponent(q.search) : '';
      return request('GET', '/law-education/articles' + qs);
    },
    saveLawArticle: function (data, id) {
      if (id) return request('PUT', '/law-education/articles/' + id, data);
      return request('POST', '/law-education/articles', data);
    },
    deleteLawArticle: function (id) { return request('DELETE', '/law-education/articles/' + id); },
    lawStats: function () { return request('GET', '/law-education/stats'); },
    getApiBase: function () { return API; },
    getServerOrigin: function () {
      return SERVER_ORIGIN;
    }
  };
})(window);

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
    if (loc.port === '3002' || loc.port === '3003') return loc.protocol + '//' + loc.host;
    var host = loc.hostname || '127.0.0.1';
    var p = loc.pathname || '';
    var adminPage = /\/admin(\/|$)/.test(p) || /admin-login\.html$/i.test(p);
    return 'http://' + host + (adminPage ? ':3003' : ':3002');
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
    var onAdminPage = /admin-dashboard\.html/.test(location.pathname) ||
      /\/admin\//.test(location.pathname) ||
      /admin-dashboard\.html/.test(location.href);
    if (onAdminPage && global.FayiToast) {
      FayiToast('登录已过期，请重新登录', 'error');
      window.setTimeout(function () {
        window.location.replace('admin-login.html');
      }, 800);
    }
  }

  var CACHEABLE_GET = /^\/(documents|ocr|regulations|consultations|users|risks|risk\/|dashboard|analytics|operation\/)/;

  function request(method, path, body, reqOpts) {
    reqOpts = reqOpts || {};
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

    var run = function () { return FayiHttp.request(API + path, opts); };
    var useCache = !reqOpts.force &&
      method === 'GET' &&
      CACHEABLE_GET.test(path) &&
      global.OpsRuntime &&
      OpsRuntime.cachedRequest;

    if (useCache) {
      var key = OpsRuntime.stableKey(method, API + path, body);
      return OpsRuntime.cachedRequest(run, key, {
        ttlMs: reqOpts.ttlMs,
        force: reqOpts.force,
        skipCache: reqOpts.skipCache
      });
    }
    if (method !== 'GET' && global.OpsRuntime) {
      OpsRuntime.invalidate(API);
      return OpsRuntime.runQueued ? OpsRuntime.runQueued(run) : run();
    }
    if (global.OpsRuntime && OpsRuntime.runQueued) {
      return OpsRuntime.runQueued(run);
    }
    return run();
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
      return !!getToken() && verified && info && (
        info.userType === 'admin' || info.role === 'admin' || info.role === 'super_admin'
      );
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
      var okRole = info && (
        info.userType === 'admin' ||
        info.role === 'admin' ||
        info.role === 'super_admin' ||
        info.identityCode === 'manager'
      );
      if (!okRole) {
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
      q = q || {};
      var qs = '?page=' + (q.page || 1) + '&pageSize=' + (q.pageSize || 12);
      if (q.search) qs += '&search=' + encodeURIComponent(q.search);
      if (q.riskLevel && q.riskLevel !== 'all') qs += '&riskLevel=' + encodeURIComponent(q.riskLevel);
      if (q.status && q.status !== 'all') qs += '&status=' + encodeURIComponent(q.status);
      if (q.sort) qs += '&sort=' + encodeURIComponent(q.sort);
      if (q.online && q.online !== 'all') qs += '&online=' + encodeURIComponent(q.online);
      return request('GET', '/users' + qs);
    },
    userDetail: function (id) {
      return request('GET', '/users/' + encodeURIComponent(id));
    },
    setUserTags: function (id, tags) {
      return request('PUT', '/users/' + encodeURIComponent(id) + '/tags', { tags: tags });
    },
    setUserStatus: function (id, status) {
      return request('PUT', '/users/' + id + '/status', { status: status });
    },
    deleteUser: function (id) { return request('DELETE', '/users/' + id); },
    consultationStatistics: function () {
      if (!global.FayiHttp) return Promise.reject(new Error('HTTP 客户端未加载'));
      var headers = {};
      var token = getToken();
      if (token) headers.Authorization = 'Bearer ' + token;
      return FayiHttp.request(API + '/consultations/statistics', {
        method: 'GET',
        headers: headers,
        onUnauthorized: onUnauthorized,
        silent: true
      });
    },
    consultations: function (q) {
      q = q || {};
      var qs = '?page=' + (q.page || 1) + '&pageSize=' + (q.pageSize || 15);
      if (q.search) qs += '&search=' + encodeURIComponent(q.search);
      if (q.category && q.category !== 'all') qs += '&category=' + encodeURIComponent(q.category);
      if (q.riskLevel && q.riskLevel !== 'all') qs += '&riskLevel=' + encodeURIComponent(q.riskLevel);
      if (q.status && q.status !== 'all') qs += '&status=' + encodeURIComponent(q.status);
      if (q.sort) qs += '&sort=' + encodeURIComponent(q.sort);
      return request('GET', '/consultations' + qs);
    },
    consultationDetail: function (id) {
      return request('GET', '/consultations/' + encodeURIComponent(id));
    },
    setConsultationNote: function (id, note) {
      return request('PUT', '/consultations/' + encodeURIComponent(id) + '/note', { note: note });
    },
    documentStatistics: function () {
      if (!global.FayiHttp) return Promise.reject(new Error('HTTP 客户端未加载'));
      var headers = {};
      var token = getToken();
      if (token) headers.Authorization = 'Bearer ' + token;
      return FayiHttp.request(API + '/documents/statistics', {
        method: 'GET',
        headers: headers,
        onUnauthorized: onUnauthorized,
        silent: true
      });
    },
    documents: function (q) {
      q = q || {};
      var qs = '?page=' + (q.page || 1) + '&pageSize=' + (q.pageSize || 15);
      if (q.search) qs += '&search=' + encodeURIComponent(q.search);
      if (q.docType && q.docType !== 'all') qs += '&docType=' + encodeURIComponent(q.docType);
      if (q.status && q.status !== 'all') qs += '&status=' + encodeURIComponent(q.status);
      if (q.date && q.date !== 'all') qs += '&date=' + encodeURIComponent(q.date);
      return request('GET', '/documents/list' + qs);
    },
    documentDetail: function (id) {
      return request('GET', '/documents/' + encodeURIComponent(id));
    },
    updateDocument: function (id, data) {
      return request('PUT', '/documents/' + encodeURIComponent(id), data || {});
    },
    regenerateDocument: function (id) {
      return request('POST', '/documents/regenerate', { id: id });
    },
    deleteDocument: function (id) { return request('DELETE', '/documents/' + id); },
    regulationList: function (q, reqOpts) {
      q = q || {};
      reqOpts = reqOpts || {};
      var qs = '?page=' + (q.page || 1) + '&pageSize=' + (q.pageSize || 20);
      if (q.category && q.category !== 'all') qs += '&category=' + encodeURIComponent(q.category);
      if (q.region && q.region !== 'all') qs += '&region=' + encodeURIComponent(q.region);
      if (q.keyword) qs += '&keyword=' + encodeURIComponent(q.keyword);
      if (q.search) qs += '&keyword=' + encodeURIComponent(q.search);
      return request('GET', '/regulations/list' + qs, null, Object.assign({ ttlMs: 5 * 60 * 1000 }, reqOpts));
    },
    regulationDetail: function (id, reqOpts) {
      reqOpts = reqOpts || {};
      return request(
        'GET',
        '/regulations/detail/' + encodeURIComponent(id),
        null,
        Object.assign({ ttlMs: 10 * 60 * 1000 }, reqOpts)
      );
    },
    regulationStatistics: function (reqOpts) {
      return request('GET', '/regulations/statistics', null, Object.assign({ ttlMs: 5 * 60 * 1000 }, reqOpts || {}));
    },
    regulationBatchInit: function (items, reqOpts) {
      return request('POST', '/regulations/batch-init', items ? { items: items } : {}, reqOpts || {});
    },
    regulationRegions: function () {
      return request('GET', '/regulations/regions', null, { ttlMs: 5 * 60 * 1000 });
    },
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
    regulationHeat: function () {
      return request('GET', '/analytics/regulation-heat?limit=20');
    },
    analyticsDashboard: function (days, reqOpts) {
      var qs = days ? '?days=' + encodeURIComponent(days) : '';
      return request('GET', '/analytics/dashboard' + qs, null, Object.assign({ ttlMs: 5 * 60 * 1000 }, reqOpts || {}));
    },
    analyticsOverview: function (days, reqOpts) {
      var qs = days ? '?days=' + encodeURIComponent(days) : '';
      return request('GET', '/analytics/overview' + qs, null, Object.assign({ ttlMs: 5 * 60 * 1000 }, reqOpts || {}));
    },
    analyticsInsight: function (days, reqOpts) {
      return request('POST', '/analytics/insight', { days: days || 30 }, Object.assign({ ttlMs: 0 }, reqOpts || {}));
    },
    analyticsCorrelation: function (reqOpts) {
      return request('GET', '/analytics/correlation', null, Object.assign({ ttlMs: 5 * 60 * 1000 }, reqOpts || {}));
    },
    analyticsPrediction: function (days, reqOpts) {
      var qs = days ? '?days=' + encodeURIComponent(days) : '';
      return request('GET', '/analytics/prediction' + qs, null, Object.assign({ ttlMs: 5 * 60 * 1000 }, reqOpts || {}));
    },
    analyticsAnomaly: function (days, reqOpts) {
      var qs = days ? '?days=' + encodeURIComponent(days) : '';
      return request('GET', '/analytics/anomaly' + qs, null, Object.assign({ ttlMs: 5 * 60 * 1000 }, reqOpts || {}));
    },
    operationDashboard: function (reqOpts) {
      return request('GET', '/operation/dashboard', null, Object.assign({ ttlMs: 5 * 60 * 1000 }, reqOpts || {}));
    },
    operationOverview: function (reqOpts) {
      return request('GET', '/operation/overview', null, Object.assign({ ttlMs: 5 * 60 * 1000 }, reqOpts || {}));
    },
    operationFunnel: function (reqOpts) {
      return request('GET', '/operation/funnel', null, Object.assign({ ttlMs: 5 * 60 * 1000 }, reqOpts || {}));
    },
    operationHotIssues: function (limit, reqOpts) {
      var qs = '?limit=' + (limit || 15);
      return request('GET', '/operation/hot-issues' + qs, null, Object.assign({ ttlMs: 5 * 60 * 1000 }, reqOpts || {}));
    },
    operationGenerateContent: function (topic, publish) {
      return request('POST', '/operation/generate-content', {
        topic: topic,
        publish: !!publish
      });
    },
    risks: function (q) {
      q = q || {};
      var qs = '?limit=' + (q.limit || 40);
      if (q.level && q.level !== 'all') qs += '&level=' + encodeURIComponent(q.level);
      return request('GET', '/risks' + qs);
    },
    riskOverview: function (reqOpts) {
      return request('GET', '/risk/overview', null, Object.assign({ ttlMs: 3 * 60 * 1000 }, reqOpts || {}));
    },
    riskList: function (q, reqOpts) {
      q = q || {};
      var qs = '?page=' + (q.page || 1) + '&pageSize=' + (q.pageSize || 20);
      if (q.level && q.level !== 'all') qs += '&level=' + encodeURIComponent(q.level);
      if (q.riskType && q.riskType !== 'all') qs += '&riskType=' + encodeURIComponent(q.riskType);
      if (q.status && q.status !== 'all') qs += '&status=' + encodeURIComponent(q.status);
      if (q.keyword) qs += '&keyword=' + encodeURIComponent(q.keyword);
      return request('GET', '/risk/list' + qs, null, Object.assign({ ttlMs: 3 * 60 * 1000 }, reqOpts || {}));
    },
    riskDetail: function (id, reqOpts) {
      return request('GET', '/risk/detail/' + encodeURIComponent(id), null, Object.assign({ ttlMs: 5 * 60 * 1000 }, reqOpts || {}));
    },
    riskStatistics: function (range, reqOpts) {
      var qs = range ? '?range=' + encodeURIComponent(range) : '';
      return request('GET', '/risk/statistics' + qs, null, Object.assign({ ttlMs: 3 * 60 * 1000 }, reqOpts || {}));
    },
    riskRealtime: function (limit, reqOpts) {
      return request('GET', '/risk/realtime?limit=' + (limit || 20), null, Object.assign({ ttlMs: 8000 }, reqOpts || {}));
    },
    riskUpdateStatus: function (id, status, note) {
      return request('PUT', '/risk/' + encodeURIComponent(id) + '/status', {
        status: status,
        adminNote: note || ''
      });
    },
    ocrList: function (q) {
      q = q || {};
      var qs = '?page=' + (q.page || 1) + '&pageSize=' + (q.pageSize || 15);
      if (q.search) qs += '&search=' + encodeURIComponent(q.search);
      if (q.status && q.status !== 'all') qs += '&status=' + encodeURIComponent(q.status);
      if (q.ocrType && q.ocrType !== 'all') qs += '&ocrType=' + encodeURIComponent(q.ocrType);
      if (q.riskLevel && q.riskLevel !== 'all') qs += '&riskLevel=' + encodeURIComponent(q.riskLevel);
      return request('GET', '/ocr/list' + qs);
    },
    ocrDetail: function (id) {
      return request('GET', '/ocr/detail/' + encodeURIComponent(id));
    },
    ocrImageUrl: function (id) {
      var url = API + '/ocr/image/' + encodeURIComponent(id);
      var t = getToken();
      if (t) url += (url.indexOf('?') >= 0 ? '&' : '?') + 'access_token=' + encodeURIComponent(t);
      return url;
    },
    ocrStats: function () { return request('GET', '/ocr/stats'); },
    systemLogs: function (q) {
      var limit = (q && q.limit) || 80;
      return request('GET', '/system-logs?limit=' + limit);
    },
    logsOverview: function (reqOpts) {
      return request('GET', '/logs/overview', null, Object.assign({ ttlMs: 5 * 60 * 1000 }, reqOpts || {}));
    },
    logsList: function (q, reqOpts) {
      q = q || {};
      var qs = '?page=' + (q.page || 1) + '&pageSize=' + (q.pageSize || 20);
      if (q.module && q.module !== 'all') qs += '&module=' + encodeURIComponent(q.module);
      if (q.actionType && q.actionType !== 'all') qs += '&actionType=' + encodeURIComponent(q.actionType);
      if (q.userId) qs += '&userId=' + encodeURIComponent(q.userId);
      if (q.status && q.status !== 'all') qs += '&status=' + encodeURIComponent(q.status);
      if (q.keyword) qs += '&keyword=' + encodeURIComponent(q.keyword);
      if (q.dateFrom) qs += '&dateFrom=' + encodeURIComponent(q.dateFrom);
      if (q.dateTo) qs += '&dateTo=' + encodeURIComponent(q.dateTo);
      return request('GET', '/logs/list' + qs, null, Object.assign({ ttlMs: 5 * 60 * 1000 }, reqOpts || {}));
    },
    logsDetail: function (id, reqOpts) {
      return request('GET', '/logs/detail/' + encodeURIComponent(id), null, Object.assign({ ttlMs: 5 * 60 * 1000 }, reqOpts || {}));
    },
    logsCreate: function (body) {
      return request('POST', '/logs/create', body || {});
    },
    settingsAll: function (reqOpts) {
      return request('GET', '/settings', null, Object.assign({ ttlMs: 60 * 1000 }, reqOpts || {}));
    },
    settingsGet: function (module, reqOpts) {
      return request('GET', '/settings/' + module, null, Object.assign({ ttlMs: 60 * 1000 }, reqOpts || {}));
    },
    settingsUpdate: function (module, body) {
      return request('POST', '/settings/' + module + '/update', body || {}, { ttlMs: 0 });
    },
    settingsReset: function (module) {
      return request('POST', '/settings/reset', module ? { module: module } : {}, { ttlMs: 0 });
    },
    dashboardFeed: function (limit) {
      return request('GET', '/dashboard/feed?limit=' + (limit || 40));
    },
    getApiBase: function () { return API; },
    getServerOrigin: function () {
      return SERVER_ORIGIN;
    }
  };
})(window);

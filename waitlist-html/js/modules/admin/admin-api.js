/**
 * 管理端 API（/api/admin）
 */
(function (global) {
  var API = 'http://localhost:3002/api/admin';
  var TOKEN_KEY = 'fayi_admin_token';
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

  function request(method, path, body) {
    var opts = { method: method, headers: { 'Content-Type': 'application/json' } };
    var token = getToken();
    if (token) opts.headers.Authorization = 'Bearer ' + token;
    if (body) opts.body = JSON.stringify(body);
    return fetch(API + path, opts).then(function (r) {
      return r.json().then(function (json) {
        if (r.status === 401 || r.status === 403) {
          clearToken();
          if (/admin-dashboard\.html/.test(location.pathname) || /admin-dashboard\.html/.test(location.href)) {
            window.location.replace('login.html');
          }
          throw new Error(json.message || '未授权');
        }
        if (!r.ok || json.success === false) {
          throw new Error(json.message || json.error || '请求失败');
        }
        return json;
      });
    });
  }

  function loginRequest(email, password, identityCode) {
    return fetch(API + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email,
        password: password,
        identityCode: identityCode
      })
    }).then(function (r) {
      return r.json().then(function (json) {
        if (!r.ok || json.success === false) {
          throw new Error(json.message || '登录失败');
        }
        return json;
      });
    });
  }

  function parseJsonResponse(r) {
    var ct = (r.headers.get('content-type') || '').toLowerCase();
    if (ct.indexOf('application/json') === -1) {
      return r.text().then(function () {
        throw new Error(
          '接口返回了网页而不是数据（常见于后端未启动）。请先运行：cd waitlist-html/server && node multimodal-server.js（端口 3002）'
        );
      });
    }
    return r.json();
  }

  function loginByCodeRequest(identityCode) {
    return fetch(API + '/auth/code-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identityCode: identityCode })
    }).then(function (r) {
      return parseJsonResponse(r).then(function (json) {
        if (!r.ok || json.success === false) {
          throw new Error(json.message || '身份验证码错误，无权进入管理系统');
        }
        return json;
      });
    });
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
        window.location.replace('login.html');
        return false;
      }
      if (localStorage.getItem(VERIFIED_KEY) !== '1') {
        clearToken();
        window.location.replace('login.html');
        return false;
      }
      var info = getAdminInfo();
      if (!info || (info.role !== 'admin' && info.userType !== 'admin')) {
        clearToken();
        window.location.replace('login.html');
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
    ocr: function (q) {
      return request('GET', '/ocr?page=' + (q.page || 1) + '&pageSize=' + (q.pageSize || 10));
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
    logs: function (q) {
      return request('GET', '/logs?page=' + (q.page || 1) + '&pageSize=' + (q.pageSize || 20));
    }
  };
})(window);

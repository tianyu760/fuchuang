/**
 * 管理端 API（/api/admin）
 */
(function (global) {
  var API = 'http://localhost:3002/api/admin';
  var TOKEN_KEY = 'fayi_admin_token';

  function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
  function setToken(t) {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  }

  function request(method, path, body) {
    var opts = { method: method, headers: { 'Content-Type': 'application/json' } };
    var token = getToken();
    if (token) opts.headers.Authorization = 'Bearer ' + token;
    if (body) opts.body = JSON.stringify(body);
    return fetch(API + path, opts).then(function (r) {
      return r.json().then(function (json) {
        if (r.status === 401) {
          setToken('');
          throw new Error(json.message || '未授权');
        }
        if (!r.ok || json.success === false) {
          throw new Error(json.message || json.error || '请求失败');
        }
        return json;
      });
    });
  }

  global.FayiAdminApi = {
    getToken: getToken,
    setToken: setToken,
    login: function (email, password) {
      return request('POST', '/auth/login', { email: email, password: password });
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

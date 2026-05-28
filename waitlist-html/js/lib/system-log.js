/**
 * 法绎 · 全系统统一操作日志埋点
 * FayiSystemLog.logAction({ actionType, module, actionName, ... })
 */
(function (global) {
  var QUEUE = [];
  var flushing = false;
  var DEDUP_MS = 30000;
  var recent = Object.create(null);

  function apiBases() {
    var admin = '';
    var pub = 'http://127.0.0.1:3002';
    try {
      var m = document.querySelector('meta[name="fayi-admin-api"]');
      if (m && m.content) admin = m.content.replace(/\/api\/admin\/?$/, '');
      var m2 = document.querySelector('meta[name="fayi-api-base"]');
      if (m2 && m2.content) pub = m2.content.replace(/\/$/, '');
    } catch (e) { /* ignore */ }
    if (!admin && global.FayiAdminApi && FayiAdminApi.getApiBase) {
      admin = String(FayiAdminApi.getApiBase() || '').replace(/\/api\/admin\/?$/, '');
    }
    return { admin: admin, pub: pub };
  }

  function currentUser() {
    if (global.FayiAdminAuth && FayiAdminAuth.getAdminInfo) {
      var a = FayiAdminAuth.getAdminInfo();
      if (a) return { userId: a.id || a.email || 'admin', userName: a.email || a.name || '管理员' };
    }
    if (global.FayiAuth && FayiAuth.getCurrentUser) {
      var u = FayiAuth.getCurrentUser();
      if (u) return { userId: u.id || u.email || 'user', userName: u.email || u.name || u.nickname || '用户' };
    }
    return { userId: 'guest', userName: '访客' };
  }

  function shouldSkip(body) {
    var key = [body.module, body.actionName, body.userId].join('|');
    var now = Date.now();
    if (recent[key] && now - recent[key] < DEDUP_MS) return true;
    recent[key] = now;
    return false;
  }

  function postJson(url, body, headers) {
    headers = headers || { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (global.FayiHttp && FayiHttp.post) {
      return FayiHttp.post(url, body, { silent: true, headers: headers });
    }
    return fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) return null;
      return r.json().catch(function () { return null; });
    }).catch(function () { return null; });
  }

  function flushQueue() {
    if (flushing || !QUEUE.length) return;
    flushing = true;
    var item = QUEUE.shift();
    sendOne(item).finally(function () {
      flushing = false;
      if (QUEUE.length) setTimeout(flushQueue, 0);
    });
  }

  function sendOne(body) {
    var bases = apiBases();
    var headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (global.FayiAdminAuth && FayiAdminAuth.getToken) {
      var tok = FayiAdminAuth.getToken();
      if (tok) headers.Authorization = 'Bearer ' + tok;
    }
    var url = bases.admin
      ? bases.admin + '/api/admin/logs/create'
      : bases.pub + '/api/logs/create';
    return postJson(url, body, headers);
  }

  /**
   * @param {Object} opts
   */
  function logAction(opts) {
    opts = opts || {};
    var user = currentUser();
    var body = {
      actionType: opts.actionType || 'query',
      module: opts.module || 'system',
      actionName: opts.actionName || '系统操作',
      userId: opts.userId || user.userId,
      userName: opts.userName || user.userName,
      targetId: opts.targetId || '',
      description: opts.description || opts.actionName || '',
      requestData: opts.requestData,
      responseData: opts.responseData,
      status: opts.status || 'success',
      ipAddress: opts.ipAddress || ''
    };

    if (shouldSkip(body)) return Promise.resolve({ skipped: true });

    QUEUE.push(body);
    setTimeout(flushQueue, 0);

    try {
      global.dispatchEvent(new CustomEvent('fayi-system-log', { detail: body }));
    } catch (e) { /* ignore */ }

    return Promise.resolve(body);
  }

  global.FayiSystemLog = {
    logAction: logAction,
    currentUser: currentUser
  };
})(typeof window !== 'undefined' ? window : global);

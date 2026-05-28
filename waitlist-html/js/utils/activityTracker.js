/**
 * 法绎 · 全站行为日志（localStorage.fayi_logs + 同步服务端）
 */
(function (global) {
  var LOG_KEY = 'fayi_logs';
  var MAX_LOGS = 8000;
  var SYNC_API = 'http://localhost:3002/api/admin/datav/operation-log';
  var VISIT_API = 'http://localhost:3002/api/admin/track/visit';

  var TYPE_TO_SERVER = {
    login: 'user_login',
    register: 'user_register',
    consult: 'ai_chat',
    case: 'ai_case',
    regulation: 'ai_fagui',
    document: 'ai_wenshi',
    ocr: 'ocr',
    pufa: 'law_edu_visit',
    upload: 'file_upload',
    risk: 'ai_case',
    pdf_export: 'pdf_export',
    contact: 'contact',
    page_view: 'page_visit',
    page_leave: 'page_visit',
    search: 'ai_fagui',
    admin: 'admin_login'
  };

  var pageEnterAt = Date.now();
  var currentPage = '';

  function uid() {
    return 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  }

  function getUser() {
    try {
      if (global.FayiAuth && FayiAuth.getCurrentUser) return FayiAuth.getCurrentUser();
      var raw = localStorage.getItem('fayi_current_user');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function username() {
    var u = getUser();
    if (u && u.name) return u.name;
    if (u && u.email) return u.email.split('@')[0];
    var info = null;
    try {
      var ai = localStorage.getItem('fayi_admin_info');
      if (ai) info = JSON.parse(ai);
    } catch (e) { /* ignore */ }
    if (info && (info.name || info.email)) return info.name || info.email.split('@')[0];
    return '访客';
  }

  function readLogs() {
    try {
      var raw = localStorage.getItem(LOG_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function writeLogs(list) {
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(list.slice(-MAX_LOGS)));
    } catch (e) {
      /* quota */
    }
  }

  function inferRisk(detail, type) {
    var t = String(detail || '') + String(type || '');
    if (/仲裁|刑事|诈骗|违约|大额|拘留|重伤/.test(t)) return 'high';
    if (/咨询|浏览|登录|普法/.test(t)) return 'low';
    return 'mid';
  }

  function track(type, module, detail, opts) {
    opts = opts || {};
    var entry = {
      id: opts.id || uid(),
      type: type,
      module: module || 'page',
      username: opts.username || username(),
      time: opts.time || new Date().toISOString(),
      detail: detail || '',
      riskLevel: opts.riskLevel || inferRisk(detail, type),
      duration: opts.duration || 0,
      meta: opts.meta || {}
    };
    if (global.FayiOperationLog && FayiOperationLog.createOperationLog) {
      FayiOperationLog.createOperationLog(type, module, detail, entry.riskLevel);
    } else {
      var list = readLogs();
      list.push(entry);
      writeLogs(list);
      syncOne(entry);
    }
    return entry;
  }

  function syncOne(entry) {
    var serverType = TYPE_TO_SERVER[entry.type] || entry.type;
    var body = {
      type: serverType,
      content: entry.detail || entry.module || entry.type,
      level: entry.riskLevel,
      meta: Object.assign({}, entry.meta, {
        userId: (getUser() && getUser().email) || entry.username,
        preview: entry.detail,
        page: entry.meta.page,
        keyword: entry.meta.keyword,
        fileName: entry.meta.fileName,
        title: entry.meta.title,
        duration: entry.duration
      })
    };
    try {
      fetch(SYNC_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json; charset=utf-8' },
        body: JSON.stringify(body)
      }).catch(function () { /* offline */ });
    } catch (e) { /* ignore */ }
  }

  function trackPageView(page) {
    currentPage = page || (location.pathname.split('/').pop() || 'index.html');
    pageEnterAt = Date.now();
    track('page_view', 'page', '访问页面：' + currentPage, { meta: { page: currentPage } });
    try {
      fetch(VISIT_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json; charset=utf-8' },
        body: JSON.stringify({ page: currentPage })
      }).catch(function () {});
    } catch (e) { /* ignore */ }
  }

  function trackPageLeave() {
    if (!currentPage) return;
    var dur = Math.round((Date.now() - pageEnterAt) / 1000);
    if (dur < 1) return;
    track('page_leave', 'page', '离开页面：' + currentPage, {
      duration: dur,
      meta: { page: currentPage }
    });
  }

  function initAutoPage() {
    if (global.FayiPageTracker) return;
    trackPageView();
    global.addEventListener('beforeunload', trackPageLeave);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') trackPageLeave();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAutoPage);
  } else {
    initAutoPage();
  }

  global.FayiActivityTracker = {
    LOG_KEY: LOG_KEY,
    readLogs: readLogs,
    writeLogs: writeLogs,
    track: track,
    trackPageView: trackPageView,
    trackSearch: function (kw, module) {
      track('search', module || 'regulation', '搜索：' + kw, { meta: { keyword: kw } });
    },
    trackConsult: function (text) {
      track('consult', 'consult', String(text || '').slice(0, 200));
    },
    trackDocument: function (title) {
      track('document', 'document', '生成文书：' + (title || ''), { meta: { title: title } });
    },
    trackOcr: function (fileName) {
      track('ocr', 'ocr', 'OCR：' + (fileName || ''), { meta: { fileName: fileName } });
    },
    trackLogin: function (email) {
      track('login', 'auth', '用户登录：' + email, { meta: { email: email } });
    },
    trackRegister: function (email) {
      track('register', 'auth', '用户注册：' + email, { meta: { email: email } });
    },
    trackAdmin: function (action) {
      track('admin', 'system', action || '管理员操作', { riskLevel: 'low' });
    }
  };
})(window);

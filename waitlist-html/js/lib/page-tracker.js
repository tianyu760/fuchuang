/**
 * 全站页面访问与操作追踪（自动写入大屏日志）
 */
(function (global) {
  var PAGE_META = {
    'index.html': { module: 'page', label: '首页', level: 'low' },
    'chat.html': { module: 'consult', label: '法律咨询', level: 'mid' },
    'wenshi.html': { module: 'document', label: '文书生成', level: 'mid' },
    'fagui.html': { module: 'law_search', label: '法规检索', level: 'mid' },
    'knowledge.html': { module: 'upload', label: '资料库', level: 'low' },
    'pufa.html': { module: 'pufa', label: '普法宣传', level: 'low' },
    'law-education.html': { module: 'pufa', label: '普法宣传', level: 'low' },
    'contact.html': { module: 'page', label: '联系反馈', level: 'low' },
    'profile.html': { module: 'page', label: '个人中心', level: 'low' },
    'datav/index.html': { module: 'page', label: '数字大屏', level: 'low' }
  };

  function currentPageKey() {
    var path = (global.location.pathname || '').replace(/\\/g, '/');
    var file = path.split('/').pop() || 'index.html';
    if (path.indexOf('/datav/') >= 0) return 'datav/index.html';
    return file;
  }

  function trackPageVisit() {
    var key = currentPageKey();
    var meta = PAGE_META[key];
    if (!meta) return;

    var sessionKey = 'fayi_page_track_' + key + '_' + new Date().toDateString();
    try {
      if (sessionStorage.getItem(sessionKey)) return;
      sessionStorage.setItem(sessionKey, '1');
    } catch (e) { /* ignore */ }

    fetch('http://localhost:3002/api/admin/track/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json; charset=utf-8' },
      body: JSON.stringify({ page: key })
    }).catch(function () {});

    if (global.FayiOperationLog && FayiOperationLog.createOperationLog) {
      FayiOperationLog.createOperationLog(
        meta.module === 'pufa' ? 'pufa' : 'page',
        meta.module,
        '用户进入「' + meta.label + '」页面',
        meta.level
      );
    }

  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trackPageVisit);
  } else {
    trackPageVisit();
  }

  global.FayiPageTracker = { trackPageVisit: trackPageVisit, currentPageKey: currentPageKey };
})(typeof window !== 'undefined' ? window : global);

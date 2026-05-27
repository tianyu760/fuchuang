/**
 * 法绎 · 数字大屏实时同步桥（跨标签页 + 即时刷新信号）
 * 主系统各模块在业务成功后调用 FayiRealtime.notify()
 */
(function (global) {
  var CHANNEL = 'fayi-dashboard-v1';
  var API_BASE = 'http://localhost:3002';

  function broadcast() {
    try {
      var ch = new BroadcastChannel(CHANNEL);
      ch.postMessage({ type: 'dashboard-refresh', t: Date.now() });
      ch.close();
    } catch (e) { /* ignore */ }
    try {
      localStorage.setItem('fayi-dashboard-bump', String(Date.now()));
    } catch (e2) { /* ignore */ }
  }

  function notify(meta) {
    meta = meta || {};
    if (global.FayiOperationLog && FayiOperationLog.createOperationLog && meta.content) {
      FayiOperationLog.createOperationLog(
        meta.logType || meta.type || 'page',
        meta.module || meta.type || 'system',
        meta.content,
        meta.level || 'mid'
      );
    }
    broadcast();
    fetch(API_BASE + '/api/admin/datav/bump', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(meta || {})
    }).catch(function () {});
  }

  function setReturnUrl(url) {
    try {
      sessionStorage.setItem('datav-return', url || global.location.href);
    } catch (e) { /* ignore */ }
  }

  function getReturnUrl() {
    try {
      return sessionStorage.getItem('datav-return') || '';
    } catch (e) {
      return '';
    }
  }

  global.FayiRealtime = {
    CHANNEL: CHANNEL,
    API_BASE: API_BASE,
    notify: notify,
    broadcast: broadcast,
    setReturnUrl: setReturnUrl,
    getReturnUrl: getReturnUrl
  };
})(typeof window !== 'undefined' ? window : global);

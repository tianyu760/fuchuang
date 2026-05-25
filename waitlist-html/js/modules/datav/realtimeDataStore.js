/**
 * 法绎 · 数字大屏客户端数据缓存（localStorage，刷新不丢上次快照）
 */
(function (global) {
  var KEY = 'fayi-datav-snapshot-v2';
  var MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

  function saveSnapshot(data) {
    if (!data) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({
        savedAt: Date.now(),
        data: data
      }));
    } catch (e) { /* quota */ }
  }

  function loadSnapshot() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || !obj.data) return null;
      if (Date.now() - (obj.savedAt || 0) > MAX_AGE_MS) return null;
      return obj.data;
    } catch (e) {
      return null;
    }
  }

  function clearSnapshot() {
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  }

  global.FayiDatavStore = {
    saveSnapshot: saveSnapshot,
    loadSnapshot: loadSnapshot,
    clearSnapshot: clearSnapshot
  };
})(typeof window !== 'undefined' ? window : global);

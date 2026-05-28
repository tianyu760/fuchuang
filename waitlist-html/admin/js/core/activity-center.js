/**
 * 运营后台 · 数据中心（封装 FayiActivityCenter）
 */
window.OpsActivityCenter = (function () {
  var core = window.FayiActivityCenter;

  function ensure() {
    if (!core) throw new Error('FayiActivityCenter 未加载');
    return core;
  }

  return {
    load: function (force) { return ensure().load(force); },
    loadCharts: function (force) { return ensure().loadCharts(force); },
    onRealtime: function (cb) { return ensure().onRealtime(cb); },
    track: function (type, detail, meta) {
      if (window.FayiActivityTracker) {
        FayiActivityTracker.track(type, detail, meta);
      }
    }
  };
})();

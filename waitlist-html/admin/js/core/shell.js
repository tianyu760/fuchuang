/**
 * 运营后台 · 整体布局壳
 */
window.OpsShell = (function () {
  var chartRegistry = [];

  function disposeCharts() {
    chartRegistry.forEach(function (c) { try { c.dispose(); } catch (e) {} });
    chartRegistry = [];
  }

  function mountLayout(activePageId) {
    var app = document.getElementById('ops-app');
    if (!app) return null;

    app.className = 'ops-app';
    document.documentElement.classList.add('ops-shell-ready');
    document.body.classList.add('ops-body');

    app.innerHTML =
      '<div class="ops-ambient" aria-hidden="true"></div>' +
      '<aside class="ops-side" id="ops-side"></aside>' +
      '<div class="ops-main">' +
        '<header class="ops-topbar" id="ops-topbar"></header>' +
        '<main class="ops-content" id="ops-content"><div id="ops-page-root"></div></main>' +
      '</div>';

    var side = document.getElementById('ops-side');
    var top = document.getElementById('ops-topbar');
    if (side && window.OpsSidebar) {
      side.innerHTML = OpsSidebar.render(activePageId);
      if (OpsSidebar.bind) OpsSidebar.bind();
    }
    if (top && window.OpsTopbar) {
      top.innerHTML = OpsTopbar.render({});
      OpsTopbar.bind();
    }

    return document.getElementById('ops-page-root');
  }

  function refreshTopbarStats(stats) {
    if (window.OpsTopbar) OpsTopbar.updateStats(stats);
  }

  function setActiveNav(pageId) {
    document.querySelectorAll('.ops-nav__link[data-nav]').forEach(function (a) {
      a.classList.toggle('is-active', a.getAttribute('data-nav') === pageId);
    });
  }

  return {
    mountLayout: mountLayout,
    refreshTopbarStats: refreshTopbarStats,
    setActiveNav: setActiveNav,
    getCharts: function () { return chartRegistry; },
    disposeCharts: disposeCharts
  };
})();

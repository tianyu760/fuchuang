/**
 * 运营后台 · 页面启动器（UI 先行，数据异步）
 */
window.OpsApp = (function () {
  var pageMod = null;
  var unsub = null;

  function getPageId() {
    var body = document.body.getAttribute('data-ops-page');
    if (body) return body;
    var path = location.pathname.split('/').pop() || 'dashboard.html';
    return path.replace('.html', '');
  }

  function onData(snap) {
    var stats = snap.stats || (snap.realtime && snap.realtime.stats) || {};
    var rt = snap.realtime || snap;
    if (window.OpsShell) OpsShell.refreshTopbarStats(stats);
    if (window.OpsMidTheme && OpsMidTheme.flashTopbarStats) OpsMidTheme.flashTopbarStats();
    if (window.OpsSidebar && OpsSidebar.update) OpsSidebar.update(stats, rt);
    if (pageMod && pageMod.onData) pageMod.onData(snap);
    if (window.OpsMidTheme && OpsMidTheme.animateKpiNumbers) {
      OpsMidTheme.animateKpiNumbers(document.getElementById('ops-page-root'));
    }
  }

  function mountPageModule(pageId, root) {
    var pages = window.OpsPages || {};
    pageMod = pages[pageId] || pages._default;
    if (pageMod && pageMod.mount) {
      try {
        pageMod.mount(root, pageId);
      } catch (err) {
        console.error('[OpsApp] 页面渲染失败', err);
        root.innerHTML =
          '<div class="ops-card"><p class="ops-empty">页面加载异常，请刷新重试。</p></div>';
      }
    } else {
      root.innerHTML =
        '<div class="ops-card"><p class="ops-empty">未找到页面模块：' + esc(pageId) + '</p></div>';
    }
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  function runPageMotion(root) {
    function enter() {
      if (window.OpsMidTheme) {
        if (OpsMidTheme.pageEnter) OpsMidTheme.pageEnter();
        else if (OpsMidTheme.animateKpiNumbers) OpsMidTheme.animateKpiNumbers(root);
      }
    }
    if (window.OpsMidTheme) {
      enter();
      return;
    }
    var existing = document.querySelector('script[data-ops-motion]');
    if (existing) {
      existing.addEventListener('load', enter, { once: true });
      return;
    }
    var motion = document.createElement('script');
    motion.src = 'js/core/ops-midplatform-motion.js';
    motion.setAttribute('data-ops-motion', '1');
    motion.onload = enter;
    document.body.appendChild(motion);
  }

  function showPageSkeleton(root) {
    if (!root) return;
    root.innerHTML =
      '<div class="ops-page-skeleton">' +
        '<div class="ops-page-skeleton__bar"></div>' +
        '<div class="ops-page-skeleton__grid">' +
          '<div class="ops-page-skeleton__card"></div>' +
          '<div class="ops-page-skeleton__card"></div>' +
          '<div class="ops-page-skeleton__card"></div>' +
        '</div>' +
        '<div class="ops-page-skeleton__list">' +
          '<div class="ops-page-skeleton__row"></div>' +
          '<div class="ops-page-skeleton__row"></div>' +
          '<div class="ops-page-skeleton__row"></div>' +
        '</div></div>';
  }

  function init() {
    if (!window.OpsBoot || !window.OpsDataCenter) {
      var app = document.getElementById('ops-app');
      if (app) {
        app.innerHTML = '<div class="ops-card" style="margin:24px"><p class="ops-empty">请先登录管理端，或刷新页面重试。</p></div>';
      }
      return;
    }
    var pageId = getPageId();
    var root;
    try {
      root = OpsShell.mountLayout(pageId);
    } catch (err) {
      console.error('[OpsApp] 布局挂载失败', err);
      root = null;
    }
    if (!root) {
      var el = document.getElementById('ops-page-root') || document.getElementById('ops-app');
      if (el) el.innerHTML = '<div class="ops-card"><p class="ops-empty">布局加载失败，请刷新页面。</p></div>';
      return;
    }

    showPageSkeleton(root);

    var bootPage = window.OpsScriptLoader
      ? OpsScriptLoader.loadPage(pageId)
      : Promise.resolve();

    bootPage.then(function () {
      mountPageModule(pageId, root);
      unsub = OpsDataCenter.subscribe(onData);
      OpsDataCenter.init({ pageId: pageId, pollMs: 30000 }).then(onData).catch(function (e) {
        console.warn('[OpsApp] 实时数据加载失败', e);
      });
      if (window.OpsPrefetch) OpsPrefetch.schedule(pageId);
      if (window.OpsTopbar && OpsTopbar.ensureFullscreen) OpsTopbar.ensureFullscreen();
      if (window.OpsMidTheme) {
        if (OpsMidTheme.pageEnter) OpsMidTheme.pageEnter();
        else if (OpsMidTheme.animateKpiNumbers) OpsMidTheme.animateKpiNumbers(root);
      }
    }).catch(function (err) {
      console.error('[OpsApp] 页面脚本加载失败', err);
      root.innerHTML = '<p class="ops-empty">页面资源加载失败，请刷新重试</p>';
    });
  }

  function scheduleInit() {
    if (window.OpsBoot) {
      init();
      return;
    }
    document.addEventListener('ops:auth-ready', init, { once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleInit);
  } else {
    scheduleInit();
  }

  return { init: init };
})();

/**
 * 中台 UI · 轻量动效（页面过渡 / CountUp / 状态微反馈）
 */
window.OpsMidTheme = (function () {
  var KPI_NUM_SEL = [
    '.ops-kpi .ops-num',
    '.ops-kpi__value',
    '.ops-analytics-kpi-card strong',
    '.ops-risk-kpi strong',
    '.ops-log-kpi strong',
    '.ops-pufa-kpi strong',
    '.ops-consult-stat strong',
    '.ops-doc-stats strong',
    '.ops-users-summary strong',
    '.ops-metric-tile__value .ops-num',
    '.ops-reg-stats__total strong'
  ].join(',');

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function countUp(el, target, duration) {
    if (!el) return;
    duration = duration || 1000;
    var end = Number(target);
    if (isNaN(end)) {
      el.textContent = target;
      return;
    }
    var start = Number(String(el.textContent).replace(/[^\d.-]/g, '')) || 0;
    if (start === end) {
      el.textContent = end;
      return;
    }
    var t0 = performance.now();
    function frame(now) {
      var p = Math.min(1, (now - t0) / duration);
      var val = Math.round(start + (end - start) * easeOutCubic(p));
      el.textContent = val;
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function pageEnter() {
    document.documentElement.classList.add('ops-mp-ready');
    var root = document.getElementById('ops-page-root');
    if (!root) return;
    root.classList.remove('ops-mp-page-in');
    void root.offsetWidth;
    root.classList.add('ops-mp-page-in');
    window.setTimeout(function () {
      animateKpiNumbers(root);
    }, 80);
  }

  function animateKpiNumbers(scope) {
    scope = scope || document.getElementById('ops-page-root');
    if (!scope) return;
    scope.querySelectorAll(KPI_NUM_SEL).forEach(function (el) {
      if (el.closest('.ops-chart')) return;
      var raw = String(el.textContent || '').replace(/[^\d.-]/g, '');
      if (!raw || isNaN(Number(raw))) return;
      countUp(el, Number(raw), 950);
    });
  }

  function flashTopbarStats() {
    document.documentElement.classList.add('ops-mp-stat-flash');
    window.setTimeout(function () {
      document.documentElement.classList.remove('ops-mp-stat-flash');
    }, 280);
  }

  function bindCountUpOnVisible() {
    if (!window.IntersectionObserver) return;
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        if (el.dataset.opsCountupDone) return;
        var raw = el.getAttribute('data-countup');
        if (raw == null) raw = el.textContent;
        el.dataset.opsCountupDone = '1';
        countUp(el, raw, 1000);
        obs.unobserve(el);
      });
    }, { threshold: 0.15 });
    document.querySelectorAll('[data-countup]').forEach(function (el) {
      obs.observe(el);
    });
  }

  function init() {
    document.documentElement.classList.add('ops-mp-ready');
    bindCountUpOnVisible();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    countUp: countUp,
    pageEnter: pageEnter,
    animateKpiNumbers: animateKpiNumbers,
    flashTopbarStats: flashTopbarStats,
    init: init
  };
})();

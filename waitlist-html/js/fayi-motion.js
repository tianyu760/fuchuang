/**
 * 法绎全站页面切换与导航动效
 */
(function () {
  var DURATION = 480;
  var EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

  function injectCss() {
    if (document.getElementById('fayi-motion-css')) return;
    var link = document.createElement('link');
    link.id = 'fayi-motion-css';
    link.rel = 'stylesheet';
    var script = document.currentScript || document.querySelector('script[src*="fayi-motion"]');
    var base = '';
    if (script && script.src) {
      base = script.src.replace(/\/js\/fayi-motion\.js(\?.*)?$/i, '/');
    } else if (location.pathname.indexOf('/datav/') >= 0) {
      base = '../';
    }
    link.href = base + 'css/fayi-motion.css';
    document.head.appendChild(link);
  }

  function isInternalPage(href) {
    if (!href || href.indexOf('javascript:') === 0 || href.charAt(0) === '#') return false;
    try {
      var u = new URL(href, location.href);
      if (u.origin !== location.origin) return false;
      return /\.html$/i.test(u.pathname) || u.pathname === '/' || u.pathname.endsWith('/');
    } catch (e) { return false; }
  }

  function navigateWithFade(url) {
    document.documentElement.classList.add('fayi-nav-pending');
    document.body.style.transition = 'opacity ' + DURATION + 'ms ' + EASE + ', transform ' + DURATION + 'ms ' + EASE;
    document.body.style.opacity = '0';
    document.body.style.transform = 'translateY(-8px)';
    window.setTimeout(function () { location.href = url; }, DURATION);
  }

  function bindPageLinks() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey) return;
      if (!isInternalPage(a.getAttribute('href'))) return;
      if (a.getAttribute('data-no-transition') === '1') return;
      e.preventDefault();
      navigateWithFade(a.href);
    }, false);
  }

  function onPageEnter() {
    document.documentElement.classList.remove('fayi-nav-pending');
    document.body.classList.add('fayi-page-enter');
    document.body.style.opacity = '';
    document.body.style.transform = '';
    document.body.style.transition = '';
    window.setTimeout(function () {
      document.body.classList.remove('fayi-page-enter');
    }, DURATION + 80);
  }

  function enhanceNav() {
    var ul = document.getElementById('fayi-main-nav');
    if (!ul || ul.getAttribute('data-fayi-motion') === '1') return;
    ul.setAttribute('data-fayi-motion', '1');
  }

  injectCss();
  bindPageLinks();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      onPageEnter();
      enhanceNav();
    });
  } else {
    onPageEnter();
    enhanceNav();
  }

  window.FayiMotion = {
    navigate: navigateWithFade,
    skeletonHtml: function (n) {
      var h = '';
      for (var i = 0; i < (n || 3); i++) h += '<div class="fayi-skeleton" style="height:' + (12 + (i % 3) * 4) + 'px;margin-bottom:10px"></div>';
      return h;
    }
  };
})();

/**
 * 欢迎页 · 离场淡出（进入系统）
 */
(function () {
  var btn = document.getElementById('welcome-register-btn');
  if (!btn) return;

  btn.addEventListener('click', function (e) {
    var href = btn.getAttribute('href');
    if (!href) return;

    var rect = btn.getBoundingClientRect();
    btn.style.setProperty('--ripple-x', (e.clientX - rect.left) + 'px');
    btn.style.setProperty('--ripple-y', (e.clientY - rect.top) + 'px');

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    e.preventDefault();
    document.body.classList.add('welcome-leave');
    window.setTimeout(function () {
      window.location.href = href;
    }, 480);
  });
})();

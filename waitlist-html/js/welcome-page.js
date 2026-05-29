/**
 * 欢迎页 · 吉祥物粒子 + 离场淡出
 */
(function () {
  function drawStar(ctx, x, y, r, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(255, 255, 255, ' + alpha + ')';
    ctx.beginPath();
    for (var i = 0; i < 4; i++) {
      var a = (Math.PI / 2) * i;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.lineTo(Math.cos(a + Math.PI / 4) * r * 0.28, Math.sin(a + Math.PI / 4) * r * 0.28);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function initMascotParticles() {
    var stage = document.getElementById('welcome-mascot-stage');
    var canvas = document.getElementById('welcome-mascot-particles');
    if (!stage || !canvas || !canvas.getContext) return null;

    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var particles = [];
    var w = 0;
    var h = 0;
    var raf = 0;
    var active = false;

    function resize() {
      var rect = stage.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function seed() {
      particles = [];
      var count = Math.floor((w * h) / 2000);
      count = Math.max(24, Math.min(count, 52));
      for (var i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: Math.random() * 2 + 0.7,
          vx: (Math.random() - 0.5) * 0.28,
          vy: -(Math.random() * 0.5 + 0.15),
          a: Math.random() * 0.3 + 0.3,
          star: Math.random() > 0.8,
          rot: Math.random() * Math.PI,
          rotSpd: (Math.random() - 0.5) * 0.02,
          tone: Math.random()
        });
      }
    }

    function particleColor(p, alpha) {
      if (p.tone > 0.7) return 'rgba(237, 233, 254, ' + alpha + ')';
      if (p.tone > 0.35) return 'rgba(196, 181, 253, ' + alpha + ')';
      return 'rgba(167, 139, 250, ' + alpha + ')';
    }

    function draw() {
      if (!active) return;
      ctx.clearRect(0, 0, w, h);
      particles.forEach(function (p) {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.rotSpd;
        if (p.y < -12) {
          p.y = h + 12;
          p.x = Math.random() * w;
        }
        if (p.x < -12) p.x = w + 12;
        if (p.x > w + 12) p.x = -12;

        var pulse = 0.88 + Math.sin(Date.now() * 0.002 + p.x) * 0.12;
        var alpha = Math.min(0.75, p.a * pulse);

        if (p.star) {
          drawStar(ctx, p.x, p.y, p.r * 2.2, alpha);
          return;
        }

        var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.8);
        g.addColorStop(0, particleColor(p, alpha));
        g.addColorStop(1, particleColor(p, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 2.2, 0, Math.PI * 2);
        ctx.fill();
      });
      raf = requestAnimationFrame(draw);
    }

    function start() {
      if (active) return;
      resize();
      seed();
      active = true;
      draw();
    }

    function stop() {
      active = false;
      if (raf) cancelAnimationFrame(raf);
    }

    window.addEventListener('resize', function () {
      if (!active) return;
      resize();
      seed();
    });

    window.setTimeout(start, 1950);
    return { stop: stop };
  }

  var particleCtrl = null;
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    particleCtrl = initMascotParticles();
  }

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
    if (particleCtrl && particleCtrl.stop) particleCtrl.stop();
    document.body.classList.add('welcome-leave');
    window.setTimeout(function () {
      window.location.href = href;
    }, 480);
  });
})();

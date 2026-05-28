/**
 * 顶部栏 V4 · 毛玻璃 / 实时指标
 */
window.OpsTopbar = (function () {
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  function fmtClock() {
    var d = new Date();
    var p = function (n) { return n < 10 ? '0' + n : n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
      p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  function render(stats) {
    var s = stats || {};
    var info = (window.OpsBoot && OpsBoot.adminInfo) || {};
    var name = info.nickname || info.name || '管理员';
    var initial = String(name).trim()[0] || '管';

    return (
      '<div class="ops-topbar__search">' +
        '<iconify-icon icon="lucide:search"></iconify-icon>' +
        '<input type="search" id="ops-global-search" placeholder="搜索用户、咨询、文书、法规…" autocomplete="off" />' +
      '</div>' +
      '<div class="ops-topbar__stats">' +
        '<div class="ops-topbar__pill"><iconify-icon icon="lucide:clock"></iconify-icon>' +
          '<strong id="ops-clock">' + fmtClock() + '</strong></div>' +
        '<div class="ops-topbar__pill"><label>在线</label> <strong class="ops-num" id="ops-stat-online">' +
          esc(String(s.onlineUsers != null ? s.onlineUsers : '—')) + '</strong></div>' +
        '<div class="ops-topbar__pill"><label>系统</label> <strong id="ops-stat-sys">' +
          esc(s.systemStatus === 'healthy' ? '正常' : '观察') + '</strong></div>' +
        '<div class="ops-topbar__pill" style="border-color:rgba(251,113,133,.25)">' +
          '<label>风险</label> <strong class="ops-num" id="ops-stat-risk" style="color:var(--ops-risk)">' +
          esc(String(s.riskAlerts != null ? s.riskAlerts : 0)) + '</strong></div>' +
      '</div>' +
      '<div class="ops-topbar__quick">' +
        '<a href="dashboard.html" class="ops-btn ops-btn--sm ops-btn--ghost" title="刷新总览">总览</a>' +
        '<a href="risks.html" class="ops-btn ops-btn--sm ops-btn--ghost">风险</a>' +
      '</div>' +
      '<div class="ops-topbar__sys-actions">' +
        '<button type="button" class="ops-topbar-action ops-topbar-action--screen" id="ops-fullscreen-btn" title="全屏展示 (F11)">' +
          '<iconify-icon icon="lucide:maximize" id="ops-fullscreen-icon"></iconify-icon>' +
          '<span id="ops-fullscreen-label">全屏</span></button>' +
        '<button type="button" class="ops-topbar-action ops-topbar-action--logout" id="ops-topbar-logout-btn" title="退出管理端">' +
          '<iconify-icon icon="lucide:log-out"></iconify-icon><span>退出登录</span></button>' +
      '</div>' +
      '<div class="ops-topbar__actions">' +
        '<button type="button" class="ops-icon-btn" id="ops-notify-btn" title="消息中心" style="position:relative">' +
          '<iconify-icon icon="lucide:bell"></iconify-icon>' +
          '<span class="ops-notify-badge" id="ops-notify-dot"></span></button>' +
        '<div class="ops-user-menu" id="ops-user-menu">' +
          '<button type="button" class="ops-user-trigger" id="ops-user-trigger">' +
            '<span class="ops-user-trigger__avatar">' + esc(initial) + '</span>' +
            '<span>' + esc(name) + '</span>' +
            '<iconify-icon icon="lucide:chevron-down"></iconify-icon>' +
          '</button>' +
          '<div class="ops-dropdown">' +
            '<a href="settings.html"><iconify-icon icon="lucide:settings"></iconify-icon> 系统配置</a>' +
            '<a href="../index.html" target="_blank" rel="noopener"><iconify-icon icon="lucide:external-link"></iconify-icon> 返回前台</a>' +
            '<button type="button" class="is-danger" id="ops-logout-btn"><iconify-icon icon="lucide:log-out"></iconify-icon> 退出登录</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function requestLogout() {
    if (!window.confirm('确定退出管理端？')) return;
    if (window.OpsSidebar && OpsSidebar.logout) OpsSidebar.logout();
    else if (window.FayiAdminAuth && FayiAdminAuth.logout) FayiAdminAuth.logout();
  }

  var FS_PIN_KEY = 'ops_admin_fullscreen_pin';
  var fsPinned = false;
  var fsEscExit = false;
  var fsRestoring = false;

  function readFsPin() {
    try { return sessionStorage.getItem(FS_PIN_KEY) === '1'; } catch (e) { return false; }
  }

  function writeFsPin(on) {
    try {
      if (on) sessionStorage.setItem(FS_PIN_KEY, '1');
      else sessionStorage.removeItem(FS_PIN_KEY);
    } catch (e) { /* ignore */ }
  }

  function isFullscreen() {
    return !!(document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement);
  }

  function showFsHint(msg) {
    var el = document.getElementById('ops-fs-hint');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ops-fs-hint';
      el.className = 'ops-fs-hint';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('is-show');
    clearTimeout(showFsHint._t);
    showFsHint._t = window.setTimeout(function () {
      el.classList.remove('is-show');
    }, 2400);
  }

  function enterFullscreen() {
    var el = document.documentElement;
    var req = el.requestFullscreen ||
      el.webkitRequestFullscreen ||
      el.msRequestFullscreen;
    if (!req) return Promise.reject(new Error('unsupported'));
    return Promise.resolve(req.call(el));
  }

  function syncFullscreenUi() {
    var on = isFullscreen();
    var icon = document.getElementById('ops-fullscreen-icon');
    var label = document.getElementById('ops-fullscreen-label');
    var btn = document.getElementById('ops-fullscreen-btn');
    document.documentElement.classList.toggle('ops-is-fullscreen', on);
    if (icon) icon.setAttribute('icon', on ? 'lucide:minimize-2' : 'lucide:maximize');
    if (label) label.textContent = on ? '全屏中' : '全屏';
    if (btn) {
      btn.setAttribute('title', on ? '仅可按 Esc 退出全屏' : '进入全屏（退出请按 Esc）');
      btn.classList.toggle('is-pinned', on && fsPinned);
    }
  }

  function onFullscreenChange() {
    syncFullscreenUi();
    if (isFullscreen()) {
      fsRestoring = false;
      return;
    }
    if (fsEscExit) {
      fsPinned = false;
      fsEscExit = false;
      writeFsPin(false);
      syncFullscreenUi();
      return;
    }
    if (fsPinned && !fsRestoring) {
      fsRestoring = true;
      window.setTimeout(function () {
        enterFullscreen().catch(function () {
          fsPinned = false;
          writeFsPin(false);
        }).finally(function () {
          fsRestoring = false;
        });
      }, 60);
    }
  }

  function onFullscreenButtonClick() {
    if (isFullscreen()) {
      showFsHint('全屏已锁定，请按键盘 Esc 退出');
      return;
    }
    fsPinned = true;
    fsEscExit = false;
    writeFsPin(true);
    enterFullscreen().catch(function () {
      fsPinned = false;
      writeFsPin(false);
      alert('当前浏览器不支持全屏，请尝试按 F11');
    });
  }

  function onFullscreenEscKey(e) {
    if (e.key !== 'Escape') return;
    if (!fsPinned || !isFullscreen()) return;
    fsEscExit = true;
  }

  function restorePinnedFullscreen() {
    if (!readFsPin()) return;
    fsPinned = true;
    fsEscExit = false;
    if (isFullscreen()) return;
    window.setTimeout(function () {
      enterFullscreen().catch(function () {
        fsPinned = false;
        writeFsPin(false);
      });
    }, 80);
  }

  function ensureFullscreen() {
    if (!readFsPin() && !fsPinned) return;
    fsPinned = true;
    writeFsPin(true);
    if (isFullscreen()) return;
    fsEscExit = false;
    enterFullscreen().catch(function () {});
  }

  function bindFullscreen() {
    var btn = document.getElementById('ops-fullscreen-btn');
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', onFullscreenButtonClick);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    document.addEventListener('keydown', onFullscreenEscKey, true);
    restorePinnedFullscreen();
    syncFullscreenUi();
  }

  function bindLogoutButtons() {
    ['ops-logout-btn', 'ops-topbar-logout-btn'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || el.dataset.bound) return;
      el.dataset.bound = '1';
      el.addEventListener('click', requestLogout);
    });
  }

  function bind() {
    var menu = document.getElementById('ops-user-menu');
    var trigger = document.getElementById('ops-user-trigger');
    if (trigger && menu) {
      trigger.addEventListener('click', function (e) {
        e.stopPropagation();
        menu.classList.toggle('is-open');
      });
      document.addEventListener('click', function () { menu.classList.remove('is-open'); });
    }
    bindLogoutButtons();
    bindFullscreen();
    setInterval(function () {
      var el = document.getElementById('ops-clock');
      if (el) el.textContent = fmtClock();
    }, 1000);
  }

  function updateStats(stats) {
    var s = stats || {};
    var o = document.getElementById('ops-stat-online');
    var r = document.getElementById('ops-stat-risk');
    var sys = document.getElementById('ops-stat-sys');
    var dot = document.getElementById('ops-notify-dot');
    if (o && s.onlineUsers != null) o.textContent = s.onlineUsers;
    if (r && s.riskAlerts != null) r.textContent = s.riskAlerts;
    if (sys) sys.textContent = s.systemStatus === 'healthy' ? '正常' : '观察';
    if (dot) dot.style.display = (s.riskAlerts || 0) > 0 ? 'block' : 'none';
  }

  return {
    render: render,
    bind: bind,
    updateStats: updateStats,
    ensureFullscreen: ensureFullscreen
  };
})();

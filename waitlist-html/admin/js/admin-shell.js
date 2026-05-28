/**
 * 法绎管理后台 V4 Shell：状态栏、消息中心、实时通知、用户面板、数字动画、页面过渡
 */
(function (global) {
  var messages = [];
  var lastEventSeq = '';
  var notifyTimer = null;
  var feedBootstrapped = false;

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function fmtTime(iso) {
    if (!iso) return '刚刚';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '刚刚';
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }

  /** 数字滚动动画 */
  function countUp(el, end, options) {
    if (!el) return;
    options = options || {};
    var dur = options.duration || 900;
    var decimals = options.decimals || 0;
    var suffix = options.suffix || '';
    var prefix = options.prefix || '';
    var start = parseFloat(el.getAttribute('data-count-from')) || 0;
    var target = typeof end === 'number' ? end : parseFloat(String(end).replace(/[^\d.-]/g, '')) || 0;
    if (isNaN(target)) {
      el.textContent = prefix + end + suffix;
      return;
    }
    var t0 = performance.now();
    function tick(now) {
      var p = Math.min(1, (now - t0) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      var val = start + (target - start) * eased;
      el.textContent = prefix + (decimals ? val.toFixed(decimals) : Math.round(val)) + suffix;
      if (p < 1) requestAnimationFrame(tick);
      else el.setAttribute('data-count-from', String(target));
    }
    requestAnimationFrame(tick);
  }

  function animateNumbersIn(root) {
    if (!root) root = document;
    root.querySelectorAll('[data-count]').forEach(function (el) {
      var end = el.getAttribute('data-count');
      var suffix = el.getAttribute('data-suffix') || '';
      var prefix = el.getAttribute('data-prefix') || '';
      if (el.classList.contains('adm-kpi__value')) {
        var raw = end;
        var unitEl = el.querySelector('span');
        countUp(el, parseFloat(raw) || 0, { suffix: unitEl ? '' : suffix, prefix: prefix });
        if (unitEl) return;
      }
      countUp(el, parseFloat(end) || 0, { suffix: suffix, prefix: prefix });
    });
    root.querySelectorAll('.adm-kpi__value').forEach(function (el) {
      if (el.getAttribute('data-count')) return;
      var text = el.childNodes[0];
      var num = parseFloat((text && text.textContent) || el.textContent);
      if (!isNaN(num)) countUp(el, num, { suffix: '' });
    });
    root.querySelectorAll('.adm-v3-metric__val').forEach(function (el) {
      if (el.getAttribute('data-count')) return;
      var num = parseFloat(el.textContent);
      if (!isNaN(num)) countUp(el, num);
    });
  }

  function pageEnter() {
    var root = $('page-root');
    if (!root) return;
    root.classList.remove('adm-page-enter');
    void root.offsetWidth;
    root.classList.add('adm-page-enter');
    window.setTimeout(function () {
      root.classList.remove('adm-page-enter');
      animateNumbersIn(root);
    }, 420);
  }

  function buildStatusItems(stats, health) {
    var s = stats || {};
    var h = health || {};
    var sys = (h.system) || {};
    return [
      { label: '系统', value: s.systemStatus === 'healthy' ? '运行正常' : '观察中', live: true },
      { label: '在线', value: (s.onlineUsers || 0) + ' 人' },
      { label: '今日咨询', value: (s.consultToday || 0) + ' 次' },
      { label: '法规检索', value: (s.faguiToday || 0) + ' 次' },
      { label: 'CPU', value: (sys.cpuPercent != null ? sys.cpuPercent : '—') + (sys.cpuPercent != null ? '%' : '') },
      { label: '内存', value: (sys.memPercent != null ? sys.memPercent : '—') + (sys.memPercent != null ? '%' : '') },
      { label: '响应', value: (s.avgResponseMs || 0) + ' ms' },
      { label: '同步', value: fmtTime(s.serverTime || new Date().toISOString()) }
    ];
  }

  function renderStatusBar(stats, health) {
    var track = $('adm-status-track');
    if (!track) return;
    var items = buildStatusItems(stats, health);
    var html = items.map(function (it) {
      return '<span class="adm-dynamic-status__item">' +
        (it.live ? '<span class="adm-dynamic-status__dot"></span>' : '') +
        esc(it.label) + ' <strong>' + esc(String(it.value)) + '</strong></span>';
    }).join('');
    track.innerHTML = html + html;
  }

  function pushMessage(item) {
    messages.unshift(item);
    if (messages.length > 80) messages.length = 80;
    renderMessageList();
    updateBadges();
  }

  function renderMessageList() {
    var list = $('adm-msg-list');
    if (!list) return;
    if (!messages.length) {
      list.innerHTML = '<p style="text-align:center;color:#8b9dc3;padding:32px 16px">暂无消息</p>';
      return;
    }
    list.innerHTML = messages.map(function (m, i) {
      return '<div class="adm-msg-item' + (m.unread ? ' is-unread' : '') + '" data-idx="' + i + '">' +
        '<div class="adm-msg-item__title">' + esc(m.title) + '</div>' +
        '<div class="adm-msg-item__meta">' + esc(m.time) + ' · ' + esc(m.type || '系统') + '</div>' +
        '<div style="font-size:12px;color:#94a3b8;margin-top:6px">' + esc(m.body) + '</div></div>';
    }).join('');
    list.querySelectorAll('.adm-msg-item').forEach(function (node) {
      node.onclick = function () {
        var idx = parseInt(node.getAttribute('data-idx'), 10);
        if (messages[idx]) messages[idx].unread = false;
        renderMessageList();
        updateBadges();
      };
    });
  }

  function updateBadges() {
    var unread = messages.filter(function (m) { return m.unread; }).length;
    ['adm-msg-badge', 'adm-notify-badge', 'adm-notify-count'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      if (unread > 0) {
        el.textContent = unread > 99 ? '99+' : String(unread);
        el.classList.remove('is-hidden', 'is-empty');
      } else {
        el.classList.add('is-hidden');
        if (id === 'adm-notify-count') {
          el.textContent = '0';
          el.classList.add('is-empty');
        }
      }
    });
  }

  function showRealtimeToast(item) {
    var stack = $('adm-notify-stack');
    if (!stack) return;
    var node = document.createElement('div');
    var cls = 'adm-notify-toast';
    if (/风险|失败|异常/.test(item.title + item.body)) cls += ' adm-notify-toast--risk';
    else if (/警告|降级/.test(item.title + item.body)) cls += ' adm-notify-toast--warn';
    node.className = cls;
    node.innerHTML = '<div>' + esc(item.title) + '</div>' +
      '<div style="font-size:12px;color:#94a3b8;margin-top:4px">' + esc(item.body) + '</div>' +
      '<div class="adm-notify-toast__time">' + esc(item.time) + '</div>';
    stack.appendChild(node);
    window.setTimeout(function () {
      node.style.opacity = '0';
      node.style.transform = 'translateX(20px)';
      node.style.transition = 'opacity .3s, transform .3s';
      window.setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 320);
    }, 5000);
    while (stack.children.length > 5) stack.removeChild(stack.firstChild);
  }

  function ingestActivity(data) {
    if (!data) return;
    renderStatusBar(data.stats, { system: {
      cpuPercent: data.stats && data.stats.cpuPercent,
      memPercent: data.stats && data.stats.memPercent
    }});

    var feed = (data.feed || []).slice(0, 12);
    var seq = feed.map(function (e) { return e.id || e.time + e.message; }).join('|');
    if (seq && seq === lastEventSeq) return;
    lastEventSeq = seq;

    feed.forEach(function (ev) {
      var title = ev.title || '平台动态';
      var body = ev.message || ev.preview || ev.content || '';
      var exists = messages.some(function (m) {
        return m.id === (ev.id || ev.time + title);
      });
      if (exists) return;
      var item = {
        id: ev.id || String(ev.time) + title,
        title: title,
        body: body.slice(0, 120),
        time: fmtTime(ev.time),
        type: ev.type || '实时',
        unread: true
      };
      pushMessage(item);
      if (feedBootstrapped) showRealtimeToast(item);
    });
    feedBootstrapped = true;
  }

  function openDrawer(id) {
    var overlay = $('adm-drawer-overlay');
    var drawer = $(id);
    if (overlay) overlay.classList.add('is-open');
    if (drawer) drawer.classList.add('is-open');
  }

  function closeDrawers() {
    ['adm-drawer-overlay', 'adm-msg-drawer'].forEach(function (id) {
      var el = $(id);
      if (el) el.classList.remove('is-open');
    });
  }

  function bindUi() {
    var msgBtn = $('adm-msg-btn');
    var overlay = $('adm-drawer-overlay');
    var closeBtn = $('adm-drawer-close');
    var userMenu = $('adm-user-menu');
    var userTrigger = $('adm-user-trigger');

    if (msgBtn) {
      msgBtn.onclick = function () {
        openDrawer('adm-msg-drawer');
        messages.forEach(function (m) { m.unread = false; });
        renderMessageList();
        updateBadges();
      };
    }
    if (overlay) overlay.onclick = closeDrawers;
    if (closeBtn) closeBtn.onclick = closeDrawers;

    if (userTrigger && userMenu) {
      userTrigger.onclick = function (e) {
        e.stopPropagation();
        userMenu.classList.toggle('is-open');
      };
      document.addEventListener('click', function () {
        userMenu.classList.remove('is-open');
      });
    }

    var logoutDrop = $('adm-user-logout-drop');
    if (logoutDrop) {
      logoutDrop.onclick = function () {
        if (global.FayiAdminApi) FayiAdminApi.clearToken();
        location.href = 'admin-login.html';
      };
    }
  }

  function seedMessages() {
    pushMessage({
      id: 'welcome',
      title: '运营控制台已就绪',
      body: '数据与 AI 服务状态将在此实时同步',
      time: fmtTime(new Date().toISOString()),
      type: '系统',
      unread: false
    });
  }

  function pollHealth() {
    var url = 'http://localhost:3002/api/admin/datav/health';
    var req = global.FayiHttp
      ? FayiHttp.get(url, { silent: true })
      : fetch(url, { cache: 'no-store' }).then(function (r) { return r.json(); });
    req.then(function (json) {
      var sys = (json && json.system) || {};
      var cached = global.FayiActivityCenter && FayiActivityCenter.getCached
        ? FayiActivityCenter.getCached()
        : null;
      var stats = (cached && cached.stats) || {};
      renderStatusBar(Object.assign({}, stats, {
        avgResponseMs: sys.responseMs != null ? sys.responseMs : stats.avgResponseMs,
        onlineUsers: sys.onlineUsers != null ? sys.onlineUsers : stats.onlineUsers,
        serverTime: json.time
      }), { system: sys });
    }).catch(function () {});
  }

  function pollActivity() {
    if (!global.FayiActivityCenter) return;
    FayiActivityCenter.load(true).then(ingestActivity).catch(function () {});
  }

  function init() {
    bindUi();
    seedMessages();
    pollActivity();
    pollHealth();
    notifyTimer = window.setInterval(pollActivity, 30000);
    window.setInterval(pollHealth, 10000);

    document.querySelectorAll('[data-route-jump]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        var route = el.getAttribute('data-route-jump');
        if (!route || el.getAttribute('target') === '_blank') return;
        e.preventDefault();
        location.hash = route;
        closeDrawers();
        var menu = $('adm-user-menu');
        if (menu) menu.classList.remove('is-open');
      });
    });

    if (global.FayiAdminApi) {
      FayiAdminApi.me().then(function (res) {
        var u = (res && res.data) || {};
        var nameEl = $('adm-user-name');
        var roleEl = $('adm-user-role');
        var av = $('adm-user-avatar-mini');
        if (nameEl) nameEl.textContent = u.name || u.nickname || u.email || '管理员';
        if (roleEl) roleEl.textContent = u.role === 'super_admin' ? '超级管理员' : '系统管理员';
        if (av) av.textContent = (u.name || u.email || '管').slice(0, 1);
      }).catch(function () {});
    }
  }

  global.AdminShell = {
    init: init,
    pageEnter: pageEnter,
    countUp: countUp,
    animateNumbersIn: animateNumbersIn,
    pushMessage: pushMessage,
    renderStatusBar: renderStatusBar,
    ingestActivity: ingestActivity
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);

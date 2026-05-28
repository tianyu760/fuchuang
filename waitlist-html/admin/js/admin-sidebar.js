/**
 * 管理端左侧栏 · 数据绑定与交互
 */
(function () {
  var HEALTH_URL = 'http://localhost:3002/api/admin/datav/health';
  var REFRESH_MS = 12000;

  function $(id) { return document.getElementById(id); }

  function fmtLogin(iso) {
    if (!iso) return '—';
    try {
      var d = new Date(iso);
      return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return String(iso).slice(0, 16).replace('T', ' ');
    }
  }

  function setBar(barId, valId, pct, suffix) {
    var bar = $(barId);
    var val = $(valId);
    pct = Math.max(0, Math.min(100, Math.round(pct)));
    if (bar) bar.style.width = pct + '%';
    if (val) val.textContent = suffix != null ? suffix : pct + '%';
  }

  function setServiceStatus(key, state) {
    var el = $('adm-svc-' + key);
    var li = document.querySelector('.adm-ai-status__list li[data-svc="' + key + '"]');
    if (!el) return;
    var label = state === 'online' ? '正常' : state === 'degraded' ? '降级' : '离线';
    el.textContent = label;
    if (li) {
      li.classList.toggle('is-offline', state !== 'online');
      li.classList.toggle('is-degraded', state === 'degraded');
    }
  }

  function renderAdmin(user) {
    user = user || {};
    var name = user.name || user.nickname || user.email || '管理员';
    var nameEl = $('adm-admin-name');
    var avatarEl = $('adm-avatar');
    if (nameEl) nameEl.textContent = name;
    if (avatarEl) {
      var ch = (name.trim()[0] || '管').toUpperCase();
      avatarEl.textContent = ch;
    }
    var roleEl = $('adm-admin-role');
    if (roleEl) {
      roleEl.textContent = user.role === 'admin' || user.userType === 'admin' ? '系统管理员 · L2' : '运营人员';
    }
    var loginEl = $('adm-last-login');
    if (loginEl) {
      var t = user.lastLoginAt || user.updatedAt || new Date().toISOString();
      loginEl.textContent = '最近登录：' + fmtLogin(t);
    }
  }

  function renderHealth(data) {
    if (!data) return;
    var svc = data.services || {};
    setServiceStatus('gpt', svc.gpt || 'online');
    setServiceStatus('ocr', svc.ocr || 'online');
    setServiceStatus('vector', svc.vector || 'online');
    setServiceStatus('redis', svc.redis || 'online');
    var sys = data.system || {};
    setBar('adm-cpu-bar', 'adm-cpu-val', sys.cpuPercent || 0);
    setBar('adm-mem-bar', 'adm-mem-val', sys.memoryPercent || 0);
    var apiMs = sys.responseMs || 420;
    setBar('adm-api-bar', 'adm-api-val', Math.min(100, apiMs / 10), apiMs + 'ms');
    var online = sys.onlineUsers || 1;
    setBar('adm-online-bar', 'adm-online-val', Math.min(100, online * 12), String(online));
    var syncEl = $('adm-sync-time');
    if (syncEl && data.time) syncEl.textContent = fmtLogin(data.time);
  }

  function renderNotify(data) {
    var badge = $('adm-notify-count');
    if (!badge || !data) return;
    var n = (data.riskEvents || []).length;
    var recent = (data.feed || []).filter(function (f) {
      return f.riskLevel === 'high';
    }).length;
    var total = n + Math.min(recent, 5);
    badge.textContent = total > 99 ? '99+' : String(total);
    badge.classList.toggle('is-empty', total === 0);
  }

  function fetchHealth() {
    var req = window.FayiHttp
      ? FayiHttp.get(HEALTH_URL, { silent: true })
      : fetch(HEALTH_URL, { cache: 'no-store' }).then(function (r) {
          var ct = (r.headers.get('content-type') || '').toLowerCase();
          if (ct.indexOf('application/json') < 0) throw new Error('non-json');
          return r.json();
        });
    return req.then(function (json) {
        var payload = json.data || json;
        if (json.code === 0 || json.success) renderHealth(payload);
        if (window.AdminShell && AdminShell.renderStatusBar && payload.stats) {
          AdminShell.renderStatusBar(payload.stats, payload);
        }
        return json;
      })
      .catch(function () {
        setServiceStatus('gpt', 'offline');
        setServiceStatus('ocr', 'offline');
        setServiceStatus('vector', 'offline');
        setServiceStatus('redis', 'offline');
      });
  }

  function refreshCenter() {
    if (!window.FayiActivityCenter) return Promise.resolve();
    return FayiActivityCenter.load(true).then(function (data) {
      renderNotify(data);
      if (data.stats) {
        var s = data.stats;
        setBar('adm-online-bar', 'adm-online-val', Math.min(100, (s.onlineUsers || 1) * 12), String(s.onlineUsers || 1));
        var apiMs = s.avgResponseMs || 420;
        setBar('adm-api-bar', 'adm-api-val', Math.min(100, apiMs / 10), apiMs + 'ms');
      }
      if (window.AdminShell && AdminShell.ingestActivity) {
        AdminShell.ingestActivity(data);
      }
      var syncEl = $('adm-sync-time');
      if (syncEl && data.serverTime) syncEl.textContent = fmtLogin(data.serverTime);
    });
  }

  function bindQuickJumps() {
    document.querySelectorAll('[data-route-jump]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        var route = el.getAttribute('data-route-jump');
        if (!route || el.getAttribute('target') === '_blank') return;
        e.preventDefault();
        location.hash = route;
      });
    });
  }

  function init() {
    bindQuickJumps();
    if (window.FayiAdminApi) {
      FayiAdminApi.me().then(function (res) {
        renderAdmin(res.data);
      }).catch(function () {});
    }
    fetchHealth();
    refreshCenter();
    setInterval(function () {
      fetchHealth();
      refreshCenter();
    }, REFRESH_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.AdmSidebar = { refresh: function () { fetchHealth(); return refreshCenter(); }, renderAdmin: renderAdmin };
})();

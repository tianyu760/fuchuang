/**
 * 左侧导航 · 紧凑一屏 + 系统状态 + 退出
 */
window.OpsSidebar = (function () {
  var NAV_GROUPS = [
    {
      id: 'overview',
      label: '总览',
      items: [
        { id: 'dashboard', href: 'dashboard.html', icon: 'lucide:layout-dashboard', label: '数据总览' }
      ]
    },
    {
      id: 'business',
      label: '业务核心',
      items: [
        { id: 'consultations', href: 'consultations.html', icon: 'lucide:message-square-text', label: '法律咨询' },
        { id: 'documents', href: 'documents.html', icon: 'lucide:file-text', label: '文书系统' },
        { id: 'ocr', href: 'ocr.html', icon: 'lucide:scan-text', label: 'OCR识别' },
        { id: 'regulations', href: 'regulations.html', icon: 'lucide:scale', label: '法规库' }
      ]
    },
    {
      id: 'insight',
      label: '分析与风控',
      items: [
        { id: 'risks', href: 'risks.html', icon: 'lucide:shield-alert', label: '风险预警' },
        { id: 'analytics', href: 'analytics.html', icon: 'lucide:bar-chart-3', label: '数据分析' },
        { id: 'law-education', href: 'law-education.html', icon: 'lucide:book-open', label: '普法运营' }
      ]
    },
    {
      id: 'system',
      label: '系统管理',
      items: [
        { id: 'users', href: 'users.html', icon: 'lucide:users', label: '用户中心' },
        { id: 'logs', href: 'logs.html', icon: 'lucide:scroll-text', label: '系统日志' },
        { id: 'settings', href: 'settings.html', icon: 'lucide:settings', label: '平台设置' }
      ]
    }
  ];

  function allNavItems() {
    var list = [];
    NAV_GROUPS.forEach(function (g) {
      g.items.forEach(function (it) { list.push(it); });
    });
    return list;
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  function statusRow(id, label) {
    return '<div class="ops-side-status__row" id="' + id + '">' +
      '<span class="ops-status-dot ops-status-dot--ok"></span>' +
      '<span class="ops-side-status__text">' + esc(label) + '</span></div>';
  }

  function renderGroup(group, activeId) {
    var links = group.items.map(function (item) {
      var cls = item.id === activeId ? 'is-active' : '';
      return '<a href="' + item.href + '" class="ops-nav__link ' + cls + '" data-nav="' + item.id + '">' +
        '<iconify-icon icon="' + item.icon + '" aria-hidden="true"></iconify-icon>' +
        '<span class="ops-nav__text">' + esc(item.label) + '</span></a>';
    }).join('');

    return '<div class="ops-nav__group" data-group="' + group.id + '">' +
      '<p class="ops-nav__group-label">' + esc(group.label) + '</p>' +
      '<div class="ops-nav__group-items">' + links + '</div>' +
    '</div>';
  }

  function render(activeId) {
    var info = (window.OpsBoot && OpsBoot.adminInfo) || {};
    var name = info.nickname || info.name || '管理员';
    var initial = String(name).trim()[0] || '管';

    var groupsHtml = NAV_GROUPS.map(function (g) {
      return renderGroup(g, activeId);
    }).join('');

    return (
      '<div class="ops-brand-v4 ops-brand-v4--compact">' +
        '<a href="dashboard.html" class="ops-brand-v4__link">' +
          '<div class="ops-brand-v4__row">' +
            '<div class="ops-logo-mark ops-logo-mark--sm"><iconify-icon icon="lucide:scale"></iconify-icon></div>' +
            '<div class="ops-brand-v4__titles">' +
              '<p class="ops-brand-v4__title">法绎运营中枢</p>' +
              '<p class="ops-brand-v4__tag">LEGAL OPS</p>' +
            '</div>' +
          '</div>' +
        '</a>' +
      '</div>' +
      '<nav class="ops-nav ops-nav--compact" aria-label="核心功能导航">' +
        groupsHtml +
      '</nav>' +
      '<section class="ops-side-status" aria-label="系统状态">' +
        '<p class="ops-side-status__title">系统状态</p>' +
        '<div class="ops-side-status__list">' +
          statusRow('ops-st-sys', '系统 · 检测中') +
          statusRow('ops-st-ai', 'AI 引擎 · —') +
          statusRow('ops-st-ocr', 'OCR · —') +
          statusRow('ops-st-reg', '法规库 · —') +
          statusRow('ops-st-users', '在线用户 · —') +
          statusRow('ops-st-risk', '今日风险 · —') +
        '</div>' +
      '</section>' +
      '<div class="ops-side-foot">' +
        '<div class="ops-admin-card ops-admin-card--compact">' +
          '<div class="ops-admin-card__avatar">' + esc(initial) + '</div>' +
          '<div class="ops-admin-card__meta">' +
            '<div class="ops-admin-card__name">' + esc(name) + '</div>' +
            '<div class="ops-admin-card__role">系统管理员</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function setStatusRow(id, text, state) {
    var el = document.getElementById(id);
    if (!el) return;
    var span = el.querySelector('.ops-side-status__text');
    if (span) span.textContent = text;
    var dot = el.querySelector('.ops-status-dot');
    if (dot) {
      dot.className = 'ops-status-dot ' + (
        state === 'ok' ? 'ops-status-dot--ok' : state === 'warn' ? 'ops-status-dot--warn' : 'ops-status-dot--err'
      );
    }
  }

  function doLogout() {
    if (window.OpsSystemLog) {
      try {
        OpsSystemLog.update('auth', '管理员退出登录', '', '');
      } catch (e) { /* ignore */ }
    }
    if (window.FayiAdminAuth && FayiAdminAuth.logout) {
      FayiAdminAuth.logout();
      return;
    }
    localStorage.removeItem('fayi_admin_token');
    localStorage.removeItem('fayi_admin_info');
    localStorage.removeItem('fayi_admin_permission_verified');
    window.location.replace('../admin-login.html');
  }

  function bind() {
    /* 退出登录仅保留顶栏入口 */
  }

  function update(stats) {
    stats = stats || {};
    var riskN = stats.riskAlerts != null ? stats.riskAlerts : 0;
    var onlineN = stats.onlineUsers != null ? stats.onlineUsers : 0;
    var ocrRate = stats.ocrSuccessRate != null ? stats.ocrSuccessRate : 0;
    var ocrOk = ocrRate >= 60 || stats.ocrToday === 0;
    var sysOk = stats.systemStatus === 'healthy';

    setStatusRow('ops-st-sys', sysOk ? '系统 · 运行正常' : '系统 · 观察中', sysOk ? 'ok' : 'warn');
    setStatusRow('ops-st-ai', 'AI 引擎 · 在线', 'ok');
    setStatusRow('ops-st-ocr', 'OCR · ' + (ocrOk ? '正常' : '降级'), ocrOk ? 'ok' : 'warn');
    setStatusRow('ops-st-reg', '法规库 · 已同步', 'ok');
    setStatusRow('ops-st-users', '在线用户 · ' + onlineN, onlineN > 0 ? 'ok' : 'warn');
    setStatusRow(
      'ops-st-risk',
      '今日风险 · ' + riskN,
      riskN > 5 ? 'err' : riskN > 0 ? 'warn' : 'ok'
    );
  }

  return {
    render: render,
    bind: bind,
    update: update,
    logout: doLogout,
    NAV: allNavItems(),
    NAV_GROUPS: NAV_GROUPS
  };
})();

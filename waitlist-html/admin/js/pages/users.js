/**
 * 用户中心 · 卡片运营 / 在线状态 / 详情抽屉
 */
window.OpsPages = window.OpsPages || {};
OpsPages.users = (function () {
  var filter = { search: '', riskLevel: 'all', status: 'all', online: 'all', sort: 'active', page: 1, pageSize: 48 };
  var pollTimer = null;
  var drawerBound = false;
  var drawerCharts = [];
  var heatChart = null;

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  function riskTag(lv) {
    var cls = lv === 'high' ? 'ops-tag--risk-high' : lv === 'low' ? 'ops-tag--risk-low' : 'ops-tag--risk-mid';
    var label = lv === 'high' ? '高风险' : lv === 'low' ? '低风险' : '中风险';
    return '<span class="ops-tag ' + cls + '">' + label + '</span>';
  }

  function onlineBadge(status, label) {
    return '<span class="ops-online ops-online--' + esc(status) + '">' +
      '<span class="ops-online__dot"></span>' + esc(label) + '</span>';
  }

  function ensureDrawer() {
    if (drawerBound) return;
    drawerBound = true;
    document.body.insertAdjacentHTML('beforeend',
      '<div class="ops-drawer-overlay" id="ops-user-overlay"></div>' +
      '<aside class="ops-drawer ops-drawer--user" id="ops-user-drawer" aria-label="用户详情">' +
        '<div class="ops-drawer__head">' +
          '<div><h3 style="margin:0;color:var(--ops-title)" id="ops-user-drawer-title">用户详情</h3>' +
          '<p style="margin:4px 0 0;font-size:12px;color:var(--ops-text)" id="ops-user-drawer-sub"></p></div>' +
          '<button type="button" class="ops-icon-btn" id="ops-user-drawer-close"><iconify-icon icon="lucide:x"></iconify-icon></button>' +
        '</div>' +
        '<div class="ops-drawer__body" id="ops-user-drawer-body"></div>' +
      '</aside>');
    document.getElementById('ops-user-drawer-close').addEventListener('click', closeDrawer);
    document.getElementById('ops-user-overlay').addEventListener('click', closeDrawer);
  }

  function openDrawer() {
    document.getElementById('ops-user-overlay').classList.add('is-open');
    document.getElementById('ops-user-drawer').classList.add('is-open');
  }

  function closeDrawer() {
    drawerCharts.forEach(function (c) { try { c.dispose(); } catch (e) {} });
    drawerCharts = [];
    var o = document.getElementById('ops-user-overlay');
    var d = document.getElementById('ops-user-drawer');
    if (o) o.classList.remove('is-open');
    if (d) d.classList.remove('is-open');
  }

  function mount(root) {
    ensureDrawer();
    root.innerHTML =
      (window.OpsUI ? OpsUI.pageHeader('用户中心', '实时在线 · 用户画像 · 行为分析 · 风险运营') : '') +
      '<section class="ops-users-summary" id="ops-users-summary"></section>' +
      '<div class="ops-card ops-users-heat">' +
        '<div class="ops-card__head"><div><h3>实时用户活动热力</h3><p>当前在线与近期活跃分布</p></div></div>' +
        '<div class="ops-users-heat__chart" id="ops-users-heat-chart"></div></div>' +
      '<div class="ops-toolbar">' +
        '<input type="search" id="ops-user-q" placeholder="搜索昵称、邮箱、标签、用户ID" />' +
        '<select id="ops-user-online"><option value="all">全部在线状态</option><option value="online">在线</option><option value="away">离开</option><option value="offline">离线</option></select>' +
        '<select id="ops-user-risk"><option value="all">全部风险</option><option value="high">高风险</option><option value="mid">中风险</option><option value="low">低风险</option></select>' +
        '<select id="ops-user-status"><option value="all">账号状态</option><option value="active">正常</option><option value="banned">已封禁</option></select>' +
        '<select id="ops-user-sort"><option value="active">最近活跃</option><option value="consult">咨询量</option><option value="risk">风险等级</option><option value="new">注册时间</option></select>' +
      '</div>' +
      '<div class="ops-users-grid" id="ops-users-grid"></div>';

    ['ops-user-q', 'ops-user-online', 'ops-user-risk', 'ops-user-status', 'ops-user-sort'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', reload);
      if (el.type === 'search') el.addEventListener('input', debounce(reload, 320));
    });

    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(reload, 15000);
    reload();
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  function reload() {
    filter.search = (document.getElementById('ops-user-q') || {}).value || '';
    filter.online = (document.getElementById('ops-user-online') || {}).value || 'all';
    filter.riskLevel = (document.getElementById('ops-user-risk') || {}).value || 'all';
    filter.status = (document.getElementById('ops-user-status') || {}).value || 'all';
    filter.sort = (document.getElementById('ops-user-sort') || {}).value || 'active';
    OpsDataCenter.loadUsers(filter).then(function (data) {
      renderSummary(data);
      renderGrid(data);
      renderActivityHeat(data);
    });
  }

  function renderSummary(data) {
    var list = (data && data.list) || [];
    var online = list.filter(function (u) { return u.onlineStatus === 'online'; }).length;
    var away = list.filter(function (u) { return u.onlineStatus === 'away'; }).length;
    var high = list.filter(function (u) { return u.riskLevel === 'high'; }).length;
    var active = list.filter(function (u) { return (u.activityScore || 0) >= 40; }).length;
    var el = document.getElementById('ops-users-summary');
    if (!el) return;
    el.innerHTML =
      summaryCard('用户总数', list.length) +
      summaryCard('在线', online, 'var(--ops-success)') +
      summaryCard('离开', away, 'var(--ops-gold)') +
      summaryCard('高风险', high, 'var(--ops-risk)') +
      summaryCard('高活跃', active, 'var(--ops-cyan)');
  }

  function summaryCard(label, val, color) {
    return '<div class="ops-card"><label>' + label + '</label><strong class="ops-num" style="color:' +
      (color || 'var(--ops-title)') + '">' + val + '</strong></div>';
  }

  function renderActivityHeat(data) {
    var el = document.getElementById('ops-users-heat-chart');
    if (!el) return;
    if (!window.echarts) {
      if (window.OpsScriptLoader) {
        OpsScriptLoader.loadEcharts().then(function () { renderActivityHeat(data); });
      }
      return;
    }
    var list = (data && data.list) || [];
    var buckets = new Array(24).fill(0);
    list.forEach(function (u) {
      if (u.onlineStatus === 'online') {
        var h = new Date().getHours();
        buckets[h]++;
      }
      var t = u.lastActiveAt ? new Date(u.lastActiveAt).getHours() : -1;
      if (t >= 0 && t < 24) buckets[t]++;
    });
    if (heatChart) { try { heatChart.dispose(); } catch (e) {} }
    heatChart = echarts.init(el);
    heatChart.setOption({
      grid: { left: 28, right: 8, top: 8, bottom: 20 },
      xAxis: {
        type: 'category',
        data: buckets.map(function (_, i) { return i + 'h'; }),
        axisLabel: { color: '#64748b', fontSize: 10, interval: 3 }
      },
      yAxis: { type: 'value', show: false },
      series: [{
        type: 'bar',
        data: buckets,
        itemStyle: {
          borderRadius: [4, 4, 0, 0],
          color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: '#2855ff' }, { offset: 1, color: '#38bdf8' }] }
        }
      }]
    });
    setTimeout(function () { try { heatChart.resize(); } catch (e) {} }, 80);
  }

  function renderGrid(data) {
    var list = (data && data.list) || [];
    var grid = document.getElementById('ops-users-grid');
    if (!grid) return;
    grid.innerHTML = list.length ? list.map(function (u) {
      var onlineCls = u.onlineStatus === 'online' ? ' ops-user-card--online' : '';
      var tags = (u.tags || []).slice(0, 4).map(function (t) {
        return '<span class="ops-tag ops-tag--auto">' + esc(t) + '</span>';
      }).join('');
      return '<article class="ops-user-card' + onlineCls + '" data-uid="' + esc(u.id) + '">' +
        '<div class="ops-user-card__head">' +
          '<div class="ops-user-card__avatar">' + esc(u.avatarInitial || 'U') + '</div>' +
          '<div class="ops-user-card__meta">' +
            '<h4>' + esc(u.name) + '</h4>' +
            '<div class="ops-user-card__id">' + esc(u.id) + '</div>' +
            '<div style="font-size:11px;color:var(--ops-text-secondary);margin-top:2px">' + esc(u.email) + '</div>' +
          '</div></div>' +
        '<div class="ops-user-card__row">' + onlineBadge(u.onlineStatus, u.onlineLabel) + riskTag(u.riskLevel) +
          (u.status === 'banned' ? '<span class="ops-tag ops-tag--risk-high">已封禁</span>' : '') +
        '</div>' +
        '<div class="ops-user-card__stats">' +
          '<div><span>活跃度</span><strong class="ops-num">' + esc(u.activityScore || 0) + '</strong></div>' +
          '<div><span>咨询</span><strong class="ops-num">' + esc(u.consultCount || 0) + '</strong></div>' +
          '<div><span>领域</span><strong>' + esc((u.topLegalArea || '—').slice(0, 6)) + '</strong></div>' +
        '</div>' +
        '<div style="font-size:11px;color:var(--ops-text-secondary);margin-bottom:8px">最近活跃 · ' +
          esc(fmtRel(u.lastActiveAt)) + '</div>' +
        '<div class="ops-user-card__tags">' + tags + '</div>' +
      '</article>';
    }).join('') : '<p class="ops-empty" style="grid-column:1/-1">暂无用户数据</p>';

    grid.querySelectorAll('.ops-user-card').forEach(function (card) {
      card.addEventListener('click', function () {
        showDetail(card.getAttribute('data-uid'));
      });
    });
  }

  function fmtRel(iso) {
    if (!iso) return '—';
    var diff = Date.now() - new Date(iso).getTime();
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
    return String(iso).slice(0, 16).replace('T', ' ');
  }

  function showDetail(id) {
    OpsDataCenter.userDetail(id).then(function (u) {
      if (!u) return;
      document.getElementById('ops-user-drawer-title').textContent = u.name || '用户详情';
      document.getElementById('ops-user-drawer-sub').textContent = u.email + ' · ' + u.onlineLabel;
      var tags = (u.tags || []).map(function (t) {
        return '<span class="ops-tag ops-tag--auto">' + esc(t) + '</span>';
      }).join(' ') || '无';

      document.getElementById('ops-user-drawer-body').innerHTML =
        '<div style="display:flex;gap:14px;align-items:center;margin-bottom:16px">' +
          '<div class="ops-user-drawer__avatar">' + esc(String(u.name || 'U')[0]) + '</div>' +
          '<div>' + onlineBadge(u.onlineStatus, u.onlineLabel) + ' ' + riskTag(u.riskLevel) +
          '<p style="margin:8px 0 0;font-size:12px;color:var(--ops-text)">' + esc(u.portrait && u.portrait.type) + ' · ' +
          esc(u.portrait && u.portrait.activeLevel) + '</p></div></div>' +

        '<section class="ops-user-drawer__section"><h4>基础信息</h4>' +
          '<p>用户 ID：<code>' + esc(u.id) + '</code></p>' +
          '<p>注册时间：' + esc((u.createdAt || '').slice(0, 10)) + '</p>' +
          '<p>最近登录：' + esc((u.lastLoginAt || '').slice(0, 16)) + '</p>' +
          '<p>最近活跃：' + esc((u.lastActiveAt || '').slice(0, 16)) + '</p>' +
          '<p>登录 IP / 地点：' + esc(u.loginLocation) + '</p>' +
          '<p>注册来源：' + esc(u.registerSource) + '</p></section>' +

        '<section class="ops-user-drawer__section"><h4>用户画像</h4>' +
          '<p>常用法律领域：' + esc(u.topLegalArea) + '</p>' +
          '<p>高频关键词：' + esc((u.topKeywords || []).join('、') || '—') + '</p>' +
          '<p>活跃时段峰值：' + esc(u.portrait && u.portrait.peakHours) + '</p>' +
          '<p>活跃度评分：<strong class="ops-num">' + esc(u.activityScore) + '</strong></p>' +
          '<div style="margin-top:8px">' + tags + '</div></section>' +

        '<section class="ops-user-drawer__section"><h4>行为分析</h4>' +
          '<p>咨询 ' + esc(u.consultCount) + ' 次 · 文书 ' + esc(u.documentCount) + ' · OCR ' + esc(u.ocrCount) + '</p>' +
          '<ul style="margin:8px 0 0;padding-left:16px;font-size:12px;color:var(--ops-text)">' +
          (u.recentConsults || []).map(function (c) {
            return '<li>[' + esc((c.createdAt || '').slice(5, 16)) + '] ' + esc(c.question) + '</li>';
          }).join('') || '<li>暂无咨询记录</li>' +
          '</ul></section>' +

        '<section class="ops-user-drawer__section"><h4>数据分析</h4>' +
          '<div class="ops-user-drawer__charts">' +
            '<div class="ops-user-drawer__chart" id="ops-ud-chart-hour"></div>' +
            '<div class="ops-user-drawer__chart" id="ops-ud-chart-cat"></div>' +
          '</div></section>' +

        '<section class="ops-user-drawer__section"><h4>系统建议</h4>' +
          '<div class="ops-user-drawer__suggestion">' + esc(u.suggestion) + '</div></section>' +

        '<section class="ops-user-drawer__section" style="border:none">' +
          '<h4>运营操作</h4>' +
          '<input id="ops-user-tags-input" placeholder="标签，逗号分隔" style="width:100%;height:36px;border-radius:8px;border:1px solid var(--ops-border);background:rgba(0,0,0,.25);color:var(--ops-title);padding:0 10px;margin-bottom:8px" value="' + esc((u.tags || []).join(',')) + '" />' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
            '<button type="button" class="ops-btn ops-btn--sm" id="ops-save-tags">保存标签</button>' +
            (u.status === 'banned'
              ? '<button type="button" class="ops-btn ops-btn--sm" id="ops-unban-user">解封用户</button>'
              : '<button type="button" class="ops-btn ops-btn--sm" id="ops-ban-user">封禁用户</button>') +
          '</div></section>';

      mountDrawerCharts(u);
      openDrawer();

      document.getElementById('ops-save-tags').onclick = function () {
        var raw = (document.getElementById('ops-user-tags-input') || {}).value || '';
        var tagsArr = raw.split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean);
        OpsDataCenter.setUserTags(id, tagsArr).then(function () { showDetail(id); reload(); });
      };
      var ban = document.getElementById('ops-ban-user');
      var unban = document.getElementById('ops-unban-user');
      if (ban) ban.onclick = function () { OpsDataCenter.setUserStatus(id, 'banned').then(function () { showDetail(id); reload(); }); };
      if (unban) unban.onclick = function () { OpsDataCenter.setUserStatus(id, 'active').then(function () { showDetail(id); reload(); }); };
    });
  }

  function mountDrawerCharts(u) {
    if (!window.OpsCharts || !window.echarts) return;
    drawerCharts.forEach(function (c) { try { c.dispose(); } catch (e) {} });
    drawerCharts = [];
    var T = OpsCharts;
    var hEl = document.getElementById('ops-ud-chart-hour');
    var cEl = document.getElementById('ops-ud-chart-cat');
    if (hEl && u.hourlyActivity) {
      var labels = u.hourlyActivity.map(function (_, i) { return i + '时'; });
      var ch = echarts.init(hEl);
      ch.setOption({
        title: { text: '活跃时段', left: 8, top: 4, textStyle: { color: '#94a3b8', fontSize: 11 } },
        grid: { left: 32, right: 8, top: 28, bottom: 24 },
        xAxis: { type: 'category', data: labels, axisLabel: { color: '#64748b', fontSize: 9, interval: 3 } },
        yAxis: { type: 'value', show: false },
        series: [{ type: 'bar', data: u.hourlyActivity, itemStyle: { color: '#38bdf8', borderRadius: [3, 3, 0, 0] } }]
      });
      drawerCharts.push(ch);
    }
    if (cEl) T.mount(cEl, T.donut(u.categoryDistribution), drawerCharts);
    setTimeout(function () { drawerCharts.forEach(function (c) { try { c.resize(); } catch (e) {} }); }, 120);
  }

  function onData() { reload(); }

  return { mount: mount, onData: onData };
})();

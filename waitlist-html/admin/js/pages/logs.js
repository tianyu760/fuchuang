/**
 * 系统日志中心 · System Log Center
 */
window.OpsPages = window.OpsPages || {};
OpsPages.logs = (function () {
  var filter = {
    module: 'all',
    actionType: 'all',
    userId: '',
    status: 'all',
    dateFrom: '',
    dateTo: '',
    keyword: '',
    page: 1,
    pageSize: 20
  };

  var state = {
    logList: [],
    logOverview: null,
    currentLogDetail: null,
    logLoading: false,
    filterParams: filter
  };

  var MODULE_OPTS = [
    { v: 'all', l: '全部模块' },
    { v: 'ocr', l: 'OCR' },
    { v: 'document', l: '文书' },
    { v: 'consult', l: '咨询' },
    { v: 'regulation', l: '法规' },
    { v: 'risk', l: '风控' },
    { v: 'operation', l: '运营' }
  ];

  var ACTION_OPTS = [
    { v: 'all', l: '全部类型' },
    { v: 'create', l: '创建' },
    { v: 'update', l: '修改' },
    { v: 'delete', l: '删除' },
    { v: 'query', l: '查询' },
    { v: 'login', l: '登录' }
  ];

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  function num(v) {
    return v != null && !isNaN(v) ? v : 0;
  }

  function actionTypeLabel(t) {
    var map = { create: '创建', update: '修改', delete: '删除', query: '查询', login: '登录' };
    return map[t] || t || '—';
  }

  function ensureDrawer() {
    if (document.getElementById('ops-log-drawer')) return;
    document.body.insertAdjacentHTML('beforeend',
      '<div class="ops-drawer-overlay" id="ops-log-overlay"></div>' +
      '<aside class="ops-drawer ops-drawer--log" id="ops-log-drawer">' +
        '<div class="ops-drawer__head"><div><h3 id="ops-log-drawer-title" style="margin:0;color:var(--ops-title)">日志详情</h3>' +
        '<p id="ops-log-drawer-sub" style="margin:4px 0 0;font-size:12px;color:var(--ops-text)"></p></div>' +
        '<button type="button" class="ops-icon-btn" id="ops-log-drawer-close"><iconify-icon icon="lucide:x"></iconify-icon></button></div>' +
        '<div class="ops-drawer__body" id="ops-log-drawer-body"></div></aside>');
    document.getElementById('ops-log-drawer-close').addEventListener('click', closeDrawer);
    document.getElementById('ops-log-overlay').addEventListener('click', closeDrawer);
  }

  function closeDrawer() {
    state.currentLogDetail = null;
    var o = document.getElementById('ops-log-overlay');
    var d = document.getElementById('ops-log-drawer');
    if (o) o.classList.remove('is-open');
    if (d) d.classList.remove('is-open');
  }

  function formatJson(data) {
    if (data == null) return '—';
    try {
      return esc(JSON.stringify(data, null, 2));
    } catch (e) {
      return esc(String(data));
    }
  }

  function openDrawer(id) {
    ensureDrawer();
    document.getElementById('ops-log-drawer-title').textContent = '加载中…';
    document.getElementById('ops-log-drawer-body').innerHTML = '<div class="ops-log-detail-loading">正在加载…</div>';
    document.getElementById('ops-log-overlay').classList.add('is-open');
    document.getElementById('ops-log-drawer').classList.add('is-open');

    OpsDataCenter.loadLogDetail(id, { force: true }).then(function (d) {
      if (!d) {
        document.getElementById('ops-log-drawer-body').innerHTML = '<p class="ops-empty">未找到日志</p>';
        return;
      }
      state.currentLogDetail = d;
      renderDetail(d);
    });
  }

  function renderDetail(d) {
    document.getElementById('ops-log-drawer-title').textContent = d.actionName || '操作日志';
    document.getElementById('ops-log-drawer-sub').textContent =
      esc(d.moduleLabel || d.module) + ' · ' + esc(String(d.createdAt || '').slice(0, 19).replace('T', ' '));

    var stCls = d.status === 'failed' ? 'ops-log-st--fail' : 'ops-log-st--ok';

    document.getElementById('ops-log-drawer-body').innerHTML =
      '<section class="ops-log-detail-section"><h4>① 基础信息</h4>' +
        '<p>操作人：' + esc(d.userName || d.userId) + '</p>' +
        '<p>操作时间：' + esc(String(d.createdAt || '').slice(0, 19).replace('T', ' ')) + '</p>' +
        '<p>所属模块：' + esc(d.moduleLabel || d.module) + '</p>' +
        '<p>IP 地址：<code>' + esc(d.ipAddress || '—') + '</code></p>' +
        '<p>状态：<span class="' + stCls + '">' + (d.status === 'failed' ? '失败' : '成功') + '</span></p></section>' +

      '<section class="ops-log-detail-section"><h4>② 操作内容</h4>' +
        '<p>' + esc(d.description || '—') + '</p>' +
        '<p style="margin-top:8px"><strong>请求参数</strong></p>' +
        '<pre class="ops-log-code">' + formatJson(d.requestData) + '</pre>' +
        '<p style="margin-top:8px"><strong>返回结果</strong></p>' +
        '<pre class="ops-log-code">' + formatJson(d.responseData) + '</pre></section>' +

      '<section class="ops-log-detail-section" style="border:none"><h4>③ 关联业务</h4>' +
        '<p>业务 ID：<code>' + esc(d.targetId || '—') + '</code></p>' +
        (d.link
          ? '<button type="button" class="ops-btn ops-btn--sm" id="ops-log-goto">跳转来源模块</button>'
          : '<p class="ops-empty" style="padding:8px 0">无可跳转关联</p>') +
      '</section>';

    var goto = document.getElementById('ops-log-goto');
    if (goto) {
      goto.onclick = function () {
        var href = d.link.indexOf('/') === 0 ? d.link : d.link;
        window.location.href = href;
      };
    }
  }

  function showSkeleton() {
    var dash = document.querySelector('.ops-log-dash');
    if (dash) dash.classList.add('ops-log-skeleton');
  }

  function hideSkeleton() {
    var dash = document.querySelector('.ops-log-dash');
    if (dash) dash.classList.remove('ops-log-skeleton');
  }

  function mount(root) {
    ensureDrawer();
    root.innerHTML =
      '<div class="ops-log-dash">' +
        (window.OpsUI ? OpsUI.pageHeader('系统日志中心', '全链路操作追溯 · 模块级筛选 · 行为可观测') : '') +
        '<div style="display:flex;justify-content:flex-end;margin:-8px 0 4px">' +
          '<span class="ops-pufa-refresh-hint" id="ops-log-updated">加载中…</span>' +
          '<button type="button" class="ops-btn ops-btn--sm" id="ops-log-refresh" style="margin-left:8px">刷新</button></div>' +
        '<section class="ops-log-kpi-row" id="ops-log-kpi"></section>' +
        '<div class="ops-card">' +
          '<div class="ops-card__head"><div><h3>操作日志列表</h3><p>分页加载 · 5 分钟缓存</p></div></div>' +
          '<div class="ops-toolbar ops-log-toolbar">' +
            '<select id="ops-log-f-mod"></select>' +
            '<select id="ops-log-f-act"></select>' +
            '<select id="ops-log-f-st"><option value="all">全部状态</option><option value="success">成功</option><option value="failed">失败</option></select>' +
            '<input type="text" id="ops-log-f-user" placeholder="用户 ID" style="width:100px" />' +
            '<input type="date" id="ops-log-f-from" title="开始日期" />' +
            '<input type="date" id="ops-log-f-to" title="结束日期" />' +
            '<input type="search" id="ops-log-f-q" placeholder="关键词搜索" style="min-width:140px" />' +
          '</div>' +
          '<div class="ops-table-wrap"><table class="ops-log-table"><thead><tr>' +
            '<th>操作类型</th><th>模块</th><th>操作名称</th><th>用户</th><th>时间</th><th>状态</th>' +
          '</tr></thead><tbody id="ops-log-tb"></tbody></table></div>' +
          '<nav class="ops-pagination" id="ops-log-pagination"></nav></div></div>';

    var modSel = document.getElementById('ops-log-f-mod');
    modSel.innerHTML = MODULE_OPTS.map(function (o) {
      return '<option value="' + o.v + '">' + esc(o.l) + '</option>';
    }).join('');
    var actSel = document.getElementById('ops-log-f-act');
    actSel.innerHTML = ACTION_OPTS.map(function (o) {
      return '<option value="' + o.v + '">' + esc(o.l) + '</option>';
    }).join('');

    ['ops-log-f-mod', 'ops-log-f-act', 'ops-log-f-st', 'ops-log-f-from', 'ops-log-f-to'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', function () {
        filter.page = 1;
        loadList(true);
      });
    });
    document.getElementById('ops-log-f-user').addEventListener('input', debounce(function () {
      filter.page = 1;
      loadList(true);
    }, 400));
    document.getElementById('ops-log-f-q').addEventListener('input', debounce(function () {
      filter.page = 1;
      loadList(true);
    }, 320));
    document.getElementById('ops-log-refresh').addEventListener('click', function () {
      bootstrap(true);
    });

    bootstrap(true);
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  function readFilters() {
    filter.module = document.getElementById('ops-log-f-mod').value;
    filter.actionType = document.getElementById('ops-log-f-act').value;
    filter.status = document.getElementById('ops-log-f-st').value;
    filter.userId = document.getElementById('ops-log-f-user').value.trim();
    filter.dateFrom = document.getElementById('ops-log-f-from').value;
    filter.dateTo = document.getElementById('ops-log-f-to').value;
    filter.keyword = document.getElementById('ops-log-f-q').value.trim();
    state.filterParams = filter;
  }

  function bootstrap(force) {
    state.logLoading = true;
    showSkeleton();
    return OpsDataCenter.loadLogDashboard(force ? { force: true } : {}).then(function (data) {
      state.logLoading = false;
      hideSkeleton();
      data = data || {};
      state.logOverview = data.overview || {};
      state.logList = (data.list && data.list.list) || [];
      renderKpi(state.logOverview);
      renderList(state.logList, data.list || {});
      var el = document.getElementById('ops-log-updated');
      if (el) {
        el.textContent = '已更新 ' + new Date().toLocaleTimeString() +
          ' · 共 ' + num(state.logOverview.totalLogs) + ' 条';
      }
    }).catch(function (err) {
      state.logLoading = false;
      hideSkeleton();
      console.error('logs bootstrap failed', err);
      state.logOverview = { totalLogs: 0, todayCount: 0, successCount: 0, failedCount: 0 };
      state.logList = [];
      renderKpi(state.logOverview);
      renderList([], { total: 0 });
    });
  }

  function loadList(force) {
    readFilters();
    var tb = document.getElementById('ops-log-tb');
    if (tb) tb.innerHTML = '<tr><td colspan="6" style="text-align:center">加载中…</td></tr>';
    return OpsDataCenter.loadLogList(filter, force ? { force: true } : {}).then(function (data) {
      state.logList = (data && data.list) || [];
      renderList(state.logList, data || {});
    });
  }

  function renderKpi(ov) {
    ov = ov || {};
    var row = document.getElementById('ops-log-kpi');
    if (!row) return;
    var items = [
      { label: '总日志数', val: num(ov.totalLogs), cls: 'ops-log-kpi--total' },
      { label: '今日操作', val: num(ov.todayCount), cls: 'ops-log-kpi--today' },
      { label: '成功操作', val: num(ov.successCount), cls: 'ops-log-kpi--ok' },
      { label: '失败操作', val: num(ov.failedCount), cls: 'ops-log-kpi--fail' },
      { label: '高频模块', val: ov.topModuleLabel || '—', cls: 'ops-log-kpi--mod', text: true }
    ];
    row.innerHTML = items.map(function (it) {
      return '<article class="ops-log-kpi ' + it.cls + '"><label>' + esc(it.label) +
        '</label><strong>' + esc(it.text ? it.val : it.val) + '</strong></article>';
    }).join('');
  }

  function renderList(list, meta) {
    var tb = document.getElementById('ops-log-tb');
    if (!tb) return;
    if (!list.length) {
      tb.innerHTML = '<tr><td colspan="6"><div class="ops-log-empty">暂无系统操作日志</div></td></tr>';
    } else {
      tb.innerHTML = list.map(function (r) {
        var stCls = r.status === 'failed' ? 'ops-log-st--fail' : 'ops-log-st--ok';
        return '<tr data-id="' + esc(r.id) + '">' +
          '<td><span class="ops-tag">' + esc(actionTypeLabel(r.actionType)) + '</span></td>' +
          '<td>' + esc(r.moduleLabel || r.module) + '</td>' +
          '<td>' + esc(r.actionName) + '</td>' +
          '<td>' + esc(r.userName || r.userId) + '</td>' +
          '<td>' + esc(String(r.createdAt || '').slice(0, 16).replace('T', ' ')) + '</td>' +
          '<td class="' + stCls + '">' + (r.status === 'failed' ? '失败' : '成功') + '</td></tr>';
      }).join('');
      tb.querySelectorAll('tr[data-id]').forEach(function (tr) {
        tr.addEventListener('click', function () {
          openDrawer(tr.getAttribute('data-id'));
        });
      });
    }
    renderPagination(meta);
  }

  function renderPagination(data) {
    var nav = document.getElementById('ops-log-pagination');
    if (!nav) return;
    var page = (data && data.page) || filter.page || 1;
    var totalPages = (data && data.totalPages) || 1;
    var total = (data && data.total) || 0;
    filter.page = page;
    if (totalPages <= 1) {
      nav.innerHTML = '<span class="ops-pagination__info">共 ' + total + ' 条</span>';
      return;
    }
    nav.innerHTML =
      '<button type="button" class="ops-pagination__btn" data-p="prev"' + (page <= 1 ? ' disabled' : '') + '>‹</button>' +
      '<span class="ops-pagination__info">' + page + ' / ' + totalPages + ' · 共 ' + total + ' 条</span>' +
      '<button type="button" class="ops-pagination__btn" data-p="next"' + (page >= totalPages ? ' disabled' : '') + '>›</button>';
    nav.querySelectorAll('[data-p]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.getAttribute('data-p') === 'prev') filter.page = Math.max(1, page - 1);
        else filter.page = Math.min(totalPages, page + 1);
        loadList(true);
      });
    });
  }

  function destroy() {
    closeDrawer();
  }

  return { mount: mount, onData: function () {}, destroy: destroy };
})();

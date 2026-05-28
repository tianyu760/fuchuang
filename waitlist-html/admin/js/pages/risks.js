/**
 * 风险预警中心 · Risk Warning Center
 */
window.OpsPages = window.OpsPages || {};
OpsPages.risks = (function () {
  var charts = [];
  var pollTimer = null;
  var feedTimer = null;
  var filter = { level: 'all', riskType: 'all', status: 'all', keyword: '', page: 1, pageSize: 20 };

  var state = {
    riskOverview: null,
    riskList: [],
    currentRiskDetail: null,
    riskTrendData: null,
    realtimeRiskFeed: [],
    riskVisible: false,
    loading: false,
    detailLoading: false
  };

  var LIST_SIZE_KEY = 'fayi_ops_risk_list_pct';
  var DEFAULT_LIST_PCT = 68;

  var TYPE_LABELS = {
    consult: '咨询',
    ocr: 'OCR',
    document: '文书',
    regulation: '法规',
    behavior: '用户行为'
  };

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  function normLevel(lv) {
    if (lv === 'mid') return 'medium';
    return lv || 'medium';
  }

  function lvLabel(lv) {
    var n = normLevel(lv);
    return n === 'high' ? '高' : n === 'low' ? '低' : '中';
  }

  function lvClass(lv) {
    var n = normLevel(lv);
    return 'ops-risk-lv--' + (n === 'high' ? 'high' : n === 'low' ? 'low' : 'mid');
  }

  function rowType(r) {
    return r.type || r.riskType || 'consult';
  }

  function statusLabel(st) {
    if (st === 'resolved') return '已处理';
    if (st === 'processing') return '处理中';
    if (st === 'ignored') return '已忽略';
    return '待处理';
  }

  function statusClass(st) {
    if (st === 'resolved') return 'ops-risk-status--resolved';
    if (st === 'processing') return 'ops-risk-status--processing';
    if (st === 'ignored') return 'ops-risk-status--ignored';
    return 'ops-risk-status--pending';
  }

  function num(v) {
    return v != null && !isNaN(v) ? v : 0;
  }

  function disposeCharts() {
    charts.forEach(function (c) { try { c.dispose(); } catch (e) {} });
    charts = [];
  }

  function ensureDrawer() {
    if (document.getElementById('ops-risk-drawer')) return;
    document.body.insertAdjacentHTML('beforeend',
      '<div class="ops-drawer-overlay" id="ops-risk-overlay"></div>' +
      '<aside class="ops-drawer ops-drawer--risk" id="ops-risk-drawer" aria-label="风险详情">' +
        '<div class="ops-drawer__head"><div><h3 style="margin:0;color:var(--ops-title)" id="ops-risk-drawer-title">风险详情</h3>' +
        '<p style="margin:4px 0 0;font-size:12px;color:var(--ops-text)" id="ops-risk-drawer-sub"></p></div>' +
        '<button type="button" class="ops-icon-btn" id="ops-risk-drawer-close"><iconify-icon icon="lucide:x"></iconify-icon></button></div>' +
        '<div class="ops-drawer__body" id="ops-risk-drawer-body"></div></aside>');
    document.getElementById('ops-risk-drawer-close').addEventListener('click', closeDrawer);
    document.getElementById('ops-risk-overlay').addEventListener('click', closeDrawer);
  }

  function showSkeleton() {
    var dash = document.querySelector('.ops-risk-dash');
    if (dash) dash.classList.add('ops-risk-skeleton');
    var kpi = document.getElementById('ops-risk-kpi');
    if (kpi) {
      kpi.innerHTML = [1, 2, 3, 4, 5].map(function () {
        return '<article class="ops-risk-kpi"><label>&nbsp;</label><strong class="ops-num">—</strong></article>';
      }).join('');
    }
    var tb = document.getElementById('ops-risk-tb');
    if (tb) {
      tb.innerHTML = [1, 2, 3, 4, 5].map(function () {
        return '<tr><td colspan="6">加载中</td></tr>';
      }).join('');
    }
  }

  function hideSkeleton() {
    var dash = document.querySelector('.ops-risk-dash');
    if (dash) dash.classList.remove('ops-risk-skeleton');
  }

  function openDrawer(id) {
    ensureDrawer();
    state.riskVisible = true;
    state.detailLoading = true;
    document.getElementById('ops-risk-drawer-title').textContent = '加载中…';
    document.getElementById('ops-risk-drawer-sub').textContent = '';
    document.getElementById('ops-risk-drawer-body').innerHTML =
      '<div class="ops-risk-detail-loading">正在加载风险详情…</div>';
    document.getElementById('ops-risk-overlay').classList.add('is-open');
    document.getElementById('ops-risk-drawer').classList.add('is-open');

    OpsDataCenter.loadRiskDetail(id, { force: true }).then(function (d) {
      state.detailLoading = false;
      if (!d) {
        document.getElementById('ops-risk-drawer-body').innerHTML =
          '<p class="ops-empty">未找到风险记录</p>';
        return;
      }
      state.currentRiskDetail = d;
      renderDetail(d);
      if (window.OpsSystemLog) OpsSystemLog.view('risk', '查看风险详情', id, d.title);
    });
  }

  function closeDrawer() {
    state.currentRiskDetail = null;
    state.riskVisible = false;
    var o = document.getElementById('ops-risk-overlay');
    var d = document.getElementById('ops-risk-drawer');
    if (o) o.classList.remove('is-open');
    if (d) d.classList.remove('is-open');
  }

  function renderDetail(d) {
    var ai = d.aiAnalysis || {};
    var handling = d.handling || {};
    var typeKey = rowType(d);

    document.getElementById('ops-risk-drawer-title').textContent = d.title || '风险详情';
    document.getElementById('ops-risk-drawer-sub').textContent =
      esc(TYPE_LABELS[typeKey] || typeKey) + ' · ' + esc((d.createdAt || '').slice(0, 16).replace('T', ' '));

    var regs = (ai.recommendedRegulations || handling.recommendedRegulations || []).map(function (r) {
      return '<li>' + esc(r) + '</li>';
    }).join('');

    var needsReview = ai.needsReview != null ? ai.needsReview : handling.needsReview;

    document.getElementById('ops-risk-drawer-body').innerHTML =
      '<div class="ops-risk-detail-section">' +
        '<div style="display:flex;align-items:center;gap:16px">' +
          '<div class="ops-risk-detail-score">' + esc(ai.score != null ? ai.score : '—') + '</div>' +
          '<div><span class="' + lvClass(d.level) + '">' + lvLabel(d.level) + '风险</span> · ' +
          '<span class="' + statusClass(d.status) + '">' + statusLabel(d.status) + '</span>' +
          (needsReview ? '<p style="margin:6px 0 0;font-size:11px;color:var(--ops-risk)">需人工审核</p>' : '') +
        '</div></div></div>' +

      '<section class="ops-risk-detail-section"><h4>① 基本信息</h4>' +
        '<p>来源模块：' + esc(d.sourceModule) + '</p>' +
        '<p>触发时间：' + esc(String(d.createdAt || '').slice(0, 19).replace('T', ' ')) + '</p>' +
        '<p>关联业务 ID：<code>' + esc(d.relatedId || '—') + '</code></p>' +
        (d.userName || d.userId ? '<p>关联用户：' + esc(d.userName || d.userId) + '</p>' : '') +
      '</section>' +

      '<section class="ops-risk-detail-section"><h4>② 风险内容</h4>' +
        '<p style="white-space:pre-wrap;line-height:1.6">' + esc(d.description || d.content || d.title) + '</p></section>' +

      '<section class="ops-risk-detail-section"><h4>③ AI 分析结果</h4>' +
        '<p><strong>风险评分：</strong>' + esc(ai.score != null ? ai.score + ' / 100' : '—') + '</p>' +
        '<p><strong>原因说明：</strong>' + esc(ai.reason || '—') + '</p>' +
        '<p><strong>法律依据：</strong>' + esc(ai.legalBasis || '—') + '</p></section>' +

      '<section class="ops-risk-detail-section"><h4>④ 处理建议</h4>' +
        '<p>' + esc(ai.suggestion || handling.suggestion || '—') + '</p>' +
        (regs ? '<ul style="margin:8px 0 0;padding-left:18px;font-size:12px">' + regs + '</ul>' : '') +
      '</section>' +

      '<section class="ops-risk-detail-section" style="border:none">' +
        '<h4>⑤ 运营操作</h4>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">' +
          '<button type="button" class="ops-btn ops-btn--sm" data-st="processing">标记处理中</button>' +
          '<button type="button" class="ops-btn ops-btn--sm ops-btn--primary" data-st="resolved">标记已处理</button>' +
          '<button type="button" class="ops-btn ops-btn--sm" data-st="ignored">忽略风险</button>' +
        '</div>' +
        (d.link ? '<button type="button" class="ops-btn ops-btn--sm" id="ops-risk-goto-src">跳转来源模块</button>' : '') +
      '</section>';

    document.querySelectorAll('#ops-risk-drawer-body [data-st]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var st = btn.getAttribute('data-st');
        var note = st === 'ignored' ? '运营忽略' : '';
        FayiAdminApi.riskUpdateStatus(d.id, st, note).then(function () {
          if (window.OpsSystemLog) {
            OpsSystemLog.update('risk', st === 'resolved' ? '标记风险已处理' : st === 'ignored' ? '忽略风险' : '标记处理中', d.id, d.title);
          }
          bootstrap(false);
          openDrawer(d.id);
        });
      });
    });
    var goto = document.getElementById('ops-risk-goto-src');
    if (goto) {
      goto.onclick = function () {
        if (d.link) window.location.href = d.link.indexOf('/') === 0 ? d.link : '/' + d.link;
      };
    }
  }

  function applyListLayout(pct) {
    var grid = document.getElementById('ops-risk-mid-grid');
    if (!grid) return;
    pct = Math.min(82, Math.max(58, pct || DEFAULT_LIST_PCT));
    var feedPct = 100 - pct;
    grid.style.setProperty('--ops-risk-list-pct', String(pct));
    grid.style.gridTemplateColumns =
      'minmax(0, ' + pct + 'fr) minmax(240px, ' + feedPct + 'fr)';
    var valEl = document.getElementById('ops-risk-list-size-val');
    if (valEl) valEl.textContent = pct + '%';
    var slider = document.getElementById('ops-risk-list-size');
    if (slider && String(slider.value) !== String(pct)) slider.value = String(pct);
  }

  function initListSizeSlider() {
    var slider = document.getElementById('ops-risk-list-size');
    if (!slider) return;
    var saved = parseInt(localStorage.getItem(LIST_SIZE_KEY) || '', 10);
    if (isNaN(saved)) saved = DEFAULT_LIST_PCT;
    applyListLayout(saved);
    slider.addEventListener('input', function () {
      applyListLayout(parseInt(slider.value, 10));
    });
    slider.addEventListener('change', function () {
      localStorage.setItem(LIST_SIZE_KEY, slider.value);
    });
  }

  function mount(root) {
    disposeCharts();
    ensureDrawer();
    root.innerHTML =
      '<div class="ops-risk-dash">' +
        '<div class="ops-risk-page-head">' +
          (window.OpsUI ? OpsUI.pageHeader('风险预警中心', '事前预警 · 事中提示 · 事后分析 · 全链路法律安全监控') : '') +
          '<div class="ops-risk-page-head__actions">' +
            '<span class="ops-pufa-refresh-hint" id="ops-risk-updated">加载中…</span>' +
            '<button type="button" class="ops-btn ops-btn--sm" id="ops-risk-refresh">刷新</button>' +
          '</div></div>' +
        '<section class="ops-risk-kpi-row" id="ops-risk-kpi"></section>' +
        '<div class="ops-risk-mid-grid" id="ops-risk-mid-grid">' +
          '<div class="ops-card ops-risk-panel ops-risk-panel--list">' +
            '<div class="ops-card__head ops-risk-panel__head">' +
              '<div><h3>风险事件列表</h3><p>真实业务扫描 · 可筛选 · 可处理</p></div>' +
              '<div class="ops-risk-size-ctrl" title="拖动以调整列表与右侧预警流的宽度">' +
                '<label for="ops-risk-list-size">列表宽度</label>' +
                '<input type="range" id="ops-risk-list-size" min="58" max="82" value="' + DEFAULT_LIST_PCT + '" step="1" aria-valuemin="58" aria-valuemax="82" />' +
                '<output id="ops-risk-list-size-val" for="ops-risk-list-size">' + DEFAULT_LIST_PCT + '%</output>' +
              '</div></div>' +
            '<div class="ops-toolbar ops-risk-toolbar">' +
              '<select id="ops-risk-f-lv"><option value="all">全部等级</option><option value="high">高风险</option><option value="medium">中风险</option><option value="low">低风险</option></select>' +
              '<select id="ops-risk-f-type"><option value="all">全部类型</option><option value="ocr">OCR</option><option value="document">文书</option><option value="consult">咨询</option><option value="regulation">法规</option><option value="behavior">用户行为</option></select>' +
              '<select id="ops-risk-f-st"><option value="all">全部状态</option><option value="pending">待处理</option><option value="processing">处理中</option><option value="resolved">已处理</option><option value="ignored">已忽略</option></select>' +
              '<input type="search" id="ops-risk-f-q" placeholder="搜索标题/描述" />' +
            '</div>' +
            '<div class="ops-table-wrap ops-risk-table-scroll"><table class="ops-risk-table"><thead><tr>' +
              '<th>风险标题</th><th>类型</th><th>等级</th><th>来源</th><th>状态</th><th>时间</th></tr></thead>' +
              '<tbody id="ops-risk-tb"></tbody></table></div>' +
            '<nav class="ops-pagination ops-risk-pagination" id="ops-risk-pagination"></nav></div>' +
          '<div class="ops-card ops-risk-panel ops-risk-panel--feed">' +
            '<div class="ops-card__head"><div><h3>实时风险预警流</h3><p>每 8 秒轮询 · 高风险优先</p></div></div>' +
            '<div class="ops-risk-feed" id="ops-risk-feed"></div></div>' +
        '</div>' +
        '<div class="ops-risk-bot-grid">' +
          '<div class="ops-card"><div class="ops-card__head"><div><h3>风险等级占比</h3></div></div>' +
            '<div class="ops-risk-chart ops-risk-chart--sm" id="ops-risk-level-chart"></div></div>' +
          '<div class="ops-card"><div class="ops-card__head"><div><h3>风险趋势</h3></div></div>' +
            '<div class="ops-risk-chart" id="ops-risk-trend-chart"></div></div>' +
          '<div class="ops-card"><div class="ops-card__head"><div><h3>来源模块分布</h3></div></div>' +
            '<div class="ops-risk-chart ops-risk-chart--sm" id="ops-risk-module-chart"></div></div>' +
        '</div></div>';

    ['ops-risk-f-lv', 'ops-risk-f-type', 'ops-risk-f-st'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', function () {
        filter.page = 1;
        loadList(true);
      });
    });
    document.getElementById('ops-risk-f-q').addEventListener('input', debounce(function () {
      filter.page = 1;
      loadList(true);
    }, 320));
    document.getElementById('ops-risk-refresh').addEventListener('click', function () {
      bootstrap(true);
    });
    initListSizeSlider();

    if (pollTimer) clearInterval(pollTimer);
    if (feedTimer) clearInterval(feedTimer);
    pollTimer = setInterval(function () { bootstrap(false); }, 5 * 60 * 1000);
    feedTimer = setInterval(loadRealtime, 8000);

    bootstrap(true);
    window.addEventListener('resize', debounce(function () {
      charts.forEach(function (c) { try { c.resize(); } catch (e) {} });
      var pct = parseInt(
        (document.getElementById('ops-risk-list-size') || {}).value || DEFAULT_LIST_PCT,
        10
      );
      applyListLayout(pct);
    }, 200));
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  function readFilters() {
    filter.level = document.getElementById('ops-risk-f-lv').value;
    filter.riskType = document.getElementById('ops-risk-f-type').value;
    filter.status = document.getElementById('ops-risk-f-st').value;
    filter.keyword = document.getElementById('ops-risk-f-q').value || '';
  }

  function bootstrap(force) {
    state.loading = true;
    showSkeleton();
    return OpsDataCenter.loadRiskDashboard(force ? { force: true } : {}).then(function (data) {
      state.loading = false;
      hideSkeleton();
      data = data || {};
      state.riskOverview = data.overview || OpsDataCenter.get().riskOverview || {};
      state.riskTrendData = data.statistics || OpsDataCenter.get().riskTrendData;
      state.realtimeRiskFeed = data.realtime || OpsDataCenter.get().realtimeRiskFeed || [];
      var listMeta = data.list || {};
      state.riskList = listMeta.list || [];
      renderKpi(state.riskOverview);
      renderList(state.riskList, listMeta);
      renderFeed(state.realtimeRiskFeed);
      renderCharts(state.riskTrendData);
      var el = document.getElementById('ops-risk-updated');
      if (el) {
        el.textContent = '已更新 ' + new Date().toLocaleTimeString() +
          ' · 共 ' + num(state.riskOverview.totalRisk || state.riskOverview.total) + ' 条风险';
      }
    }).catch(function (err) {
      state.loading = false;
      hideSkeleton();
      console.error('risk page bootstrap failed', err);
      state.riskOverview = {
        totalRisk: 0, highRisk: 0, mediumRisk: 0, lowRisk: 0, unresolvedRisk: 0
      };
      state.riskList = [];
      renderKpi(state.riskOverview);
      renderList([], { total: 0 });
      renderFeed([]);
    });
  }

  function loadList(force) {
    readFilters();
    var tb = document.getElementById('ops-risk-tb');
    if (tb) tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--ops-text-secondary)">加载中…</td></tr>';
    return OpsDataCenter.loadRiskList(filter, force ? { force: true } : {}).then(function (data) {
      state.riskList = (data && data.list) || [];
      renderList(state.riskList, data || {});
    });
  }

  function loadRealtime() {
    if (!FayiAdminApi.riskRealtime) return;
    FayiAdminApi.riskRealtime(15, { force: true, ttlMs: 0 }).then(function (res) {
      var raw = res && res.data != null ? res.data : res;
      state.realtimeRiskFeed = Array.isArray(raw) ? raw : (raw && raw.list) || [];
      renderFeed(state.realtimeRiskFeed);
    }).catch(function () {});
  }

  function renderKpi(ov) {
    ov = ov || {};
    var row = document.getElementById('ops-risk-kpi');
    if (!row) return;
    var items = [
      { label: '总风险数', val: num(ov.totalRisk != null ? ov.totalRisk : ov.total), cls: 'ops-risk-kpi--total' },
      { label: '高风险', val: num(ov.highRisk), cls: 'ops-risk-kpi--high' },
      { label: '中风险', val: num(ov.mediumRisk != null ? ov.mediumRisk : ov.midRisk), cls: 'ops-risk-kpi--mid' },
      { label: '低风险', val: num(ov.lowRisk), cls: 'ops-risk-kpi--low' },
      { label: '未处理风险', val: num(ov.unresolvedRisk != null ? ov.unresolvedRisk : (num(ov.pending) + num(ov.processing))), cls: 'ops-risk-kpi--warn' }
    ];
    row.innerHTML = items.map(function (it) {
      return '<article class="ops-risk-kpi ' + it.cls + '"><label>' + esc(it.label) +
        '</label><strong class="ops-num">' + esc(it.val) + '</strong></article>';
    }).join('');
  }

  function renderList(list, meta) {
    var tb = document.getElementById('ops-risk-tb');
    if (!tb) return;
    if (!list.length) {
      tb.innerHTML = '<tr><td colspan="6"><div class="ops-risk-empty">暂无风险数据</div></td></tr>';
    } else {
      tb.innerHTML = list.map(function (r) {
        var typeKey = rowType(r);
        return '<tr data-id="' + esc(r.id) + '">' +
          '<td class="ops-risk-table__title" title="' + esc(r.title) + '">' + esc(r.title) + '</td>' +
          '<td><span class="ops-tag">' + esc(TYPE_LABELS[typeKey] || typeKey) + '</span></td>' +
          '<td class="' + lvClass(r.level) + '">' + lvLabel(r.level) + '</td>' +
          '<td>' + esc(r.sourceModule || '—') + '</td>' +
          '<td class="' + statusClass(r.status) + '">' + statusLabel(r.status) + '</td>' +
          '<td>' + esc(String(r.createdAt || '').slice(0, 16).replace('T', ' ')) + '</td></tr>';
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
    var nav = document.getElementById('ops-risk-pagination');
    if (!nav || !data) return;
    var page = data.page || filter.page || 1;
    var totalPages = data.totalPages || 1;
    var total = data.total || 0;
    filter.page = page;
    if (totalPages <= 1) {
      nav.innerHTML = '<span class="ops-pagination__info">共 ' + total + ' 条风险</span>';
      return;
    }
    nav.innerHTML =
      '<button type="button" class="ops-pagination__btn" data-p="prev"' + (page <= 1 ? ' disabled' : '') + '>‹</button>' +
      '<span class="ops-pagination__info">' + page + ' / ' + totalPages + ' · 共 ' + total + ' 条</span>' +
      '<button type="button" class="ops-pagination__btn" data-p="next"' + (page >= totalPages ? ' disabled' : '') + '>›</button>';
    nav.querySelectorAll('[data-p]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var p = btn.getAttribute('data-p');
        if (p === 'prev') filter.page = Math.max(1, page - 1);
        else filter.page = Math.min(totalPages, page + 1);
        loadList(true);
      });
    });
  }

  function renderFeed(list) {
    var box = document.getElementById('ops-risk-feed');
    if (!box) return;
    if (!list.length) {
      box.innerHTML = '<p class="ops-empty" style="padding:12px">暂无实时高风险预警</p>';
      return;
    }
    var items = list.concat(list).map(function (r) {
      var lv = normLevel(r.level);
      var dot = lv === 'high' ? 'high' : 'mid';
      return '<div class="ops-risk-feed-item" data-id="' + esc(r.id) + '">' +
        '<span class="ops-risk-feed-item__dot ops-risk-feed-item__dot--' + dot + '"></span>' +
        '<div class="ops-risk-feed-item__body">' +
        '<div class="ops-risk-feed-item__text" style="color:var(--ops-title)">' + esc(r.message || r.title) + '</div>' +
        '<div class="ops-risk-feed-item__meta">' +
        esc(TYPE_LABELS[rowType(r)] || '') + ' · ' + esc(String(r.createdAt || '').slice(11, 16)) +
        '</div></div></div>';
    }).join('');
    box.innerHTML = '<div class="ops-risk-feed__track">' + items + '</div>';
    box.querySelectorAll('.ops-risk-feed-item').forEach(function (el) {
      el.addEventListener('click', function () {
        openDrawer(el.getAttribute('data-id'));
      });
    });
  }

  function renderCharts(stats) {
    if (!window.echarts) return;
    disposeCharts();
    stats = stats || {};

    var levelEl = document.getElementById('ops-risk-level-chart');
    var levelData = stats.levelDistribution || [];
    if (levelEl && levelData.length) {
      var levelPie = echarts.init(levelEl);
      var levelColors = { high: '#ef4444', medium: '#f97316', low: '#22c55e' };
      levelPie.setOption({
        tooltip: { trigger: 'item' },
        legend: { bottom: 0, textStyle: { color: '#94a3b8', fontSize: 10 } },
        series: [{
          type: 'pie',
          radius: ['42%', '68%'],
          center: ['50%', '42%'],
          data: levelData.map(function (x) {
            var name = x.level === 'high' ? '高风险' : x.level === 'low' ? '低风险' : '中风险';
            return {
              name: name,
              value: x.value,
              itemStyle: { color: levelColors[x.level] || '#94a3b8' }
            };
          }),
          label: { color: '#cbd5e1', fontSize: 10 }
        }]
      });
      charts.push(levelPie);
    }

    var trendEl = document.getElementById('ops-risk-trend-chart');
    if (trendEl && stats.trend) {
      var ch = echarts.init(trendEl);
      ch.setOption({
        tooltip: { trigger: 'axis' },
        legend: { data: ['高', '中', '低'], textStyle: { color: '#94a3b8', fontSize: 10 }, bottom: 0 },
        grid: { left: 36, right: 12, top: 16, bottom: 36 },
        xAxis: { type: 'category', data: stats.labels || [], axisLabel: { color: '#64748b', fontSize: 10 } },
        yAxis: { type: 'value', axisLabel: { color: '#64748b', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.1)' } } },
        series: [
          { name: '高', type: 'line', smooth: true, data: stats.trend.high || [], itemStyle: { color: '#ef4444' } },
          { name: '中', type: 'line', smooth: true, data: stats.trend.mid || [], itemStyle: { color: '#f97316' } },
          { name: '低', type: 'line', smooth: true, data: stats.trend.low || [], itemStyle: { color: '#22c55e' } }
        ]
      });
      charts.push(ch);
    }

    var modEl = document.getElementById('ops-risk-module-chart');
    if (modEl && stats.byModule && stats.byModule.length) {
      var bar = echarts.init(modEl);
      var mods = stats.byModule || [];
      bar.setOption({
        grid: { left: 72, right: 12, top: 12, bottom: 24 },
        xAxis: { type: 'value', axisLabel: { color: '#64748b', fontSize: 10 } },
        yAxis: {
          type: 'category',
          data: mods.map(function (m) { return m.label; }).reverse(),
          axisLabel: { color: '#94a3b8', fontSize: 9 }
        },
        series: [{
          type: 'bar',
          data: mods.map(function (m) { return m.value; }).reverse(),
          itemStyle: { color: '#38bdf8', borderRadius: [0, 4, 4, 0] }
        }]
      });
      charts.push(bar);
    }
  }

  function onData() { /* 独立 risk API */ }

  function destroy() {
    if (pollTimer) clearInterval(pollTimer);
    if (feedTimer) clearInterval(feedTimer);
    disposeCharts();
    closeDrawer();
  }

  return { mount: mount, onData: onData, destroy: destroy };
})();

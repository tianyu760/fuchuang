/**
 * 普法运营中心 · Legal Publicity Dashboard
 */
window.OpsPages = window.OpsPages || {};
OpsPages['law-education'] = (function () {
  var charts = [];
  var refreshTimer = null;
  var lastUpdated = '';

  var state = {
    operationOverview: null,
    funnelData: null,
    hotIssuesList: [],
    contentStats: [],
    channelStats: [],
    loading: false
  };

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  function riskLabel(lv) {
    if (lv === 'high') return '高';
    if (lv === 'low') return '低';
    return '中';
  }

  function riskClass(lv) {
    return 'ops-pufa-risk--' + (lv === 'high' ? 'high' : lv === 'low' ? 'low' : 'mid');
  }

  function disposeCharts() {
    charts.forEach(function (c) { try { c.dispose(); } catch (e) {} });
    charts = [];
  }

  function mount(root) {
    disposeCharts();
    root.innerHTML =
      '<div class="ops-pufa-dash">' +
        '<div class="ops-pufa-toolbar">' +
          (window.OpsUI ? OpsUI.pageHeader('普法运营中心', '传播效果 · 行为分析 · 转化漏斗 · AI内容生成') : '') +
          '<div style="display:flex;align-items:center;gap:10px;margin-left:auto">' +
            '<span class="ops-pufa-refresh-hint" id="ops-pufa-updated">数据加载中…</span>' +
            '<button type="button" class="ops-btn ops-btn--sm" id="ops-pufa-refresh">刷新</button>' +
            '<button type="button" class="ops-btn ops-btn--sm ops-btn--primary" id="ops-pufa-ai-open">' +
              '<iconify-icon icon="lucide:sparkles"></iconify-icon> AI 生成</button>' +
          '</div>' +
        '</div>' +
        '<section class="ops-pufa-kpi-row" id="ops-pufa-kpi"></section>' +
        '<div class="ops-pufa-dash__grid-mid">' +
          '<div class="ops-card"><div class="ops-card__head"><div><h3>转化漏斗分析</h3>' +
            '<p>普法内容 → 咨询 → OCR → 文书 → 法规引用</p></div></div>' +
            '<div class="ops-pufa-chart" id="ops-pufa-funnel-chart"></div>' +
            '<div class="ops-pufa-funnel-legend" id="ops-pufa-funnel-legend"></div></div>' +
          '<div class="ops-card"><div class="ops-card__head"><div><h3>热点法律问题</h3>' +
            '<p>基于真实咨询与行为日志聚合</p></div></div>' +
            '<ul class="ops-pufa-hot-list" id="ops-pufa-hot"></ul></div>' +
        '</div>' +
        '<div class="ops-pufa-dash__grid-bot">' +
          '<div class="ops-card ops-pufa-panel ops-pufa-panel--content">' +
            '<div class="ops-card__head"><div><h3>普法内容传播</h3>' +
            '<p>阅读 · 分享 · 停留 · 跳出率</p></div></div>' +
            '<div class="ops-pufa-panel__body ops-table-wrap ops-pufa-table-wrap">' +
              '<table class="ops-pufa-content-table">' +
              '<thead><tr><th class="col-title">标题</th><th class="col-num">阅读</th>' +
              '<th class="col-num">分享</th><th class="col-num">停留(s)</th><th class="col-num">跳出率</th></tr></thead>' +
              '<tbody id="ops-pufa-content-tb"></tbody></table></div></div>' +
          '<div class="ops-card ops-pufa-panel ops-pufa-panel--channel">' +
            '<div class="ops-card__head"><div><h3>渠道来源分析</h3>' +
            '<p>用户访问来源分布</p></div></div>' +
            '<div class="ops-pufa-panel__body ops-pufa-channel-board">' +
              '<div class="ops-pufa-chart ops-pufa-chart--channel-pie" id="ops-pufa-channel-pie"></div>' +
              '<div class="ops-pufa-chart ops-pufa-chart--channel-bar" id="ops-pufa-channel-bar"></div>' +
            '</div></div>' +
        '</div>' +
      '</div>' +
      '<div class="ops-pufa-ai-overlay" id="ops-pufa-ai-overlay"></div>' +
      '<aside class="ops-pufa-ai-panel" id="ops-pufa-ai-panel" aria-label="AI普法生成">' +
        '<div class="ops-pufa-ai-panel__head"><div><h3 style="margin:0;color:var(--ops-title)">AI 普法内容生成</h3>' +
          '<p style="margin:4px 0 0;font-size:12px;color:var(--ops-text)">输入主题，一键生成并可选发布</p></div>' +
        '<button type="button" class="ops-icon-btn" id="ops-pufa-ai-close"><iconify-icon icon="lucide:x"></iconify-icon></button></div>' +
        '<div class="ops-pufa-ai-panel__body">' +
          '<label style="font-size:12px;color:var(--ops-text-secondary)">法律主题</label>' +
          '<textarea id="ops-pufa-ai-topic" placeholder="例如：劳动合同纠纷、网购维权、电信诈骗防范"></textarea>' +
          '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">' +
            '<button type="button" class="ops-btn ops-btn--primary ops-btn--sm" id="ops-pufa-ai-gen">生成文章</button>' +
            '<button type="button" class="ops-btn ops-btn--sm" id="ops-pufa-ai-publish">生成并发布</button>' +
          '</div>' +
          '<div class="ops-pufa-ai-result" id="ops-pufa-ai-result" hidden></div>' +
        '</div></aside>';

    document.getElementById('ops-pufa-refresh').addEventListener('click', function () {
      loadDashboard(true);
    });
    document.getElementById('ops-pufa-ai-open').addEventListener('click', openAiPanel);
    document.getElementById('ops-pufa-ai-close').addEventListener('click', closeAiPanel);
    document.getElementById('ops-pufa-ai-overlay').addEventListener('click', closeAiPanel);
    document.getElementById('ops-pufa-ai-gen').addEventListener('click', function () { runAiGenerate(false); });
    document.getElementById('ops-pufa-ai-publish').addEventListener('click', function () { runAiGenerate(true); });

    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(function () { loadDashboard(false); }, 5 * 60 * 1000);

    loadDashboard(true);
    window.addEventListener('resize', debounce(resizeCharts, 200));
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  function openAiPanel() {
    document.getElementById('ops-pufa-ai-overlay').classList.add('is-open');
    document.getElementById('ops-pufa-ai-panel').classList.add('is-open');
  }

  function closeAiPanel() {
    document.getElementById('ops-pufa-ai-overlay').classList.remove('is-open');
    document.getElementById('ops-pufa-ai-panel').classList.remove('is-open');
  }

  function loadDashboard(force) {
    state.loading = true;
    var el = document.getElementById('ops-pufa-updated');
    if (el) el.textContent = '正在加载运营数据…';

    return OpsDataCenter.loadOperationDashboard(force ? { force: true, ttlMs: 0 } : { ttlMs: 0 }).then(function (data) {
      state.loading = false;
      data = data || {};
      state.operationOverview = data.overview || OpsDataCenter.get().operationOverview;
      state.funnelData = data.funnel || OpsDataCenter.get().funnelData;
      state.hotIssuesList = data.hotIssues || OpsDataCenter.get().hotIssuesList || [];
      state.contentStats = data.contentStats || OpsDataCenter.get().contentStats || [];
      state.channelStats = data.channelStats || OpsDataCenter.get().channelStats || [];
      lastUpdated = data.updatedAt || new Date().toISOString();
      renderAll();
      var hint = document.getElementById('ops-pufa-updated');
      if (hint && data._fallback) {
        hint.textContent = hint.textContent + ' · 已使用本地聚合数据（请重启管理端服务以启用完整接口）';
      }
    }).catch(function (err) {
      state.loading = false;
      console.error('law-education dashboard failed', err);
      var el = document.getElementById('ops-pufa-updated');
      if (el) el.textContent = '数据加载失败，请确认管理端服务(3003)已启动并刷新页面';
    });
  }

  function renderAll() {
    renderKpi(state.operationOverview);
    renderFunnel(state.funnelData);
    renderHotIssues(state.hotIssuesList);
    renderContentStats(state.contentStats);
    renderChannels(state.channelStats);
    var el = document.getElementById('ops-pufa-updated');
    if (el) {
      el.textContent = '更新于 ' + String(lastUpdated).slice(0, 19).replace('T', ' ') + ' · 每5分钟自动刷新';
    }
  }

  function renderKpi(ov) {
    ov = ov || {};
    var row = document.getElementById('ops-pufa-kpi');
    if (!row) return;
    var items = [
      { label: '今日访问量', val: ov.todayVisits, cls: '', drill: 'analytics' },
      { label: '普法阅读量', val: ov.pufaContentReads, cls: 'ops-pufa-kpi--gold', drill: 'content' },
      { label: '咨询转化', val: ov.consultConversions, cls: 'ops-pufa-kpi--green', drill: 'consultations' },
      { label: '文书转化', val: ov.documentConversions, cls: '', drill: 'documents' },
      { label: 'OCR 使用', val: ov.ocrUsageCount, cls: '', drill: 'ocr' },
      { label: '用户活跃 DAU', val: ov.dau, cls: 'ops-pufa-kpi--green', drill: 'users' }
    ];
    row.innerHTML = items.map(function (it) {
      return '<article class="ops-pufa-kpi ' + it.cls + '" data-drill="' + it.drill + '">' +
        '<label>' + esc(it.label) + '</label><strong class="ops-num">' + esc(it.val != null ? it.val : '—') + '</strong></article>';
    }).join('');
    row.querySelectorAll('[data-drill]').forEach(function (card) {
      card.addEventListener('click', function () {
        drillTo(card.getAttribute('data-drill'));
      });
    });
  }

  function drillTo(target) {
    var map = {
      analytics: 'analytics.html',
      consultations: 'consultations.html',
      documents: 'documents.html',
      ocr: 'ocr.html',
      users: 'users.html',
      regulations: 'regulations.html',
      content: 'law-education.html'
    };
    if (map[target]) window.location.href = map[target];
  }

  function renderFunnel(funnel) {
    var steps = (funnel && funnel.steps) || [];
    var legend = document.getElementById('ops-pufa-funnel-legend');
    if (legend) {
      legend.innerHTML = steps.map(function (s) {
        return '<span>' + esc(s.label) + '：' + esc(s.count) +
          ' · 逐步转化 ' + esc(s.conversionRate) + '% · 流失 ' + esc(s.dropoffRate) + '%</span>';
      }).join('');
    }
    var el = document.getElementById('ops-pufa-funnel-chart');
    if (!el || !window.echarts) return;
    var ch = echarts.init(el);
    ch.setOption({
      tooltip: { trigger: 'item', formatter: '{b}<br/>人数: {c}<br/>占比: {d}%' },
      series: [{
        type: 'funnel',
        left: '8%',
        width: '84%',
        top: 16,
        bottom: 16,
        sort: 'descending',
        gap: 4,
        label: { color: '#94a3b8', fontSize: 11 },
        data: steps.map(function (s) {
          return { name: s.label, value: Math.max(s.count, 0) };
        }),
        itemStyle: {
          borderColor: '#1e293b',
          borderWidth: 1
        }
      }]
    });
    ch.on('click', function (params) {
      var step = steps[params.dataIndex];
      if (!step) return;
      if (step.key === 'consult') drillTo('consultations');
      else if (step.key === 'document') drillTo('documents');
      else if (step.key === 'ocr') drillTo('ocr');
      else if (step.key === 'regulation') drillTo('regulations');
    });
    charts.push(ch);
  }

  function renderHotIssues(list) {
    var ul = document.getElementById('ops-pufa-hot');
    if (!ul) return;
    if (!list.length) {
      ul.innerHTML = '<li><span class="title">暂无热点问题数据</span></li>';
      return;
    }
    ul.innerHTML = list.map(function (item) {
      return '<li data-id="' + esc(item.id) + '" data-title="' + esc(item.fullTitle || item.title) + '">' +
        '<span class="rank">' + esc(item.rank || '') + '</span>' +
        '<div><div class="title">' + esc(item.title) + '</div>' +
        '<div class="meta">' + esc(item.relatedRegulations) + ' · 出现 <strong>' + esc(item.count) + '</strong> 次</div></div>' +
        '<span class="' + riskClass(item.riskLevel) + '">' + riskLabel(item.riskLevel) + '风险</span></li>';
    }).join('');
    ul.querySelectorAll('li[data-title]').forEach(function (li) {
      li.addEventListener('click', function () {
        var title = li.getAttribute('data-title') || '';
        window.location.href = 'consultations.html?q=' + encodeURIComponent(title);
      });
      li.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        window.location.href = 'regulations.html';
      });
    });
  }

  function renderContentStats(list) {
    var tb = document.getElementById('ops-pufa-content-tb');
    if (!tb) return;
    if (!list.length) {
      tb.innerHTML = '<tr><td colspan="5">暂无普法内容数据</td></tr>';
      return;
    }
    tb.innerHTML = list.map(function (c) {
      return '<tr data-id="' + esc(c.id) + '" data-path="' + esc(c.path) + '">' +
        '<td title="' + esc(c.title) + '">' + esc(c.title) + '</td>' +
        '<td class="ops-num">' + esc(c.reads) + '</td>' +
        '<td class="ops-num">' + esc(c.shares) + '</td>' +
        '<td class="ops-num">' + esc(c.avgDwellSec) + '</td>' +
        '<td>' + esc(c.bounceRate) + '%</td></tr>';
    }).join('');
    tb.querySelectorAll('tr[data-id]').forEach(function (tr) {
      tr.addEventListener('click', function () {
        var path = tr.getAttribute('data-path');
        if (path) window.open('../' + path.replace(/^\//, ''), '_blank');
      });
    });
  }

  function renderChannels(list) {
    list = list || [];
    var pieEl = document.getElementById('ops-pufa-channel-pie');
    var barEl = document.getElementById('ops-pufa-channel-bar');
    if (!window.echarts) return;
    if (pieEl) {
      var pie = echarts.init(pieEl);
      pie.setOption({
        tooltip: { trigger: 'item' },
        legend: {
          orient: 'horizontal',
          bottom: 4,
          left: 'center',
          itemWidth: 10,
          itemHeight: 8,
          itemGap: 10,
          textStyle: { color: '#94a3b8', fontSize: 10 }
        },
        series: [{
          type: 'pie',
          radius: ['42%', '68%'],
          center: ['50%', '44%'],
          data: list.map(function (c) {
            return { name: c.label, value: c.value };
          }),
          label: { show: false },
          labelLine: { show: false }
        }]
      });
      charts.push(pie);
    }
    if (barEl) {
      var bar = echarts.init(barEl);
      bar.setOption({
        grid: { left: 76, right: 16, top: 8, bottom: 8, containLabel: false },
        xAxis: {
          type: 'value',
          axisLabel: { color: '#64748b', fontSize: 10 },
          splitLine: { lineStyle: { color: 'rgba(148,163,184,0.12)' } }
        },
        yAxis: {
          type: 'category',
          data: list.map(function (c) { return c.label; }).reverse(),
          axisLabel: { color: '#94a3b8', fontSize: 10, width: 68, overflow: 'truncate' }
        },
        series: [{
          type: 'bar',
          barWidth: 14,
          data: list.map(function (c) { return c.value; }).reverse(),
          itemStyle: { color: '#38bdf8', borderRadius: [0, 4, 4, 0] }
        }]
      });
      charts.push(bar);
    }
  }

  function resizeCharts() {
    charts.forEach(function (c) { try { c.resize(); } catch (e) {} });
  }

  function runAiGenerate(publish) {
    var topic = (document.getElementById('ops-pufa-ai-topic') || {}).value || '';
    if (!topic.trim()) {
      alert('请输入法律主题');
      return;
    }
    var resultEl = document.getElementById('ops-pufa-ai-result');
    resultEl.hidden = false;
    resultEl.textContent = 'AI 正在生成，请稍候…';

    FayiAdminApi.operationGenerateContent(topic.trim(), publish).then(function (res) {
      var data = res && res.data != null ? res.data : res;
      if (!data) {
        resultEl.textContent = '生成失败，请重试';
        return;
      }
      resultEl.innerHTML =
        '<h4 style="margin:0 0 8px;color:var(--ops-title)">' + esc(data.title) + '</h4>' +
        '<p style="font-size:11px;color:var(--ops-text-secondary)">关键词：' +
        esc((data.keywords || []).join('、')) + '</p>' +
        '<p style="margin:12px 0"><strong>传播策略</strong><br/>' + esc(data.strategy) + '</p>' +
        '<hr style="border-color:var(--ops-border)"/>' +
        '<div>' + esc(data.article) + '</div>' +
        (data.published ? '<p style="margin-top:12px;color:var(--ops-success)">✓ 已发布至普法内容库</p>' : '');
      if (publish) loadDashboard(true);
    }).catch(function (err) {
      resultEl.textContent = '生成失败：' + (err && err.message ? err.message : '未知错误');
    });
  }

  function onData() {
    /* 本页使用独立 operation API */
  }

  function destroy() {
    if (refreshTimer) clearInterval(refreshTimer);
    disposeCharts();
  }

  return { mount: mount, onData: onData, destroy: destroy };
})();

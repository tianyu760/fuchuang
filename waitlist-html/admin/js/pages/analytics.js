/**
 * 数据分析 · 法律业务 AI 分析中台
 */
window.OpsPages = window.OpsPages || {};
OpsPages.analytics = (function () {
  var charts = [];
  var refreshTimer = null;
  var DAYS = 30;

  var state = {
    analyticsLoading: false,
    analyticsInsightLoading: false,
    analyticsInsight: null,
    correlationData: null,
    predictionData: null,
    anomalyData: [],
    chartInsights: {},
    dashboardData: null,
    insightExpanded: true
  };

  var MODULE_LINKS = {
    consult: 'consultations.html',
    document: 'documents.html',
    ocr: 'ocr.html',
    risk: 'risks.html',
    regulation: 'regulations.html'
  };

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  function disposeCharts() {
    charts.forEach(function (c) { try { c.dispose(); } catch (e) {} });
    charts = [];
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  function chartSkeleton(id) {
    return '<div id="' + id + '" class="ops-chart ops-chart--loading"><div class="ops-chart-skeleton"></div></div>';
  }

  function chartCaption(id, key) {
    return '<p class="ops-analytics-chart-cap" id="ops-a-cap-' + key + '" data-cap="' + key + '"></p>';
  }

  function mount(root) {
    disposeCharts();
    root.innerHTML =
      (window.OpsUI ? OpsUI.pageHeader(
        '数据分析',
        '法律业务 AI 分析中台 · 智能解读 · 关联分析 · 趋势预测 · 异常检测'
      ) : '') +
      '<div class="ops-analytics-toolbar">' +
        '<span class="ops-analytics-hint" id="ops-analytics-updated">数据加载中…</span>' +
        '<button type="button" class="ops-btn ops-btn--sm" id="ops-analytics-refresh">刷新数据</button>' +
        '<button type="button" class="ops-btn ops-btn--sm ops-btn--ghost" id="ops-analytics-regen">重新生成分析</button>' +
      '</div>' +
      '<section class="ops-analytics-kpi-panel" aria-label="核心指标">' +
        '<div class="ops-analytics-kpi" id="ops-analytics-kpi"></div>' +
      '</section>' +
      '<div class="ops-analytics-grid">' +
        chartBlock('ops-a-consult', '咨询趋势', '近30日 · 支持异常点标注', 'consult') +
        chartBlock('ops-a-doc', '文书类型分布', 'document-generate-logs', 'document') +
        chartBlock('ops-a-ocr', 'OCR 置信度分布', 'ocr-records', 'ocr') +
        chartBlock('ops-a-risk', '风险等级分布', '全链路风险扫描', 'risk') +
        chartBlock('ops-a-law', '法规热点分布', '咨询 + 法规检索聚合', 'law') +
      '</div>' +
      '<section class="ops-analytics-insight" id="ops-analytics-insight">' +
        '<div class="ops-analytics-insight__head">' +
          '<h3><iconify-icon icon="lucide:sparkles"></iconify-icon> AI 数据解读</h3>' +
          '<button type="button" class="ops-btn ops-btn--sm ops-btn--ghost" id="ops-insight-toggle">收起</button>' +
        '</div>' +
        '<div class="ops-analytics-insight__body" id="ops-insight-body">' +
          '<p class="ops-analytics-insight__summary" id="ops-insight-summary">正在生成分析结论…</p>' +
          '<ul class="ops-analytics-insight__list" id="ops-insight-list"></ul>' +
          '<div class="ops-analytics-suggest" id="ops-insight-suggest"></div>' +
        '</div>' +
      '</section>' +
      '<div class="ops-analytics-advanced">' +
        '<div class="ops-card ops-analytics-card">' +
          '<div class="ops-card__head"><div><h3>多维关联分析</h3><p>咨询→文书 · OCR→法规 · 风险↔咨询类型</p></div></div>' +
          '<div class="ops-analytics-split">' +
            '<div id="ops-a-sankey" class="ops-chart ops-chart--tall ops-chart--loading">' +
              '<div class="ops-chart-skeleton"></div></div>' +
            '<div id="ops-a-graph" class="ops-chart ops-chart--tall ops-chart--loading">' +
              '<div class="ops-chart-skeleton"></div></div>' +
          '</div>' +
          '<div class="ops-analytics-metrics" id="ops-correlation-metrics"></div>' +
        '</div>' +
        '<div class="ops-card ops-analytics-card">' +
          '<div class="ops-card__head"><div><h3>趋势预测（7日）</h3><p>线性回归预测 · 仅供参考</p></div></div>' +
          '<div id="ops-a-forecast" class="ops-chart ops-chart--loading">' +
            '<div class="ops-chart-skeleton"></div></div>' +
        '</div>' +
        '<div class="ops-card ops-analytics-card">' +
          '<div class="ops-card__head"><div><h3>异常检测</h3><p>自动识别突增/突降与质量波动</p></div></div>' +
          '<div class="ops-analytics-anomaly" id="ops-anomaly-list"></div>' +
        '</div>' +
      '</div>' +
      '<aside class="ops-analytics-drawer" id="ops-analytics-drawer" aria-hidden="true">' +
        '<div class="ops-analytics-drawer__head">' +
          '<h4 id="ops-drawer-title">数据明细</h4>' +
          '<button type="button" class="ops-icon-btn" id="ops-drawer-close"><iconify-icon icon="lucide:x"></iconify-icon></button>' +
        '</div>' +
        '<div class="ops-analytics-drawer__body" id="ops-drawer-body"></div>' +
      '</aside>';

    document.getElementById('ops-analytics-refresh').addEventListener('click', function () {
      loadOverview(true);
    });
    document.getElementById('ops-analytics-regen').addEventListener('click', function () {
      regenerateInsight();
    });
    document.getElementById('ops-insight-toggle').addEventListener('click', function () {
      state.insightExpanded = !state.insightExpanded;
      document.getElementById('ops-insight-body').classList.toggle('is-collapsed', !state.insightExpanded);
      this.textContent = state.insightExpanded ? '收起' : '展开';
    });
    document.getElementById('ops-drawer-close').addEventListener('click', closeDrawer);

    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(function () { loadOverview(false); }, 300000);

    loadOverview(true);
    window.addEventListener('resize', debounce(function () {
      charts.forEach(function (c) { try { c.resize(); } catch (e) {} });
    }, 200));
  }

  function chartBlock(id, title, sub, capKey) {
    return '<div class="ops-card ops-analytics-card" data-chart="' + capKey + '">' +
      '<div class="ops-card__head"><div><h3>' + esc(title) + '</h3><p>' + esc(sub) + '</p></div></div>' +
      chartSkeleton(id) +
      chartCaption(id, capKey) +
    '</div>';
  }

  function loadOverview(force) {
    if (state.analyticsLoading && !force) return Promise.resolve();
    state.analyticsLoading = true;
    var hint = document.getElementById('ops-analytics-updated');
    if (hint) hint.textContent = '正在加载分析数据…';

    var req = window.OpsDataCenter && OpsDataCenter.loadAnalyticsOverview
      ? OpsDataCenter.loadAnalyticsOverview(DAYS, force ? { force: true } : {})
      : Promise.reject(new Error('API 未就绪'));

    return req.then(function (ov) {
      state.analyticsLoading = false;
      applyOverview(ov || {});
      if (hint) {
        hint.textContent = '更新于 ' + new Date().toLocaleTimeString() + ' · 缓存 5 分钟';
      }
      return ov;
    }).catch(function (err) {
      state.analyticsLoading = false;
      console.error('analytics overview failed', err);
      applyOverview({});
      if (hint) hint.textContent = '加载失败 · 请检查管理端 API（3003）';
    });
  }

  function applyOverview(ov) {
    var chartsData = ov.charts || ov;
    state.dashboardData = normalizeDashboard(chartsData);
    state.analyticsInsight = ov.insights || null;
    state.correlationData = ov.correlation || null;
    state.predictionData = ov.prediction || null;
    state.anomalyData = ov.anomaly || [];
    state.chartInsights = ov.chartInsights || {};

    renderKpi(state.dashboardData.overview);
    renderInsight(state.analyticsInsight);
    renderAnomalies(state.anomalyData);
    renderCorrelationMetrics(state.correlationData);

    var chain = window.OpsScriptLoader
      ? OpsScriptLoader.loadEcharts()
      : Promise.resolve();
    chain.then(function () {
      renderCharts(state.dashboardData);
      renderAdvanced(state.correlationData, state.predictionData, state.dashboardData);
    });
  }

  function regenerateInsight() {
    if (!FayiAdminApi.analyticsInsight) return;
    state.analyticsInsightLoading = true;
    var summary = document.getElementById('ops-insight-summary');
    if (summary) summary.textContent = '正在重新生成 AI 分析…';
    FayiAdminApi.analyticsInsight(DAYS, { force: true, ttlMs: 0 }).then(function (res) {
      state.analyticsInsightLoading = false;
      var data = (res && res.data != null) ? res.data : res;
      state.analyticsInsight = data;
      renderInsight(data);
      if (window.FayiToast) FayiToast('分析结论已更新', 'success');
    }).catch(function (err) {
      state.analyticsInsightLoading = false;
      if (summary) summary.textContent = '分析生成失败：' + (err.message || '');
    });
  }

  function normalizeDashboard(data) {
    if (!data || typeof data !== 'object') {
      return {
        overview: {},
        consultTrend: [],
        documentTypeDistribution: [],
        ocrConfidenceDistribution: [],
        riskLevelDistribution: [],
        lawCategoryHotspot: []
      };
    }
    return {
      overview: data.overview || {},
      consultTrend: data.consultTrend || [],
      documentTypeDistribution: data.documentTypeDistribution || [],
      ocrConfidenceDistribution: data.ocrConfidenceDistribution || [],
      riskLevelDistribution: data.riskLevelDistribution || [],
      lawCategoryHotspot: data.lawCategoryHotspot || []
    };
  }

  function renderKpi(ov) {
    ov = ov || {};
    var el = document.getElementById('ops-analytics-kpi');
    if (!el) return;
    var items = [
      { key: 'consult', label: '咨询总量', val: ov.totalConsult, icon: 'lucide:message-square-text' },
      { key: 'document', label: '文书总量', val: ov.totalDocuments, icon: 'lucide:file-text' },
      { key: 'ocr', label: 'OCR 总量', val: ov.totalOCR, icon: 'lucide:scan-text' },
      { key: 'regulation', label: '法规库', val: ov.totalRegulations, icon: 'lucide:scale' },
      { key: 'users', label: '活跃用户', val: ov.activeUsers, icon: 'lucide:users' },
      { key: 'today', label: '今日咨询', val: ov.consultToday, icon: 'lucide:calendar-clock' }
    ];
    el.innerHTML = items.map(function (it) {
      return '<article class="ops-analytics-kpi-card ops-analytics-kpi-card--' + it.key + '">' +
        '<div class="ops-analytics-kpi-card__head">' +
          '<label>' + esc(it.label) + '</label>' +
          '<span class="ops-analytics-kpi-card__icon" aria-hidden="true">' +
            '<iconify-icon icon="' + it.icon + '"></iconify-icon></span>' +
        '</div>' +
        '<strong class="ops-num">' + esc(it.val != null ? it.val : 0) + '</strong>' +
      '</article>';
    }).join('');
  }

  function renderInsight(insight) {
    insight = insight || { summary: '暂无解读', insights: [], suggestions: [] };
    var summary = document.getElementById('ops-insight-summary');
    var list = document.getElementById('ops-insight-list');
    var sug = document.getElementById('ops-insight-suggest');
    if (summary) summary.textContent = insight.summary || '暂无分析结论';
    if (list) {
      list.innerHTML = (insight.insights || []).map(function (t) {
        return '<li>' + esc(t) + '</li>';
      }).join('') || '<li class="ops-empty">暂无更多洞察</li>';
    }
    if (sug) {
      sug.innerHTML = '<h4>运营建议</h4><ul>' + (insight.suggestions || []).map(function (t) {
        return '<li>' + esc(t) + '</li>';
      }).join('') + '</ul>';
    }
  }

  function renderAnomalies(list) {
    var box = document.getElementById('ops-anomaly-list');
    if (!box) return;
    if (!list || !list.length) {
      box.innerHTML = '<p class="ops-empty">未检测到显著异常波动</p>';
      return;
    }
    box.innerHTML = list.map(function (a) {
      var sev = a.severity || 'medium';
      return '<article class="ops-anomaly-card ops-anomaly-card--' + sev + '" data-link="' + esc(a.link || '') + '">' +
        '<div class="ops-anomaly-card__badge">' + esc(sev === 'high' ? '高' : sev === 'low' ? '低' : '中') + '</div>' +
        '<div class="ops-anomaly-card__body">' +
          '<p>' + esc(a.description) + '</p>' +
          '<span class="ops-anomaly-card__time">' + esc(a.time || '') + '</span>' +
        '</div></article>';
    }).join('');
    box.querySelectorAll('.ops-anomaly-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var link = card.getAttribute('data-link');
        if (link) window.location.href = link;
      });
    });
  }

  function renderCorrelationMetrics(cor) {
    var el = document.getElementById('ops-correlation-metrics');
    if (!el || !cor || !cor.metrics) return;
    var m = cor.metrics;
    el.innerHTML =
      '<span class="ops-analytics-metric">咨询→文书转化率 <strong>' + esc(m.consultToDocumentRate) + '%</strong></span>' +
      '<span class="ops-analytics-metric">OCR→法规引用率 <strong>' + esc(m.ocrToRegulationRate) + '%</strong></span>';
  }

  function renderCharts(data) {
    disposeCharts();
    if (!window.OpsCharts) return;
    var T = OpsCharts;
    var caps = state.chartInsights || {};

    ['ops-a-consult', 'ops-a-doc', 'ops-a-ocr', 'ops-a-risk', 'ops-a-law'].forEach(clearLoadingClass);
    ['consult', 'document', 'ocr', 'risk', 'law'].forEach(function (key) {
      var capEl = document.querySelector('[data-cap="' + key + '"]');
      if (capEl && caps[key]) capEl.textContent = caps[key];
    });

    var trend = data.consultTrend || [];
    var labels = trend.map(function (x) { return String(x.date || '').slice(5); });
    var values = trend.map(function (x) { return x.count != null ? x.count : 0; });
    var marks = (caps.markPoints || []).map(function (m) {
      return { date: String(m.date || '').slice(5), label: m.label, severity: m.severity };
    });
    var consultEl = document.getElementById('ops-a-consult');
    if (consultEl) {
      var ch = T.mount(consultEl, T.lineGrowthMarked(labels, values, marks), charts);
      bindChartDrill(ch, 'consult', { labels: labels, values: values, trend: trend });
    }

    var docEl = document.getElementById('ops-a-doc');
    if (docEl) {
      var docData = (data.documentTypeDistribution || []).map(function (x, i) {
        return { name: x.type, label: x.type, value: x.value != null ? x.value : 0 };
      });
      var ch2 = T.mount(docEl, T.donut(docData), charts);
      bindChartDrill(ch2, 'document', { items: docData });
    }

    var ocrEl = document.getElementById('ops-a-ocr');
    if (ocrEl) {
      var ocrItems = (data.ocrConfidenceDistribution || []).map(function (x) {
        return { label: x.range, value: x.value != null ? x.value : 0 };
      });
      var ch3 = T.mount(ocrEl, T.barV(ocrItems, { yName: '次数', color: '#38bdf8' }), charts);
      bindChartDrill(ch3, 'ocr', { items: ocrItems });
    }

    var riskEl = document.getElementById('ops-a-risk');
    if (riskEl) {
      var riskData = (data.riskLevelDistribution || []).map(function (x) {
        var label = x.level === 'high' ? '高风险' : x.level === 'low' ? '低风险' : '中风险';
        return { name: label, label: label, value: x.value != null ? x.value : 0 };
      });
      var ch4 = T.mount(riskEl, T.donut(riskData), charts);
      bindChartDrill(ch4, 'risk', { items: riskData });
    }

    var lawEl = document.getElementById('ops-a-law');
    if (lawEl) {
      var lawItems = (data.lawCategoryHotspot || []).map(function (x) {
        return { label: x.category, value: x.count != null ? x.count : 0 };
      });
      var ch5 = T.mount(lawEl, T.barH(lawItems), charts);
      bindChartDrill(ch5, 'regulation', { items: lawItems });
    }

    setTimeout(function () {
      charts.forEach(function (c) { try { c.resize(); } catch (e) {} });
    }, 120);
  }

  function renderAdvanced(correlation, prediction, dashboard) {
    if (!window.OpsCharts) return;
    var T = OpsCharts;

    var sankeyEl = document.getElementById('ops-a-sankey');
    if (sankeyEl && correlation && correlation.sankey) {
      sankeyEl.classList.remove('ops-chart--loading');
      sankeyEl.innerHTML = '';
      T.mount(sankeyEl, T.sankey(correlation.sankey), charts);
    }

    var graphEl = document.getElementById('ops-a-graph');
    if (graphEl && correlation && correlation.graph) {
      graphEl.classList.remove('ops-chart--loading');
      graphEl.innerHTML = '';
      T.mount(graphEl, T.relationGraph(correlation.graph), charts);
    }

    var fcEl = document.getElementById('ops-a-forecast');
    if (fcEl && prediction) {
      fcEl.classList.remove('ops-chart--loading');
      fcEl.innerHTML = '';
      T.mount(fcEl, T.forecastTrend(
        (dashboard && dashboard.consultTrend) || [],
        prediction.consultForecast || [],
        '咨询预测'
      ), charts);
    }
  }

  function bindChartDrill(chart, module, ctx) {
    if (!chart || !chart.on) return;
    chart.on('click', function (params) {
      var title = '图表数据点';
      var detail = '';
      if (params.name) title = params.name;
      if (params.value != null) detail = '数值：' + params.value;
      if (params.seriesName) detail += ' · ' + params.seriesName;
      if (module === 'consult' && params.dataIndex != null && ctx.trend) {
        var row = ctx.trend[params.dataIndex];
        if (row) detail = '日期 ' + row.date + ' · 咨询量 ' + row.count;
      }
      openDrawer(title, detail, MODULE_LINKS[module] || 'dashboard.html');
    });
  }

  function openDrawer(title, body, link) {
    var drawer = document.getElementById('ops-analytics-drawer');
    document.getElementById('ops-drawer-title').textContent = title;
    document.getElementById('ops-drawer-body').innerHTML =
      '<p>' + esc(body) + '</p>' +
      (link ? '<a class="ops-btn ops-btn--sm" href="' + esc(link) + '">跳转业务模块</a>' : '');
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
  }

  function closeDrawer() {
    var drawer = document.getElementById('ops-analytics-drawer');
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
  }

  function clearLoadingClass(id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('ops-chart--loading');
  }

  function onData() { /* 独立 overview API */ }

  function destroy() {
    if (refreshTimer) clearInterval(refreshTimer);
    disposeCharts();
  }

  return { mount: mount, onData: onData, destroy: destroy };
})();

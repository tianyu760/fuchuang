/**
 * 数据总览 · 运营首页（高密度商务布局）
 */
window.OpsPages = window.OpsPages || {};

OpsPages.dashboard = (function () {
  var charts = [];
  var countEls = {};
  var metaEl = null;

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  function fmtTime(iso) {
    if (!iso) return '--:--';
    return String(iso).slice(11, 16).replace('T', ' ');
  }

  function countUp(el, target) {
    if (!el) return;
    var n = Number(target) || 0;
    var start = 0;
    var step = Math.max(1, Math.ceil(n / 20));
    var t = setInterval(function () {
      start += step;
      if (start >= n) { start = n; clearInterval(t); }
      el.textContent = start;
    }, 35);
  }

  var METRIC_ICONS = {
    online: 'lucide:radio',
    active: 'lucide:activity',
    consult: 'lucide:message-square-text',
    fagui: 'lucide:scale',
    doc: 'lucide:file-text',
    ocr: 'lucide:scan-text',
    risk: 'lucide:shield-alert',
    users: 'lucide:users'
  };

  function metricTile(key, label, id, unit, isRisk) {
    var icon = METRIC_ICONS[key] || 'lucide:bar-chart-2';
    return '<article class="ops-metric-tile' + (isRisk ? ' ops-metric-tile--risk' : '') + '">' +
      '<iconify-icon class="ops-metric-tile__icon" icon="' + icon + '" aria-hidden="true"></iconify-icon>' +
      '<div class="ops-metric-tile__body">' +
        '<span class="ops-metric-tile__label">' + label + '</span>' +
        '<span class="ops-metric-tile__value"><span class="ops-num" id="' + id + '">0</span>' +
        (unit ? '<span class="ops-metric-tile__unit">' + unit + '</span>' : '') +
        '</span></div></article>';
  }

  function metricMini(label, id, suffix) {
    return '<div class="ops-metric-mini"><label>' + label + '</label>' +
      '<span><strong class="ops-num" id="' + id + '">—</strong>' +
      (suffix ? '<span class="ops-metric-mini__suffix">' + suffix + '</span>' : '') +
      '</span></div>';
  }

  function metricsPanelHtml() {
    return '<section class="ops-card ops-metrics-panel" aria-label="核心运营指标">' +
      '<div class="ops-metrics-panel__head">' +
        '<div><h2>核心指标</h2><p>全站实时统计 · 自动刷新</p></div>' +
        '<span class="ops-metrics-panel__live">数据在线</span>' +
      '</div>' +
      '<div class="ops-metrics-panel__primary">' +
        metricTile('online', '在线人数', 'ops-kpi-online', '人') +
        metricTile('active', '今日活跃', 'ops-kpi-active', '人') +
        metricTile('consult', '今日咨询', 'ops-kpi-consult', '次') +
        metricTile('fagui', '法规检索', 'ops-kpi-fagui', '次') +
        metricTile('doc', '文书生成', 'ops-kpi-doc', '份') +
        metricTile('ocr', 'OCR 识别', 'ops-kpi-ocr', '次') +
        metricTile('risk', '风险预警', 'ops-kpi-risk', '条', true) +
        metricTile('users', '注册用户', 'ops-kpi-users', '人') +
      '</div>' +
      '<div class="ops-metrics-panel__secondary">' +
        metricMini('近 7 日新增', 'ops-mini-new', '人') +
        metricMini('OCR 成功率', 'ops-mini-ocr', '%') +
        metricMini('高风险事件', 'ops-mini-riskhi', '条') +
        metricMini('API 平均响应', 'ops-mini-api', 'ms') +
      '</div></section>';
  }

  function pageHeaderHtml() {
    if (window.OpsUI) {
      return OpsUI.pageHeader(
        '数据总览',
        '法律智能平台运营中心 · 全站真实行为数据',
        OpsUI.metaChip('系统', '正常', 'ok') +
        OpsUI.metaChip('数据刷新', '—', '') +
        OpsUI.metaChip('注册用户', '—', '')
      );
    }
    return '<h1 class="ops-page-title">数据总览</h1><p class="ops-page-sub">法律智能平台运营中心</p>';
  }

  function mount(root) {
    OpsShell.disposeCharts();
    charts = OpsShell.getCharts();

    root.innerHTML =
      '<div class="ops-enter">' +
        pageHeaderHtml() +
        '<section class="ops-brief-bar ops-brief-bar--compact" id="ops-brief-bar"></section>' +
        metricsPanelHtml() +
        '<section class="ops-dash-trend ops-card">' +
          '<div class="ops-card__head"><div><h3>平台业务趋势</h3><p>咨询 · OCR · 文书 · 近 30 日</p></div></div>' +
          '<div id="ops-chart-trend" class="ops-chart ops-chart--lg"></div>' +
        '</section>' +
        '<section class="ops-dash-split">' +
          '<div class="ops-card"><div class="ops-card__head"><div><h3>用户增长趋势</h3><p>近 30 日新增用户</p></div></div>' +
            '<div id="ops-chart-growth" class="ops-chart"></div></div>' +
          '<div class="ops-card"><div class="ops-card__head"><div><h3>咨询分类分布</h3><p>案件类型结构占比</p></div></div>' +
            '<div id="ops-chart-pie" class="ops-chart"></div></div>' +
        '</section>' +
        '<section class="ops-dash-v4-row">' +
          '<div class="ops-card"><div class="ops-card__head"><div><h3>今日运营摘要</h3><p>AI 运营洞察</p></div></div>' +
            '<ul class="ops-insights" id="ops-daily-brief"></ul></div>' +
          '<div class="ops-card"><div class="ops-card__head"><div><h3>实时热点法规</h3><p>检索热度 TOP</p></div></div>' +
            '<ul class="ops-hot-list" id="ops-hot-regs"></ul></div>' +
          '<div class="ops-card"><div class="ops-card__head"><div><h3>用户行为分析</h3><p>功能使用偏好</p></div></div>' +
            '<ul class="ops-hot-list" id="ops-user-behavior"></ul></div>' +
        '</section>' +
        '<section class="ops-dash-row3">' +
          '<div class="ops-card ops-dash-feed-col"><div class="ops-card__head"><div><h3>平台实时动态</h3><p>自动滚动 · 真实事件</p></div></div>' +
            '<div class="ops-feed ops-feed--live" id="ops-feed-wrap"><div class="ops-feed__scroll" id="ops-feed"></div></div></div>' +
          '<div class="ops-card"><div class="ops-card__head"><div><h3>智能分析建议</h3><p>运营策略提示</p></div></div>' +
            '<div class="ops-insights"><ul id="ops-smart-advice"></ul></div></div>' +
          '<div class="ops-card"><div class="ops-card__head"><div><h3>24 小时活跃热力</h3><p>平台活跃趋势</p></div></div>' +
            '<div id="ops-chart-heat" class="ops-chart ops-chart--sm"></div></div>' +
        '</section>' +
        '<section class="ops-dash-v4-row">' +
          '<div class="ops-card ops-dash-service-card">' +
            '<div class="ops-card__head"><div><h3>服务通道概况</h3><p>各业务线调用量 · 系统健康</p></div></div>' +
            '<div class="ops-service-bars" id="ops-service-bars"></div>' +
            '<div class="ops-service-foot" id="ops-service-foot"></div></div>' +
          '<div class="ops-card"><div class="ops-card__head"><div><h3>管理员操作动态</h3><p>后台操作时间轴</p></div></div>' +
            '<ul class="ops-timeline" id="ops-admin-timeline"></ul></div>' +
          '<div class="ops-card"><div class="ops-card__head"><div><h3>法律领域占比</h3><p>咨询结构环形图</p></div></div>' +
            '<div id="ops-chart-domain" class="ops-chart ops-chart--sm"></div></div>' +
        '</section>' +
        '<section class="ops-dash-bottom">' +
          '<div class="ops-card"><div class="ops-card__head"><div><h3>风险预警</h3><p>高风险咨询与异常事件</p></div></div>' +
            '<ul class="ops-risk-list" id="ops-risks"></ul></div>' +
          '<div class="ops-card"><div class="ops-card__head"><div><h3>高频法律问题</h3><p>用户检索热词</p></div></div>' +
            '<div id="ops-chart-keywords" class="ops-chart"></div></div>' +
        '</section>' +
      '</div>';

    metaEl = document.querySelector('.ops-page-meta');
    countEls = {
      online: document.getElementById('ops-kpi-online'),
      active: document.getElementById('ops-kpi-active'),
      consult: document.getElementById('ops-kpi-consult'),
      fagui: document.getElementById('ops-kpi-fagui'),
      doc: document.getElementById('ops-kpi-doc'),
      ocr: document.getElementById('ops-kpi-ocr'),
      risk: document.getElementById('ops-kpi-risk'),
      users: document.getElementById('ops-kpi-users')
    };
  }

  function paintFeed(feed) {
    var el = document.getElementById('ops-feed');
    if (!el) return;
    var items = (feed || []).slice(0, 24);
    var html = items.map(function (f) {
      var cls = /失败|风险|异常/.test(f.message || '') ? 'ops-feed__msg--warn' :
        /咨询|文书|生成|检索|上传/.test(f.message || '') ? 'ops-feed__msg--hi' : 'ops-feed__msg';
      return '<div class="ops-feed__item">' +
        '<span class="ops-feed__time">[' + fmtTime(f.time) + ']</span>' +
        '<span class="' + cls + '">' + esc(f.message) + '</span></div>';
    }).join('');
    if (!html) {
      el.innerHTML = '<p class="ops-empty">暂无动态，请在前台产生真实操作。</p>';
      return;
    }
    el.innerHTML = html + html;
  }

  function paintBriefBar(insights, stats) {
    var el = document.getElementById('ops-brief-bar');
    if (!el) return;
    var lines = (insights || []).slice(0, 3);
    if (!lines.length) {
      lines = ['今日平台运行平稳，各项法律服务模块正常接待用户咨询。'];
    }
    el.innerHTML = lines.map(function (t, i) {
      return '<div class="ops-brief-bar__item"><strong>洞察 ' + (i + 1) + '</strong> · ' + esc(t) + '</div>';
    }).join('');
    if (stats && stats.consultToday > 0) {
      el.insertAdjacentHTML('beforeend',
        '<div class="ops-brief-bar__item ops-brief-bar__item--highlight">今日 <strong>' +
        stats.consultToday + '</strong> 次咨询</div>');
    }
  }

  function paintList(elId, items, emptyMsg) {
    var el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = (items || []).length
      ? items.map(function (it) { return '<li>' + it + '</li>'; }).join('')
      : '<li class="ops-empty">' + (emptyMsg || '暂无数据') + '</li>';
  }

  function paintHotRegs(keywords, heat) {
    var el = document.getElementById('ops-hot-regs');
    if (!el) return;
    var list = heat && heat.length ? heat : (keywords || []).map(function (k) {
      return { name: k.name || k.text, value: k.value };
    });
    el.innerHTML = list.length ? list.slice(0, 8).map(function (item, i) {
      return '<li><span><span class="ops-hot-list__rank">' + (i + 1) + '</span>' +
        esc(item.name || item.keyword || item.label) + '</span>' +
        '<span class="ops-num">' + esc(item.value || item.count || '—') + '</span></li>';
    }).join('') : '<li class="ops-empty">暂无法规检索热词</li>';
  }

  function paintUserBehavior(modules, categories) {
    var el = document.getElementById('ops-user-behavior');
    if (!el) return;
    var src = modules && modules.length ? modules : (categories || []);
    el.innerHTML = src.length ? src.slice(0, 6).map(function (m, i) {
      return '<li><span><span class="ops-hot-list__rank">' + (i + 1) + '</span>' +
        esc(m.label || m.name) + '</span><span class="ops-num">' + esc(m.value) + '</span></li>';
    }).join('') : '<li class="ops-empty">暂无行为统计</li>';
  }

  function paintAdminTimeline(feed) {
    var el = document.getElementById('ops-admin-timeline');
    if (!el) return;
    var rows = (feed || []).filter(function (f) {
      return /管理|登录|后台|admin/i.test(f.message || '');
    }).slice(0, 12);
    if (!rows.length) rows = (feed || []).slice(0, 8);
    el.innerHTML = rows.length ? rows.map(function (f) {
      return '<li><span class="ops-timeline__time">' + fmtTime(f.time) + '</span>' + esc(f.message) + '</li>';
    }).join('') : '<li class="ops-empty">暂无管理员动态</li>';
  }

  function paintInsights(list) {
    paintList('ops-daily-brief', (list || []).map(function (t) { return esc(t); }),
      '暂无足够行为数据，请在前台产生真实操作。');
    paintList('ops-smart-advice', (list || []).slice(0, 6).map(function (t) { return esc(t); }),
      '系统将基于运营数据生成策略建议。');
  }

  var SERVICE_ICONS = {
    consult: 'lucide:message-square-text',
    document: 'lucide:file-text',
    regulation: 'lucide:scale',
    ocr: 'lucide:scan-text',
    case: 'lucide:briefcase',
    pufa: 'lucide:book-open',
    page: 'lucide:layout',
    auth: 'lucide:user-check',
    system: 'lucide:settings'
  };

  function paintServiceChannels(modules, stats, system, publicity) {
    var barsEl = document.getElementById('ops-service-bars');
    var footEl = document.getElementById('ops-service-foot');
    if (!barsEl) return;

    stats = stats || {};
    var list = (modules && modules.length) ? modules.slice(0, 6) : [
      { label: '法律咨询', module: 'consult', value: stats.consultToday || 0 },
      { label: '法规检索', module: 'regulation', value: stats.faguiToday || 0 },
      { label: '文书生成', module: 'document', value: stats.documentToday || stats.wenshiToday || 0 },
      { label: 'OCR 识别', module: 'ocr', value: stats.ocrToday || 0 },
      { label: '今日活跃', module: 'page', value: stats.todayActive || 0 },
      { label: '注册用户', module: 'auth', value: stats.totalUsers || 0 }
    ];

    var maxVal = 1;
    list.forEach(function (m) {
      var v = Number(m.value) || 0;
      if (v > maxVal) maxVal = v;
    });

    barsEl.innerHTML = list.map(function (m, i) {
      var val = Number(m.value) || 0;
      var pct = Math.max(4, Math.round((val / maxVal) * 100));
      var mod = m.module || m.name || ('m' + i);
      var icon = SERVICE_ICONS[mod] || 'lucide:layers';
      return '<div class="ops-service-bar">' +
        '<iconify-icon class="ops-service-bar__icon" icon="' + icon + '" aria-hidden="true"></iconify-icon>' +
        '<div class="ops-service-bar__main">' +
          '<div class="ops-service-bar__top">' +
            '<span class="ops-service-bar__label">' + esc(m.label || m.name) + '</span>' +
            '<span class="ops-service-bar__val ops-num">' + val + '</span>' +
          '</div>' +
          '<div class="ops-service-bar__track" role="presentation">' +
            '<span class="ops-service-bar__fill" style="width:' + pct + '%"></span>' +
          '</div>' +
        '</div></div>';
    }).join('');

    if (!footEl) return;
    var sys = system || {};
    var pub = publicity || {};
    var ocrPct = stats.ocrSuccessRate != null ? stats.ocrSuccessRate + '%' : '—';
    var apiMs = sys.responseMs != null ? sys.responseMs : (stats.avgResponseMs != null ? stats.avgResponseMs : '—');
    var reads = pub.todayReads != null ? pub.todayReads : (pub.articleViewCount != null ? pub.articleViewCount : '—');

    footEl.innerHTML =
      '<div class="ops-service-metric"><span class="ops-service-metric__label">API 响应</span>' +
        '<strong class="ops-num">' + esc(String(apiMs)) + '</strong><span>ms</span></div>' +
      '<div class="ops-service-metric"><span class="ops-service-metric__label">OCR 成功率</span>' +
        '<strong class="ops-num">' + esc(String(ocrPct)) + '</strong></div>' +
      '<div class="ops-service-metric"><span class="ops-service-metric__label">普法阅读</span>' +
        '<strong class="ops-num">' + esc(String(reads)) + '</strong><span>次</span></div>';
  }

  function paintRisks(list) {
    var el = document.getElementById('ops-risks');
    if (!el) return;
    el.innerHTML = (list || []).length
      ? list.slice(0, 12).map(function (r) {
          return '<li class="ops-risk-item"><strong>' + esc(r.level === 'high' ? '高风险' : '中风险') + '</strong> · ' +
            esc((r.title || r.message || '—').slice(0, 80)) + '</li>';
        }).join('')
      : '<li class="ops-empty">当前无高风险事件</li>';
  }

  function updateMetaChips(s) {
    var meta = document.querySelector('.ops-page-meta');
    if (!meta || !window.OpsUI) return;
    var sys = s.systemStatus === 'healthy' ? '正常' : '观察';
    var updated = s.updatedAt ? String(s.updatedAt).slice(11, 16) : '—';
    meta.innerHTML =
      OpsUI.metaChip('系统', sys, s.systemStatus === 'healthy' ? 'ok' : 'warn') +
      OpsUI.metaChip('刷新', updated, '') +
      OpsUI.metaChip('注册用户', s.totalUsers != null ? s.totalUsers : '—', '');
  }

  function mountCharts(data) {
    if (!window.OpsCharts || !window.echarts) return;
    var T = OpsCharts;
    var g = data.userGrowth30 || { labels: [], values: [] };
    var c30 = data.charts30 || data.charts || {};

    T.mount(document.getElementById('ops-chart-growth'), T.lineGrowth(g.labels, g.values || []), charts);

    if (c30.labels && c30.labels.length) {
      T.mount(document.getElementById('ops-chart-trend'), T.multiTrend(c30.labels, [
        { name: '咨询', data: c30.consult || [] },
        { name: 'OCR', data: c30.ocr || [] },
        { name: '文书', data: c30.documents || [] }
      ]), charts);
    }

    T.mount(document.getElementById('ops-chart-pie'), T.donut(data.categories), charts);
    T.mount(document.getElementById('ops-chart-domain'), T.donut(data.categories), charts);
    T.mount(document.getElementById('ops-chart-heat'), T.heatmap24(data.hourlyHeatmap), charts);
    T.mount(document.getElementById('ops-chart-keywords'), T.wordCloud(data.keywords), charts);

    setTimeout(function () { charts.forEach(function (c) { try { c.resize(); } catch (e) {} }); }, 150);
  }

  function setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val != null ? val : '—';
  }

  function onData(snap) {
    var data = snap.realtime || snap;
    var s = data.stats || snap.stats || {};
    countUp(countEls.online, s.onlineUsers || 0);
    countUp(countEls.active, s.todayActive || 0);
    countUp(countEls.consult, s.consultToday || 0);
    countUp(countEls.fagui, s.faguiToday || 0);
    countUp(countEls.doc, s.documentToday || s.wenshiToday || 0);
    countUp(countEls.ocr, s.ocrToday || 0);
    countUp(countEls.risk, s.riskAlerts || s.riskHigh || 0);
    countUp(countEls.users, s.totalUsers || 0);

    setText('ops-mini-new', s.newUsersWeek != null ? s.newUsersWeek : '—');
    setText('ops-mini-ocr', s.ocrSuccessRate != null ? s.ocrSuccessRate : '—');
    setText('ops-mini-riskhi', s.riskHigh != null ? s.riskHigh : '—');
    setText('ops-mini-api', s.avgResponseMs != null ? s.avgResponseMs : '—');

    updateMetaChips(s);
    paintBriefBar(data.insights, s);
    paintFeed(data.feed);
    paintInsights(data.insights);
    paintHotRegs(data.keywords, data.regulationHeat);
    paintUserBehavior(data.moduleUsage, data.categories);
    paintAdminTimeline(data.feed);
    paintServiceChannels(data.moduleUsage, s, data.system, data.publicity);
    paintRisks(data.riskEvents);
    mountCharts(data);
  }

  return { mount: mount, onData: onData };
})();

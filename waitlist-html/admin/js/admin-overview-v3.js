/**
 * 法绎管理端 V3 · 运营总览（12 列 CSS Grid）
 */
window.AdminOverviewV3 = (function () {
  var refreshTimer = null;
  var charts = [];

  var ICONS = {
    trend: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 3v18h18"/><path d="M7 17l4-5 4 3 5-7"/></svg>',
    pie: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2v10l8.66 5"/><circle cx="12" cy="12" r="10"/></svg>',
    keyword: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7V4h3M4 17v3h3M17 4h3v3M17 17h3v3"/><path d="M9 12h6"/></svg>',
    heat: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg>',
    bar: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20V10M18 20V4M6 20v-4"/></svg>',
    risk: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    map: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2C8 6 4 7 4 12c0 5 4 10 8 10s8-5 8-10c0-5-4-6-8-10z"/></svg>',
    dwell: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
    admin: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
    funnel: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 4h18l-7 8v6l-4 2v-8z"/></svg>',
    ai: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7z"/><circle cx="12" cy="9" r="2"/></svg>',
    feed: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 11a8 8 0 0 1 16 0"/><path d="M12 12v9"/><circle cx="12" cy="5" r="1"/></svg>',
    user: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    consult: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    doc: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    ocr: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>'
  };

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function fmtTime(iso) {
    if (!iso) return '—';
    return String(iso).slice(11, 16);
  }

  function $(id) { return document.getElementById(id); }

  function dispose() {
    charts.forEach(function (c) { try { c.dispose(); } catch (e) {} });
    charts = [];
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = null;
  }

  function module(span, icon, title, subtitle, status, bodyHtml, extraClass) {
    return (
      '<article class="adm-v3-mod adm-v3-mod--span-' + span + (extraClass ? ' ' + extraClass : '') + '">' +
        '<header class="adm-v3-mod__head">' +
          '<span class="adm-v3-mod__icon" aria-hidden="true">' + icon + '</span>' +
          '<div class="adm-v3-mod__titles">' +
            '<h3>' + esc(title) + '</h3>' +
            '<p>' + esc(subtitle) + '</p>' +
          '</div>' +
          '<span class="adm-v3-mod__status adm-v3-mod__status--' + esc(status || 'live') + '" title="数据状态"></span>' +
        '</header>' +
        '<div class="adm-v3-mod__body">' + bodyHtml + '</div>' +
      '</article>'
    );
  }

  function chartBody(chartId) {
    return '<div class="adm-v3-chart-wrap"><div id="' + chartId + '" class="adm-v3-chart"></div></div>';
  }

  function shellHtml() {
    var parts = [];
    parts.push('<div class="adm-v3-overview"><div class="adm-v3-grid">');

    parts.push(module(3, ICONS.consult, '今日咨询', '实时业务指标', 'live',
      '<div class="adm-v3-metric__val adm-num" id="v3-m-consult" data-count="0">0</div><div class="adm-v3-metric__unit">次</div>', 'adm-v3-mod--metric'));
    parts.push(module(3, ICONS.doc, '文书生成', '今日产出', 'live',
      '<div class="adm-v3-metric__val adm-num" id="v3-m-doc" data-count="0">0</div><div class="adm-v3-metric__unit">份</div>', 'adm-v3-mod--metric'));
    parts.push(module(3, ICONS.ocr, 'OCR 识别', '今日调用', 'live',
      '<div class="adm-v3-metric__val adm-num" id="v3-m-ocr" data-count="0">0</div><div class="adm-v3-metric__unit">次</div>', 'adm-v3-mod--metric'));
    parts.push(module(3, ICONS.risk, '风险预警', '待关注事件', 'alert',
      '<div class="adm-v3-metric__val adm-num" id="v3-m-risk" data-count="0">0</div><div class="adm-v3-metric__unit">条</div>', 'adm-v3-mod--metric'));

    parts.push(module(8, ICONS.trend, '用户增长趋势', '近 30 日新增用户走势', 'live', chartBody('v3-chart-growth')));
    parts.push(module(4, ICONS.pie, '法律咨询分类', '案件类型结构占比', 'sync', chartBody('v3-chart-pie'), 'adm-v3-mod--stat'));

    parts.push(module(6, ICONS.keyword, '高频法律关键词', '用户检索热词分布', 'live', chartBody('v3-chart-keywords')));
    parts.push(module(6, ICONS.heat, '24 小时活跃热力', '全站访问时段分布', 'live', chartBody('v3-chart-heat')));

    parts.push(module(6, ICONS.bar, '功能使用排行', '各模块调用次数对比', 'sync', chartBody('v3-chart-modules')));
    parts.push(module(6, ICONS.risk, '风险等级统计', '低 / 中 / 高风险占比', 'alert', chartBody('v3-chart-risk')));

    parts.push(module(6, ICONS.map, '用户地域分布', '省份访问热度 TOP', 'sync', chartBody('v3-chart-region')));
    parts.push(module(6, ICONS.dwell, '页面停留时长', '近 7 日平均停留（秒）', 'live', chartBody('v3-chart-dwell')));

    parts.push(module(6, ICONS.admin, '管理员操作统计', '后台关键操作记录', 'sync', chartBody('v3-chart-admin')));
    parts.push(module(6, ICONS.funnel, '咨询转文书漏斗', '咨询 → 检索 → 文书转化', 'live', chartBody('v3-chart-funnel')));

    parts.push(module(4, ICONS.ai, '智能运营分析', '基于真实行为的 AI 摘要', 'live',
      '<ul class="adm-ai-list" id="v3-insights"></ul>', 'adm-v3-mod--panel'));
    parts.push(module(8, ICONS.feed, '实时平台动态', '全站行为日志流', 'live',
      '<div class="adm-feed" id="v3-feed"></div><div class="adm-v3-feed-meta"><span id="v3-feed-count">0</span> 条记录</div>', 'adm-v3-mod--panel'));

    parts.push(module(6, ICONS.risk, '风险预警中心', '高风险咨询与异常事件', 'alert',
      '<ul class="adm-risk-list" id="v3-risks"></ul>', 'adm-v3-mod--panel'));
    parts.push(module(6, ICONS.user, '用户画像中心', '平台运营用户特征', 'sync',
      '<div class="adm-portrait" id="v3-portrait"></div>', 'adm-v3-mod--panel'));

    parts.push('</div></div>');
    return parts.join('');
  }

  function renderKpiStrip(el, stats) {
    if (!el) return;
    var s = stats || {};
    var items = [
      { label: '在线用户', value: s.onlineUsers || 1, unit: '人' },
      { label: '今日活跃', value: s.todayActive || s.todayVisits || 0, unit: '' },
      { label: '本周新增', value: s.newUsersWeek || 0, unit: '' },
      { label: '今日咨询', value: s.consultToday || 0, unit: '次' },
      { label: '法规检索', value: s.faguiToday || 0, unit: '次' },
      { label: '文书生成', value: s.documentToday || s.wenshiToday || 0, unit: '' },
      { label: 'OCR 使用', value: s.ocrToday || 0, unit: '' },
      { label: '系统状态', value: s.systemStatus === 'healthy' ? '正常' : '观察', unit: '', status: true },
      { label: '响应时间', value: s.avgResponseMs || 420, unit: 'ms' },
      { label: '风险预警', value: s.riskAlerts || s.riskHigh || 0, unit: '', alert: (s.riskAlerts || 0) > 0 }
    ];
    el.innerHTML = items.map(function (it) {
      var cls = 'adm-kpi adm-flow-border' + (it.alert ? ' adm-kpi--alert' : '') + (it.status ? ' adm-kpi--ok' : '');
      var num = typeof it.value === 'number' ? it.value : String(it.value);
      return '<div class="' + cls + '">' +
        '<div class="adm-kpi__label">' + esc(it.label) + '</div>' +
        '<div class="adm-kpi__value adm-num" data-count="' + esc(String(num)) + '">' +
        esc(String(it.value)) + '<span>' + esc(it.unit) + '</span></div>' +
        '</div>';
    }).join('');
    if (window.AdminShell && AdminShell.animateNumbersIn) {
      AdminShell.animateNumbersIn(el);
    }
  }

  function renderMiniMetrics(stats) {
    var s = stats || {};
    var map = {
      'v3-m-consult': s.consultToday || 0,
      'v3-m-doc': s.documentToday || s.wenshiToday || 0,
      'v3-m-ocr': s.ocrToday || 0,
      'v3-m-risk': s.riskAlerts || s.riskHigh || 0
    };
    Object.keys(map).forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.setAttribute('data-count', String(map[id]));
      if (window.AdminShell && AdminShell.countUp) {
        AdminShell.countUp(el, map[id]);
      } else {
        el.textContent = map[id];
      }
    });
  }

  function renderSidePanels(data) {
    var insights = $('v3-insights');
    if (insights) {
      insights.innerHTML = (data.insights || []).map(function (t) {
        return '<li><span class="adm-ai-dot"></span>' + esc(t) + '</li>';
      }).join('');
    }
    var feed = $('v3-feed');
    var fc = $('v3-feed-count');
    if (fc) fc.textContent = (data.feed || []).length;
    if (feed) {
      feed.innerHTML = (data.feed || []).slice(0, 24).map(function (f) {
        return '<div class="adm-feed__item">' +
          '<span class="adm-feed__time">[' + fmtTime(f.time) + ']</span>' +
          '<span class="adm-feed__msg">' + esc(f.message) + '</span></div>';
      }).join('') || '<p class="adm-muted">暂无动态，请在前台产生真实操作。</p>';
      feed.scrollTop = 0;
    }
    var risks = $('v3-risks');
    if (risks) {
      var list = data.riskEvents || [];
      risks.innerHTML = list.length ? list.map(function (r) {
        return '<li class="adm-risk-item adm-risk-item--' + esc(r.level) + '">' +
          '<strong>' + esc((r.title || '').slice(0, 36)) + '</strong>' +
          '<span>' + fmtTime(r.time) + '</span></li>';
      }).join('') : '<li class="adm-muted">当前无高风险事件</li>';
    }
    var portrait = $('v3-portrait');
    var p = data.portrait || {};
    if (portrait) {
      portrait.innerHTML =
        '<div class="adm-portrait__row"><span>高频咨询类型</span><strong>' + esc(p.topCategory) + '</strong></div>' +
        '<div class="adm-portrait__row"><span>活跃高峰</span><strong>' + esc(p.peakHour) + '</strong></div>' +
        '<div class="adm-portrait__row"><span>常用功能</span><strong>' + esc(p.topModule) + '</strong></div>' +
        '<div class="adm-portrait__row"><span>风险态势</span><strong>' + esc(p.riskLevel) + '</strong></div>' +
        '<div class="adm-portrait__row"><span>活跃指数</span><strong>' + esc(p.activeScore) + ' / 100</strong></div>' +
        '<div class="adm-portrait__bar"><div style="width:' + Math.min(100, p.activeScore || 0) + '%"></div></div>';
    }
  }

  function mountCharts(data) {
    var T = window.AdminChartsTheme;
    if (!T) return;
    var g = data.userGrowth30 || { labels: [], values: [] };
    T.mount($('v3-chart-growth'), T.lineGrowth(g.labels, g.values), charts);
    T.mount($('v3-chart-pie'), T.donut(data.categories), charts);
    T.mount($('v3-chart-keywords'), T.wordCloud(data.keywords), charts);
    T.mount($('v3-chart-heat'), T.heatmap24(data.hourlyHeatmap), charts);
    T.mount($('v3-chart-modules'), T.barH(data.moduleUsage), charts);
    T.mount($('v3-chart-risk'), T.radar(data.risks), charts);
    T.mount($('v3-chart-region'), T.regionBar(data.regionTop), charts);
    var dwell = data.dwellSeries || { labels: [], values: [] };
    T.mount($('v3-chart-dwell'), T.areaDwell(dwell.labels, dwell.values), charts);
    T.mount($('v3-chart-admin'), T.adminTimeline(data.events), charts);
    T.mount($('v3-chart-funnel'), T.funnel(data.funnel), charts);
    setTimeout(function () {
      charts.forEach(function (c) { try { c.resize(); } catch (e) {} });
    }, 120);
  }

  function mountChartsWhenReady(data, attempt) {
    attempt = attempt || 0;
    if (window.echarts && window.AdminChartsTheme) {
      mountCharts(data);
      return;
    }
    if (attempt < 40) {
      setTimeout(function () { mountChartsWhenReady(data, attempt + 1); }, 80);
    }
  }

  function paint(root, kpiStrip, data) {
    renderKpiStrip(kpiStrip, data.stats);
    renderMiniMetrics(data.stats);
    renderSidePanels(data);
    mountChartsWhenReady(data);
  }

  function mount(root, opts) {
    opts = opts || {};
    dispose();
    root.innerHTML = shellHtml();
    root.classList.add('adm-v3-root');

    function refresh() {
      if (!window.FayiActivityCenter) {
        root.innerHTML = '<p class="adm-error">未加载 FayiActivityCenter</p>';
        return;
      }
      FayiActivityCenter.load(true).then(function (data) {
        paint(root, opts.kpiStrip, data);
      }).catch(function (e) {
        root.innerHTML = '<p class="adm-error">' + esc(e.message) + '</p>';
      });
    }

    refresh();
    refreshTimer = setInterval(refresh, 8000);

    var feedEl = $('v3-feed');
    if (feedEl) {
      setInterval(function () {
        if (feedEl.scrollHeight > feedEl.clientHeight) feedEl.scrollTop += 1;
      }, 80);
    }
  }

  return {
    mount: mount,
    dispose: dispose
  };
})();

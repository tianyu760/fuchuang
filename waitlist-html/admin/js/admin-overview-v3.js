/**
 * 法绎管理端 V3 · 运营总览（企业级数据中心布局）
 */
window.AdminOverviewV3 = (function () {
  var cardTimer = null;
  var chartTimer = null;
  var wsOff = null;
  var charts = [];
  var lastChartData = null;

  var ICONS = {
    trend: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 3v18h18"/><path d="M7 17l4-5 4 3 5-7"/></svg>',
    pie: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2v10l8.66 5"/><circle cx="12" cy="12" r="10"/></svg>',
    ai: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7z"/><circle cx="12" cy="9" r="2"/></svg>',
    feed: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 11a8 8 0 0 1 16 0"/><path d="M12 12v9"/><circle cx="12" cy="5" r="1"/></svg>',
    risk: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    consult: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    doc: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    fagui: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>'
  };

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function fmtTime(iso) {
    if (!iso) return '—';
    var s = String(iso);
    if (s.length >= 16) return s.slice(11, 16).replace('T', ' ');
    return s.slice(0, 16);
  }

  function riskLevelLabel(lv) {
    if (lv === 'high') return '高风险';
    if (lv === 'low') return '低风险';
    return '中风险';
  }

  function insightTextClass(text) {
    var s = String(text || '');
    if (/风险|失败|异常|警告|待关注|错误|高风险/.test(s)) return 'adm-ai-list__text adm-ai-list__text--warn';
    if (/高峰|热门|占比|建议|完成|正常|检索|文书|咨询|活跃|推送/.test(s)) return 'adm-ai-list__text adm-ai-list__text--hi';
    return 'adm-ai-list__text';
  }

  function feedMsgClass(f) {
    if (!f) return 'adm-feed__msg';
    if (f.result === 'failed' || /失败|异常|风险|错误|封禁/.test(f.message || '')) {
      return 'adm-feed__msg adm-feed__msg--warn';
    }
    if (/咨询|文书|检索|登录|注册|生成|识别/.test(f.message || '')) {
      return 'adm-feed__msg adm-feed__msg--hi';
    }
    return 'adm-feed__msg';
  }

  function $(id) { return document.getElementById(id); }

  function dispose() {
    charts.forEach(function (c) { try { c.dispose(); } catch (e) {} });
    charts = [];
    if (cardTimer) clearInterval(cardTimer);
    if (chartTimer) clearInterval(chartTimer);
    cardTimer = null;
    chartTimer = null;
    if (wsOff) { try { wsOff(); } catch (e) {} wsOff = null; }
  }

  function modHead(icon, title, subtitle, status) {
    return (
      '<header class="adm-v3-mod__head">' +
        '<span class="adm-v3-mod__icon" aria-hidden="true">' + icon + '</span>' +
        '<div class="adm-v3-mod__titles">' +
          '<h3>' + esc(title) + '</h3>' +
          '<p>' + esc(subtitle) + '</p>' +
        '</div>' +
        '<span class="adm-v3-mod__status adm-v3-mod__status--' + esc(status || 'live') + '" title="数据状态"></span>' +
      '</header>'
    );
  }

  function metricCard(icon, title, subtitle, valueId, unit, delayIdx) {
    var delay = (delayIdx || 0) * 60;
    return (
      '<article class="adm-v3-metric-card adm-v3-mod adm-v3-mod--enter" style="animation-delay:' + delay + 'ms">' +
        '<div class="adm-v3-metric-card__top">' +
          '<span class="adm-v3-mod__icon" aria-hidden="true">' + icon + '</span>' +
          '<div class="adm-v3-metric-card__titles">' +
            '<h4>' + esc(title) + '</h4>' +
            '<p>' + esc(subtitle) + '</p>' +
          '</div>' +
        '</div>' +
        '<div class="adm-v3-metric-card__val adm-num" id="' + valueId + '" data-count="0">0</div>' +
        '<div class="adm-v3-metric-card__unit">' + esc(unit) + '</div>' +
      '</article>'
    );
  }

  function chartBody(chartId, heightClass) {
    heightClass = heightClass || 'adm-v3-chart-wrap--hero';
    return '<div class="adm-v3-chart-wrap ' + heightClass + '"><div id="' + chartId + '" class="adm-v3-chart"></div></div>';
  }

  function shellHtml() {
    return (
      '<div class="adm-v3-overview adm-v3-overview--dc">' +
        '<section class="adm-v3-metrics-row" aria-label="今日核心指标">' +
          metricCard(ICONS.consult, '今日咨询', '实时业务指标', 'v3-m-consult', '次', 0) +
          metricCard(ICONS.doc, '文书生成', '今日产出', 'v3-m-doc', '份', 1) +
          metricCard(ICONS.fagui, '法规检索', '今日检索', 'v3-m-fagui', '次', 2) +
          metricCard(ICONS.risk, '风险预警', '待关注事件', 'v3-m-risk', '条', 3) +
        '</section>' +
        '<section class="adm-v3-hero-row">' +
          '<article class="adm-v3-mod adm-v3-mod--hero adm-v3-mod--enter" style="animation-delay:80ms">' +
            modHead(ICONS.trend, '用户增长趋势', '近 30 日新增用户走势', 'live') +
            '<div class="adm-v3-mod__body">' + chartBody('v3-chart-growth', 'adm-v3-chart-wrap--hero') + '</div>' +
          '</article>' +
          '<article class="adm-v3-mod adm-v3-mod--pie adm-v3-mod--enter" style="animation-delay:140ms">' +
            modHead(ICONS.pie, '法律咨询分类', '案件类型结构占比', 'sync') +
            '<div class="adm-v3-mod__body">' + chartBody('v3-chart-pie', 'adm-v3-chart-wrap--hero') + '</div>' +
          '</article>' +
        '</section>' +
        '<section class="adm-v3-biz-row">' +
          '<article class="adm-v3-mod adm-v3-mod--biz adm-v3-mod--panel adm-v3-mod--enter" style="animation-delay:200ms">' +
            modHead(ICONS.ai, '智能运营分析', '基于真实业务数据的运营摘要', 'live') +
            '<div class="adm-v3-mod__body">' +
              '<div class="adm-v3-scroll adm-scroll-lite adm-v3-scroll--biz" id="v3-insights-wrap"><ul class="adm-ai-list" id="v3-insights"></ul></div>' +
            '</div>' +
          '</article>' +
          '<article class="adm-v3-mod adm-v3-mod--biz adm-v3-mod--panel adm-v3-mod--enter" style="animation-delay:260ms">' +
            modHead(ICONS.feed, '实时平台动态', '全站行为事件流', 'live') +
            '<div class="adm-v3-mod__body">' +
              '<div class="adm-v3-scroll adm-scroll-lite adm-v3-scroll--biz" id="v3-feed-wrap"><div class="adm-feed" id="v3-feed"></div></div>' +
              '<div class="adm-v3-feed-meta"><span id="v3-feed-count">0</span> 条记录</div>' +
            '</div>' +
          '</article>' +
        '</section>' +
        '<section class="adm-v3-risk-section">' +
          '<article class="adm-v3-mod adm-v3-mod--risk adm-v3-mod--enter" style="animation-delay:320ms">' +
            modHead(ICONS.risk, '风险预警中心', '高风险咨询与异常事件 · 实时滚动', 'alert') +
            '<div class="adm-v3-mod__body">' +
              '<div class="adm-v3-risk-stream adm-scroll-lite" id="v3-risks-wrap"><ul class="adm-v3-risk-list" id="v3-risks"></ul></div>' +
            '</div>' +
          '</article>' +
        '</section>' +
      '</div>'
    );
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
      { label: '系统状态', value: s.systemStatus === 'healthy' ? '正常' : '观察', unit: '', status: true },
      { label: '响应时间', value: s.avgResponseMs || 0, unit: 'ms' },
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
      'v3-m-fagui': s.faguiToday || 0,
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

  function renderRiskRow(r) {
    var lv = r.level || 'mid';
    var type = r.type || r.category || '风险事件';
    var user = r.user || r.userId || r.source || '平台监测';
    return (
      '<li class="adm-v3-risk-row adm-v3-risk-row--' + esc(lv) + '">' +
        '<span class="adm-v3-risk-row__dot" aria-hidden="true"></span>' +
        '<div class="adm-v3-risk-row__main">' +
          '<div class="adm-v3-risk-row__tags">' +
            '<span class="adm-v3-risk-tag adm-v3-risk-tag--' + esc(lv) + '">' + esc(riskLevelLabel(lv)) + '</span>' +
            '<span class="adm-v3-risk-tag adm-v3-risk-tag--type">' + esc(type) + '</span>' +
          '</div>' +
          '<p class="adm-v3-risk-row__text">' + esc((r.title || '—').slice(0, 96)) + '</p>' +
          '<span class="adm-v3-risk-row__source">' + esc(user) + '</span>' +
        '</div>' +
        '<time class="adm-v3-risk-row__time">' + esc(fmtTime(r.time || r.createdAt)) + '</time>' +
      '</li>'
    );
  }

  function renderSidePanels(data) {
    var insights = $('v3-insights');
    if (insights) {
      var list = data.insights || [];
      insights.innerHTML = list.length
        ? list.map(function (t) {
            return '<li class="adm-ai-list__item"><span class="adm-ai-dot" aria-hidden="true"></span>' +
              '<span class="' + insightTextClass(t) + '">' + esc(t) + '</span></li>';
          }).join('')
        : '<li class="adm-biz-empty">暂无足够行为数据，请在前台产生真实操作后查看分析。</li>';
    }
    var feed = $('v3-feed');
    var fc = $('v3-feed-count');
    if (fc) fc.textContent = (data.feed || []).length;
    if (feed) {
      feed.innerHTML = (data.feed || []).slice(0, 24).map(function (f) {
        var metaParts = [
          f.user ? esc(f.user) : '',
          f.ip ? 'IP ' + esc(f.ip) : '',
          f.sourcePage ? esc(f.sourcePage) : '',
          f.result === 'failed' ? '<em class="adm-feed__meta-tag adm-feed__meta-tag--warn">失败</em>' :
            (f.result ? '<em class="adm-feed__meta-tag adm-feed__meta-tag--ok">成功</em>' : '')
        ].filter(Boolean);
        var meta = metaParts.join(' · ');
        return '<div class="adm-feed__item">' +
          '<div class="adm-feed__line">' +
            '<span class="adm-feed__time">[' + fmtTime(f.time) + ']</span>' +
            '<span class="' + feedMsgClass(f) + '">' + esc(f.message) + '</span>' +
          '</div>' +
          (meta ? '<span class="adm-feed__meta">' + meta + '</span>' : '') +
          '</div>';
      }).join('') || '<p class="adm-biz-empty">暂无动态，请在前台产生真实操作。</p>';
      feed.scrollTop = 0;
    }
    var risks = $('v3-risks');
    if (risks) {
      var list = data.riskEvents || [];
      risks.innerHTML = list.length
        ? list.map(renderRiskRow).join('')
        : '<li class="adm-v3-risk-row adm-v3-risk-row--empty"><span class="adm-v3-risk-row__dot"></span><div class="adm-v3-risk-row__main"><p class="adm-v3-risk-row__text">当前无高风险事件</p></div></li>';
    }
  }

  function mountCharts(data) {
    var T = window.AdminChartsTheme;
    if (!T) return;
    var g = data.userGrowth30 || { labels: [], values: [] };
    T.mount($('v3-chart-growth'), T.lineGrowth(g.labels, g.values), charts);
    T.mount($('v3-chart-pie'), T.donut(data.categories), charts);
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

  function refreshCards(kpiStrip) {
    if (!window.FayiActivityCenter) return;
    FayiActivityCenter.load(true).then(function (data) {
      renderKpiStrip(kpiStrip, data.stats);
      renderMiniMetrics(data.stats);
      renderSidePanels(data);
      if (window.AdminShell && AdminShell.ingestActivity) {
        AdminShell.ingestActivity(data);
      }
    }).catch(function () {});
  }

  function refreshChartsOnly() {
    if (!window.FayiActivityCenter) return;
    FayiActivityCenter.loadCharts(true).then(function (data) {
      lastChartData = data;
      mountChartsWhenReady(data);
    }).catch(function () {});
  }

  function mount(root, opts) {
    opts = opts || {};
    dispose();
    root.innerHTML = shellHtml();
    root.classList.add('adm-v3-root');

    if (!window.FayiActivityCenter) {
      root.innerHTML = '<p class="adm-error">未加载 FayiActivityCenter</p>';
      return;
    }

    FayiActivityCenter.load(true).then(function (data) {
      paint(root, opts.kpiStrip, data);
      lastChartData = data;
    }).catch(function (e) {
      root.innerHTML = '<p class="adm-error">' + esc(e.message) + '</p>';
    });

    cardTimer = setInterval(function () { refreshCards(opts.kpiStrip); }, 30000);
    chartTimer = setInterval(refreshChartsOnly, 60000);

    if (FayiActivityCenter.onRealtime) {
      FayiActivityCenter.onRealtime(function (data) {
        renderSidePanels(data);
        if (opts.kpiStrip) renderKpiStrip(opts.kpiStrip, data.stats);
        renderMiniMetrics(data.stats);
      });
    }
  }

  return {
    mount: mount,
    dispose: dispose
  };
})();

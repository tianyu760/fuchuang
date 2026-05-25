/**
 * 法绎数字大屏 — 真实数据驱动 + 商业级 UI
 */
(function () {
  var API_BASE = 'http://localhost:3002';
  var HEALTH_URL = API_BASE + '/api/admin/datav/health';
  var API = API_BASE + '/api/admin/datav/realtime';
  var SSE_URL = API_BASE + '/api/admin/datav/stream';
  var POLL_MS = 2000;
  var CHANNEL = 'fayi-dashboard-v1';
  var THEME = window.FayiDatavTheme || {};
  var grid = window.datavBaseGrid || function (o) { return o || {}; };

  var charts = [];
  var lastRevisionSeq = -1;
  var chartInited = {};
  var pollTimer = null;
  var sse = null;
  var feedsStarted = false;

  var RISK_LABEL = { low: '低风险', mid: '中风险', high: '高风险' };
  var RISK_COLOR = { low: '#34d399', mid: '#fbbf24', high: '#f87171' };

  function $(id) { return document.getElementById(id); }

  function catLabel(c) {
    return (c && (c.label || c.name)) || '其他';
  }

  function dashboardDataValidator(data) {
    var d = data && typeof data === 'object' ? data : {};
    var stats = d.stats && typeof d.stats === 'object' ? d.stats : {};
    var chartsData = d.charts && typeof d.charts === 'object' ? d.charts : {};
    var categories = Array.isArray(d.categories) ? d.categories : [];
    var keywords = Array.isArray(d.keywords) ? d.keywords : [];
    var feed = Array.isArray(d.feed) ? d.feed : [];
    var topQuestions = Array.isArray(d.topQuestions) ? d.topQuestions : [];
    var risks = Array.isArray(d.risks) ? d.risks : [];
    var consultHotspots = Array.isArray(d.consultHotspots) ? d.consultHotspots : [];
    var moduleUsage = Array.isArray(d.moduleUsage) ? d.moduleUsage : [];
    var labels = Array.isArray(chartsData.labels) ? chartsData.labels : [];
    function normalizeSeries(arr) {
      if (!Array.isArray(arr)) return labels.map(function () { return 0; });
      return arr.map(function (x) { return Number(x) || 0; });
    }
    return {
      revision: d.revision || { seq: 0, at: 0 },
      serverTime: d.serverTime || new Date().toISOString(),
      stats: stats,
      charts: {
        labels: labels,
        consult: normalizeSeries(chartsData.consult),
        ocr: normalizeSeries(chartsData.ocr),
        documents: normalizeSeries(chartsData.documents),
        pufa: normalizeSeries(chartsData.pufa)
      },
      categories: categories,
      keywords: keywords,
      feed: feed,
      topQuestions: topQuestions,
      publicity: d.publicity || {},
      risks: risks,
      consultHotspots: consultHotspots,
      moduleUsage: moduleUsage,
      system: d.system || {}
    };
  }

  function scaleLayout() {
    var el = $('datav-scale');
    if (!el) return;
    var w = window.innerWidth;
    var h = window.innerHeight;
    var s = Math.min(w / 1920, h / 1080);
    el.style.transform = 'scale(' + s + ')';
    el.style.marginLeft = ((w - 1920 * s) / 2) + 'px';
    el.style.marginTop = ((h - 1080 * s) / 2) + 'px';
    charts.forEach(function (c) { try { c.resize(); } catch (e) {} });
  }

  function tickClock() {
    var el = $('datav-clock');
    if (el) el.textContent = new Date().toLocaleString('zh-CN', { hour12: false });
  }

  function setSyncStatus(ok, msg) {
    var el = $('datav-status');
    if (!el) return;
    el.className = 'datav-status' + (ok ? ' datav-status--ok' : ' datav-status--err');
    el.textContent = msg || (ok ? '数据已同步' : '连接异常');
  }

  function animateNum(el, v) {
    if (!el) return;
    var cur = parseInt(el.textContent.replace(/\D/g, ''), 10) || 0;
    var target = parseInt(v, 10) || 0;
    var t0 = performance.now();
    function step(now) {
      var p = Math.min(1, (now - t0) / 900);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(cur + (target - cur) * eased);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function initParticles() {
    var canvas = $('particles');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var pts = [];
    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    for (var i = 0; i < 60; i++) {
      pts.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        r: Math.random() * 1.2 + 0.4
      });
    }
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pts.forEach(function (p) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        ctx.beginPath();
        ctx.fillStyle = 'rgba(79, 156, 249, 0.45)';
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });
      requestAnimationFrame(draw);
    }
    window.addEventListener('resize', resize);
    draw();
  }

  function getChart(dom) {
    if (!window.echarts || !dom) return null;
    var inst = echarts.getInstanceByDom(dom);
    if (!inst) {
      inst = echarts.init(dom, null, { renderer: 'canvas' });
      charts.push(inst);
    }
    return inst;
  }

  function chartSet(dom, opt, full) {
    var inst = getChart(dom);
    if (!inst) return null;
    var key = dom.id || 'chart';
    if (full || !chartInited[key]) {
      inst.setOption(Object.assign({ textStyle: THEME.textStyle }, opt), { notMerge: false });
      chartInited[key] = true;
    } else {
      inst.setOption(opt, { notMerge: false, lazyUpdate: true, silent: true });
    }
    return inst;
  }

  function renderKpiRow(stats) {
    var row = $('kpi-row');
    if (!row) return;
    var cards = [
      { label: '累计 AI 调用', val: stats.aiCalls, unit: '次' },
      { label: '今日总调用', val: stats.aiCallsToday, unit: '次' },
      { label: 'OCR 识别总量', val: stats.ocrCount, unit: '次' },
      { label: 'OCR 成功率', val: stats.ocrSuccessRate, unit: '%' },
      { label: '文书生成总量', val: stats.documentCount, unit: '份' },
      { label: '普法今日阅读', val: stats.pufaReadsToday, unit: '次' }
    ];
    row.innerHTML = cards.map(function (c, i) {
      return '<div class="datav-kpi-card" style="animation-delay:' + (i * 0.06) + 's">' +
        '<div class="datav-kpi-card__label">' + c.label + '</div>' +
        '<div class="datav-kpi-card__val">' + c.val + '<small> ' + c.unit + '</small></div></div>';
    }).join('');
    animateNum($('kpi-online'), stats.onlineUsers || 1);
  }

  function renderFeed(feed) {
    var ul = $('datav-feed');
    if (!ul) return;
    var items = (feed || []).slice(0, 16);
    if (!items.length) {
      ul.innerHTML = '<li><time>—</time><span class="datav-feed__type">系统</span><span class="datav-feed__msg">等待业务数据写入…</span></li>';
      return;
    }
    var html = items.map(function (f) {
      var t = (f.time || '').slice(11, 19);
      var riskCls = f.riskLevel ? ' datav-feed__risk--' + f.riskLevel : '';
      var tags = [];
      if (f.categoryLabel) tags.push(f.categoryLabel);
      if (f.keywords && f.keywords.length) tags.push(f.keywords.join(' · '));
      if (f.riskLevel) tags.push(RISK_LABEL[f.riskLevel] || f.riskLevel);
      return '<li><time>' + t + '</time>' +
        '<span class="datav-feed__type">' + (f.typeLabel || f.type) + '</span>' +
        '<span class="datav-feed__msg' + riskCls + '">' + (f.message || '') +
        (tags.length ? '<div class="datav-feed__tags">' + tags.join(' · ') + '</div>' : '') +
        '</span></li>';
    }).join('');
    ul.innerHTML = html + html;
  }

  function renderTopQuestions(list) {
    var el = $('datav-topq');
    if (!el) return;
    var items = list || [];
    if (!items.length) {
      el.innerHTML = '<li><span class="datav-topq__text">暂无足够问答样本</span></li>';
      return;
    }
    el.innerHTML = items.map(function (q, i) {
      return '<li><span class="datav-topq__rank">' + (i + 1) + '</span>' +
        '<span class="datav-topq__text">' + q.question + '</span>' +
        '<span class="datav-topq__cnt">' + q.count + '</span></li>';
    }).join('');
  }

  function renderPublicity(pub) {
    pub = pub || {};
    var el = $('datav-publicity');
    if (!el) return;
    var topics = (pub.hotTopics || []).slice(0, 2).join('、') || '—';
    el.innerHTML = [
      ['今日阅读', pub.todayReads || 0],
      ['累计阅读', pub.totalReads || 0],
      ['热门', topics]
    ].map(function (x) {
      return '<li><span>' + x[0] + '</span><span>' + x[1] + '</span></li>';
    }).join('');
  }

  function applyData(data, isUpdate) {
    if (!data || !data.stats) return;
    if (window.FayiDatavStore && FayiDatavStore.saveSnapshot) {
      FayiDatavStore.saveSnapshot(data);
    }

    var stats = data.stats;
    var ch = data.charts || {};

    renderKpiRow(stats);
    animateNum($('hero-consult'), stats.consultToday != null ? stats.consultToday : 0);
    animateNum($('hero-ocr'), stats.ocrToday || 0);
    animateNum($('hero-doc'), stats.documentToday || 0);
    animateNum($('hero-fagui'), stats.faguiToday || 0);
    renderFeed(data.feed);
    renderTopQuestions(data.topQuestions);
    renderPublicity(data.publicity);

    chartSet($('chart-trend'), {
      color: THEME.color,
      tooltip: { trigger: 'axis' },
      legend: { data: ['咨询', 'OCR', '文书'], top: 0, right: 8 },
      grid: grid({ top: 42 }),
      xAxis: { type: 'category', data: ch.labels, boundaryGap: false },
      yAxis: { type: 'value', minInterval: 1 },
      series: [
        {
          id: 's-consult', name: '咨询', type: 'line', smooth: true, data: ch.consult,
          symbol: 'circle', symbolSize: 6,
          lineStyle: { width: 2, color: '#4f9cf9' },
          areaStyle: { color: 'rgba(79,156,249,0.12)' }
        },
        {
          id: 's-ocr', name: 'OCR', type: 'line', smooth: true, data: ch.ocr,
          lineStyle: { width: 2, color: '#38bdf8' }
        },
        {
          id: 's-doc', name: '文书', type: 'line', smooth: true, data: ch.documents,
          lineStyle: { width: 2, color: '#818cf8' }
        }
      ],
      animationDuration: isUpdate ? 500 : 1000
    }, !isUpdate);

    var risks = data.risks || [];
    chartSet($('chart-risk'), {
      color: ['#34d399', '#fbbf24', '#f87171'],
      tooltip: { trigger: 'axis' },
      grid: grid({ left: 72, right: 24 }),
      xAxis: { type: 'value', minInterval: 1 },
      yAxis: {
        type: 'category',
        data: risks.map(function (r) { return r.label; }).reverse()
      },
      series: [{
        id: 'risk-bar', type: 'bar', data: risks.map(function (r) { return r.value; }).reverse(),
        barWidth: 14,
        itemStyle: {
          borderRadius: [0, 6, 6, 0],
          color: function (p) {
            var colors = ['#34d399', '#fbbf24', '#f87171'];
            return colors[p.dataIndex] || '#4f9cf9';
          }
        },
        label: { show: true, position: 'right', color: '#94a3b8' }
      }]
    }, !isUpdate);

    var pieData = (data.categories || []).map(function (c) {
      return { name: catLabel(c), value: c.value };
    });
    chartSet($('chart-pie'), {
      color: THEME.color,
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      series: [{
        id: 'category-pie', type: 'pie', radius: ['42%', '68%'], center: ['50%', '55%'],
        data: pieData.length ? pieData : [{ name: '暂无分类数据', value: 1 }],
        label: { color: '#94a3b8', fontSize: 10 },
        itemStyle: { borderColor: '#0c1528', borderWidth: 2 },
        animationType: isUpdate ? 'expansion' : 'scale'
      }]
    }, !isUpdate);

    var heatCats = (data.consultHotspots || []).slice().sort(function (a, b) { return b.value - a.value; });
    chartSet($('chart-heat'), {
      tooltip: { trigger: 'axis' },
      grid: grid({ left: 88, right: 16, top: 8, bottom: 8 }),
      xAxis: { type: 'value', show: false },
      yAxis: {
        type: 'category',
        data: heatCats.map(function (c) { return catLabel(c); }),
        axisLabel: { color: '#94a3b8', fontSize: 10 }
      },
      series: [{
        id: 'heat-bar', type: 'bar', data: heatCats.map(function (c) { return c.value; }),
        barWidth: 12,
        itemStyle: {
          borderRadius: [0, 8, 8, 0],
          color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: 'rgba(79,156,249,0.25)' },
            { offset: 1, color: '#4f9cf9' }
          ])
        }
      }]
    }, !isUpdate);

    var moduleUsage = (data.moduleUsage || []).slice().sort(function (a, b) { return b.value - a.value; });
    chartSet($('chart-module'), {
      tooltip: { trigger: 'axis' },
      grid: grid({ left: 92, right: 16, top: 8, bottom: 8 }),
      xAxis: { type: 'value', minInterval: 1 },
      yAxis: {
        type: 'category',
        data: moduleUsage.map(function (m) { return m.label || m.module; }),
        axisLabel: { color: '#94a3b8', fontSize: 10 }
      },
      series: [{
        id: 'module-bar', type: 'bar', data: moduleUsage.map(function (m) { return m.value; }),
        barWidth: 13,
        itemStyle: {
          borderRadius: [0, 8, 8, 0],
          color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: 'rgba(34,211,238,0.25)' },
            { offset: 1, color: '#22d3ee' }
          ])
        },
        label: { show: true, position: 'right', color: '#94a3b8' }
      }]
    }, !isUpdate);

    var words = (data.keywords || []).map(function (w) {
      return { name: w.name, value: Math.max(1, w.value) };
    });
    if ($('chart-word') && words.length) {
      chartSet($('chart-word'), {
        series: [{
          id: 'word-cloud', type: 'wordCloud', shape: 'circle',
          sizeRange: [11, 38],
          rotationRange: [-20, 20],
          gridSize: 6,
          textStyle: {
            color: function () {
              var palette = THEME.color || ['#4f9cf9'];
              return palette[Math.floor(Math.random() * palette.length)];
            }
          },
          data: words
        }]
      }, !isUpdate);
    }

    var rev = data.revision && data.revision.seq;
    if (rev != null) lastRevisionSeq = rev;
    setSyncStatus(true, '已同步 · ' + (data.serverTime || '').slice(11, 19));
  }

  function ingest(json) {
    if (!json || !json.success || !json.data) return;
    var safeData = dashboardDataValidator(json.data);
    var seq = (safeData.revision && safeData.revision.seq) || 0;
    var hadData = lastRevisionSeq >= 0;
    if (hadData && seq === lastRevisionSeq) return;
    applyData(safeData, hadData);
    lastRevisionSeq = seq;
  }

  function showOffline(show) {
    var el = $('datav-service-offline');
    if (el) el.classList.toggle('hidden', !show);
  }

  function checkDataService() {
    return fetch(HEALTH_URL + '?_=' + Date.now(), { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('health');
        return r.json();
      })
      .then(function (json) {
        if (!json || !json.success) throw new Error('invalid');
        showOffline(false);
        return true;
      })
      .catch(function () {
        return fetch(API + '?_=' + Date.now(), { cache: 'no-store' })
          .then(function (r) {
            if (!r.ok) throw new Error('realtime');
            return r.json();
          })
          .then(function (json) {
            if (!json || !json.success) throw new Error('invalid');
            showOffline(false);
            ingest(json);
            return true;
          });
      })
      .catch(function () {
        showOffline(true);
        setSyncStatus(false, '3002 未启动');
        var cached = window.FayiDatavStore && FayiDatavStore.loadSnapshot();
        if (cached) {
          applyData(cached, false);
          setSyncStatus(false, '离线缓存 · 等待 3002');
        }
        return false;
      });
  }

  function poll() {
    fetch(API + '?_=' + Date.now(), { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then(function (json) {
        ingest(json);
        showOffline(false);
      })
      .catch(function () {
        setSyncStatus(false, '3002 未连接');
        showOffline(true);
      });
  }

  function startDataFeeds() {
    if (feedsStarted) return;
    feedsStarted = true;
    poll();
    if (typeof EventSource !== 'undefined') {
      try {
        sse = new EventSource(SSE_URL);
        sse.addEventListener('update', function (ev) {
          try { ingest(JSON.parse(ev.data)); } catch (e) {}
        });
      } catch (e) { /* ignore */ }
    }
    pollTimer = setInterval(poll, POLL_MS);
  }

  function bindOfflinePanel() {
    var retry = $('btn-retry-service');
    if (retry) {
      retry.onclick = function () {
        checkDataService().then(function (ok) {
          if (ok) startDataFeeds();
        });
      };
    }
    var home = $('btn-offline-home');
    if (home) home.onclick = function () { window.location.href = '../index.html'; };
  }

  function getExitUrl() {
    try {
      var s = sessionStorage.getItem('datav-return');
      if (s && s.indexOf('datav') < 0) return s;
    } catch (e) {}
    if (document.referrer && document.referrer.indexOf('datav') < 0) return document.referrer;
    return '../index.html';
  }

  function exitDashboard() {
    document.body.classList.add('datav-exiting');
    setTimeout(function () { window.location.href = getExitUrl(); }, 380);
  }

  function bindToolbar() {
    if ($('btn-fs')) $('btn-fs').onclick = function () {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen();
      else document.exitFullscreen();
    };
    if ($('btn-exit')) $('btn-exit').onclick = exitDashboard;
    if ($('btn-home')) $('btn-home').onclick = function () {
      try { sessionStorage.setItem('datav-return', '../index.html'); } catch (e) {}
      exitDashboard();
    };
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (document.fullscreenElement) document.exitFullscreen();
      else exitDashboard();
    });
    document.addEventListener('fullscreenchange', function () {
      var b = $('btn-fs');
      if (b) b.textContent = document.fullscreenElement ? '退出全屏' : '全屏';
    });
  }

  function bindRealtimeSignals() {
    try {
      var ch = new BroadcastChannel(CHANNEL);
      ch.onmessage = function () { poll(); };
    } catch (e) {}
    window.addEventListener('storage', function (ev) {
      if (ev.key === 'fayi-dashboard-bump') poll();
    });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) poll();
    });
  }

  function logDatavVisit() {
    try {
      var dayKey = 'fayi_datav_visit_' + new Date().toDateString();
      if (sessionStorage.getItem(dayKey)) return;
      if (window.FayiActivity && FayiActivity.addActivityLog) {
        FayiActivity.addActivityLog({
          type: 'datav',
          title: '进入数字分析中心',
          description: '正在查看智慧法务数据驾驶舱',
          link: 'datav/index.html'
        });
        sessionStorage.setItem(dayKey, '1');
      }
    } catch (e) { /* ignore */ }
  }

  function boot() {
    document.body.classList.add('datav-entering');
    setTimeout(function () { document.body.classList.remove('datav-entering'); }, 600);
    bindToolbar();
    bindOfflinePanel();
    bindRealtimeSignals();
    tickClock();
    setInterval(tickClock, 1000);
    initParticles();
    scaleLayout();
    window.addEventListener('resize', scaleLayout);

    var cached = window.FayiDatavStore && FayiDatavStore.loadSnapshot();
    if (cached) applyData(cached, false);

    checkDataService().then(function (ok) {
      if (ok) {
        logDatavVisit();
        startDataFeeds();
      } else {
        setInterval(function () {
          checkDataService().then(function (again) {
            if (again && !feedsStarted) startDataFeeds();
          });
        }, 5000);
      }
    });
  }

  function waitReady() {
    if (window.echarts) boot();
    else window.addEventListener('load', boot);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitReady);
  } else {
    waitReady();
  }
})();

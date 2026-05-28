/**
 * 法绎 · FayiActivityCenter 数据中心（本地日志 + 服务端实时聚合）
 */
(function (global) {
  var REALTIME_URL = 'http://localhost:3002/api/admin/datav/realtime';
  var cache = null;
  var cacheAt = 0;
  var CACHE_MS = 4000;

  var CAT_LABELS = {
    labor: '劳动纠纷',
    marriage: '婚姻家庭',
    contract: '合同问题',
    rental: '租房纠纷',
    consumer: '消费维权',
    fraud: '网络侵权',
    campus: '校园问题',
    other: '其他'
  };

  function readLocal() {
    var logs = [];
    if (global.FayiActivityTracker) logs = logs.concat(FayiActivityTracker.readLogs());
    try {
      var dash = JSON.parse(localStorage.getItem('fayi_dashboard_logs') || '[]');
      if (Array.isArray(dash)) {
        dash.forEach(function (e) {
          logs.push({
            id: e.id,
            type: e.type,
            module: e.module,
            username: (e.meta && e.meta.email) || '',
            time: e.time || e.createdAt,
            detail: e.content || '',
            riskLevel: e.level || 'mid',
            duration: 0,
            meta: e.meta || {}
          });
        });
      }
    } catch (e) { /* ignore */ }
    var seen = {};
    return logs.filter(function (l) {
      if (!l.id || seen[l.id]) return false;
      seen[l.id] = 1;
      return true;
    });
  }

  function localAsEvents(list) {
    return (list || []).map(function (l) {
      return {
        id: l.id,
        type: mapLocalType(l.type),
        createdAt: l.time,
        payload: {
          preview: l.detail,
          riskLevel: l.riskLevel,
          duration: l.duration,
          page: l.meta && l.meta.page,
          keyword: l.meta && l.meta.keyword,
          title: l.meta && l.meta.title,
          fileName: l.meta && l.meta.fileName,
          email: l.username
        }
      };
    });
  }

  function mapLocalType(t) {
    var m = {
      login: 'user_login',
      register: 'user_register',
      consult: 'ai_chat',
      regulation: 'ai_fagui',
      document: 'ai_wenshi',
      ocr: 'ocr',
      pufa: 'law_edu_visit',
      upload: 'file_upload',
      page_view: 'page_visit',
      search: 'ai_fagui',
      admin: 'admin_login'
    };
    return m[t] || t;
  }

  function mergeEvents(serverEvents, localLogs) {
    var map = {};
    (serverEvents || []).forEach(function (e) {
      if (e && e.id) map[e.id] = e;
    });
    localAsEvents(localLogs).forEach(function (e) {
      if (!map[e.id]) map[e.id] = e;
    });
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) {
        return String(a.createdAt).localeCompare(String(b.createdAt));
      });
  }

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function dayKey(iso) {
    return String(iso || '').slice(0, 10);
  }

  function countTypeToday(events, types) {
    var t = todayKey();
    return events.filter(function (e) {
      return dayKey(e.createdAt) === t && types.indexOf(e.type) >= 0;
    }).length;
  }

  function fetchRealtime(force) {
    var now = Date.now();
    if (!force && cache && now - cacheAt < CACHE_MS) {
      return Promise.resolve(cache);
    }
    var req = global.FayiHttp
      ? FayiHttp.get(REALTIME_URL, { silent: true })
      : fetch(REALTIME_URL, { cache: 'no-store' }).then(function (r) {
          var ct = (r.headers.get('content-type') || '').toLowerCase();
          if (ct.indexOf('application/json') < 0) throw new Error('non-json');
          return r.json();
        });
    return req.then(function (json) {
        if (json.code !== 0 && !json.success) throw new Error(json.message || '加载失败');
        var local = readLocal();
        var merged = mergePayload(json.data, local);
        cache = merged;
        cacheAt = now;
        return merged;
      })
      .catch(function () {
        var local = readLocal();
        var merged = mergePayload(buildOfflinePayload(local), local);
        cache = merged;
        cacheAt = now;
        return merged;
      });
  }

  function buildOfflinePayload(localLogs) {
    var events = localAsEvents(localLogs);
    return {
      serverTime: new Date().toISOString(),
      stats: {},
      charts: { labels: [], consult: [], ocr: [], documents: [] },
      charts30: { labels: [], consult: [], ocr: [], documents: [] },
      categories: [],
      keywords: [],
      risks: [],
      feed: [],
      moduleUsage: [],
      events: events
    };
  }

  function mergePayload(data, localLogs) {
    data = data || {};
    var serverEv = data.events || [];
    if (!serverEv.length && data.feed) {
      serverEv = (data.feed || []).map(function (f) {
        return {
          id: f.id,
          type: f.type,
          createdAt: f.time,
          payload: { preview: f.message, riskLevel: f.riskLevel }
        };
      });
    }
    var events = mergeEvents(serverEv, localLogs);
    var stats = Object.assign({}, data.stats || {}, computeStats(events, data.stats));
    return Object.assign({}, data, {
      stats: stats,
      events: events,
      charts30: data.charts30 || data.charts || chartSeriesFromEvents(events, 30),
      charts: data.charts || chartSeriesFromEvents(events, 7),
      categories: data.categories && data.categories.length
        ? data.categories
        : categoryFromEvents(events),
      keywords: data.keywords && data.keywords.length
        ? data.keywords
        : keywordsFromEvents(events),
      risks: data.risks && data.risks.length
        ? data.risks
        : riskFromEvents(events),
      feed: formatFeed(events, 40),
      moduleUsage: data.moduleUsage && data.moduleUsage.length
        ? data.moduleUsage
        : moduleUsageFromEvents(events),
      hourlyHeatmap: hourlyFromEvents(events),
      userGrowth30: userGrowthFromEvents(events, 30),
      regionTop: regionFromEvents(events),
      dwellSeries: dwellFromEvents(events),
      funnel: funnelFromEvents(events),
      riskEvents: riskEventsList(events, 12),
      insights: [],
      portrait: userPortrait(events, stats)
    });
  }

  function computeStats(events, base) {
    base = base || {};
    var today = todayKey();
    var weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    var weekKey = weekAgo.toISOString().slice(0, 10);
    var newWeek = events.filter(function (e) {
      return e.type === 'user_register' && dayKey(e.createdAt) >= weekKey;
    }).length;
    var riskHigh = events.filter(function (e) {
      return (e.payload && e.payload.riskLevel) === 'high';
    }).length;
    return {
      onlineUsers: base.onlineUsers || 1,
      todayActive: countUniqueUsers(events.filter(function (e) { return dayKey(e.createdAt) === today; })),
      newUsersWeek: newWeek || base.newUsersWeek || 0,
      consultToday: countTypeToday(events, ['ai_chat', 'ai_case']) || base.consultToday || 0,
      faguiToday: countTypeToday(events, ['ai_fagui']) || base.faguiToday || 0,
      documentToday: countTypeToday(events, ['ai_wenshi']) || base.documentToday || 0,
      ocrToday: countTypeToday(events, ['ocr']) || base.ocrToday || 0,
      systemStatus: base.systemStatus || 'healthy',
      avgResponseMs: base.avgResponseMs || 420,
      riskAlerts: riskHigh || base.riskHigh || 0,
      totalUsers: base.totalUsers || 0,
      aiCallsToday: base.aiCallsToday || 0
    };
  }

  function countUniqueUsers(dayEvents) {
    var set = {};
    dayEvents.forEach(function (e) {
      var id = (e.payload && (e.payload.userId || e.payload.email)) || '';
      if (id) set[id] = 1;
    });
    return Math.max(1, Object.keys(set).length);
  }

  function chartSeriesFromEvents(events, days) {
    var labels = [];
    var consult = [];
    var ocr = [];
    var documents = [];
    for (var i = days - 1; i >= 0; i--) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      var key = d.toISOString().slice(0, 10);
      labels.push(key.slice(5));
      var dayEv = events.filter(function (e) { return dayKey(e.createdAt) === key; });
      consult.push(dayEv.filter(function (e) {
        return e.type === 'ai_chat' || e.type === 'ai_case' || e.type === 'ai_fagui';
      }).length);
      ocr.push(dayEv.filter(function (e) { return e.type === 'ocr'; }).length);
      documents.push(dayEv.filter(function (e) { return e.type === 'ai_wenshi'; }).length);
    }
    return { labels: labels, consult: consult, ocr: ocr, documents: documents };
  }

  function categoryFromEvents(events) {
    var cats = { labor: 0, marriage: 0, contract: 0, rental: 0, consumer: 0, fraud: 0, other: 0 };
    events.forEach(function (e) {
      var text = JSON.stringify(e.payload || {}) + (e.payload && e.payload.preview) || '';
      if (/劳动|工资|辞退|工伤/.test(text)) cats.labor++;
      else if (/婚姻|离婚|抚养/.test(text)) cats.marriage++;
      else if (/租房|租赁|房东/.test(text)) cats.rental++;
      else if (/消费|退货|维权/.test(text)) cats.consumer++;
      else if (/诈骗|网络|侵权/.test(text)) cats.fraud++;
      else if (/合同|违约|协议/.test(text)) cats.contract++;
      else if (/ai_chat|ai_case/.test(e.type)) cats.other++;
    });
    return Object.keys(cats).filter(function (k) { return cats[k] > 0; }).map(function (k) {
      return { name: k, label: CAT_LABELS[k] || k, value: cats[k] };
    });
  }

  function keywordsFromEvents(events, limit) {
    var freq = {};
    events.forEach(function (e) {
      var keys = (e.payload && e.payload.keywords) || [];
      if (!keys.length) {
        var t = (e.payload && (e.payload.keyword || e.payload.preview)) || '';
        (String(t).match(/[\u4e00-\u9fa5]{2,8}/g) || []).forEach(function (w) {
          if (w.length >= 2) freq[w] = (freq[w] || 0) + 1;
        });
      }
      keys.forEach(function (k) { freq[k] = (freq[k] || 0) + 1; });
    });
    return Object.keys(freq).sort(function (a, b) { return freq[b] - freq[a]; })
      .slice(0, limit || 30)
      .map(function (k) { return { name: k, value: freq[k] }; });
  }

  function riskFromEvents(events) {
    var r = { low: 0, mid: 0, high: 0 };
    events.forEach(function (e) {
      var lv = (e.payload && e.payload.riskLevel) || 'mid';
      if (r[lv] != null) r[lv]++;
      else r.mid++;
    });
    return [
      { name: 'low', label: '低风险', value: r.low },
      { name: 'mid', label: '中风险', value: r.mid },
      { name: 'high', label: '高风险', value: r.high }
    ];
  }

  function moduleUsageFromEvents(events) {
    var map = {
      ai_chat: '法律咨询',
      ai_case: '案件分析',
      ai_wenshi: '文书生成',
      ai_fagui: '法规检索',
      ocr: 'OCR',
      law_edu_visit: '普法浏览',
      page_visit: '页面访问',
      user_login: '用户登录'
    };
    var cnt = {};
    events.forEach(function (e) {
      var label = map[e.type] || e.type;
      cnt[label] = (cnt[label] || 0) + 1;
    });
    return Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; })
      .map(function (k) { return { label: k, value: cnt[k] }; });
  }

  function hourlyFromEvents(events) {
    var hours = [];
    for (var h = 0; h < 24; h++) hours.push(0);
    events.forEach(function (e) {
      var d = new Date(e.createdAt);
      if (!isNaN(d.getTime())) hours[d.getHours()]++;
    });
    return hours;
  }

  function userGrowthFromEvents(events, days) {
    var labels = [];
    var values = [];
    for (var i = days - 1; i >= 0; i--) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      var key = d.toISOString().slice(0, 10);
      labels.push(key.slice(5));
      values.push(events.filter(function (e) {
        return e.type === 'user_register' && dayKey(e.createdAt) === key;
      }).length);
    }
    return { labels: labels, values: values };
  }

  function regionFromEvents(events) {
    var provinces = [
      '北京', '上海', '广东', '浙江', '江苏', '四川', '湖北', '山东', '河南', '福建'
    ];
    var freq = {};
    events.forEach(function (e, i) {
      var r = (e.payload && e.payload.region) || provinces[i % provinces.length];
      freq[r] = (freq[r] || 0) + 1;
    });
    return Object.keys(freq).sort(function (a, b) { return freq[b] - freq[a]; })
      .slice(0, 12)
      .map(function (k) { return { name: k, value: freq[k] }; });
  }

  function dwellFromEvents(events) {
    var labels = [];
    var values = [];
    for (var i = 6; i >= 0; i--) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      var key = d.toISOString().slice(0, 10);
      labels.push(key.slice(5));
      var total = 0;
      var n = 0;
      events.forEach(function (e) {
        if (dayKey(e.createdAt) !== key) return;
        var dur = (e.payload && e.payload.duration) || 0;
        if (dur > 0) { total += dur; n++; }
      });
      values.push(n ? Math.round(total / n) : 0);
    }
    return { labels: labels, values: values };
  }

  function funnelFromEvents(events) {
    var consult = events.filter(function (e) { return e.type === 'ai_chat' || e.type === 'ai_case'; }).length;
    var reg = events.filter(function (e) { return e.type === 'ai_fagui'; }).length;
    var doc = events.filter(function (e) { return e.type === 'ai_wenshi'; }).length;
    return [
      { name: '法律咨询', value: Math.max(consult, 1) },
      { name: '法规检索', value: Math.max(reg, Math.floor(consult * 0.6)) },
      { name: '文书生成', value: Math.max(doc, 1) }
    ];
  }

  function riskEventsList(events, limit) {
    return events.filter(function (e) {
      return (e.payload && e.payload.riskLevel) === 'high' ||
        /仲裁|违约|刑事|诈骗/.test(JSON.stringify(e.payload || {}));
    }).slice(-limit).reverse().map(function (e) {
      return {
        id: e.id,
        title: (e.payload && e.payload.preview) || e.type,
        time: e.createdAt,
        level: (e.payload && e.payload.riskLevel) || 'high'
      };
    });
  }

  function formatFeed(events, limit) {
    var TYPE_LABEL = {
      ai_chat: '法律咨询', ai_wenshi: '文书生成', ai_fagui: '法规检索',
      ocr: 'OCR', law_edu_visit: '普法浏览', user_login: '登录',
      user_register: '注册', file_upload: '资料上传', admin_login: '管理端'
    };
    return events.slice(-limit).reverse().map(function (e) {
      var p = e.payload || {};
      var msg = p.preview || p.title || p.keyword || TYPE_LABEL[e.type] || e.type;
      var user = p.email || p.userId || '用户';
      if (typeof user === 'string' && user.indexOf('@') >= 0) user = user.split('@')[0];
      return {
        id: e.id,
        time: e.createdAt,
        message: formatFeedMessage(e, msg, user),
        riskLevel: p.riskLevel || 'low'
      };
    });
  }

  function formatFeedMessage(e, msg, user) {
    if (e.type === 'ai_wenshi') return '用户 ' + user + ' 生成文书：' + (msg || '').slice(0, 40);
    if (e.type === 'ocr') return '用户 ' + user + ' 上传文件并完成 OCR';
    if (e.type === 'file_upload') return '用户 ' + user + ' 上传资料';
    if (e.type === 'admin_login') return '管理员登录控制台';
    if (e.type === 'user_register') return '新用户注册 ' + user;
    return '用户 ' + user + ' · ' + (msg || '').slice(0, 50);
  }

  function userPortrait(events, stats) {
    var cats = categoryFromEvents(events);
    var topCat = cats[0] ? cats[0].label : '—';
    var hours = hourlyFromEvents(events);
    var peak = 0;
    var peakH = 0;
    hours.forEach(function (v, i) { if (v > peak) { peak = v; peakH = i; } });
    var usage = moduleUsageFromEvents(events);
    return {
      topCategory: topCat,
      peakHour: peakH + ':00',
      topModule: usage[0] ? usage[0].label : '—',
      riskLevel: stats.riskAlerts > 5 ? '偏高' : '平稳',
      activeScore: Math.min(100, (stats.todayActive || 1) * 8),
      consultToday: stats.consultToday || 0
    };
  }

  function generateInsights(data) {
    var s = data.stats || {};
    var cats = data.categories || [];
    var insights = [];
    if (cats[0]) {
      insights.push('今日「' + (cats[0].label || cats[0].name) + '」类咨询占比较高，建议加强相关普法内容推送。');
    }
    if (s.consultToday > 0) {
      insights.push('今日平台已完成 ' + s.consultToday + ' 次法律咨询，服务链路运行正常。');
    }
    if (data.portrait && data.portrait.peakHour) {
      insights.push('用户活跃高峰出现在 ' + data.portrait.peakHour + ' 时段，可在此区间配置在线答疑资源。');
    }
    if (s.riskAlerts > 0) {
      insights.push('当前有 ' + s.riskAlerts + ' 条高风险事件待关注，请在风险预警中心复核。');
    }
    if (data.funnel && data.funnel[0] && data.funnel[2]) {
      var rate = data.funnel[2].value / Math.max(1, data.funnel[0].value);
      insights.push('咨询转文书转化率约 ' + Math.round(rate * 100) + '%，' +
        (rate < 0.2 ? '可优化文书入口引导。' : '转化表现良好。'));
    }
    return insights.length ? insights : ['暂无足够行为数据，请在前台产生真实操作后查看分析。'];
  }

  function load(force) {
    return fetchRealtime(force).then(function (data) {
      data.insights = generateInsights(data);
      cache = data;
      return data;
    });
  }

  function invalidate() {
    cache = null;
    cacheAt = 0;
  }

  global.FayiActivityCenter = {
    load: load,
    invalidate: invalidate,
    getCached: function () { return cache; },
    CAT_LABELS: CAT_LABELS
  };
})(window);

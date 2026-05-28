/**
 * 法绎运营后台 · 统一数据中心
 * 所有页面通过 OpsDataCenter 读取/订阅数据，禁止各页单独拼接口
 */
window.OpsDataCenter = (function () {
  var CACHE_MS = 5000;
  var state = {
    realtime: null,
    users: null,
    consultations: null,
    documents: null,
    ocr: null,
    regulations: null,
    regulationHeat: null,
    lawEducation: null,
    operationOverview: null,
    funnelData: null,
    hotIssuesList: null,
    contentStats: null,
    channelStats: null,
    operationLoading: false,
    riskOverview: null,
    riskList: null,
    currentRiskDetail: null,
    riskTrendData: null,
    realtimeRiskFeed: null,
    riskLoading: false,
    analyticsDashboard: null,
    risks: null,
    logs: null,
    logList: [],
    logOverview: null,
    currentLogDetail: null,
    logLoading: false,
    systemSettings: null,
    aiSettings: null,
    dataSettings: null,
    securitySettings: null,
    settingsLoading: false,
    loadedAt: 0
  };
  var listeners = [];
  var pollTimer = null;
  var wsBound = false;

  function unwrap(res) {
    if (!res) return null;
    return res.data != null ? res.data : res;
  }

  function notify() {
    var snap = get();
    listeners.forEach(function (fn) {
      try { fn(snap); } catch (e) { console.warn('[OpsDataCenter]', e); }
    });
  }

  function get() {
    return {
      realtime: state.realtime,
      stats: state.realtime && state.realtime.stats,
      users: state.users,
      consultations: state.consultations,
      documents: state.documents,
      ocr: state.ocr,
      regulations: state.regulations,
      regulationHeat: state.regulationHeat ||
        (state.realtime && state.realtime.regulationHeat) || [],
      lawEducation: state.lawEducation,
      operationOverview: state.operationOverview,
      funnelData: state.funnelData,
      hotIssuesList: state.hotIssuesList,
      contentStats: state.contentStats,
      channelStats: state.channelStats,
      operationLoading: state.operationLoading,
      riskOverview: state.riskOverview,
      riskList: state.riskList,
      currentRiskDetail: state.currentRiskDetail,
      riskTrendData: state.riskTrendData,
      realtimeRiskFeed: state.realtimeRiskFeed,
      riskLoading: state.riskLoading,
      analyticsDashboard: state.analyticsDashboard,
      risks: state.risks,
      logs: state.logs,
      logList: state.logList,
      logOverview: state.logOverview,
      currentLogDetail: state.currentLogDetail,
      logLoading: state.logLoading,
      systemSettings: state.systemSettings,
      aiSettings: state.aiSettings,
      dataSettings: state.dataSettings,
      securitySettings: state.securitySettings,
      settingsLoading: state.settingsLoading,
      feed: state.realtime && state.realtime.feed,
      insights: state.realtime && state.realtime.insights,
      keywords: state.realtime && state.realtime.keywords,
      categories: state.realtime && state.realtime.categories,
      charts30: state.realtime && state.realtime.charts30,
      userGrowth30: state.realtime && state.realtime.userGrowth30,
      hourlyHeatmap: state.realtime && state.realtime.hourlyHeatmap,
      moduleUsage: state.realtime && state.realtime.moduleUsage,
      risksBreakdown: state.realtime && state.realtime.risks,
      riskEvents: state.realtime && state.realtime.riskEvents,
      publicity: state.realtime && state.realtime.publicity,
      loadedAt: state.loadedAt
    };
  }

  function loadRealtime(force) {
    if (!window.OpsActivityCenter) {
      return Promise.reject(new Error('FayiActivityCenter 未加载'));
    }
    return OpsActivityCenter.load(!!force).then(function (data) {
      state.realtime = data;
      state.loadedAt = Date.now();
      return data;
    });
  }

  function loadUsers(q) {
    if (!window.FayiAdminApi) return Promise.resolve(null);
    q = q || {};
    return FayiAdminApi.users(q).then(function (res) {
      state.users = unwrap(res);
      return state.users;
    });
  }

  function loadConsultations(q) {
    q = q || {};
    return FayiAdminApi.consultations(q).then(function (res) {
      state.consultations = unwrap(res);
      return state.consultations;
    });
  }

  function loadConsultationStatistics() {
    if (!window.FayiAdminApi || !FayiAdminApi.consultationStatistics) {
      return Promise.resolve({
        total: 0,
        todayCount: 0,
        processedCount: 0,
        pendingCount: 0,
        convertedCount: 0
      });
    }
    return FayiAdminApi.consultationStatistics().then(function (res) {
      return unwrap(res) || {
        total: 0,
        todayCount: 0,
        processedCount: 0,
        pendingCount: 0,
        convertedCount: 0
      };
    });
  }

  function loadDocuments(q) {
    return FayiAdminApi.documents(q || {}).then(function (res) {
      state.documents = unwrap(res);
      return state.documents;
    }).catch(function (err) {
      console.error('documents list load failed', err);
      return { list: [], total: 0, page: 1, pageSize: 15, totalPages: 1 };
    });
  }

  function loadDocumentStatistics() {
    if (!window.FayiAdminApi || !FayiAdminApi.documentStatistics) {
      return Promise.resolve({
        total: 0,
        todayCount: 0,
        processingCount: 0,
        completedCount: 0,
        pendingReviewCount: 0
      });
    }
    return FayiAdminApi.documentStatistics().then(function (res) {
      return Object.assign({
        total: 0,
        todayCount: 0,
        processingCount: 0,
        completedCount: 0,
        pendingReviewCount: 0
      }, unwrap(res) || {});
    });
  }

  function documentDetail(id) {
    return FayiAdminApi.documentDetail(id).then(function (res) { return unwrap(res); });
  }

  function updateDocument(id, data) {
    return FayiAdminApi.updateDocument(id, data).then(function (res) { return unwrap(res); });
  }

  function regenerateDocument(id) {
    return FayiAdminApi.regenerateDocument(id).then(function (res) { return unwrap(res); });
  }

  function deleteDocument(id) {
    return FayiAdminApi.deleteDocument(id).then(function (r) {
      invalidate('/documents');
      return loadDocuments({ page: 1, pageSize: 15 }).then(function () { return r; });
    });
  }

  function loadOcr(q) {
    var p1 = FayiAdminApi.ocrList(q || {}).catch(function (err) {
      console.error('ocr list load failed', err);
      return { list: [], total: 0, page: 1, pageSize: 15 };
    });
    var p2 = FayiAdminApi.ocrStats().catch(function () { return {}; });
    return Promise.all([p1, p2]).then(function (arr) {
      var listData = unwrap(arr[0]) || { list: [], total: 0 };
      state.ocr = { list: listData.list || [], stats: unwrap(arr[1]), total: listData.total, page: listData.page, pageSize: listData.pageSize, totalPages: listData.totalPages };
      return state.ocr;
    });
  }

  function ocrDetail(id) {
    return FayiAdminApi.ocrDetail(id).then(function (res) { return unwrap(res); });
  }

  function loadRegulations() {
    return loadRegulationList({ page: 1, pageSize: 500 }).then(function (data) {
      state.regulations = (data && data.list) ? data.list : [];
      return state.regulations;
    });
  }

  function loadRegulationList(q, reqOpts) {
    return FayiAdminApi.regulationList(q || {}, reqOpts).then(function (res) {
      var data = unwrap(res) || { list: [], total: 0 };
      state.regulations = data.list || [];
      state.regulationStats = data.statistics || state.regulationStats;
      return data;
    }).catch(function (err) {
      console.error('regulation list load failed', err);
      return { list: [], total: 0, page: 1, pageSize: 20, totalPages: 1 };
    });
  }

  function loadRegulationStatistics(reqOpts) {
    if (!FayiAdminApi.regulationStatistics) {
      return loadRegulationList({ page: 1, pageSize: 1 }, reqOpts).then(function (data) {
        return { total: data.total, totalRegulations: data.totalRegulations || data.total };
      });
    }
    return FayiAdminApi.regulationStatistics(reqOpts).then(function (res) {
      var data = unwrap(res) || {};
      state.regulationStats = data;
      return data;
    });
  }

  function regulationDetail(id, reqOpts) {
    return FayiAdminApi.regulationDetail(id, reqOpts).then(function (res) { return unwrap(res); });
  }

  function loadRegulationHeat() {
    return FayiAdminApi.regulationHeat().then(function (res) {
      state.regulationHeat = unwrap(res) || [];
      return state.regulationHeat;
    });
  }

  function applyOperationDashboard(data) {
    data = data || {};
    state.operationOverview = data.overview || null;
    state.funnelData = data.funnel || null;
    state.hotIssuesList = data.hotIssues || [];
    state.contentStats = data.contentStats || [];
    state.channelStats = data.channelStats || [];
    state.operationLoading = false;
    return data;
  }

  function loadOperationDashboardFallback(reqOpts) {
    reqOpts = reqOpts || {};
    var tasks = [
      loadRealtime(!!reqOpts.force),
      loadConsultations({ page: 1, pageSize: 80 }, reqOpts),
      loadLawEducation()
    ];
    return Promise.all(tasks).then(function () {
      var data = window.OpsOperationFallback
        ? OpsOperationFallback.buildFromSnap(get())
        : {};
      return applyOperationDashboard(data);
    });
  }

  function loadOperationDashboard(reqOpts) {
    state.operationLoading = true;
    if (!FayiAdminApi.operationDashboard) {
      return loadOperationDashboardFallback(reqOpts);
    }
    return FayiAdminApi.operationDashboard(reqOpts).then(function (res) {
      return applyOperationDashboard(unwrap(res) || {});
    }).catch(function (err) {
      console.warn('operation dashboard API failed, using fallback', err);
      return FayiAdminApi.operationOverview(reqOpts).then(function (ovRes) {
        var overview = unwrap(ovRes);
        return Promise.all([
          FayiAdminApi.operationFunnel(reqOpts).catch(function () { return null; }),
          FayiAdminApi.operationHotIssues(15, reqOpts).catch(function () { return null; }),
          loadLawEducation()
        ]).then(function (arr) {
          var funnel = unwrap(arr[0]);
          var hot = unwrap(arr[1]);
          var articles = (state.lawEducation && state.lawEducation.articles) || [];
          var contentStats = window.OpsOperationFallback
            ? OpsOperationFallback.articlesToContentStats(articles)
            : [];
          return applyOperationDashboard({
            overview: overview,
            funnel: funnel,
            hotIssues: hot || [],
            contentStats: contentStats,
            channelStats: window.OpsOperationFallback
              ? OpsOperationFallback.buildChannelsFromSnap(get())
              : [],
            updatedAt: new Date().toISOString(),
            _partial: true
          });
        });
      }).catch(function () {
        return loadOperationDashboardFallback(reqOpts);
      });
    });
  }

  function loadLawEducation() {
    var p1 = FayiAdminApi.lawStats().catch(function () { return {}; });
    var p2 = FayiAdminApi.lawArticles({}).catch(function () { return []; });
    return Promise.all([p1, p2]).then(function (arr) {
      state.lawEducation = {
        stats: unwrap(arr[0]) || {},
        articles: unwrap(arr[1]) || []
      };
      return state.lawEducation;
    });
  }

  function loadAnalyticsDashboard(days, reqOpts) {
    if (!FayiAdminApi.analyticsDashboard) {
      return Promise.resolve({});
    }
    return FayiAdminApi.analyticsDashboard(days || 30, reqOpts).then(function (res) {
      var data = unwrap(res) || {};
      state.analyticsDashboard = data;
      return data;
    }).catch(function (err) {
      console.error('analytics dashboard load failed', err);
      return {};
    });
  }

  function analyticsOverviewFallback(days, reqOpts) {
    return loadAnalyticsDashboard(days, reqOpts).then(function (charts) {
      var data = {
        charts: charts,
        insights: {},
        correlation: {},
        prediction: {},
        anomaly: [],
        chartInsights: {}
      };
      state.analyticsOverview = data;
      return data;
    });
  }

  function isAnalyticsOverviewMissing(err) {
    return err && (err.status === 404 ||
      (err.message && String(err.message).indexOf('接口不存在') >= 0));
  }

  function loadAnalyticsOverview(days, reqOpts) {
    if (!FayiAdminApi.analyticsOverview) {
      return analyticsOverviewFallback(days, reqOpts);
    }
    return FayiAdminApi.analyticsOverview(days || 30, reqOpts).then(function (res) {
      var data = unwrap(res) || {};
      state.analyticsOverview = data;
      state.analyticsDashboard = data.charts || data;
      return data;
    }).catch(function (err) {
      if (isAnalyticsOverviewMissing(err)) {
        console.warn('analytics overview 不可用，已降级为 dashboard 接口');
        return analyticsOverviewFallback(days, reqOpts);
      }
      console.error('analytics overview load failed', err);
      return {};
    });
  }

  function loadRisks(q) {
    return FayiAdminApi.risks(q || {}).then(function (res) {
      state.risks = unwrap(res);
      return state.risks;
    });
  }

  function emptyRiskOverview() {
    return {
      totalRisk: 0,
      highRisk: 0,
      mediumRisk: 0,
      lowRisk: 0,
      unresolvedRisk: 0,
      total: 0,
      pending: 0,
      processing: 0,
      resolved: 0,
      todayNew: 0
    };
  }

  function loadRiskDashboard(reqOpts) {
    state.riskLoading = true;
    if (!FayiAdminApi.riskOverview) {
      state.riskLoading = false;
      state.riskOverview = emptyRiskOverview();
      state.riskList = [];
      state.risks = { list: [], total: 0 };
      return Promise.resolve({
        overview: state.riskOverview,
        list: { list: [], total: 0, page: 1, pageSize: 20, totalPages: 1 },
        statistics: null,
        realtime: []
      });
    }
    return Promise.all([
      FayiAdminApi.riskOverview(reqOpts),
      FayiAdminApi.riskList({ page: 1, pageSize: 20 }, reqOpts),
      FayiAdminApi.riskStatistics('week', reqOpts),
      FayiAdminApi.riskRealtime(15, reqOpts)
    ]).then(function (arr) {
      state.riskOverview = unwrap(arr[0]) || emptyRiskOverview();
      var listData = unwrap(arr[1]) || { list: [], total: 0 };
      state.riskList = listData.list || [];
      state.risks = { list: state.riskList, total: listData.total || 0 };
      state.riskTrendData = unwrap(arr[2]);
      state.realtimeRiskFeed = unwrap(arr[3]) || [];
      state.riskLoading = false;
      return {
        overview: state.riskOverview,
        list: listData,
        statistics: state.riskTrendData,
        realtime: state.realtimeRiskFeed
      };
    }).catch(function (err) {
      state.riskLoading = false;
      console.error('risk dashboard load failed', err);
      state.riskOverview = emptyRiskOverview();
      state.riskList = [];
      state.risks = { list: [], total: 0 };
      return {
        overview: state.riskOverview,
        list: { list: [], total: 0, page: 1, pageSize: 20, totalPages: 1 },
        statistics: null,
        realtime: []
      };
    });
  }

  function loadRiskList(q, reqOpts) {
    if (!FayiAdminApi.riskList) {
      state.riskList = [];
      return Promise.resolve({ list: [], total: 0 });
    }
    return FayiAdminApi.riskList(q || {}, reqOpts).then(function (res) {
      var data = unwrap(res) || { list: [], total: 0 };
      state.riskList = data.list || [];
      state.risks = { list: state.riskList, total: data.total };
      return data;
    }).catch(function (err) {
      console.error('risk list load failed', err);
      state.riskList = [];
      return { list: [], total: 0 };
    });
  }

  function loadRiskDetail(id, reqOpts) {
    if (!FayiAdminApi.riskDetail) {
      state.currentRiskDetail = null;
      return Promise.resolve(null);
    }
    return FayiAdminApi.riskDetail(id, reqOpts).then(function (res) {
      state.currentRiskDetail = unwrap(res);
      return state.currentRiskDetail;
    }).catch(function (err) {
      console.error('risk detail load failed', err);
      state.currentRiskDetail = null;
      return null;
    });
  }

  function emptyLogOverview() {
    return {
      totalLogs: 0,
      todayCount: 0,
      successCount: 0,
      failedCount: 0,
      topModuleLabel: '—'
    };
  }

  function loadLogDashboard(reqOpts) {
    state.logLoading = true;
    if (!FayiAdminApi.logsOverview) {
      state.logLoading = false;
      state.logOverview = emptyLogOverview();
      state.logList = [];
      return Promise.resolve({
        overview: state.logOverview,
        list: { list: [], total: 0, page: 1, pageSize: 20, totalPages: 1 }
      });
    }
    return Promise.all([
      FayiAdminApi.logsOverview(reqOpts),
      FayiAdminApi.logsList({ page: 1, pageSize: 20 }, reqOpts)
    ]).then(function (arr) {
      state.logOverview = unwrap(arr[0]) || emptyLogOverview();
      var listData = unwrap(arr[1]) || { list: [], total: 0 };
      state.logList = listData.list || [];
      state.logs = state.logList;
      state.logLoading = false;
      return { overview: state.logOverview, list: listData };
    }).catch(function (err) {
      state.logLoading = false;
      console.error('log dashboard load failed', err);
      state.logOverview = emptyLogOverview();
      state.logList = [];
      return {
        overview: state.logOverview,
        list: { list: [], total: 0, page: 1, pageSize: 20, totalPages: 1 }
      };
    });
  }

  function loadLogList(q, reqOpts) {
    if (!FayiAdminApi.logsList) {
      return Promise.resolve({ list: [], total: 0 });
    }
    return FayiAdminApi.logsList(q || {}, reqOpts).then(function (res) {
      var data = unwrap(res) || { list: [], total: 0 };
      state.logList = data.list || [];
      state.logs = state.logList;
      return data;
    }).catch(function () {
      return { list: [], total: 0 };
    });
  }

  function loadLogDetail(id, reqOpts) {
    if (!FayiAdminApi.logsDetail) return Promise.resolve(null);
    return FayiAdminApi.logsDetail(id, reqOpts).then(function (res) {
      state.currentLogDetail = unwrap(res);
      return state.currentLogDetail;
    }).catch(function () {
      return null;
    });
  }

  function loadLogs() {
    return loadLogDashboard();
  }

  function loadSettingsAll(reqOpts) {
    state.settingsLoading = true;
    if (!FayiAdminApi.settingsAll) {
      state.settingsLoading = false;
      return Promise.resolve({});
    }
    return FayiAdminApi.settingsAll(reqOpts).then(function (res) {
      var data = unwrap(res) || {};
      state.systemSettings = data.system || null;
      state.aiSettings = data.ai || null;
      state.dataSettings = data.data || null;
      state.securitySettings = data.security || null;
      state.settingsLoading = false;
      return data;
    }).catch(function (err) {
      state.settingsLoading = false;
      console.error('settings load failed', err);
      return {};
    });
  }

  function updateSettingsModule(module, patch) {
    if (!FayiAdminApi.settingsUpdate) {
      return Promise.reject(new Error('settings API 不可用'));
    }
    return FayiAdminApi.settingsUpdate(module, patch).then(function (res) {
      var data = unwrap(res);
      if (module === 'system') state.systemSettings = data;
      if (module === 'ai') state.aiSettings = data;
      if (module === 'data') state.dataSettings = data;
      if (module === 'security') state.securitySettings = data;
      invalidate('/settings');
      return res;
    });
  }

  function refreshAll(force) {
    var now = Date.now();
    if (!force && state.loadedAt && now - state.loadedAt < CACHE_MS && state.realtime) {
      return Promise.resolve(get());
    }
    return loadRealtime(force).then(function () {
      notify();
      return get();
    });
  }

  function loadPageBundle(pageId) {
    var tasks = [];
    if (pageId === 'dashboard' || pageId === 'analytics') {
      return loadRealtime(false).then(function () {
        notify();
        return get();
      });
    }
    if (pageId === 'users') tasks.push(loadUsers({ page: 1, pageSize: 50 }));
    if (pageId === 'risks') tasks.push(loadRisks({ limit: 40 }));
    if (pageId === 'law-education') tasks.push(loadLawEducation());
    if (pageId === 'logs') tasks.push(loadLogDashboard());
    if (pageId === 'settings') tasks.push(loadSettingsAll());
    if (!tasks.length) {
      return loadRealtime(false).then(function () {
        notify();
        return get();
      });
    }
    return Promise.all(tasks).then(function () {
      return loadRealtime(false);
    }).then(function () {
      notify();
      return get();
    });
  }

  function refreshRealtime(force) {
    return loadRealtime(force).then(function () {
      notify();
      return get();
    });
  }

  function subscribe(fn) {
    if (typeof fn === 'function') listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (f) { return f !== fn; });
    };
  }

  function bindRealtime() {
    if (wsBound || !window.OpsActivityCenter || !OpsActivityCenter.onRealtime) return;
    wsBound = true;
    OpsActivityCenter.onRealtime(function (data) {
      state.realtime = data;
      state.loadedAt = Date.now();
      notify();
    });
  }

  function init(opts) {
    opts = opts || {};
    bindRealtime();
    if (opts.pollMs) {
      pollTimer = setInterval(function () { refreshRealtime(true); }, opts.pollMs);
    }
    return loadRealtime(false).then(function () {
      notify();
      return get();
    });
  }

  function userDetail(id) {
    return FayiAdminApi.userDetail(id).then(function (res) { return unwrap(res); });
  }

  function consultationDetail(id) {
    return FayiAdminApi.consultationDetail(id).then(function (res) { return unwrap(res); });
  }

  function setConsultationNote(id, note) {
    return FayiAdminApi.setConsultationNote(id, note).then(function (r) {
      return loadConsultationStatistics().then(function () { return r; });
    });
  }

  function setUserStatus(id, status) {
    return FayiAdminApi.setUserStatus(id, status).then(function (r) {
      invalidate('/users');
      return loadUsers({ page: 1, pageSize: 50 }).then(function () { return r; });
    });
  }

  function setUserTags(id, tags) {
    return FayiAdminApi.setUserTags(id, tags).then(function (r) {
      invalidate('/users');
      return loadUsers({ page: 1, pageSize: 50 }).then(function () { return r; });
    });
  }

  function invalidate(prefix) {
    state.loadedAt = 0;
    if (window.OpsRuntime && OpsRuntime.invalidate) {
      OpsRuntime.invalidate(prefix || '');
    }
    if (window.OpsActivityCenter && OpsActivityCenter.invalidate) {
      OpsActivityCenter.invalidate();
    }
  }

  function dispose() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    listeners = [];
  }

  return {
    init: init,
    get: get,
    subscribe: subscribe,
    refreshAll: refreshAll,
    loadPageBundle: loadPageBundle,
    refreshRealtime: refreshRealtime,
    loadRealtime: loadRealtime,
    loadUsers: loadUsers,
    loadConsultations: loadConsultations,
    loadConsultationStatistics: loadConsultationStatistics,
    loadDocuments: loadDocuments,
    loadDocumentStatistics: loadDocumentStatistics,
    documentDetail: documentDetail,
    updateDocument: updateDocument,
    regenerateDocument: regenerateDocument,
    deleteDocument: deleteDocument,
    loadOcr: loadOcr,
    ocrDetail: ocrDetail,
    loadRegulations: loadRegulations,
    loadRegulationList: loadRegulationList,
    loadRegulationStatistics: loadRegulationStatistics,
    loadOperationDashboard: loadOperationDashboard,
    regulationDetail: regulationDetail,
    loadRegulationHeat: loadRegulationHeat,
    loadLawEducation: loadLawEducation,
    loadRisks: loadRisks,
    loadRiskDashboard: loadRiskDashboard,
    loadRiskList: loadRiskList,
    loadRiskDetail: loadRiskDetail,
    loadAnalyticsDashboard: loadAnalyticsDashboard,
    loadAnalyticsOverview: loadAnalyticsOverview,
    loadLogs: loadLogs,
    loadLogDashboard: loadLogDashboard,
    loadLogList: loadLogList,
    loadLogDetail: loadLogDetail,
    loadSettingsAll: loadSettingsAll,
    updateSettingsModule: updateSettingsModule,
    userDetail: userDetail,
    consultationDetail: consultationDetail,
    setConsultationNote: setConsultationNote,
    setUserStatus: setUserStatus,
    setUserTags: setUserTags,
    invalidate: invalidate,
    dispose: dispose
  };
})();

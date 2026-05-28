/**
 * 页面空闲时预取相邻模块轻量数据
 */
window.OpsPrefetch = (function () {
  var timer = null;
  var MAP = {
    dashboard: [
      function () { return OpsDataCenter.loadConsultationStatistics && OpsDataCenter.loadConsultationStatistics(); },
      function () { return OpsDataCenter.loadDocumentStatistics && OpsDataCenter.loadDocumentStatistics(); }
    ],
    consultations: [
      function () { return OpsDataCenter.loadDocumentStatistics && OpsDataCenter.loadDocumentStatistics(); }
    ],
    documents: [
      function () { return OpsDataCenter.loadConsultationStatistics && OpsDataCenter.loadConsultationStatistics(); }
    ],
    ocr: [
      function () { return OpsDataCenter.loadRegulationList && OpsDataCenter.loadRegulationList({ page: 1, pageSize: 5 }); }
    ],
    regulations: [
      function () { return OpsDataCenter.loadOcr && OpsDataCenter.loadOcr({ page: 1, pageSize: 5 }); }
    ],
    'law-education': [
      function () { return OpsDataCenter.loadConsultationStatistics && OpsDataCenter.loadConsultationStatistics(); }
    ],
    analytics: [
      function () { return OpsDataCenter.loadRiskDashboard && OpsDataCenter.loadRiskDashboard({ force: false }); }
    ],
    users: [
      function () { return OpsDataCenter.loadConsultationStatistics && OpsDataCenter.loadConsultationStatistics(); }
    ]
  };

  function schedule(pageId) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      var jobs = MAP[pageId] || [];
      jobs.forEach(function (fn, i) {
        setTimeout(function () {
          try {
            var p = fn();
            if (p && p.catch) p.catch(function () {});
          } catch (e) { /* ignore */ }
        }, i * 400);
      });
    }, 1200);
  }

  return { schedule: schedule };
})();

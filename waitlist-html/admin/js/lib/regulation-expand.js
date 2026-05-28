/**
 * 法规库兜底：后端不足 100 条时触发服务端种子初始化
 */
window.OpsRegulationExpand = (function () {
  var MIN_TOTAL = 100;

  function ensureCatalog() {
    if (!window.FayiAdminApi || !FayiAdminApi.regulationList) {
      return Promise.resolve({ expanded: false });
    }
    return FayiAdminApi.regulationList({ page: 1, pageSize: 1 }, { force: true }).then(function (res) {
      var data = res && res.data != null ? res.data : res;
      var total = (data && data.total) || (data && data.totalRegulations) || 0;
      if (total >= MIN_TOTAL) return { expanded: false, total: total };
      if (!FayiAdminApi.regulationBatchInit) {
        return { expanded: false, total: total, source: 'generated_seed_skipped' };
      }
      return FayiAdminApi.regulationBatchInit().then(function (initRes) {
        var initData = initRes && initRes.data != null ? initRes.data : initRes;
        return {
          expanded: true,
          total: (initData && initData.total) || MIN_TOTAL,
          source: 'catalog_seed'
        };
      });
    });
  }

  return { ensureCatalog: ensureCatalog, MIN_TOTAL: MIN_TOTAL };
})();

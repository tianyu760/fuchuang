/**
 * 运营后台 · 系统日志埋点快捷方法
 */
window.OpsSystemLog = (function () {
  function log(opts) {
    if (!window.FayiSystemLog || !FayiSystemLog.logAction) return Promise.resolve();
    return FayiSystemLog.logAction(opts);
  }

  return {
    view: function (module, name, targetId, desc) {
      return log({
        actionType: 'query',
        module: module,
        actionName: name || '查看详情',
        targetId: targetId || '',
        description: desc || name
      });
    },
    create: function (module, name, targetId, desc, req, res) {
      return log({
        actionType: 'create',
        module: module,
        actionName: name,
        targetId: targetId || '',
        description: desc,
        requestData: req,
        responseData: res
      });
    },
    update: function (module, name, targetId, desc, req, res) {
      return log({
        actionType: 'update',
        module: module,
        actionName: name,
        targetId: targetId || '',
        description: desc,
        requestData: req,
        responseData: res
      });
    },
    export: function (module, name, targetId, desc) {
      return log({
        actionType: 'create',
        module: module,
        actionName: name || '导出PDF',
        targetId: targetId || '',
        description: desc
      });
    }
  };
})();

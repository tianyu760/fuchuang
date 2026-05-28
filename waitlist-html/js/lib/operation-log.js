/**
 * 法绎 · 数字大屏统一操作日志
 * createOperationLog(type, module, content, level)
 * 写入 localStorage（dashboard_logs）并同步至 3002 事件流
 */
(function (global) {
  var STORAGE_KEY = 'fayi_dashboard_logs';
  var MAX_LOGS = 500;
  var API_BASE = 'http://localhost:3002';

  var TYPE_TO_EVENT = {
    consult: 'ai_chat',
    case: 'ai_case',
    document: 'ai_wenshi',
    law_search: 'ai_fagui',
    ocr: 'ocr',
    pufa: 'law_edu_visit',
    upload: 'file_upload',
    page: 'page_visit',
    login: 'user_login',
    register: 'user_register'
  };

  var MODULE_LABEL = {
    consult: '法律咨询',
    case: '案件分析',
    document: '文书生成',
    regulation: '法规检索',
    ocr: 'OCR识别',
    pufa: '普法学习',
    upload: '资料上传',
    page: '页面访问',
    auth: '用户认证',
    system: '系统'
  };

  function normalizeLevel(level) {
    var lv = String(level || 'mid').toLowerCase();
    if (lv === '低' || lv === 'low') return 'low';
    if (lv === '高' || lv === 'high') return 'high';
    if (lv === '中' || lv === 'mid' || lv === 'medium') return 'mid';
    return lv === 'low' || lv === 'high' ? lv : 'mid';
  }

  function riskLabel(level) {
    var map = { low: '低风险', mid: '中风险', high: '高风险' };
    return map[normalizeLevel(level)] || '中风险';
  }

  function readLogs() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function writeLogs(logs) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(0, MAX_LOGS)));
      localStorage.setItem('fayi-dashboard-bump', String(Date.now()));
    } catch (e) { /* quota */ }
  }

  function syncServer(entry) {
    var eventType = TYPE_TO_EVENT[entry.type] || entry.type || 'system_event';
    var body = {
      type: eventType,
      module: entry.module,
      content: entry.content,
      level: entry.level,
      meta: entry.meta || {}
    };
    if (global.FayiHttp) {
      FayiHttp.post(API_BASE + '/api/admin/datav/operation-log', body, { silent: true }).catch(function () {});
    } else {
      fetch(API_BASE + '/api/admin/datav/operation-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json; charset=utf-8' },
        body: JSON.stringify(body)
      }).then(function (r) {
        var ct = (r.headers.get('content-type') || '').toLowerCase();
        if (ct.indexOf('application/json') >= 0) return r.json();
      }).catch(function () {});
    }
    if (global.FayiRealtime && FayiRealtime.notify) {
      FayiRealtime.notify({ type: eventType, module: entry.module });
    }
  }

  /**
   * @param {string} type - consult|case|document|law_search|ocr|pufa|upload|page
   * @param {string} module - 模块中文名或模块 key
   * @param {string} content - 简短描述
   * @param {string} [level] - low|mid|high
   */
  function createOperationLog(type, module, content, level) {
    if (!type) return null;
    var now = new Date().toISOString();
    var lv = normalizeLevel(level);
    var modLabel = MODULE_LABEL[module] || module || '系统';
    var entry = {
      id: 'dlog_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      type: type,
      module: module,
      moduleSource: modLabel,
      content: String(content || '').trim(),
      level: lv,
      riskLabel: riskLabel(lv),
      time: now,
      createdAt: now
    };

    var logs = readLogs();
    logs.unshift(entry);
    writeLogs(logs);

    try {
      global.dispatchEvent(new CustomEvent('fayi-dashboard-log', { detail: entry }));
    } catch (e) { /* ignore */ }

    syncServer(entry);

    if (global.FayiSystemLog && FayiSystemLog.logAction) {
      var modMap = {
        consult: 'consult', case: 'consult', document: 'document',
        law_search: 'regulation', ocr: 'ocr', pufa: 'operation',
        upload: 'ocr', page: 'system', login: 'system', register: 'system'
      };
      FayiSystemLog.logAction({
        actionType: t === 'login' || t === 'register' ? 'login' : 'create',
        module: modMap[t] || t || 'system',
        actionName: content || modLabel,
        description: content,
        status: 'success'
      });
    }

    return entry;
  }

  function getDashboardLogs(opts) {
    opts = opts || {};
    var logs = readLogs();
    if (opts.limit) logs = logs.slice(0, opts.limit);
    return logs;
  }

  function mapActivityToLog(activity) {
    if (!activity) return null;
    var typeMap = {
      consult: 'consult',
      case: 'case',
      document: 'document',
      law_search: 'law_search',
      upload: 'upload',
      pufa: 'pufa',
      datav: 'page'
    };
    var t = typeMap[activity.type] || activity.type || 'page';
    var content = activity.summary || activity.description || activity.title || '';
    return createOperationLog(t, activity.module || t, content, activity.riskLevel || 'mid');
  }

  global.FayiOperationLog = {
    STORAGE_KEY: STORAGE_KEY,
    createOperationLog: createOperationLog,
    getDashboardLogs: getDashboardLogs,
    mapActivityToLog: mapActivityToLog,
    riskLabel: riskLabel,
    normalizeLevel: normalizeLevel
  };
})(typeof window !== 'undefined' ? window : global);

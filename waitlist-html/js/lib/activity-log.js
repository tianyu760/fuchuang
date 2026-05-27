/**
 * 法绎 · 用户行为动态日志（localStorage，按用户隔离）
 * FayiActivity.addActivityLog()
 */
(function (global) {
  var STORAGE_PREFIX = 'fayi_activity_logs_';
  var META_PREFIX = 'fayi_activity_meta_';
  var MAX_LOGS = 500;

  var TYPE_META = {
    consult:    { module: '法律咨询', color: 'blue',   label: '咨询', link: 'chat.html' },
    upload:     { module: '资料库',   color: 'green',  label: '上传', link: 'knowledge.html' },
    document:   { module: '文书生成', color: 'purple', label: '文书', link: 'wenshi.html' },
    law_search: { module: '法规检索', color: 'orange', label: '检索', link: 'fagui.html' },
    pufa:       { module: '普法学习', color: 'cyan',   label: '普法', link: 'pufa.html' },
    datav:      { module: '数字大屏', color: 'indigo', label: '大屏', link: 'datav/index.html' },
    case:       { module: '案件分析', color: 'blue',   label: '分析', link: 'chat.html' }
  };

  function getUserKey() {
    if (!global.FayiAuth || !FayiAuth.getCurrentUser) return null;
    var u = FayiAuth.getCurrentUser();
    return u && u.email ? u.email : null;
  }

  function storageKey() {
    var email = getUserKey();
    return email ? STORAGE_PREFIX + email : null;
  }

  function metaKey() {
    var email = getUserKey();
    return email ? META_PREFIX + email : null;
  }

  function readLogs() {
    var key = storageKey();
    if (!key) return [];
    try {
      var raw = localStorage.getItem(key);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function writeLogs(logs) {
    var key = storageKey();
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(logs.slice(0, MAX_LOGS)));
    } catch (e) { /* quota */ }
  }

  function readMeta() {
    var key = metaKey();
    if (!key) return { activeDays: [], streak: 0, lastActiveAt: null };
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : { activeDays: [], streak: 0, lastActiveAt: null };
    } catch (e) {
      return { activeDays: [], streak: 0, lastActiveAt: null };
    }
  }

  function writeMeta(meta) {
    var key = metaKey();
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(meta));
    } catch (e) { /* ignore */ }
  }

  function dateKey(d) {
    var dt = d ? new Date(d) : new Date();
    return dt.getFullYear() + '-' +
      String(dt.getMonth() + 1).padStart(2, '0') + '-' +
      String(dt.getDate()).padStart(2, '0');
  }

  function touchActiveDay(iso) {
    var meta = readMeta();
    var today = dateKey(iso);
    var days = meta.activeDays || [];
    if (days.indexOf(today) === -1) {
      days.unshift(today);
      days = days.slice(0, 120);
    }
    meta.activeDays = days;
    meta.lastActiveAt = iso || new Date().toISOString();

    var set = {};
    days.forEach(function (d) { set[d] = true; });
    var streak = 0;
    var cursor = new Date();
    for (var i = 0; i < 365; i++) {
      if (set[dateKey(cursor)]) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      } else if (i === 0) {
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }
    meta.streak = streak;
    writeMeta(meta);
    return meta;
  }

  function uid() {
    return 'act_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function buildFallbackMarkdown(log) {
    var lines = [];
    if (log.userInput) lines.push('## 用户输入\n\n' + log.userInput);
    if (log.description || log.summary) {
      lines.push('## 摘要\n\n' + (log.summary || log.description));
    }
    if (log.content) lines.push('\n' + log.content);
    return lines.join('\n\n') || log.title || '暂无详细内容';
  }

  function normalizeLog(log) {
    if (!log) return null;
    var meta = TYPE_META[log.type] || { module: '法绎', color: 'blue', label: '动态' };
    var createTime = log.createTime || log.createdAt || log.time || new Date().toISOString();
    var summary = String(log.summary || log.description || '').trim();
    return {
      id: log.id,
      title: String(log.title || meta.label + '记录').trim(),
      type: log.type || 'consult',
      createTime: createTime,
      createdAt: createTime,
      summary: summary,
      description: summary,
      content: String(log.content || '').trim(),
      markdown: String(log.markdown || '').trim() || buildFallbackMarkdown(log),
      status: log.status || 'completed',
      attachments: Array.isArray(log.attachments) ? log.attachments : [],
      exportable: log.exportable !== false,
      userInput: String(log.userInput || log.description || '').trim(),
      starred: !!log.starred,
      module: log.module || meta.module,
      link: log.link || meta.link || '',
      icon: log.icon || log.type
    };
  }

  function migrateLogs(logs) {
    return logs.map(normalizeLog).filter(Boolean);
  }

  function addActivityLog(entry) {
    if (!entry || !entry.type) return null;
    if (!getUserKey()) return null;

    var meta = TYPE_META[entry.type] || { module: '法绎', color: 'blue', label: '动态' };
    var now = new Date().toISOString();
    var summary = String(entry.summary || entry.description || '').trim();
    var log = normalizeLog({
      id: uid(),
      type: entry.type,
      title: String(entry.title || meta.label + '记录').trim(),
      summary: summary,
      description: summary,
      content: String(entry.content || '').trim(),
      markdown: String(entry.markdown || '').trim(),
      status: entry.status || 'completed',
      attachments: entry.attachments || [],
      exportable: entry.exportable !== false,
      userInput: String(entry.userInput || entry.description || '').trim(),
      starred: !!entry.starred,
      icon: entry.icon || entry.type,
      module: entry.module || meta.module,
      link: entry.link || '',
      createTime: now,
      createdAt: now,
      time: now
    });

    var logs = migrateLogs(readLogs());
    logs.unshift(log);
    writeLogs(logs);
    touchActiveDay(now);

    try {
      global.dispatchEvent(new CustomEvent('fayi-activity-added', { detail: log }));
    } catch (e) { /* ignore */ }

    if (global.FayiOperationLog && FayiOperationLog.createOperationLog) {
      var risk = entry.riskLevel || (entry.type === 'case' ? 'mid' : 'low');
      FayiOperationLog.createOperationLog(
        entry.type,
        entry.type,
        summary || log.title,
        risk
      );
    }

    return log;
  }

  function getActivityLogById(id) {
    if (!id) return null;
    var found = migrateLogs(readLogs()).filter(function (l) { return l.id === id; });
    return found[0] || null;
  }

  function updateActivityLog(id, patch) {
    var logs = migrateLogs(readLogs());
    var idx = logs.findIndex(function (l) { return l.id === id; });
    if (idx === -1) return null;
    logs[idx] = normalizeLog(Object.assign({}, logs[idx], patch || {}, { id: id }));
    writeLogs(logs);
    try {
      global.dispatchEvent(new CustomEvent('fayi-activity-updated', { detail: logs[idx] }));
    } catch (e) { /* ignore */ }
    return logs[idx];
  }

  function deleteActivityLog(id) {
    var logs = migrateLogs(readLogs()).filter(function (l) { return l.id !== id; });
    writeLogs(logs);
    try {
      global.dispatchEvent(new CustomEvent('fayi-activity-deleted', { detail: { id: id } }));
    } catch (e) { /* ignore */ }
    return true;
  }

  function toggleFavorite(id) {
    var log = getActivityLogById(id);
    if (!log) return null;
    return updateActivityLog(id, { starred: !log.starred });
  }

  function markExported(id) {
    return updateActivityLog(id, { status: 'exported' });
  }

  function searchActivityLogs(opts) {
    opts = opts || {};
    var logs = migrateLogs(readLogs());
    var q = String(opts.query || '').trim().toLowerCase();
    var type = opts.type || '';
    var status = opts.status || '';
    var starredOnly = !!opts.starredOnly;

    if (type) logs = logs.filter(function (l) { return l.type === type; });
    if (status) logs = logs.filter(function (l) { return l.status === status; });
    if (starredOnly) logs = logs.filter(function (l) { return l.starred; });
    if (q) {
      logs = logs.filter(function (l) {
        var hay = [l.title, l.summary, l.userInput, l.markdown, l.module].join(' ').toLowerCase();
        return hay.indexOf(q) !== -1;
      });
    }
    if (opts.limit) logs = logs.slice(0, opts.limit);
    return logs;
  }

  function getActivityLogs(opts) {
    opts = opts || {};
    return searchActivityLogs(opts);
  }

  function startOfDay(d) {
    var x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function daysAgo(n) {
    var d = new Date();
    d.setDate(d.getDate() - n);
    return startOfDay(d);
  }

  function countInRange(logs, from, to, type) {
    return logs.filter(function (l) {
      var t = new Date(l.createdAt).getTime();
      if (t < from.getTime() || t >= to.getTime()) return false;
      if (type && l.type !== type) return false;
      return true;
    }).length;
  }

  function getActivityStats() {
    var logs = migrateLogs(readLogs());
    var meta = readMeta();
    var now = new Date();
    var weekStart = daysAgo(6);
    var weekEnd = new Date(now.getTime() + 86400000);
    var prevWeekStart = daysAgo(13);
    var prevWeekEnd = daysAgo(6);

    var types = ['consult', 'upload', 'document', 'law_search', 'pufa', 'datav', 'case'];
    var weekCounts = {};
    var prevWeekTotal = 0;
    var weekTotal = 0;

    types.forEach(function (tp) {
      var c = countInRange(logs, weekStart, weekEnd, tp);
      weekCounts[tp] = c;
      weekTotal += c;
      prevWeekTotal += countInRange(logs, prevWeekStart, prevWeekEnd, tp);
    });

    var moduleFreq = {};
    logs.forEach(function (l) {
      if (new Date(l.createdAt).getTime() < weekStart.getTime()) return;
      moduleFreq[l.type] = (moduleFreq[l.type] || 0) + 1;
    });

    var topType = '';
    var topCount = 0;
    Object.keys(moduleFreq).forEach(function (k) {
      if (moduleFreq[k] > topCount) {
        topCount = moduleFreq[k];
        topType = k;
      }
    });

    var growth = 0;
    if (prevWeekTotal > 0) {
      growth = Math.round(((weekTotal - prevWeekTotal) / prevWeekTotal) * 100);
    } else if (weekTotal > 0) {
      growth = 100;
    }

    return {
      week: weekCounts,
      weekTotal: weekTotal,
      prevWeekTotal: prevWeekTotal,
      growthPercent: growth,
      streak: meta.streak || 0,
      lastActiveAt: meta.lastActiveAt,
      topType: topType,
      topModule: topType && TYPE_META[topType] ? TYPE_META[topType].module : '',
      total: logs.length
    };
  }

  function formatRelativeTime(iso) {
    if (!iso) return '';
    var diff = Date.now() - new Date(iso).getTime();
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
    if (diff < 604800000) return Math.floor(diff / 86400000) + ' 天前';
    var d = new Date(iso);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' +
      String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function formatTimelineDate(iso) {
    var d = new Date(iso);
    var today = dateKey(new Date());
    if (dateKey(d) === today) return '今天';
    var yest = new Date();
    yest.setDate(yest.getDate() - 1);
    if (dateKey(d) === dateKey(yest)) return '昨天';
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  function groupLogsByDate(logs) {
    var groups = [];
    var map = {};
    logs.forEach(function (log) {
      var label = formatTimelineDate(log.createdAt);
      if (!map[label]) {
        map[label] = { label: label, items: [] };
        groups.push(map[label]);
      }
      map[label].items.push(log);
    });
    return groups;
  }

  function getTypeMeta(type) {
    return TYPE_META[type] || TYPE_META.consult;
  }

  function truncate(s, n) {
    s = String(s || '').trim();
    if (s.length <= n) return s;
    return s.slice(0, n) + '…';
  }

  global.FayiActivity = {
    TYPE_META: TYPE_META,
    STATUS: { COMPLETED: 'completed', PROCESSING: 'processing', FAILED: 'failed', EXPORTED: 'exported' },
    addActivityLog: addActivityLog,
    getActivityLogs: getActivityLogs,
    getActivityLogById: getActivityLogById,
    updateActivityLog: updateActivityLog,
    deleteActivityLog: deleteActivityLog,
    toggleFavorite: toggleFavorite,
    markExported: markExported,
    searchActivityLogs: searchActivityLogs,
    normalizeLog: normalizeLog,
    getActivityStats: getActivityStats,
    formatRelativeTime: formatRelativeTime,
    formatTimelineDate: formatTimelineDate,
    groupLogsByDate: groupLogsByDate,
    getTypeMeta: getTypeMeta,
    truncate: truncate
  };
})(typeof window !== 'undefined' ? window : global);

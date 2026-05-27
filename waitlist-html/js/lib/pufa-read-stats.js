/**
 * 普法传播真实阅读统计（localStorage + 服务端同步）
 */
(function (global) {
  var STORAGE_KEY = 'fayi_pufa_read_stats';
  var API_BASE = 'http://localhost:3002';

  function defaultStats() {
    return {
      todayReadCount: 0,
      totalReadCount: 0,
      videoPlayCount: 0,
      articleViewCount: 0,
      todayVisitors: 0,
      lastDay: '',
      topics: {},
      articles: {}
    };
  }

  function readStats() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var st = raw ? JSON.parse(raw) : defaultStats();
      return Object.assign(defaultStats(), st);
    } catch (e) {
      return defaultStats();
    }
  }

  function writeStats(st) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(st));
      localStorage.setItem('fayi-dashboard-bump', String(Date.now()));
    } catch (e) { /* ignore */ }
  }

  function resetTodayIfNeeded(st) {
    var today = new Date().toISOString().slice(0, 10);
    if (st.lastDay !== today) {
      st.todayReadCount = 0;
      st.todayVisitors = 0;
      st.lastDay = today;
    }
    return st;
  }

  /**
   * @param {{ kind?: string, title?: string, category?: string, articleId?: string }} opts
   */
  function increaseReadCount(opts) {
    opts = opts || {};
    var st = resetTodayIfNeeded(readStats());
    var kind = opts.kind || 'page';
    st.todayReadCount += 1;
    st.totalReadCount += 1;
    if (kind === 'video') st.videoPlayCount += 1;
    if (kind === 'article') st.articleViewCount += 1;
    if (kind === 'page') st.todayVisitors += 1;

    var topicKey = String(opts.category || opts.title || '普法浏览').trim();
    if (topicKey) {
      st.topics[topicKey] = (st.topics[topicKey] || 0) + 1;
    }
    if (opts.articleId) {
      var id = String(opts.articleId);
      st.articles[id] = (st.articles[id] || 0) + 1;
    }
    writeStats(st);

    fetch(API_BASE + '/api/admin/datav/pufa-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: kind,
        title: opts.title || '',
        category: opts.category || '',
        articleId: opts.articleId || ''
      })
    }).catch(function () {});

    if (global.FayiOperationLog && FayiOperationLog.createOperationLog) {
      var desc = kind === 'video'
        ? '观看普法视频《' + (opts.title || '') + '》'
        : kind === 'article'
          ? '阅读普法文章《' + (opts.title || '') + '》'
          : '访问普法宣传页面';
      FayiOperationLog.createOperationLog('pufa', 'pufa', desc, 'low');
    }

    return st;
  }

  function getHotTopics(limit) {
    var st = readStats();
    return Object.keys(st.topics || {})
      .sort(function (a, b) { return (st.topics[b] || 0) - (st.topics[a] || 0); })
      .slice(0, limit || 3)
      .map(function (k) {
        return k.length > 12 ? '《' + k.slice(0, 10) + '…》' : '《' + k + '》';
      });
  }

  function getArticleReads(articleId) {
    var st = readStats();
    return (st.articles && st.articles[String(articleId)]) || 0;
  }

  function getSnapshot() {
    return resetTodayIfNeeded(readStats());
  }

  global.FayiPufaStats = {
    STORAGE_KEY: STORAGE_KEY,
    increaseReadCount: increaseReadCount,
    getHotTopics: getHotTopics,
    getArticleReads: getArticleReads,
    getSnapshot: getSnapshot,
    readStats: readStats
  };
})(typeof window !== 'undefined' ? window : global);

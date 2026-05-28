/**
 * 业务页脚本按需加载（减少首屏解析阻塞）
 */
window.OpsScriptLoader = (function () {
  var loaded = Object.create(null);
  var DEDICATED = {
    dashboard: 'js/pages/dashboard.js',
    users: 'js/pages/users.js',
    consultations: 'js/pages/consultations.js',
    documents: 'js/pages/documents.js',
    ocr: 'js/pages/ocr.js',
    regulations: 'js/pages/regulations.js',
    'law-education': 'js/pages/law-education.js',
    risks: 'js/pages/risks.js',
    logs: 'js/pages/logs.js',
    settings: 'js/pages/settings.js',
    analytics: 'js/pages/analytics.js'
  };

  var PAGE_EXTRA = {
    documents: [
      'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
      'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
      'js/lib/document-pdf.js'
    ]
  };

  function basePath() {
    var p = location.pathname || '';
    if (p.indexOf('/admin/') >= 0) return '';
    return 'admin/';
  }

  function loadScript(src) {
    if (loaded[src]) return loaded[src];
    loaded[src] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('脚本加载失败: ' + src)); };
      document.body.appendChild(s);
    });
    return loaded[src];
  }

  function wordCloudPluginReady() {
    if (!window.echarts || !echarts.ComponentModel) return false;
    var getClasses = echarts.ComponentModel.getClasses;
    if (!getClasses) return false;
    try {
      return !!getClasses()['series.wordCloud'];
    } catch (e) {
      return false;
    }
  }

  function loadEcharts() {
    var key = 'echarts';
    if (window.echarts && wordCloudPluginReady()) {
      if (loaded[key]) return loaded[key];
      loaded[key] = loadScript(basePath() + 'charts/ops-charts.js');
      return loaded[key];
    }
    if (loaded[key]) return loaded[key];
    loaded[key] = loadScript('https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js')
      .then(function () {
        if (!window.echarts) {
          return Promise.reject(new Error('ECharts 未加载'));
        }
        if (wordCloudPluginReady()) return undefined;
        return loadScript('https://cdn.jsdelivr.net/npm/echarts-wordcloud@2.1.0/dist/echarts-wordcloud.min.js');
      })
      .then(function () {
        return loadScript(basePath() + 'charts/ops-charts.js');
      });
    return loaded[key];
  }

  function loadExtras(pageId) {
    var list = PAGE_EXTRA[pageId] || [];
    return list.reduce(function (p, src) {
      return p.then(function () {
        return loadScript(src.indexOf('http') === 0 ? src : basePath() + src);
      });
    }, Promise.resolve());
  }

  function loadSystemLogLib() {
    var k = 'system-log-lib';
    if (loaded[k]) return loaded[k];
    loaded[k] = loadScript(basePath() + '../js/lib/system-log.js')
      .catch(function (err) {
        console.warn('[OpsScriptLoader] system-log.js 加载跳过', err);
      })
      .then(function () {
        return loadScript(basePath() + 'js/lib/ops-system-log.js').catch(function (err) {
          console.warn('[OpsScriptLoader] ops-system-log.js 加载跳过', err);
        });
      })
      .then(function () {
        return loadScript(basePath() + 'js/lib/operation-fallback.js').catch(function () {});
      });
    return loaded[k];
  }

  function loadPage(pageId) {
    var chain = loadSystemLogLib();
    if (pageId === 'dashboard' || pageId === 'analytics' || pageId === 'users' || pageId === 'law-education' || pageId === 'risks') {
      chain = chain.then(function () { return loadEcharts(); });
    }
    return chain.then(function () { return loadExtras(pageId); }).then(function () {
      var rel = DEDICATED[pageId];
      if (rel) return loadScript(basePath() + rel);
      return loadScript(basePath() + 'js/pages/generic.js');
    });
  }

  return {
    loadPage: loadPage,
    loadEcharts: loadEcharts,
    loadScript: loadScript
  };
})();

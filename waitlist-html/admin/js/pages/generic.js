/**
 * 通用业务页（文书 / OCR / 法规 / 风险 / 日志 / 设置 / 分析）
 */
(function () {
  window.OpsPages = window.OpsPages || {};

  var DEDICATED = ['dashboard', 'users', 'consultations', 'documents', 'ocr', 'regulations'];

  var META = {
    documents: { title: '文书系统', sub: '法律文书生成记录与管理', api: 'documents' },
    ocr: { title: 'OCR识别', sub: '图片与文档识别记录', ocr: true },
  };

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  function pageHead(title, sub) {
    return window.OpsUI ? OpsUI.pageHeader(title, sub) : '<h1 class="ops-page-title">' + esc(title) + '</h1>';
  }

  function mountList(root, pageId, meta) {
    root.innerHTML =
      pageHead(meta.title, meta.sub) +
      '<div class="ops-card"><div class="ops-table-wrap"><table class="ops-table"><thead><tr>' +
        '<th>时间</th><th>内容</th><th>状态</th>' +
      '</tr></thead><tbody id="ops-generic-tb"></tbody></table></div></div>';

    if (meta.ocr) {
      OpsDataCenter.loadOcr({ page: 1, pageSize: 20 }).then(function (ocr) {
        var tb = document.getElementById('ops-generic-tb');
        if (!tb) return;
        var list = (ocr && ocr.list) || [];
        tb.innerHTML = list.length ? list.map(function (row) {
          return '<tr><td>' + esc((row.createdAt || '').slice(0, 16)) + '</td><td>' +
            esc(row.fileName || row.textPreview || '—') + '</td><td>' + esc(row.status || '—') + '</td></tr>';
        }).join('') : '<tr><td colspan="3">暂无 OCR 记录</td></tr>';
      });
      return;
    }

    if (meta.risk || meta.feed) {
      var snap = OpsDataCenter.get();
      var rows = meta.feed ? (snap.feed || []) : ((snap.risks && snap.risks.list) || []);
        var tb = document.getElementById('ops-generic-tb');
        if (!tb) return;
        tb.innerHTML = rows.length ? rows.map(function (r) {
          var msg = r.message || r.title || '—';
          var time = (r.time || r.createdAt || '').slice(0, 16);
          return '<tr><td>' + esc(time) + '</td><td>' + esc(msg) + '</td><td>' + esc(r.level || r.result || '—') + '</td></tr>';
        }).join('') : '<tr><td colspan="3">暂无数据</td></tr>';
      return;
    }

    if (!window.FayiAdminApi || !meta.api) return;
    var fn = FayiAdminApi[meta.api];
    if (!fn) return;
    fn({ page: 1, pageSize: 15 }).then(function (res) {
      var data = res.data || res;
      var list = data.list || data.items || data.records || (Array.isArray(data) ? data : []);
      var tb = document.getElementById('ops-generic-tb');
      if (!tb) return;
      tb.innerHTML = list.length ? list.map(function (row) {
        var title = row.title || row.question || row.name || row.fileName || row.id || '—';
        var time = (row.createdAt || row.time || '').slice(0, 16);
        return '<tr><td>' + esc(time) + '</td><td>' + esc(String(title).slice(0, 80)) + '</td><td>' + esc(row.status || '—') + '</td></tr>';
      }).join('') : '<tr><td colspan="3">暂无记录</td></tr>';
    }).catch(function () {
      var tb = document.getElementById('ops-generic-tb');
      if (tb) tb.innerHTML = '<tr><td colspan="3">加载失败</td></tr>';
    });
  }

  OpsPages._default = {
    mount: function (root, pageId) {
      var meta = META[pageId] || { title: pageId, sub: '' };
      mountList(root, pageId, meta);
    },
    onData: function () {}
  };

  Object.keys(META).forEach(function (key) {
    if (DEDICATED.indexOf(key) >= 0) return;
    OpsPages[key] = {
      mount: function (root) { OpsPages._default.mount(root, key); },
      onData: OpsPages._default.onData
    };
  });
})();

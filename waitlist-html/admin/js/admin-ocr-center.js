/**
 * 法绎 · OCR 识别中心（管理端）
 */
(function (global) {
  var API_FILE = 'http://localhost:3002';
  var OCR_TYPES = {
    all: '全部类型',
    basic: '基础识别',
    process_image: '图片分析',
    process_case: '案件材料',
    accurate: '高精识别',
    general: '通用识别'
  };

  var state = {
    page: 1,
    pageSize: 12,
    search: '',
    status: 'all',
    ocrType: 'all',
    dateFrom: '',
    dateTo: '',
    expandedId: null,
    loading: false
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtTime(iso) {
    if (!iso) return '—';
    return String(iso).slice(0, 16).replace('T', ' ');
  }

  function fmtDuration(ms) {
    if (!ms) return '—';
    if (ms < 1000) return ms + ' ms';
    return (ms / 1000).toFixed(2) + ' s';
  }

  function typeLabel(t) {
    return OCR_TYPES[t] || t || '通用';
  }

  function summaryText(r) {
    return (r.correctedText || r.fullText || r.textPreview || '—').trim();
  }

  function thumbUrl(r) {
    if (!r.fileUrl) return '';
    if (/^https?:\/\//i.test(r.fileUrl)) return r.fileUrl;
    return API_FILE + r.fileUrl;
  }

  function isImageFile(name) {
    return /\.(png|jpe?g|gif|webp|bmp)$/i.test(name || '');
  }

  function mount(root) {
    if (!root) return;
    root.innerHTML =
      '<div class="ocr-center" id="ocr-center-root">' +
        '<div class="ocr-stats" id="ocr-stats">' + statSkeleton() + '</div>' +
        '<div class="ocr-toolbar adm-card" style="padding:14px 16px">' +
          '<input type="search" class="adm-input ocr-search" id="ocr-search" placeholder="搜索文件名、识别内容、用户 ID…">' +
          '<input type="date" class="adm-input" id="ocr-date-from" title="开始日期">' +
          '<input type="date" class="adm-input" id="ocr-date-to" title="结束日期">' +
          '<select class="adm-input" id="ocr-filter-status">' +
            '<option value="all">全部状态</option>' +
            '<option value="success">成功</option>' +
            '<option value="processing">识别中</option>' +
            '<option value="failed">失败</option>' +
          '</select>' +
          '<select class="adm-input" id="ocr-filter-type">' +
            Object.keys(OCR_TYPES).map(function (k) {
              return '<option value="' + k + '">' + OCR_TYPES[k] + '</option>';
            }).join('') +
          '</select>' +
          '<button type="button" class="adm-btn adm-btn--primary adm-btn--sm" id="ocr-btn-search">查询</button>' +
          '<button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" id="ocr-btn-reset">重置</button>' +
        '</div>' +
        '<div class="ocr-table-panel" id="ocr-table-panel">' + tableSkeleton() + '</div>' +
        '<div id="ocr-pagination" class="adm-pagination"></div>' +
      '</div>';

    bindToolbar(root);
    loadStats();
    loadTable(1);
  }

  function statSkeleton() {
    var h = '';
    for (var i = 0; i < 4; i++) {
      h += '<div class="ocr-stat-card"><div class="adm-skeleton" style="height:12px;width:60%;margin-bottom:10px"></div>' +
        '<div class="adm-skeleton" style="height:28px;width:40%"></div></div>';
    }
    return h;
  }

  function tableSkeleton() {
    var rows = '';
    for (var i = 0; i < 6; i++) {
      rows += '<div class="ocr-skeleton-row">' +
        '<div class="adm-skeleton ocr-skeleton-thumb"></div>' +
        '<div class="adm-skeleton" style="flex:2"></div>' +
        '<div class="adm-skeleton" style="flex:3"></div>' +
        '<div class="adm-skeleton" style="flex:1"></div></div>';
    }
    return '<div class="ocr-skeleton-wrap">' + rows + '</div>';
  }

  function bindToolbar(root) {
    var searchBtn = root.querySelector('#ocr-btn-search');
    var resetBtn = root.querySelector('#ocr-btn-reset');
    var searchInput = root.querySelector('#ocr-search');

    function applyFilters() {
      state.search = (root.querySelector('#ocr-search').value || '').trim();
      state.dateFrom = root.querySelector('#ocr-date-from').value || '';
      state.dateTo = root.querySelector('#ocr-date-to').value || '';
      state.status = root.querySelector('#ocr-filter-status').value || 'all';
      state.ocrType = root.querySelector('#ocr-filter-type').value || 'all';
      state.expandedId = null;
      loadTable(1);
    }

    if (searchBtn) searchBtn.onclick = applyFilters;
    if (resetBtn) resetBtn.onclick = function () {
      root.querySelector('#ocr-search').value = '';
      root.querySelector('#ocr-date-from').value = '';
      root.querySelector('#ocr-date-to').value = '';
      root.querySelector('#ocr-filter-status').value = 'all';
      root.querySelector('#ocr-filter-type').value = 'all';
      applyFilters();
    };
    if (searchInput) {
      searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') applyFilters();
      });
    }
  }

  function loadStats() {
    if (!global.FayiAdminApi || !FayiAdminApi.ocrStats) return;
    FayiAdminApi.ocrStats().then(function (res) {
      var s = (res && res.data) || {};
      var el = document.getElementById('ocr-stats');
      if (!el) return;
      el.innerHTML =
        '<div class="ocr-stat-card ocr-stat-card--info adm-flow-border">' +
          '<div class="ocr-stat-card__label">今日识别数</div>' +
          '<div class="ocr-stat-card__val adm-num" data-count="' + (s.todayCount || 0) + '">0</div></div>' +
        '<div class="ocr-stat-card ocr-stat-card--success adm-flow-border">' +
          '<div class="ocr-stat-card__label">成功率</div>' +
          '<div class="ocr-stat-card__val adm-num" data-count="' + (s.successRate != null ? s.successRate : 0) + '" data-suffix="%">0%</div></div>' +
        '<div class="ocr-stat-card adm-flow-border">' +
          '<div class="ocr-stat-card__label">平均耗时</div>' +
          '<div class="ocr-stat-card__val adm-num">' + fmtDuration(s.avgDurationMs) + '</div></div>' +
        '<div class="ocr-stat-card ocr-stat-card--danger adm-flow-border">' +
          '<div class="ocr-stat-card__label">异常任务数</div>' +
          '<div class="ocr-stat-card__val adm-num" data-count="' + (s.failedCount || 0) + '">0</div></div>';
      if (global.AdminShell && AdminShell.animateNumbersIn) AdminShell.animateNumbersIn(el);
    }).catch(function () {
      var el = document.getElementById('ocr-stats');
      if (el) el.innerHTML = '<p style="color:#f87171;grid-column:1/-1">统计加载失败</p>';
    });
  }

  function loadTable(page) {
    if (!global.FayiAdminApi) return;
    state.page = page || 1;
    state.loading = true;
    var panel = document.getElementById('ocr-table-panel');
    if (panel) panel.innerHTML = tableSkeleton();

    FayiAdminApi.ocr({
      page: state.page,
      pageSize: state.pageSize,
      search: state.search,
      status: state.status,
      ocrType: state.ocrType,
      dateFrom: state.dateFrom,
      dateTo: state.dateTo
    }).then(function (res) {
      state.loading = false;
      var data = (res && res.data) || {};
      renderTable(data.list || [], data);
      renderPagination(data);
    }).catch(function (e) {
      state.loading = false;
      if (panel) {
        panel.innerHTML =
          '<div class="ocr-empty"><div class="ocr-empty__icon">⚠</div>' +
          '<p>' + esc(e.message || '加载失败') + '</p>' +
          '<p style="font-size:12px;margin-top:8px">请确认 Node 服务已启动（端口 3002）</p></div>';
      }
    });
  }

  function renderTable(list, meta) {
    var panel = document.getElementById('ocr-table-panel');
    if (!panel) return;

    if (!list.length) {
      panel.innerHTML =
        '<div class="ocr-empty">' +
          '<div class="ocr-empty__icon">📄</div>' +
          '<p>暂无 OCR 识别记录</p>' +
          '<p style="font-size:12px;margin-top:8px">用户在前台上传图片识别后，记录将显示在此处</p>' +
        '</div>';
      return;
    }

    var body = list.map(function (r) {
      return rowHtml(r) + detailRowHtml(r);
    }).join('');

    panel.innerHTML =
      '<div class="ocr-table-scroll">' +
        '<table class="ocr-table">' +
          '<thead><tr>' +
            '<th style="width:64px">缩略图</th>' +
            '<th>文件</th>' +
            '<th>识别摘要</th>' +
            '<th>类型</th>' +
            '<th>状态</th>' +
            '<th>耗时</th>' +
            '<th>时间</th>' +
          '</tr></thead>' +
          '<tbody>' + body + '</tbody>' +
        '</table></div>';

    list.forEach(function (r) {
      bindRowActions(r);
    });
  }

  function statusHtml(r) {
    var st = r.status || (r.success === false ? 'failed' : 'success');
    if (st === 'processing') {
      return '<span class="ocr-status ocr-status--processing">识别中</span>' +
        '<div class="ocr-progress"><div class="ocr-progress__bar"></div></div>';
    }
    if (st === 'failed') {
      return '<span class="ocr-status ocr-status--failed">失败</span>';
    }
    return '<span class="ocr-status ocr-status--success">成功</span>';
  }

  function thumbHtml(r) {
    var url = thumbUrl(r);
    if (url && isImageFile(r.fileName)) {
      return '<img class="ocr-thumb" src="' + esc(url) + '" alt="" loading="lazy" onerror="this.classList.add(\'ocr-thumb--placeholder\');this.alt=\'无图\';">';
    }
    return '<div class="ocr-thumb ocr-thumb--placeholder">DOC</div>';
  }

  function rowHtml(r) {
    var expanded = state.expandedId === r.id;
    return '<tr class="ocr-row' + (expanded ? ' is-expanded' : '') + '" data-id="' + esc(r.id) + '">' +
      '<td>' + thumbHtml(r) + '</td>' +
      '<td><div class="ocr-file-name" title="' + esc(r.fileName) + '">' + esc(r.fileName || '—') + '</div></td>' +
      '<td><div class="ocr-summary">' + esc(summaryText(r)) + '</div></td>' +
      '<td><span class="ocr-type-tag">' + esc(typeLabel(r.ocrType)) + '</span></td>' +
      '<td>' + statusHtml(r) + '</td>' +
      '<td>' + fmtDuration(r.durationMs) + '</td>' +
      '<td>' + fmtTime(r.createdAt) + '</td>' +
    '</tr>';
  }

  function detailRowHtml(r) {
    if (state.expandedId !== r.id) return '';
    var text = summaryText(r);
    var url = thumbUrl(r);
    return '<tr class="ocr-detail-row" data-detail="' + esc(r.id) + '"><td colspan="7">' +
      '<div class="ocr-detail">' +
        (url && isImageFile(r.fileName)
          ? '<div style="margin-bottom:12px"><img class="ocr-thumb" style="width:120px;height:120px" src="' + esc(url) + '" alt=""></div>'
          : '') +
        '<div class="ocr-detail__text">' + esc(text) + '</div>' +
        '<div class="ocr-detail__meta" style="font-size:12px;color:#94a3b8;margin-bottom:10px">' +
          '行数 ' + (r.lines || '—') + ' · 用户 ' + esc(r.userId || '—') +
          (r.error ? ' · 错误：' + esc(r.error) : '') +
        '</div>' +
        '<div class="ocr-detail__actions">' +
          (url && isImageFile(r.fileName)
            ? '<button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" data-act="view" data-id="' + esc(r.id) + '">查看原图</button>'
            : '') +
          '<button type="button" class="adm-btn adm-btn--primary adm-btn--sm" data-act="correct" data-id="' + esc(r.id) + '">AI 纠错</button>' +
          '<button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" data-act="pdf" data-id="' + esc(r.id) + '">导出 PDF</button>' +
        '</div>' +
      '</div></td></tr>';
  }

  function bindRowActions(r) {
    var row = document.querySelector('.ocr-row[data-id="' + r.id + '"]');
    if (!row) return;
    row.onclick = function (e) {
      if (e.target.closest('button')) return;
      state.expandedId = state.expandedId === r.id ? null : r.id;
      loadTable(state.page);
    };

    document.querySelectorAll('[data-act][data-id="' + r.id + '"]').forEach(function (btn) {
      btn.onclick = function (ev) {
        ev.stopPropagation();
        var act = btn.getAttribute('data-act');
        if (act === 'view') openLightbox(r);
        else if (act === 'correct') runAiCorrect(r);
        else if (act === 'pdf') exportPdf(r);
      };
    });
  }

  function openLightbox(r) {
    var url = thumbUrl(r);
    if (!url) {
      toast('暂无原图', 'error');
      return;
    }
    var box = document.createElement('div');
    box.className = 'ocr-lightbox';
    box.innerHTML =
      '<button type="button" class="adm-btn adm-btn--ghost ocr-lightbox__close">关闭</button>' +
      '<img src="' + esc(url) + '" alt="原图">';
    box.onclick = function (e) {
      if (e.target === box || e.target.classList.contains('ocr-lightbox__close')) {
        box.remove();
      }
    };
    document.body.appendChild(box);
  }

  function runAiCorrect(r) {
    if (!FayiAdminApi.ocrAiCorrect) return;
    toast('AI 纠错中…', 'info');
    FayiAdminApi.ocrAiCorrect(r.id).then(function (res) {
      var text = (res.data && res.data.correctedText) || '';
      toast('纠错完成', 'success');
      if (text) {
        state.expandedId = r.id;
        loadTable(state.page);
        loadStats();
      }
    }).catch(function (e) {
      toast(e.message || '纠错失败', 'error');
    });
  }

  function exportPdf(r) {
    var text = summaryText(r);
    var title = (r.fileName || 'OCR识别结果').replace(/\.[^.]+$/, '');
    if (global.jspdf && global.html2canvas) {
      exportPdfCanvas(title, text, r);
      return;
    }
    exportPdfPrint(title, text);
  }

  function exportPdfPrint(title, text) {
    var w = window.open('', '_blank');
    if (!w) {
      toast('请允许弹出窗口以导出 PDF', 'error');
      return;
    }
    w.document.write(
      '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + esc(title) + '</title>' +
      '<style>body{font-family:"Microsoft YaHei",sans-serif;padding:32px;line-height:1.7}h1{font-size:18px}</style></head><body>' +
      '<h1>' + esc(title) + '</h1><pre style="white-space:pre-wrap;font-size:14px">' + esc(text) + '</pre></body></html>'
    );
    w.document.close();
    w.focus();
    w.print();
    toast('请在打印对话框中选择「另存为 PDF」', 'info');
  }

  function exportPdfCanvas(title, text, r) {
    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;left:-9999px;top:0;width:595px;padding:40px;background:#fff;color:#111;font-family:"Microsoft YaHei",sans-serif';
    wrap.innerHTML = '<h2 style="margin:0 0 16px;font-size:18px">' + esc(title) + '</h2>' +
      '<p style="font-size:11px;color:#666;margin:0 0 12px">' + esc(fmtTime(r.createdAt)) + ' · ' + esc(typeLabel(r.ocrType)) + '</p>' +
      '<div style="font-size:13px;line-height:1.65;white-space:pre-wrap">' + esc(text) + '</div>';
    document.body.appendChild(wrap);
    global.html2canvas(wrap, { scale: 2, useCORS: true }).then(function (canvas) {
      var img = canvas.toDataURL('image/png');
      var pdf = new global.jspdf.jsPDF('p', 'mm', 'a4');
      var pw = pdf.internal.pageSize.getWidth();
      var ph = pdf.internal.pageSize.getHeight();
      var iw = pw - 20;
      var ih = (canvas.height * iw) / canvas.width;
      var y = 10;
      var left = 10;
      if (ih > ph - 20) {
        pdf.addImage(img, 'PNG', left, y, iw, ph - 20);
      } else {
        pdf.addImage(img, 'PNG', left, y, iw, ih);
      }
      pdf.save(sanitizeFilename(title) + '_OCR.pdf');
      wrap.remove();
      toast('PDF 已下载', 'success');
    }).catch(function (e) {
      wrap.remove();
      exportPdfPrint(title, text);
    });
  }

  function sanitizeFilename(name) {
    return String(name || 'ocr').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
  }

  function renderPagination(data) {
    var pg = document.getElementById('ocr-pagination');
    if (!pg) return;
    var total = data.total || 0;
    var page = data.page || 1;
    var pageSize = data.pageSize || state.pageSize;
    var pages = Math.max(1, Math.ceil(total / pageSize));
    pg.innerHTML = '';
    function btn(label, p, dis) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'adm-btn adm-btn--ghost adm-btn--sm';
      b.textContent = label;
      b.disabled = !!dis;
      b.onclick = function () { loadTable(p); };
      return b;
    }
    pg.appendChild(btn('上一页', page - 1, page <= 1));
    var span = document.createElement('span');
    span.style.cssText = 'padding:0 12px;color:#94a3b8;font-size:13px';
    span.textContent = '第 ' + page + ' / ' + pages + ' 页 · 共 ' + total + ' 条';
    pg.appendChild(span);
    pg.appendChild(btn('下一页', page + 1, page >= pages));
  }

  function toast(msg, variant) {
    if (global.FayiToast) FayiToast(msg, variant || 'info');
  }

  global.AdminOcrCenter = { mount: mount };
})(window);

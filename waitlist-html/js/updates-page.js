/**
 * 法绎 · 法律服务动态工作台
 */
(function () {
  var STATUS_LABEL = {
    completed: '已完成',
    processing: '分析中',
    failed: '失败',
    exported: '已导出'
  };

  var REGEN_KEYS = {
    consult: 'fayi_regenerate_consult',
    case: 'fayi_regenerate_consult',
    document: 'fayi_regenerate_document',
    law_search: 'fayi_regenerate_law_search',
    upload: 'fayi_regenerate_upload',
    pufa: 'fayi_regenerate_pufa',
    datav: 'fayi_regenerate_datav'
  };

  var state = {
    activeId: null,
    query: '',
    typeFilter: '',
    statusFilter: '',
    starredOnly: false,
    loading: false,
    mobileDetailOpen: false
  };

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function formatDateTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0') + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' +
      String(d.getMinutes()).padStart(2, '0');
  }

  function formatDateOnly(iso) {
    var d = iso ? new Date(iso) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function sanitizeFilenamePart(name, fallback) {
    var raw = String(name || '').trim();
    var cleaned = raw
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .replace(/[. ]+$/g, '')
      .trim();
    if (!cleaned) cleaned = fallback || '法律服务记录';
    return cleaned.slice(0, 80);
  }

  function buildExportFilename(log, ext) {
    var base = sanitizeFilenamePart((log && log.title) || '法律服务记录', '法律服务记录');
    return base + '_' + formatDateOnly(log && log.createTime) + '.' + ext;
  }

  function isMobile() {
    return window.innerWidth <= 900;
  }

  function getFilteredLogs() {
    if (!window.FayiActivity) return [];
    return FayiActivity.searchActivityLogs({
      query: state.query,
      type: state.typeFilter,
      status: state.statusFilter,
      starredOnly: state.starredOnly,
      limit: 200
    });
  }

  function getActiveRecord() {
    if (!state.activeId) return null;
    return FayiActivity.getActivityLogById(state.activeId);
  }

  function renderMarkdown(md) {
    if (!md) return '<p class="wb-md-p">暂无 AI 生成内容</p>';
    if (window.marked && marked.parse) {
      try {
        marked.setOptions({ breaks: true, gfm: true });
        return marked.parse(md);
      } catch (e) { /* fallback */ }
    }
    return '<p>' + esc(md).replace(/\n/g, '</p><p>') + '</p>';
  }

  function renderMiniStats() {
    var stats = FayiActivity.getActivityStats();
    var w = stats.week || {};
    return '<div class="wb-stat-mini"><div class="wb-stat-mini__num">' + (stats.weekTotal || 0) + '</div><div class="wb-stat-mini__label">本周</div></div>' +
      '<div class="wb-stat-mini"><div class="wb-stat-mini__num">' + (stats.streak || 0) + '</div><div class="wb-stat-mini__label">连续天</div></div>' +
      '<div class="wb-stat-mini"><div class="wb-stat-mini__num">' + (stats.total || 0) + '</div><div class="wb-stat-mini__label">总记录</div></div>';
  }

  function renderRecordItem(log) {
    var meta = FayiActivity.getTypeMeta(log.type);
    var active = log.id === state.activeId ? ' is-active' : '';
    var statusCls = 'wb-record__status--' + (log.status || 'completed');
    return '<button type="button" class="wb-record' + active + '" data-id="' + esc(log.id) + '">' +
      (log.starred ? '<span class="wb-record__star">★</span>' : '') +
      '<h3 class="wb-record__title">' + esc(log.title) + '</h3>' +
      '<div class="wb-record__meta">' +
      '<span class="wb-record__time">' + esc(formatDateTime(log.createTime)) + '</span>' +
      '<span class="wb-record__type">' + esc(log.module || meta.module) + '</span>' +
      '<span class="wb-record__status ' + statusCls + '">' + esc(STATUS_LABEL[log.status] || STATUS_LABEL.completed) + '</span>' +
      '</div>' +
      '<p class="wb-record__summary">「' + esc(FayiActivity.truncate(log.summary || log.userInput, 48)) + '」</p>' +
      '</button>';
  }

  function renderList() {
    var logs = getFilteredLogs();
    var root = document.getElementById('wb-list-root');
    if (!root) return;
    if (!logs.length) {
      root.innerHTML = '<div class="wb-list-empty">暂无匹配记录<br><a href="chat.html">开始法律咨询</a></div>';
      return;
    }
    root.innerHTML = logs.map(renderRecordItem).join('');
    root.querySelectorAll('.wb-record').forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectRecord(btn.getAttribute('data-id'));
      });
    });
  }

  function renderSkeleton() {
    return '<div class="wb-detail-inner is-loading"><div class="wb-detail-card wb-skeleton">' +
      '<div class="wb-skeleton__line wb-skeleton__line--lg"></div>' +
      '<div class="wb-skeleton__line wb-skeleton__line--md"></div>' +
      '<div class="wb-skeleton__line"></div><div class="wb-skeleton__line"></div><div class="wb-skeleton__line wb-skeleton__line--sm"></div>' +
      '</div></div>';
  }

  function renderAttachments(log) {
    if (!log.attachments || !log.attachments.length) return '';
    var html = '<section class="wb-section"><h3 class="wb-section__title">附件与材料</h3><div class="wb-attachments">';
    log.attachments.forEach(function (att) {
      var isImg = att.type && att.type.indexOf('image') === 0;
      html += '<div class="wb-attach">';
      if (isImg && att.url) {
        html += '<img src="' + esc(att.url) + '" alt="' + esc(att.name) + '" loading="lazy" />';
      }
      html += '<div class="wb-attach__name">' + esc(att.name || '附件') + '</div></div>';
    });
    html += '</div></section>';
    return html;
  }

  function renderEmptyDetail() {
    return '<div class="wb-empty">' +
      '<div class="wb-empty__illus">' +
      '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">' +
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>' +
      '<line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div>' +
      '<h2>请选择一条历史记录查看详情</h2>' +
      '<p>左侧列表展示您的法律咨询、文书生成、法规检索等 AI 服务记录，点击即可在此预览完整内容。</p>' +
      (isMobile() ? '<button type="button" class="wb-btn wb-btn--primary" id="wb-open-drawer" style="margin-top:20px">浏览历史记录</button>' : '') +
      '</div>';
  }

  function renderDetailToolbar(log) {
    var starred = log.starred ? ' is-starred' : '';
    return '<div class="wb-toolbar">' +
      '<div class="wb-toolbar__left">' +
      (isMobile() ? '<button type="button" class="wb-btn wb-back-btn" id="wb-back-list">← 返回</button>' : '') +
      '<button type="button" class="wb-btn' + starred + '" id="wb-btn-star" title="收藏">' + (log.starred ? '★' : '☆') + ' <span class="wb-btn-label">收藏</span></button>' +
      '<button type="button" class="wb-btn wb-btn--danger" id="wb-btn-delete"><span class="wb-btn-label">删除</span></button>' +
      '<button type="button" class="wb-btn" id="wb-btn-regen"><span class="wb-btn-label">重新生成</span></button>' +
      '</div>' +
      '<div class="wb-toolbar__right">' +
      '<button type="button" class="wb-btn" id="wb-btn-copy"><span class="wb-btn-label">复制内容</span></button>' +
      '<button type="button" class="wb-btn" id="wb-btn-word"><span class="wb-btn-label">导出 Word</span></button>' +
      '<button type="button" class="wb-btn wb-btn--primary" id="wb-btn-pdf"><span class="wb-btn-label">导出 PDF</span></button>' +
      '</div></div>';
  }

  function renderDetail(log) {
    if (!log) return renderEmptyDetail();
    var meta = FayiActivity.getTypeMeta(log.type);
    var statusCls = 'wb-record__status--' + (log.status || 'completed');
    var aiHtml = log.content
      ? '<div class="wb-md wb-html-content">' + log.content + '</div>'
      : '<div class="wb-md" id="wb-md-body">' + renderMarkdown(log.markdown) + '</div>';

    return '<div class="wb-detail-inner">' +
      renderDetailToolbar(log) +
      '<article class="wb-detail-card" id="wb-detail-card">' +
      '<header class="wb-detail-head">' +
      '<h2>' + esc(log.title) + '</h2>' +
      '<div class="wb-detail-meta">' +
      '<span class="wb-detail-meta__item">' + esc(formatDateTime(log.createTime)) + '</span>' +
      '<span class="wb-detail-meta__tag">' + esc(log.module || meta.module) + '</span>' +
      '<span class="wb-record__status ' + statusCls + '">' + esc(STATUS_LABEL[log.status] || '已完成') + '</span>' +
      '</div></header>' +
      (log.userInput ? '<section class="wb-section"><h3 class="wb-section__title">用户输入</h3><div class="wb-user-input">' + esc(log.userInput) + '</div></section>' : '') +
      renderAttachments(log) +
      '<section class="wb-section"><h3 class="wb-section__title">AI 生成内容</h3>' + aiHtml + '</section>' +
      '</article></div>';
  }

  function bindDetailActions(log) {
    var starBtn = document.getElementById('wb-btn-star');
    var delBtn = document.getElementById('wb-btn-delete');
    var regenBtn = document.getElementById('wb-btn-regen');
    var copyBtn = document.getElementById('wb-btn-copy');
    var wordBtn = document.getElementById('wb-btn-word');
    var pdfBtn = document.getElementById('wb-btn-pdf');
    var backBtn = document.getElementById('wb-back-list');
    var openDrawer = document.getElementById('wb-open-drawer');

    if (starBtn) starBtn.addEventListener('click', function () {
      FayiActivity.toggleFavorite(log.id);
      refresh();
    });
    if (delBtn) delBtn.addEventListener('click', function () {
      if (!confirm('确定删除这条记录吗？')) return;
      FayiActivity.deleteActivityLog(log.id);
      state.activeId = null;
      closeMobileDetail();
      refresh();
    });
    if (regenBtn) regenBtn.addEventListener('click', function () { handleRegenerate(log); });
    if (copyBtn) copyBtn.addEventListener('click', function () { copyContent(log); });
    if (wordBtn) wordBtn.addEventListener('click', function () { exportWord(log); });
    if (pdfBtn) pdfBtn.addEventListener('click', function () { exportPdf(log); });
    if (backBtn) backBtn.addEventListener('click', closeMobileDetail);
    if (openDrawer) openDrawer.addEventListener('click', openDrawerList);
  }

  function renderDetailPanel() {
    var root = document.getElementById('wb-detail-root');
    if (!root) return;
    if (state.loading) {
      root.innerHTML = renderSkeleton();
      return;
    }
    var log = getActiveRecord();
    root.innerHTML = renderDetail(log);
    if (log) bindDetailActions(log);
    else {
      var openBtn = document.getElementById('wb-open-drawer');
      if (openBtn) openBtn.addEventListener('click', openDrawerList);
    }
  }

  function selectRecord(id) {
    if (!id) return;
    state.loading = true;
    renderDetailPanel();
    setTimeout(function () {
      state.activeId = id;
      state.loading = false;
      if (isMobile()) {
        state.mobileDetailOpen = true;
        document.getElementById('wb-sidebar').classList.remove('is-open');
        document.getElementById('wb-drawer-backdrop').classList.remove('is-visible');
        document.getElementById('wb-detail-root').classList.add('mobile-full');
      }
      renderList();
      renderDetailPanel();
    }, 180);
  }

  function openDrawerList() {
    document.getElementById('wb-sidebar').classList.add('is-open');
    document.getElementById('wb-drawer-backdrop').classList.add('is-visible');
  }

  function closeMobileDetail() {
    state.mobileDetailOpen = false;
    state.activeId = null;
    var detail = document.getElementById('wb-detail-root');
    if (detail) detail.classList.remove('mobile-full');
    renderList();
    renderDetailPanel();
    if (isMobile()) openDrawerList();
  }

  function handleRegenerate(log) {
    var key = REGEN_KEYS[log.type] || ('fayi_regenerate_' + log.type);
    if (log.userInput) sessionStorage.setItem(key, log.userInput);
    var link = log.link || (FayiActivity.TYPE_META[log.type] && FayiActivity.TYPE_META[log.type].link) || 'index.html';
    window.open(link, '_blank');
    if (window.FayiToast) FayiToast('已打开对应模块，输入内容已预填', 'success');
  }

  function copyContent(log) {
    var text = log.markdown || log.content || log.summary || '';
    var plain = text.replace(/<[^>]+>/g, '');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(plain).then(function () {
        if (window.FayiToast) FayiToast('内容已复制到剪贴板', 'success');
      });
    } else {
      var ta = document.createElement('textarea');
      ta.value = plain;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      if (window.FayiToast) FayiToast('内容已复制', 'success');
    }
  }

  function buildExportHtml(log) {
    var body = log.content
      ? '<div class="export-body">' + log.content + '</div>'
      : '<div class="export-body">' + renderMarkdown(log.markdown) + '</div>';
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
      'body{font-family:"Microsoft YaHei","PingFang SC",SimSun,sans-serif;line-height:1.8;color:#1e293b;padding:40px}' +
      'h1{font-size:22pt;margin-bottom:12pt}h2{font-size:16pt;margin-top:18pt}h3{font-size:14pt}' +
      'blockquote{border-left:4px solid #7c83fd;padding:8px 16px;background:#f5f7ff;color:#475569;margin:12pt 0}' +
      'p{margin:8pt 0}ul,ol{margin:8pt 0;padding-left:24pt}strong{font-weight:bold}' +
      '</style></head><body><h1>' + esc(log.title) + '</h1>' +
      '<p><em>' + esc(formatDateTime(log.createTime)) + ' · ' + esc(log.module) + '</em></p>' +
      (log.userInput ? '<h2>用户输入</h2><p>' + esc(log.userInput) + '</p>' : '') +
      '<h2>AI 生成内容</h2>' + body + '</body></html>';
  }

  function downloadBlob(blob, filename) {
    var safeName = sanitizeFilenamePart(filename, '法律服务记录').replace(/\.+$/, '');
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    a.setAttribute('download', safeName);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function exportWord(log) {
    if (!log.exportable) {
      if (window.FayiToast) FayiToast('该记录不支持导出', 'error');
      return;
    }
    if (typeof htmlDocx === 'undefined') {
      if (window.FayiToast) FayiToast('Word 导出库未加载', 'error');
      return;
    }
    try {
      var html = buildExportHtml(log);
      var blob = htmlDocx.asBlob(html, {
        orientation: 'portrait',
        margins: { top: 720, right: 720, bottom: 720, left: 720 }
      });
      downloadBlob(blob, buildExportFilename(log, 'docx'));
      FayiActivity.markExported(log.id);
      refresh();
      if (window.FayiToast) FayiToast('Word 文档已导出', 'success');
    } catch (e) {
      if (window.FayiToast) FayiToast('导出失败：' + e.message, 'error');
    }
  }

  function exportPdf(log) {
    if (!log.exportable) {
      if (window.FayiToast) FayiToast('该记录不支持导出', 'error');
      return;
    }
    if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') {
      if (window.FayiToast) FayiToast('PDF 导出库未加载', 'error');
      return;
    }
    var target = document.getElementById('wb-export-target');
    var card = document.getElementById('wb-detail-card');
    if (!target || !card) return;

    target.innerHTML = '<h1 style="font-size:22px;margin-bottom:12px">' + esc(log.title) + '</h1>' +
      (log.userInput ? '<h2 style="font-size:16px">用户输入</h2><p>' + esc(log.userInput) + '</p>' : '') +
      '<h2 style="font-size:16px">AI 生成内容</h2>' +
      (log.content ? log.content : renderMarkdown(log.markdown));

    var pdfBtn = document.getElementById('wb-btn-pdf');
    if (pdfBtn) pdfBtn.disabled = true;

    html2canvas(target, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' }).then(function (canvas) {
      var pdf = new jspdf.jsPDF('p', 'mm', 'a4');
      var pageW = pdf.internal.pageSize.getWidth();
      var pageH = pdf.internal.pageSize.getHeight();
      var margin = 10;
      var imgW = pageW - margin * 2;
      var imgH = (canvas.height * imgW) / canvas.width;
      var sliceH = (canvas.width * (pageH - margin * 2)) / imgW;
      var yPos = 0;
      var page = 0;

      while (yPos < canvas.height) {
        if (page > 0) pdf.addPage();
        var sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = Math.min(sliceH, canvas.height - yPos);
        var ctx = sliceCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, yPos, canvas.width, sliceCanvas.height, 0, 0, canvas.width, sliceCanvas.height);
        var sliceImg = sliceCanvas.toDataURL('image/jpeg', 0.92);
        var renderH = (sliceCanvas.height * imgW) / canvas.width;
        pdf.addImage(sliceImg, 'JPEG', margin, margin, imgW, renderH);
        yPos += sliceH;
        page++;
      }

      pdf.save(buildExportFilename(log, 'pdf'));
      FayiActivity.markExported(log.id);
      refresh();
      if (window.FayiToast) FayiToast('PDF 已导出', 'success');
    }).catch(function (e) {
      if (window.FayiToast) FayiToast('PDF 导出失败：' + e.message, 'error');
    }).finally(function () {
      if (pdfBtn) pdfBtn.disabled = false;
      target.innerHTML = '';
    });
  }

  function refresh() {
    var statsEl = document.getElementById('wb-stats-mini');
    if (statsEl) statsEl.innerHTML = renderMiniStats();
    renderList();
    renderDetailPanel();
  }

  function initFilters() {
    var search = document.getElementById('wb-search');
    var typeSel = document.getElementById('wb-filter-type');
    var statusSel = document.getElementById('wb-filter-status');
    var starBtn = document.getElementById('wb-filter-star');
    var backdrop = document.getElementById('wb-drawer-backdrop');

    if (search) {
      search.addEventListener('input', function () {
        state.query = search.value.trim();
        renderList();
      });
    }
    if (typeSel) {
      typeSel.addEventListener('change', function () {
        state.typeFilter = typeSel.value;
        renderList();
      });
    }
    if (statusSel) {
      statusSel.addEventListener('change', function () {
        state.statusFilter = statusSel.value;
        renderList();
      });
    }
    if (starBtn) {
      starBtn.addEventListener('click', function () {
        state.starredOnly = !state.starredOnly;
        starBtn.classList.toggle('is-active', state.starredOnly);
        starBtn.textContent = state.starredOnly ? '★' : '☆';
        renderList();
      });
    }
    if (backdrop) {
      backdrop.addEventListener('click', function () {
        document.getElementById('wb-sidebar').classList.remove('is-open');
        backdrop.classList.remove('is-visible');
      });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!window.FayiAuth || !FayiAuth.getCurrentUser()) {
      window.location.replace('login.html?next=' + encodeURIComponent('updates.html'));
      return;
    }
    if (!window.FayiActivity) return;

    var user = FayiAuth.getCurrentUser();
    var sub = document.getElementById('wb-sidebar-sub');
    if (sub && user && user.name) {
      sub.textContent = user.name.split(/[@\s]/)[0] + ' 的 AI 法律服务工作台';
    }

    initFilters();
    refresh();

    if (isMobile()) openDrawerList();

    var logs = getFilteredLogs();
    if (logs.length && !state.activeId) {
      selectRecord(logs[0].id);
    }

    window.addEventListener('fayi-activity-added', refresh);
    window.addEventListener('fayi-activity-updated', refresh);
    window.addEventListener('fayi-activity-deleted', refresh);
    window.addEventListener('resize', function () {
      if (!isMobile()) {
        document.getElementById('wb-sidebar').classList.remove('is-open');
        document.getElementById('wb-drawer-backdrop').classList.remove('is-visible');
      }
    });
  });
})();

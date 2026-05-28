/**
 * OCR 识别 · 真实数据 / 详情抽屉 / 图片预览
 */
window.OpsPages = window.OpsPages || {};
OpsPages.ocr = (function () {
  var ocrList = [];
  var currentOcrDetail = null;
  var ocrDetailVisible = false;
  var ocrLoading = false;
  var detailLoading = false;
  var filter = { search: '', status: 'all', page: 1, pageSize: 15 };
  var drawerBound = false;
  var lightboxBound = false;
  var lightboxScale = 1;
  var lightboxX = 0;
  var lightboxY = 0;
  var dragStart = null;

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  function fmtDateTime(iso) {
    if (!iso) return '—';
    return String(iso).replace('T', ' ').slice(0, 16);
  }

  function confDisplay(c) {
    if (c == null || c === '') return '—';
    var n = Number(c);
    if (isNaN(n)) return '—';
    if (n <= 1) n = Math.round(n * 100);
    return n + '%';
  }

  function isLowConfidence(c) {
    if (c == null) return false;
    var n = Number(c);
    if (isNaN(n)) return false;
    if (n > 1) n = n / 100;
    return n < 0.7;
  }

  function resolveImgSrc(url, id, hasImage) {
    if (id && window.FayiAdminApi && FayiAdminApi.ocrImageUrl) {
      if (hasImage !== false) return FayiAdminApi.ocrImageUrl(id);
    }
    if (url) return url;
    return '';
  }

  function ensureDrawer() {
    if (drawerBound) return;
    drawerBound = true;
    document.body.insertAdjacentHTML('beforeend',
      '<div class="ops-drawer-overlay" id="ops-ocr-overlay"></div>' +
      '<aside class="ops-drawer ops-drawer--ocr" id="ops-ocr-drawer" aria-label="OCR详情">' +
        '<div class="ops-drawer__head"><div><h3 style="margin:0;color:var(--ops-title)" id="ops-ocr-drawer-title">OCR 详情</h3>' +
        '<p style="margin:4px 0 0;font-size:12px;color:var(--ops-text)" id="ops-ocr-drawer-sub"></p></div>' +
        '<button type="button" class="ops-icon-btn" id="ops-ocr-drawer-close"><iconify-icon icon="lucide:x"></iconify-icon></button></div>' +
        '<div class="ops-drawer__body" id="ops-ocr-drawer-body"></div></aside>');
    document.getElementById('ops-ocr-drawer-close').addEventListener('click', closeOcrDetail);
    document.getElementById('ops-ocr-overlay').addEventListener('click', closeOcrDetail);
  }

  function ensureLightbox() {
    if (lightboxBound) return;
    lightboxBound = true;
    document.body.insertAdjacentHTML('beforeend',
      '<div class="ops-ocr-lightbox" id="ops-ocr-lightbox" role="dialog" aria-modal="true">' +
        '<div class="ops-ocr-lightbox__toolbar">' +
          '<button type="button" class="ops-btn ops-btn--sm" id="ops-ocr-lb-zoom-in">放大</button>' +
          '<button type="button" class="ops-btn ops-btn--sm" id="ops-ocr-lb-zoom-out">缩小</button>' +
          '<button type="button" class="ops-btn ops-btn--sm" id="ops-ocr-lb-dl">下载</button>' +
          '<button type="button" class="ops-btn ops-btn--sm" id="ops-ocr-lb-close">关闭</button>' +
        '</div>' +
        '<div class="ops-ocr-lightbox__stage" id="ops-ocr-lb-stage"><img id="ops-ocr-lb-img" alt="OCR原图" /></div>' +
        '<p class="ops-ocr-lightbox__hint">滚轮缩放 · 拖拽移动 · Esc 关闭</p></div>');

    document.getElementById('ops-ocr-lb-close').onclick = closeLightbox;
    document.getElementById('ops-ocr-lb-zoom-in').onclick = function () { lightboxScale = Math.min(4, lightboxScale + 0.25); applyLightboxTransform(); };
    document.getElementById('ops-ocr-lb-zoom-out').onclick = function () { lightboxScale = Math.max(0.5, lightboxScale - 0.25); applyLightboxTransform(); };
    document.getElementById('ops-ocr-lb-dl').onclick = downloadLightboxImage;

    var stage = document.getElementById('ops-ocr-lb-stage');
    stage.addEventListener('wheel', function (e) {
      e.preventDefault();
      lightboxScale += e.deltaY < 0 ? 0.1 : -0.1;
      lightboxScale = Math.max(0.5, Math.min(4, lightboxScale));
      applyLightboxTransform();
    }, { passive: false });
    stage.addEventListener('mousedown', function (e) {
      dragStart = { x: e.clientX - lightboxX, y: e.clientY - lightboxY };
      stage.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', function (e) {
      if (!dragStart) return;
      lightboxX = e.clientX - dragStart.x;
      lightboxY = e.clientY - dragStart.y;
      applyLightboxTransform();
    });
    window.addEventListener('mouseup', function () {
      dragStart = null;
      if (stage) stage.style.cursor = 'grab';
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeLightbox();
    });
  }

  var lightboxSrc = '';

  function applyLightboxTransform() {
    var img = document.getElementById('ops-ocr-lb-img');
    if (!img) return;
    img.style.transform = 'translate(' + lightboxX + 'px,' + lightboxY + 'px) scale(' + lightboxScale + ')';
  }

  function openLightbox(src) {
    if (!src) return;
    ensureLightbox();
    lightboxSrc = src;
    lightboxScale = 1;
    lightboxX = 0;
    lightboxY = 0;
    var img = document.getElementById('ops-ocr-lb-img');
    img.src = src;
    applyLightboxTransform();
    document.getElementById('ops-ocr-lightbox').classList.add('is-open');
  }

  function closeLightbox() {
    var lb = document.getElementById('ops-ocr-lightbox');
    if (lb) lb.classList.remove('is-open');
  }

  function downloadLightboxImage() {
    if (!lightboxSrc) return;
    var a = document.createElement('a');
    a.href = lightboxSrc;
    a.download = (currentOcrDetail && currentOcrDetail.fileName) || 'ocr-image';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function openOcrDetail(id) {
    if (!id || detailLoading) return;
    ensureDrawer();
    detailLoading = true;
    ocrDetailVisible = true;
    currentOcrDetail = null;

    document.getElementById('ops-ocr-drawer-title').textContent = '加载中…';
    document.getElementById('ops-ocr-drawer-sub').textContent = '';
    document.getElementById('ops-ocr-drawer-body').innerHTML =
      '<div class="ops-doc-drawer__loading"><iconify-icon icon="lucide:loader-2"></iconify-icon> 正在加载 OCR 详情…</div>';
    document.getElementById('ops-ocr-overlay').classList.add('is-open');
    document.getElementById('ops-ocr-drawer').classList.add('is-open');

    OpsDataCenter.ocrDetail(id).then(function (d) {
      detailLoading = false;
      if (!d) {
        document.getElementById('ops-ocr-drawer-body').innerHTML = '<p class="ops-empty">记录不存在</p>';
        return;
      }
      currentOcrDetail = d;
      renderOcrDetail(d);
      if (window.OpsSystemLog) OpsSystemLog.view('ocr', '查看OCR详情', id, d.fileName || d.textPreview);
    }).catch(function (err) {
      detailLoading = false;
      console.error('ocr detail load failed', err);
      document.getElementById('ops-ocr-drawer-body').innerHTML = '<p class="ops-empty">加载失败，请稍后重试</p>';
    });
  }

  function closeOcrDetail() {
    ocrDetailVisible = false;
    currentOcrDetail = null;
    var o = document.getElementById('ops-ocr-overlay');
    var d = document.getElementById('ops-ocr-drawer');
    if (o) o.classList.remove('is-open');
    if (d) d.classList.remove('is-open');
  }

  function copyText(text) {
    if (!navigator.clipboard) {
      prompt('复制以下内容', text);
      return;
    }
    navigator.clipboard.writeText(text || '').then(function () {
      if (window.FayiToast) FayiToast('已复制到剪贴板', 'success');
    });
  }

  function collapsibleBlock(id, text, emptyMsg) {
    var body = String(text || '').trim();
    if (!body) return '<p class="ops-doc-empty">' + esc(emptyMsg) + '</p>';
    return '<div class="ops-ocr-scroll is-collapsed" id="' + id + '">' + esc(body) + '</div>' +
      '<button type="button" class="ops-doc-toggle" data-toggle="' + id + '">展开全文</button>';
  }

  function bindCollapsibles(root) {
    if (!root) return;
    root.querySelectorAll('[data-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var el = document.getElementById(btn.getAttribute('data-toggle'));
        if (!el) return;
        var collapsed = el.classList.toggle('is-collapsed');
        btn.textContent = collapsed ? '展开全文' : '收起';
      });
    });
  }

  function renderAnalysisSection(d) {
    var ar = d.analysisResult;
    if (!ar || (typeof ar === 'object' && !ar.text && !(ar.keywords && ar.keywords.length))) {
      return '<p class="ops-doc-empty">暂无分析结果</p>';
    }
    if (typeof ar === 'string') {
      return collapsibleBlock('ops-ocr-analysis', ar, '暂无分析结果');
    }
    var riskCls = ar.riskLevel === 'high' ? ' ops-ocr-risk-high' : '';
    var tags = '';
    if (ar.legalCategory) {
      tags += '<span class="ops-tag">' + esc(ar.legalCategory) + '</span>';
    }
    if (ar.riskLabel) {
      tags += '<span class="ops-tag' + riskCls + '">' + esc(ar.riskLabel) + '</span>';
    }
    (ar.keywords || []).slice(0, 8).forEach(function (kw) {
      tags += '<span class="ops-tag">' + esc(kw) + '</span>';
    });
    var text = ar.text || ar.riskAnalysis || ar.summary || '';
    return (tags ? '<div class="ops-ocr-tags">' + tags + '</div>' : '') +
      collapsibleBlock('ops-ocr-analysis', text, '暂无分析结果');
  }

  function renderOcrDetail(d) {
    var imgSrc = resolveImgSrc(d.imageUrl, d.id, d.hasImage);
    var confCls = isLowConfidence(d.confidence) ? ' ops-ocr-conf--low' : '';
    var ocrText = d.ocrText || d.fullText || d.textPreview || '';

    document.getElementById('ops-ocr-drawer-title').textContent = d.fileName || 'OCR 详情';
    document.getElementById('ops-ocr-drawer-sub').textContent =
      fmtDateTime(d.createdAt) + ' · ' + esc(d.statusLabel || d.status);

    var imgBlock = imgSrc
      ? '<div class="ops-ocr-detail__img-wrap" id="ops-ocr-detail-img" data-src="' + esc(imgSrc) + '">' +
          '<img src="' + esc(imgSrc) + '" alt="' + esc(d.fileName) + '" onerror="this.parentNode.innerHTML=\'<div class=ops-ocr-detail__img-placeholder>图片加载失败</div>\'" />' +
        '</div>'
      : '<div class="ops-ocr-detail__img-placeholder">无原始图片</div>';

    document.getElementById('ops-ocr-drawer-body').innerHTML =
      '<section class="ops-doc-card"><h4>① 图片预览</h4>' + imgBlock +
        (imgSrc ? '<button type="button" class="ops-btn ops-btn--sm" id="ops-ocr-open-lb">全屏查看</button>' : '') +
      '</section>' +
      '<section class="ops-doc-card"><h4>基础信息</h4>' +
        '<p>置信度：<span class="' + confCls.trim() + '">' + confDisplay(d.confidence) + '</span></p>' +
        '<p>状态：' + esc(d.statusLabel || d.status) + '</p>' +
        '<p>用户：' + esc(d.userName || d.userId || '—') + '</p></section>' +
      '<section class="ops-doc-card"><h4>② OCR 识别结果</h4>' +
        collapsibleBlock('ops-ocr-text', ocrText, '无识别文本') +
        '<button type="button" class="ops-btn ops-btn--sm" style="margin-top:8px" id="ops-ocr-copy">复制全文</button></section>' +
      '<section class="ops-doc-card"><h4>③ AI 分析结果</h4>' + renderAnalysisSection(d) + '</section>';

    bindCollapsibles(document.getElementById('ops-ocr-drawer-body'));

    var wrap = document.getElementById('ops-ocr-detail-img');
    if (wrap) {
      wrap.addEventListener('click', function () { openLightbox(wrap.getAttribute('data-src')); });
    }
    var lbBtn = document.getElementById('ops-ocr-open-lb');
    if (lbBtn) lbBtn.onclick = function () { openLightbox(imgSrc); };
    document.getElementById('ops-ocr-copy').onclick = function () { copyText(ocrText); };
  }

  function mount(root) {
    ensureDrawer();
    ensureLightbox();
    root.innerHTML =
      (window.OpsUI ? OpsUI.pageHeader('OCR 识别', '真实识别记录 · 原图预览 · AI 分析结果') : '') +
      '<section class="ops-ocr-stats" id="ops-ocr-stats"></section>' +
      '<div class="ops-toolbar">' +
        '<input type="search" id="ops-ocr-q" placeholder="搜索文件名、识别文本、用户" />' +
        '<select id="ops-ocr-status"><option value="all">全部状态</option>' +
          '<option value="success">已完成</option><option value="processing">处理中</option><option value="failed">失败</option></select>' +
        '<select id="ops-ocr-pagesize"><option value="10">每页 10 条</option><option value="15" selected>每页 15 条</option></select>' +
      '</div>' +
      '<div class="ops-ocr-list" id="ops-ocr-list"></div>' +
      '<nav class="ops-pagination" id="ops-ocr-pagination"></nav>';

    ['ops-ocr-q', 'ops-ocr-status', 'ops-ocr-pagesize'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', function () {
        if (id === 'ops-ocr-pagesize') filter.page = 1;
        fetchOcrList();
      });
      if (el.type === 'search') {
        el.addEventListener('input', debounce(function () { filter.page = 1; fetchOcrList(); }, 320));
      }
    });
    fetchOcrList();
    loadOcrStats();
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  function readFilters() {
    filter.search = (document.getElementById('ops-ocr-q') || {}).value || '';
    filter.status = (document.getElementById('ops-ocr-status') || {}).value || 'all';
    filter.pageSize = parseInt((document.getElementById('ops-ocr-pagesize') || {}).value, 10) || 15;
  }

  function fetchOcrList() {
    readFilters();
    ocrLoading = true;
    renderListSkeleton();
    return OpsDataCenter.loadOcr(filter).then(function (data) {
      ocrLoading = false;
      var payload = data || {};
      ocrList = payload.list || [];
      renderList(ocrList);
      renderPagination({
        total: payload.total || ocrList.length,
        page: filter.page,
        pageSize: filter.pageSize,
        totalPages: payload.totalPages || Math.max(1, Math.ceil((payload.total || 0) / filter.pageSize))
      });
      return ocrList;
    }).catch(function (err) {
      ocrLoading = false;
      console.error('ocr list load failed', err);
      ocrList = [];
      renderList([]);
      renderPagination({ total: 0, page: 1, pageSize: filter.pageSize, totalPages: 1 });
    });
  }

  function loadOcrStats() {
    FayiAdminApi.ocrStats().then(function (res) {
      var stats = (res && res.data != null) ? res.data : res;
      renderStatsBar(stats || {});
    }).catch(function (err) {
      console.error('ocr stats load failed', err);
      renderStatsBar({});
    });
  }

  function renderStatsBar(s) {
    var el = document.getElementById('ops-ocr-stats');
    if (!el) return;
    s = s || {};
    function card(label, val, color) {
      return '<div class="ops-card"><label>' + label + '</label><strong class="ops-num" style="color:' +
        (color || 'var(--ops-title)') + '">' + (val != null ? val : 0) + '</strong></div>';
    }
    el.innerHTML =
      card('识别总量', s.totalCount || s.total || 0) +
      card('今日识别', s.todayCount || 0, 'var(--ops-cyan)') +
      card('成功率', (s.successRate != null ? s.successRate + '%' : '—'), 'var(--ops-success)') +
      card('处理中', s.processingCount || 0, 'var(--ops-gold)');
  }

  function renderListSkeleton() {
    var box = document.getElementById('ops-ocr-list');
    if (!box) return;
    box.innerHTML = [1, 2, 3, 4, 5].map(function () {
      return '<div class="ops-ocr-skeleton"></div>';
    }).join('');
  }

  function statusTag(label, status) {
    var cls = status === 'failed' ? 'ops-tag--risk-high' : status === 'processing' ? 'ops-tag--risk-mid' : 'ops-tag--risk-low';
    return '<span class="ops-tag ' + cls + '">' + esc(label || '已完成') + '</span>';
  }

  function renderList(list) {
    var box = document.getElementById('ops-ocr-list');
    if (!box) return;
    if (!list.length) {
      box.innerHTML = '<p class="ops-empty">暂无 OCR 识别记录</p>';
      return;
    }
    box.innerHTML = list.map(function (row) {
      var imgSrc = resolveImgSrc(row.imageUrl, row.id, row.hasImage);
      var confCls = isLowConfidence(row.confidence) ? ' ops-ocr-conf--low' : '';
      var thumb = imgSrc
        ? '<img src="' + esc(imgSrc) + '" alt="" loading="lazy" onerror="this.outerHTML=\'<span class=ops-ocr-item__thumb-placeholder>无图</span>\'" />'
        : '<span class="ops-ocr-item__thumb-placeholder">无图</span>';
      return '<article class="ops-ocr-item" data-id="' + esc(row.id) + '" role="button" tabindex="0">' +
        '<div class="ops-ocr-item__thumb">' + thumb + '</div>' +
        '<div><h3 class="ops-ocr-item__title">' + esc(row.fileName) + '</h3>' +
          '<p class="ops-ocr-item__preview">' + esc(row.textPreview || row.ocrText || '（无文本）') + '</p>' +
          '<div class="ops-ocr-item__meta">' +
            statusTag(row.statusLabel, row.status) +
            '<span class="' + confCls.trim() + '">置信度 ' + confDisplay(row.confidence) + '</span>' +
            '<span>' + fmtDateTime(row.createdAt) + '</span>' +
          '</div></div>' +
        '<div><button type="button" class="ops-btn ops-btn--sm" data-view="' + esc(row.id) + '">查看</button></div>' +
      '</article>';
    }).join('');

    box.querySelectorAll('.ops-ocr-item').forEach(function (row) {
      row.addEventListener('click', function (e) {
        if (e.target.closest('button')) return;
        openOcrDetail(row.getAttribute('data-id'));
      });
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openOcrDetail(row.getAttribute('data-id'));
        }
      });
    });
    box.querySelectorAll('[data-view]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        openOcrDetail(btn.getAttribute('data-view'));
      });
    });
  }

  function renderPagination(data) {
    var nav = document.getElementById('ops-ocr-pagination');
    if (!nav || !data) return;
    var page = data.page || filter.page || 1;
    var totalPages = data.totalPages || 1;
    var total = data.total || 0;
    if (totalPages <= 1) {
      nav.innerHTML = '<span class="ops-pagination__info">共 ' + total + ' 条记录</span>';
      return;
    }
    var pages = [];
    for (var i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i++) pages.push(i);
    nav.innerHTML =
      '<button type="button" class="ops-pagination__btn" data-page="prev"' + (page <= 1 ? ' disabled' : '') + '>‹ 上一页</button>' +
      pages.map(function (p) {
        return '<button type="button" class="ops-pagination__page' + (p === page ? ' is-active' : '') + '" data-page="' + p + '">' + p + '</button>';
      }).join('') +
      '<button type="button" class="ops-pagination__btn" data-page="next"' + (page >= totalPages ? ' disabled' : '') + '>下一页 ›</button>' +
      '<span class="ops-pagination__info">第 ' + page + ' / ' + totalPages + ' 页 · 共 ' + total + ' 条</span>';
    nav.querySelectorAll('[data-page]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var p = btn.getAttribute('data-page');
        if (p === 'prev') filter.page = Math.max(1, page - 1);
        else if (p === 'next') filter.page = Math.min(totalPages, page + 1);
        else filter.page = parseInt(p, 10);
        fetchOcrList();
      });
    });
  }

  function onData() {
    if (document.getElementById('ops-ocr-list') && !ocrLoading) fetchOcrList();
  }

  return {
    mount: mount,
    onData: onData,
    openOcrDetail: openOcrDetail,
    closeOcrDetail: closeOcrDetail,
    fetchOcrList: fetchOcrList,
    get ocrList() { return ocrList; },
    get currentOcrDetail() { return currentOcrDetail; },
    get ocrDetailVisible() { return ocrDetailVisible; },
    get ocrLoading() { return ocrLoading; }
  };
})();

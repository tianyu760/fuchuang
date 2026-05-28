/**
 * 文书系统 · 列表 → 详情抽屉 → PDF 下载
 */
window.OpsPages = window.OpsPages || {};
OpsPages.documents = (function () {
  var filter = { search: '', docType: 'all', status: 'all', date: 'all', page: 1, pageSize: 15 };
  var documentStatistics = {
    total: 0,
    todayCount: 0,
    processingCount: 0,
    completedCount: 0,
    pendingReviewCount: 0
  };
  var activeStatFilter = 'total';
  var statisticsLoading = true;
  var listLoading = false;
  var statClickLock = false;
  var documentDetailVisible = false;
  var currentDocument = null;
  var drawerBound = false;
  var pdfLoading = false;
  var detailLoading = false;

  function defaultStatistics() {
    return {
      total: 0,
      todayCount: 0,
      processingCount: 0,
      completedCount: 0,
      pendingReviewCount: 0
    };
  }

  function numVal(v) {
    var n = Number(v);
    return isNaN(n) ? 0 : n;
  }

  function isValidDocumentId(id) {
    if (!id || typeof id !== 'string') return false;
    if (id === 'statistics' || id === 'stats' || id === 'list') return false;
    return /^(doc_|dgl_)/.test(id);
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  function fmtDateTime(iso) {
    if (!iso) return '—';
    return String(iso).replace('T', ' ').slice(0, 16);
  }

  function statusTag(code, label) {
    var cls = 'ops-tag';
    if (code === 'pending_review' || code === 'processing') cls += ' ops-tag--risk-mid';
    else if (code === 'archived') cls += ' ops-tag--risk-low';
    else cls += ' ops-tag--risk-low';
    return '<span class="' + cls + '">' + esc(label || '已完成') + '</span>';
  }

  function ensureDrawer() {
    if (drawerBound) return;
    drawerBound = true;
    document.body.insertAdjacentHTML('beforeend',
      '<div class="ops-drawer-overlay" id="ops-doc-overlay"></div>' +
      '<aside class="ops-drawer ops-drawer--doc" id="ops-doc-drawer" aria-label="文书详情">' +
        '<div class="ops-drawer__head"><div><h3 style="margin:0;color:var(--ops-title)" id="ops-doc-drawer-title">文书详情</h3>' +
        '<p style="margin:4px 0 0;font-size:12px;color:var(--ops-text)" id="ops-doc-drawer-sub"></p></div>' +
        '<button type="button" class="ops-icon-btn" id="ops-doc-drawer-close"><iconify-icon icon="lucide:x"></iconify-icon></button></div>' +
        '<div class="ops-drawer__body" id="ops-doc-drawer-body"></div></aside>');
    document.getElementById('ops-doc-drawer-close').addEventListener('click', closeDocumentDetail);
    document.getElementById('ops-doc-overlay').addEventListener('click', closeDocumentDetail);
  }

  function openDocumentDetail(recordId) {
    if (!isValidDocumentId(recordId) || detailLoading) return;
    ensureDrawer();
    detailLoading = true;
    documentDetailVisible = true;
    currentDocument = null;

    document.getElementById('ops-doc-drawer-title').textContent = '加载中…';
    document.getElementById('ops-doc-drawer-sub').textContent = '';
    document.getElementById('ops-doc-drawer-body').innerHTML =
      '<div class="ops-doc-drawer__loading"><iconify-icon icon="lucide:loader-2" class="spin"></iconify-icon> 正在获取文书详情…</div>';

    document.getElementById('ops-doc-overlay').classList.add('is-open');
    document.getElementById('ops-doc-drawer').classList.add('is-open');

    OpsDataCenter.documentDetail(recordId).then(function (d) {
      detailLoading = false;
      if (!d) {
        document.getElementById('ops-doc-drawer-body').innerHTML =
          '<p class="ops-empty">未找到该文书记录</p>';
        return;
      }
      currentDocument = d;
      renderDocumentDetail(d);
      if (window.OpsSystemLog) OpsSystemLog.view('document', '查看文书详情', recordId, d.title || d.docType);
    }).catch(function () {
      detailLoading = false;
      document.getElementById('ops-doc-drawer-body').innerHTML =
        '<p class="ops-empty">加载失败，请稍后重试</p>';
    });
  }

  function closeDocumentDetail() {
    documentDetailVisible = false;
    currentDocument = null;
    var o = document.getElementById('ops-doc-overlay');
    var d = document.getElementById('ops-doc-drawer');
    if (o) o.classList.remove('is-open');
    if (d) d.classList.remove('is-open');
  }

  function collapsibleBlock(id, text, emptyLabel) {
    var body = String(text || '').trim();
    if (!body) {
      return '<p class="ops-doc-empty">' + esc(emptyLabel || '暂无内容') + '</p>';
    }
    return '<div class="ops-doc-scroll is-collapsed" id="' + id + '-body">' + esc(body) + '</div>' +
      '<button type="button" class="ops-doc-toggle" data-toggle="' + id + '">展开全文</button>';
  }

  function bindCollapsibles(root) {
    if (!root) return;
    root.querySelectorAll('[data-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-toggle');
        var el = document.getElementById(id + '-body');
        if (!el) return;
        var collapsed = el.classList.toggle('is-collapsed');
        btn.textContent = collapsed ? '展开全文' : '收起';
      });
    });
  }

  function renderDocumentDetail(d) {
    document.getElementById('ops-doc-drawer-title').textContent = d.title || '文书详情';
    document.getElementById('ops-doc-drawer-sub').textContent =
      fmtDateTime(d.createdAt) + ' · ' + esc(d.userName || d.userNickname || '');

    var laws = (d.legalBasis || []).length
      ? d.legalBasis.map(function (l) {
          return '<li><strong>' + esc(l.name) + '</strong> — ' + esc(l.clause || '') + '</li>';
        }).join('')
      : '<li class="ops-doc-empty">暂无法律依据引用</li>';

    var timeline = (d.timeline || []).length
      ? d.timeline.map(function (t) {
          return '<li><span style="color:var(--ops-text-secondary)">' + fmtDateTime(t.time) +
            '</span> · ' + esc(t.label) + '</li>';
        }).join('')
      : '<li class="ops-doc-empty">暂无操作记录</li>';

    document.getElementById('ops-doc-drawer-body').innerHTML =
      '<section class="ops-doc-card"><h4>基础信息</h4>' +
        '<p><strong>文书标题：</strong>' + esc(d.title) + '</p>' +
        '<p><strong>用户：</strong>' + esc(d.userName) + ' · ID ' + esc(d.userId) + '</p>' +
        '<p><strong>文书类型：</strong>' + esc(d.docType) + '</p>' +
        '<p><strong>案件编号：</strong>' + esc(d.caseNo) + '</p>' +
        '<p><strong>创建时间：</strong>' + fmtDateTime(d.createdAt) + '</p>' +
        '<p><strong>状态：</strong>' + statusTag(d.status, d.statusLabel) + '</p></section>' +

      '<section class="ops-doc-card"><h4>用户提问</h4><p class="ops-doc-qa-detail">' +
        esc(d.question || '—') + '</p></section>' +
      '<section class="ops-doc-card"><h4>AI 生成正文</h4>' +
        collapsibleBlock('ops-doc-content', d.content, '暂无正文内容') + '</section>' +

      '<section class="ops-doc-card"><h4>OCR 原始内容</h4>' +
        collapsibleBlock('ops-doc-ocr', d.ocrContent, '无 OCR 原始内容') + '</section>' +

      '<section class="ops-doc-card"><h4>法律依据引用</h4><ul class="ops-doc-law-list">' + laws + '</ul></section>' +

      '<section class="ops-doc-card"><h4>操作记录</h4><ul class="ops-doc-timeline">' + timeline + '</ul></section>' +

      '<section class="ops-doc-actions">' +
        '<button type="button" class="ops-btn ops-btn--primary" id="ops-doc-pdf">生成 PDF</button>' +
        '<button type="button" class="ops-btn ops-btn--sm" id="ops-doc-regen">重新生成</button>' +
        '<button type="button" class="ops-btn ops-btn--sm" id="ops-doc-edit">编辑内容</button>' +
        '<button type="button" class="ops-btn ops-btn--sm ops-btn--danger" id="ops-doc-del">删除记录</button>' +
      '</section>';

    bindCollapsibles(document.getElementById('ops-doc-drawer-body'));

    document.getElementById('ops-doc-pdf').onclick = function () {
      generateDocumentPDF(currentDocument);
    };
    document.getElementById('ops-doc-regen').onclick = function () {
      if (!currentDocument || !confirm('确认使用 AI 重新生成该文书？将覆盖当前正文。')) return;
      var btn = document.getElementById('ops-doc-regen');
      btn.disabled = true;
      btn.textContent = '生成中…';
      OpsDataCenter.regenerateDocument(currentDocument.id).then(function (updated) {
        btn.disabled = false;
        btn.textContent = '重新生成文书';
        if (updated) {
          currentDocument = updated;
          renderDocumentDetail(updated);
          reload(false);
        }
      }).catch(function () {
        btn.disabled = false;
        btn.textContent = '重新生成文书';
        alert('重新生成失败，请检查 AI 服务是否可用');
      });
    };
    document.getElementById('ops-doc-edit').onclick = function () {
      openEditModal(currentDocument);
    };
    document.getElementById('ops-doc-del').onclick = function () {
      if (!currentDocument || !confirm('确定删除该文书记录？此操作不可恢复。')) return;
      OpsDataCenter.deleteDocument(currentDocument.id).then(function () {
        closeDocumentDetail();
        reload(false);
      });
    };
  }

  function openEditModal(doc) {
    if (!doc) return;
    var title = prompt('文书标题', doc.title || '');
    if (title === null) return;
    var content = prompt('编辑正文（长文本建议在后台数据库维护）', (doc.content || '').slice(0, 8000));
    if (content === null) return;
    OpsDataCenter.updateDocument(doc.id, {
      title: title,
      content: content
    }).then(function (data) {
      if (data) {
        currentDocument = data;
        renderDocumentDetail(data);
      } else {
        openDocumentDetail(doc.id);
      }
      reload(false);
    });
  }

  function generateDocumentPDF(doc) {
    if (!doc || pdfLoading) return;
    if (!window.OpsDocumentPdf || !OpsDocumentPdf.generateDocumentPDF) {
      alert('PDF 模块未加载');
      return;
    }
    pdfLoading = true;
    var btn = document.getElementById('ops-doc-pdf');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '生成中…';
    }
    if (window.OpsSystemLog) OpsSystemLog.export('document', '导出文书PDF', doc.id, doc.title);
    OpsDocumentPdf.generateDocumentPDF(doc).then(function () {
      pdfLoading = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = '生成 PDF';
      }
    }).catch(function (err) {
      pdfLoading = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = '生成 PDF';
      }
      alert((err && err.message) || 'PDF 生成失败');
    });
  }

  function mount(root) {
    ensureDrawer();
    root.innerHTML =
      (window.OpsUI ? OpsUI.pageHeader('文书系统', '法律文书生成记录 · 详情查看 · 标准 PDF 导出') : '') +
      '<section class="ops-doc-stats" id="ops-doc-stats"></section>' +
      '<div class="ops-toolbar">' +
        '<input type="search" id="ops-doc-q" placeholder="搜索标题、用户、案件编号" />' +
        '<select id="ops-doc-type"><option value="all">全部类型</option><option value="法律文书">法律文书</option></select>' +
        '<select id="ops-doc-status"><option value="all">全部状态</option>' +
          '<option value="processing">处理中</option><option value="completed">已完成</option>' +
          '<option value="pending_review">待审核</option><option value="archived">已归档</option></select>' +
        '<select id="ops-doc-pagesize"><option value="10">每页 10 条</option><option value="15" selected>每页 15 条</option></select>' +
      '</div>' +
      '<div class="ops-doc-list" id="ops-doc-list"></div>' +
      '<nav class="ops-pagination" id="ops-doc-pagination"></nav>';

    ['ops-doc-q', 'ops-doc-type', 'ops-doc-status', 'ops-doc-pagesize'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', function () {
        if (id === 'ops-doc-pagesize') filter.page = 1;
        if (id === 'ops-doc-status') {
          filter.date = 'all';
          activeStatFilter = '';
        }
        reload(false);
      });
      if (el.type === 'search') {
        el.addEventListener('input', debounce(function () { filter.page = 1; reload(); }, 320));
      }
    });
    statisticsLoading = true;
    renderDocumentStatistics(documentStatistics, true);
    fetchDocumentStatistics();
    reload(false);
  }

  function fetchDocumentStatistics() {
    statisticsLoading = true;
    renderDocumentStatistics(documentStatistics, true);
    return OpsDataCenter.loadDocumentStatistics().then(function (data) {
      statisticsLoading = false;
      documentStatistics = Object.assign(defaultStatistics(), data || {});
      renderDocumentStatistics(documentStatistics, false);
      return documentStatistics;
    }).catch(function (err) {
      statisticsLoading = false;
      console.error('document statistics load failed', err);
      documentStatistics = defaultStatistics();
      renderDocumentStatistics(documentStatistics, false);
      return documentStatistics;
    });
  }

  function handleStatClick(type) {
    if (statClickLock) return;
    statClickLock = true;
    setTimeout(function () { statClickLock = false; }, 400);

    activeStatFilter = type || 'total';
    filter.page = 1;
    filter.date = 'all';
    filter.status = 'all';

    if (type === 'today') {
      filter.date = 'today';
    } else if (type === 'processing') {
      filter.status = 'processing';
    } else if (type === 'completed') {
      filter.status = 'completed';
    } else if (type === 'pending') {
      filter.status = 'pending_review';
    }

    syncFilterControls();
    renderDocumentStatistics(documentStatistics, false);
    reload(true);
  }

  function syncFilterControls() {
    var statusEl = document.getElementById('ops-doc-status');
    if (statusEl) statusEl.value = filter.status || 'all';
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  function readFilters() {
    filter.search = (document.getElementById('ops-doc-q') || {}).value || '';
    filter.docType = (document.getElementById('ops-doc-type') || {}).value || 'all';
    filter.status = (document.getElementById('ops-doc-status') || {}).value || 'all';
    filter.pageSize = parseInt((document.getElementById('ops-doc-pagesize') || {}).value, 10) || 15;
    if (filter.status !== 'all' || filter.date === 'today') {
      activeStatFilter = '';
    }
  }

  function setListLoading(on) {
    listLoading = on;
    var box = document.getElementById('ops-doc-list');
    if (!box) return;
    if (on) box.classList.add('is-loading');
    else box.classList.remove('is-loading');
  }

  function reload(silentStats) {
    readFilters();
    setListLoading(true);
    var listPromise = OpsDataCenter.loadDocuments(filter).then(function (data) {
      setListLoading(false);
      data = data || { list: [], total: 0, page: filter.page, pageSize: filter.pageSize, totalPages: 1 };
      renderList(data.list || []);
      renderPagination(data);
      return data;
    }).catch(function (err) {
      setListLoading(false);
      console.error('documents list load failed', err);
      renderList([]);
      renderPagination({ total: 0, page: 1, pageSize: filter.pageSize, totalPages: 1 });
    });

    if (!silentStats) {
      return Promise.all([fetchDocumentStatistics(), listPromise]);
    }
    return listPromise;
  }

  function renderDocumentStatistics(stats, loading) {
    var s = stats || defaultStatistics();
    var el = document.getElementById('ops-doc-stats');
    if (!el) return;

    if (loading) {
      el.innerHTML =
        statCardSkeleton('总文书') +
        statCardSkeleton('今日生成') +
        statCardSkeleton('处理中') +
        statCardSkeleton('已完成') +
        statCardSkeleton('待审核');
      return;
    }

    var cards = [
      { type: 'total', label: '总文书', val: numVal(s.total), color: 'var(--ops-title)' },
      { type: 'today', label: '今日生成', val: numVal(s.todayCount), color: 'var(--ops-cyan)' },
      { type: 'processing', label: '处理中', val: numVal(s.processingCount), color: 'var(--ops-gold)' },
      { type: 'completed', label: '已完成', val: numVal(s.completedCount), color: 'var(--ops-success)' },
      { type: 'pending', label: '待审核', val: numVal(s.pendingReviewCount), color: 'var(--ops-risk)' }
    ];

    el.innerHTML = cards.map(function (c) {
      var active = activeStatFilter === c.type ? ' is-active' : '';
      return '<button type="button" class="ops-doc-stat-card' + active + '" data-stat="' + c.type + '">' +
        '<label>' + esc(c.label) + '</label>' +
        '<strong class="ops-num" style="color:' + c.color + '">' + c.val + '</strong></button>';
    }).join('');

    el.querySelectorAll('[data-stat]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        handleStatClick(btn.getAttribute('data-stat'));
      });
    });
  }

  function statCardSkeleton(label) {
    return '<div class="ops-doc-stat-card ops-doc-stat-card--loading">' +
      '<label>' + esc(label) + '</label><span class="ops-stat-skeleton"></span></div>';
  }

  function renderDocQa(d) {
    var q = d.question || '';
    var a = d.answerSnippet || '';
    if (!q && d.preview && d.preview.indexOf('问：') >= 0) {
      var parts = String(d.preview).split(/\n答：/);
      q = (parts[0] || '').replace(/^问：/, '').trim();
      a = (parts[1] || '').trim();
    }
    if (!q && !a) {
      return '<p class="ops-doc-qa ops-doc-qa--empty">' + esc(d.preview || '—') + '</p>';
    }
    return '<div class="ops-doc-qa">' +
      '<p class="ops-doc-qa__row"><span class="ops-doc-qa__tag ops-doc-qa__tag--q">问</span>' +
      '<span class="ops-doc-qa__text">' + esc(q || '—') + '</span></p>' +
      '<p class="ops-doc-qa__row"><span class="ops-doc-qa__tag ops-doc-qa__tag--a">答</span>' +
      '<span class="ops-doc-qa__text">' + esc(a || '—') + '</span></p></div>';
  }

  function renderList(list) {
    var box = document.getElementById('ops-doc-list');
    if (!box) return;
    box.innerHTML = (list || []).length ? list.map(function (d) {
      return '<article class="ops-doc-item" data-id="' + esc(d.id) + '" role="button" tabindex="0">' +
        '<div class="ops-doc-item__top">' +
          '<h3 class="ops-doc-item__title">' + esc(d.title) + '</h3>' +
          statusTag(d.status, d.statusLabel) +
        '</div>' +
        renderDocQa(d) +
        '<div class="ops-doc-item__meta">' +
          '<span>' + esc(d.userName) + '</span>' +
          '<span>' + esc(d.docType) + '</span>' +
          '<span>案件 ' + esc(d.caseNo) + '</span>' +
          '<span>' + fmtDateTime(d.createdAt) + '</span>' +
        '</div></article>';
    }).join('') : '<p class="ops-empty">暂无文书记录</p>';

    box.querySelectorAll('.ops-doc-item').forEach(function (row) {
      row.addEventListener('click', function () {
        openDocumentDetail(row.getAttribute('data-id'));
      });
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openDocumentDetail(row.getAttribute('data-id'));
        }
      });
    });
  }

  function renderPagination(data) {
    var nav = document.getElementById('ops-doc-pagination');
    if (!nav || !data) return;
    var page = data.page || 1;
    var totalPages = data.totalPages || Math.max(1, Math.ceil((data.total || 0) / (data.pageSize || 15)));
    var total = data.total || 0;

    if (totalPages <= 1) {
      nav.innerHTML = '<span class="ops-pagination__info">共 ' + total + ' 条记录</span>';
      return;
    }

    var pages = [];
    var start = Math.max(1, page - 2);
    var end = Math.min(totalPages, page + 2);
    for (var i = start; i <= end; i++) pages.push(i);

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
        reload();
      });
    });
  }

  return {
    mount: mount,
    openDocumentDetail: openDocumentDetail,
    closeDocumentDetail: closeDocumentDetail,
    generateDocumentPDF: generateDocumentPDF,
    fetchDocumentStatistics: fetchDocumentStatistics,
    handleStatClick: handleStatClick,
    get documentStatistics() { return documentStatistics; },
    get documentDetailVisible() { return documentDetailVisible; },
    get currentDocument() { return currentDocument; }
  };
})();

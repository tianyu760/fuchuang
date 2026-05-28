/**
 * 法规库 · 列表 + 筛选 + 详情抽屉
 */
window.OpsPages = window.OpsPages || {};
OpsPages.regulations = (function () {
  var regulationList = [];
  var currentRegulation = null;
  var regulationDetailVisible = false;
  var regulationLoading = false;
  var detailLoading = false;
  var filterParams = { category: 'all', region: 'all', keyword: '', page: 1, pageSize: 20 };
  var listScrollY = 0;
  var drawerBound = false;
  var catalogStats = null;
  var regionOptions = ['全国'];
  var lastPageMeta = { total: 0, page: 1, pageSize: 20, totalPages: 1 };

  var CATEGORIES = [
    { id: 'all', label: '全部分类' },
    { id: '民法', label: '民法' },
    { id: '刑法', label: '刑法' },
    { id: '行政法', label: '行政法' },
    { id: '商法', label: '商法' },
    { id: '劳动法', label: '劳动法' },
    { id: '其他', label: '其他' }
  ];

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  function categoryTagClass(cat) {
    var map = {
      '民法': 'ops-reg-tag--civil',
      '刑法': 'ops-reg-tag--criminal',
      '行政法': 'ops-reg-tag--admin',
      '商法': 'ops-reg-tag--commercial',
      '劳动法': 'ops-reg-tag--labor'
    };
    return map[cat] || 'ops-reg-tag--other';
  }

  function statusClass(st) {
    if (st === '废止') return 'ops-reg-status--repealed';
    if (st === '修订中') return 'ops-reg-status--amending';
    return 'ops-reg-status--active';
  }

  function ensureDrawer() {
    if (drawerBound) return;
    drawerBound = true;
    document.body.insertAdjacentHTML('beforeend',
      '<div class="ops-drawer-overlay" id="ops-reg-overlay"></div>' +
      '<aside class="ops-drawer ops-drawer--reg" id="ops-reg-drawer" aria-label="法规详情">' +
        '<div class="ops-drawer__head"><div><h3 style="margin:0;color:var(--ops-title)" id="ops-reg-drawer-title">法规详情</h3>' +
        '<p style="margin:4px 0 0;font-size:12px;color:var(--ops-text)" id="ops-reg-drawer-sub"></p></div>' +
        '<button type="button" class="ops-icon-btn" id="ops-reg-drawer-close"><iconify-icon icon="lucide:x"></iconify-icon></button></div>' +
        '<div class="ops-drawer__body" id="ops-reg-drawer-body"></div></aside>');
    document.getElementById('ops-reg-drawer-close').addEventListener('click', closeRegulationDetail);
    document.getElementById('ops-reg-overlay').addEventListener('click', closeRegulationDetail);
  }

  function openRegulationDetail(id) {
    if (!id || detailLoading) return;
    var content = document.getElementById('ops-content');
    if (content) listScrollY = content.scrollTop;
    ensureDrawer();
    detailLoading = true;
    regulationDetailVisible = true;
    currentRegulation = null;

    document.getElementById('ops-reg-drawer-title').textContent = '加载中…';
    document.getElementById('ops-reg-drawer-sub').textContent = '';
    document.getElementById('ops-reg-drawer-body').innerHTML =
      '<div class="ops-doc-drawer__loading">正在加载法规全文…</div>';
    document.getElementById('ops-reg-overlay').classList.add('is-open');
    document.getElementById('ops-reg-drawer').classList.add('is-open');

    OpsDataCenter.regulationDetail(id).then(function (d) {
      detailLoading = false;
      if (!d) {
        document.getElementById('ops-reg-drawer-body').innerHTML = '<p class="ops-empty">未找到相关法规</p>';
        return;
      }
      currentRegulation = d;
      renderRegulationDetail(d);
      if (window.OpsSystemLog) OpsSystemLog.view('regulation', '查看法规详情', id, d.title || d.name);
    }).catch(function (err) {
      detailLoading = false;
      console.error('regulation detail load failed', err);
      document.getElementById('ops-reg-drawer-body').innerHTML = '<p class="ops-empty">加载失败，请稍后重试</p>';
    });
  }

  function closeRegulationDetail() {
    regulationDetailVisible = false;
    currentRegulation = null;
    var o = document.getElementById('ops-reg-overlay');
    var d = document.getElementById('ops-reg-drawer');
    if (o) o.classList.remove('is-open');
    if (d) d.classList.remove('is-open');
    var content = document.getElementById('ops-content');
    if (content) {
      requestAnimationFrame(function () {
        content.scrollTop = listScrollY;
      });
    }
  }

  function renderRegulationDetail(d) {
    document.getElementById('ops-reg-drawer-title').textContent = d.title || '法规详情';
    document.getElementById('ops-reg-drawer-sub').textContent =
      esc(d.issuer) + ' · ' + esc(d.publishDate) + ' · ' + esc(d.status);

    var articles = d.articles || [];
    var tocHtml = (d.toc || []).length
      ? d.toc.map(function (item, ti) {
          var cls = item.type === 'chapter' ? 'is-chapter' : '';
          return '<button type="button" class="' + cls + '" data-art-idx="' + ti + '">' + esc(item.label) + '</button>';
        }).join('')
      : articles.map(function (a, i) {
          return '<button type="button" data-art-idx="' + i + '">' + esc(a.number || ('条目 ' + (i + 1))) + '</button>';
        }).join('') || '<p class="ops-doc-empty" style="padding:8px">暂无目录</p>';

    var articlesHtml = articles.length
      ? '<div class="ops-reg-body" id="ops-reg-legal-body">' + articles.map(function (a, i) {
          return '<article class="ops-reg-article" id="reg-art-' + i + '">' +
            (a.number ? '<div class="ops-reg-article__num">' + esc(a.number) + '</div>' : '') +
            '<div>' + esc(a.content) + '</div></article>';
        }).join('') + '</div>'
      : '<div class="ops-reg-body" id="ops-reg-legal-body"><pre style="white-space:pre-wrap;font-family:inherit;margin:0">' +
        esc(d.legalText || '暂无正文') + '</pre></div>';

    var revisions = (d.revisions || []).map(function (r) {
      return '<li><strong>' + esc(r.date) + '</strong> — ' + esc(r.summary) + '</li>';
    }).join('') || '<li>暂无修订记录</li>';

    var keywords = (d.keywords || []).map(function (k) {
      return '<span class="ops-tag ' + categoryTagClass(d.category) + '">' + esc(k) + '</span>';
    }).join('');

    document.getElementById('ops-reg-drawer-body').innerHTML =
      '<section class="ops-doc-card"><h4>① 基本信息</h4>' +
        '<p><strong>法规名称：</strong>' + esc(d.title) + '</p>' +
        '<p><strong>发布机构：</strong>' + esc(d.issuer) + '</p>' +
        '<p><strong>发布日期：</strong>' + esc(d.publishDate) + '</p>' +
        '<p><strong>状态：</strong><span class="' + statusClass(d.status) + '">' + esc(d.status) + '</span></p>' +
        '<p><strong>适用范围：</strong>' + esc(d.scope) + '</p></section>' +

      '<section class="ops-doc-card"><h4>② 法规正文</h4>' +
        '<div class="ops-reg-detail-layout">' +
          '<nav class="ops-reg-toc" aria-label="目录">' + tocHtml + '</nav>' +
          articlesHtml +
        '</div></section>' +

      '<section class="ops-doc-card"><h4>③ 修订记录</h4><ul class="ops-reg-revisions">' + revisions + '</ul></section>' +

      '<section class="ops-doc-card"><h4>④ 关键词与标签</h4>' +
        '<div class="ops-reg-keywords">' +
          '<span class="ops-tag ' + categoryTagClass(d.category) + '">' + esc(d.category) + '</span>' +
          keywords +
        '</div></section>';

    document.querySelectorAll('#ops-reg-drawer-body .ops-reg-toc [data-art-idx]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.getAttribute('data-art-idx'), 10);
        var arts = d.articles || [];
        var targetIdx = idx;
        if (d.toc && d.toc[idx] && d.toc[idx].type === 'article' && d.toc[idx].label) {
          var found = arts.findIndex(function (a) {
            return a.number && d.toc[idx].label.indexOf(a.number) === 0;
          });
          if (found >= 0) targetIdx = found;
        } else if (idx >= arts.length) {
          targetIdx = Math.max(0, arts.length - 1);
        }
        var target = document.getElementById('reg-art-' + targetIdx);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function mount(root) {
    ensureDrawer();
    var catOpts = CATEGORIES.map(function (c) {
      return '<option value="' + c.id + '">' + esc(c.label) + '</option>';
    }).join('');

    root.innerHTML =
      (window.OpsUI ? OpsUI.pageHeader('法规库', '法律法规条目检索 · 分类筛选 · 全文查阅') : '') +
      '<section class="ops-reg-stats" id="ops-reg-stats"></section>' +
      '<div class="ops-reg-filters">' +
        '<input type="search" id="ops-reg-keyword" placeholder="搜索法规名称、摘要…" />' +
        '<select id="ops-reg-category">' + catOpts + '</select>' +
        '<select id="ops-reg-region"><option value="all">全部地区</option><option value="全国">全国</option><option value="local">地方性法规</option></select>' +
        '<select id="ops-reg-pagesize"><option value="10">每页 10 条</option><option value="20" selected>每页 20 条</option></select>' +
      '</div>' +
      '<div class="ops-reg-list-wrap">' +
        '<p class="ops-reg-page-hint" id="ops-reg-page-hint"></p>' +
        '<div class="ops-reg-list" id="ops-reg-list"></div>' +
      '</div>' +
      '<nav class="ops-pagination ops-pagination--reg" id="ops-reg-pagination" aria-label="法规列表分页"></nav>';

    document.getElementById('ops-reg-category').addEventListener('change', function () {
      filterParams.page = 1;
      fetchRegulationList();
    });
    document.getElementById('ops-reg-region').addEventListener('change', function () {
      filterParams.page = 1;
      fetchRegulationList();
    });
    document.getElementById('ops-reg-pagesize').addEventListener('change', function () {
      filterParams.page = 1;
      fetchRegulationList();
    });

    var kw = document.getElementById('ops-reg-keyword');
    kw.addEventListener('input', debounce(function () {
      filterParams.page = 1;
      fetchRegulationList();
    }, 320));
    kw.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        filterParams.page = 1;
        fetchRegulationList();
      }
    });

    loadRegions();
    bootstrapCatalog().then(function () {
      return fetchRegulationList();
    });
  }

  function bootstrapCatalog() {
    var chain = Promise.resolve();
    if (window.OpsRegulationExpand && OpsRegulationExpand.ensureCatalog) {
      chain = OpsRegulationExpand.ensureCatalog();
    }
    return chain.then(function () {
      if (OpsDataCenter.loadRegulationStatistics) {
        return OpsDataCenter.loadRegulationStatistics().then(renderStats);
      }
    }).catch(function () {});
  }

  function renderStats(stats) {
    catalogStats = stats || catalogStats;
    var el = document.getElementById('ops-reg-stats');
    if (!el) return;
    var total = (catalogStats && (catalogStats.totalRegulations || catalogStats.total)) || 0;
    var byCat = (catalogStats && catalogStats.byCategory) || {};
    var chips = CATEGORIES.filter(function (c) { return c.id !== 'all'; }).map(function (c) {
      var n = byCat[c.id] || 0;
      return '<button type="button" class="ops-reg-stats__chip" data-cat="' + esc(c.id) + '">' +
        esc(c.label) + ' <em>' + n + '</em></button>';
    }).join('');
    el.innerHTML =
      '<div class="ops-reg-stats__total"><span>法规总量</span><strong class="ops-num">' + total + '</strong></div>' +
      '<div class="ops-reg-stats__chips">' + chips + '</div>';
    el.querySelectorAll('[data-cat]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var cat = btn.getAttribute('data-cat');
        var sel = document.getElementById('ops-reg-category');
        if (sel) sel.value = cat;
        filterParams.page = 1;
        fetchRegulationList();
      });
    });
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  function readFilters() {
    filterParams.keyword = (document.getElementById('ops-reg-keyword') || {}).value || '';
    filterParams.category = (document.getElementById('ops-reg-category') || {}).value || 'all';
    filterParams.region = (document.getElementById('ops-reg-region') || {}).value || 'all';
    var ps = parseInt((document.getElementById('ops-reg-pagesize') || {}).value, 10) || 20;
    filterParams.pageSize = ps === 10 ? 10 : 20;
    if (!filterParams.page || filterParams.page < 1) filterParams.page = 1;
  }

  function loadRegions() {
    if (!window.FayiAdminApi || !FayiAdminApi.regulationRegions) return;
    FayiAdminApi.regulationRegions().then(function (res) {
      var list = (res && res.data != null) ? res.data : res;
      if (!Array.isArray(list)) return;
      regionOptions = list;
      var sel = document.getElementById('ops-reg-region');
      if (!sel) return;
      var html = '<option value="all">全部地区</option><option value="全国">全国</option><option value="local">地方性法规</option>';
      list.filter(function (r) { return r !== '全国'; }).forEach(function (r) {
        html += '<option value="' + esc(r) + '">' + esc(r) + '</option>';
      });
      sel.innerHTML = html;
      sel.value = filterParams.region || 'all';
    }).catch(function () {});
  }

  function fetchRegulationList(append) {
    readFilters();
    if (!append) {
      appendMode = false;
      filterParams.page = filterParams.page || 1;
    }
    regulationLoading = true;
    if (!append) renderListSkeleton();
    var reqOpts = append ? {} : { force: filterParams.page === 1 && !appendMode };
    return OpsDataCenter.loadRegulationList(filterParams, reqOpts).then(function (data) {
      regulationLoading = false;
      appendMode = false;
      data = data || { list: [], total: 0 };
      if (append && filterParams.page > 1) {
        regulationList = regulationList.concat(data.list || []);
      } else {
        regulationList = data.list || [];
      }
      if (data.statistics) {
        catalogStats = Object.assign({}, catalogStats, {
          total: data.totalRegulations || data.total,
          totalRegulations: data.totalRegulations || data.total,
          byCategory: data.statistics.byCategory
        });
        renderStats(catalogStats);
      }
      renderList(regulationList);
      renderPagination(data);
      updateLoadMore(data);
      return regulationList;
    }).catch(function (err) {
      regulationLoading = false;
      appendMode = false;
      console.error('regulation list load failed', err);
      if (!append) {
        regulationList = [];
        renderList([]);
        renderPagination({ total: 0, page: 1, pageSize: filterParams.pageSize, totalPages: 1 });
      }
    });
  }

  function updateLoadMore(data) {
    var more = document.getElementById('ops-reg-loadmore');
    if (!more || !data) return;
    var page = data.page || filterParams.page || 1;
    var totalPages = data.totalPages || 1;
    more.setAttribute('data-total-pages', String(totalPages));
    if (page < totalPages) {
      more.hidden = false;
      more.innerHTML = '<button type="button" class="ops-btn ops-btn--sm" id="ops-reg-more-btn">加载更多（' +
        page + '/' + totalPages + '）</button>';
      var btn = document.getElementById('ops-reg-more-btn');
      if (btn) btn.onclick = loadMoreRegulations;
    } else {
      more.hidden = true;
      more.innerHTML = '';
    }
  }

  function renderListSkeleton() {
    var box = document.getElementById('ops-reg-list');
    if (!box) return;
    box.innerHTML = [1, 2, 3, 4, 5].map(function () {
      return '<div class="ops-reg-skeleton"></div>';
    }).join('');
  }

  function renderList(list) {
    var box = document.getElementById('ops-reg-list');
    if (!box) return;
    if (!list.length) {
      box.innerHTML = '<p class="ops-empty">未找到相关法规</p>';
      return;
    }
    box.innerHTML = list.map(function (r) {
      return '<article class="ops-reg-item" data-id="' + esc(r.id) + '" role="button" tabindex="0">' +
        '<h3 class="ops-reg-item__title">' + esc(r.title) + '</h3>' +
        '<p class="ops-reg-item__summary">' + esc(r.summary) + '</p>' +
        '<div class="ops-reg-item__meta">' +
          '<span class="ops-tag ' + categoryTagClass(r.category) + '">' + esc(r.category) + '</span>' +
          '<span>' + esc(r.region) + '</span>' +
          '<span>' + esc(r.publishDate) + '</span>' +
          '<span class="' + statusClass(r.status) + '">' + esc(r.status) + '</span>' +
        '</div></article>';
    }).join('');

    box.querySelectorAll('.ops-reg-item').forEach(function (row) {
      row.addEventListener('click', function () {
        openRegulationDetail(row.getAttribute('data-id'));
      });
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openRegulationDetail(row.getAttribute('data-id'));
        }
      });
    });
  }

  function scrollListTop() {
    var content = document.getElementById('ops-content');
    if (content) content.scrollTop = 0;
    var wrap = document.querySelector('.ops-reg-list-wrap');
    if (wrap && wrap.scrollIntoView) wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderPagination(data) {
    var nav = document.getElementById('ops-reg-pagination');
    if (!nav || !data) return;
    var page = data.page || filterParams.page || 1;
    var totalPages = Math.max(1, data.totalPages || 1);
    var total = data.total || 0;
    var pageSize = data.pageSize || filterParams.pageSize || 20;
    filterParams.page = page;

    if (total <= 0) {
      nav.innerHTML = '';
      nav.hidden = true;
      return;
    }
    nav.hidden = false;

    var pages = [];
    for (var i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i++) pages.push(i);

    var pageBtns = totalPages > 1
      ? pages.map(function (p) {
          return '<button type="button" class="ops-pagination__page' + (p === page ? ' is-active' : '') + '" data-page="' + p + '">' + p + '</button>';
        }).join('')
      : '<span class="ops-pagination__page is-active">1</span>';

    nav.innerHTML =
      '<button type="button" class="ops-pagination__btn" data-page="prev"' + (page <= 1 ? ' disabled' : '') + '>‹ 上一页</button>' +
      pageBtns +
      '<button type="button" class="ops-pagination__btn" data-page="next"' + (page >= totalPages ? ' disabled' : '') + '>下一页 ›</button>' +
      '<span class="ops-pagination__info">每页 ' + pageSize + ' 条 · 共 ' + total + ' 条</span>';

    nav.querySelectorAll('[data-page]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.disabled) return;
        var p = btn.getAttribute('data-page');
        if (p === 'prev') filterParams.page = Math.max(1, page - 1);
        else if (p === 'next') filterParams.page = Math.min(totalPages, page + 1);
        else filterParams.page = parseInt(p, 10);
        fetchRegulationList();
        scrollListTop();
      });
    });
  }

  function onData() {
    /* 法规页使用独立接口，不依赖实时快照 */
  }

  return {
    mount: mount,
    onData: onData,
    openRegulationDetail: openRegulationDetail,
    fetchRegulationList: fetchRegulationList,
    get regulationList() { return regulationList; },
    get currentRegulation() { return currentRegulation; },
    get filterParams() { return filterParams; }
  };
})();

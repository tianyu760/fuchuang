/**
 * 法律咨询 · 全量分页 / 用户关联 / 详情抽屉
 */
window.OpsPages = window.OpsPages || {};
OpsPages.consultations = (function () {
  var filter = {
    search: '',
    category: 'all',
    riskLevel: 'all',
    status: 'all',
    sort: 'new',
    page: 1,
    pageSize: 15
  };
  var lastTotal = 0;
  var pollTimer = null;
  var drawerBound = false;
  var statisticsData = {
    total: 0,
    todayCount: 0,
    processedCount: 0,
    pendingCount: 0,
    convertedCount: 0
  };
  var statisticsLoading = true;

  function defaultStatistics() {
    return {
      total: 0,
      todayCount: 0,
      processedCount: 0,
      pendingCount: 0,
      convertedCount: 0
    };
  }

  function numVal(v) {
    var n = Number(v);
    return isNaN(n) ? 0 : n;
  }

  var CATEGORIES = [
    { id: 'all', label: '全部领域' },
    { id: 'labor', label: '劳动纠纷' },
    { id: 'contract', label: '合同纠纷' },
    { id: 'marriage', label: '婚姻纠纷' },
    { id: 'consumer', label: '消费维权' },
    { id: 'fraud', label: '网络诈骗' },
    { id: 'campus', label: '校园问题' },
    { id: 'other', label: '其他' }
  ];

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  function riskTag(lv) {
    var cls = lv === 'high' ? 'ops-tag--risk-high' : lv === 'low' ? 'ops-tag--risk-low' : 'ops-tag--risk-mid';
    var label = lv === 'high' ? '高风险' : lv === 'low' ? '低风险' : '中风险';
    return '<span class="ops-tag ' + cls + '">' + label + '</span>';
  }

  function fmtDateTime(iso) {
    if (!iso) return '—';
    var s = String(iso).replace('T', ' ');
    return s.slice(0, 16);
  }

  function fmtRel(iso) {
    if (!iso) return '—';
    var diff = Date.now() - new Date(iso).getTime();
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
    if (diff < 172800000) return '昨天';
    if (diff < 604800000) return Math.floor(diff / 86400000) + ' 天前';
    return fmtDateTime(iso);
  }

  function fmtDuration(ms) {
    var n = Number(ms) || 0;
    if (n < 1000) return n ? n + ' ms' : '—';
    if (n < 60000) return Math.round(n / 1000) + ' 秒';
    return Math.round(n / 60000) + ' 分钟';
  }

  function ensureDrawer() {
    if (drawerBound) return;
    drawerBound = true;
    document.body.insertAdjacentHTML('beforeend',
      '<div class="ops-drawer-overlay" id="ops-consult-overlay"></div>' +
      '<aside class="ops-drawer ops-drawer--consult" id="ops-consult-drawer" aria-label="咨询详情">' +
        '<div class="ops-drawer__head"><div><h3 style="margin:0;color:var(--ops-title)" id="ops-drawer-title">咨询详情</h3>' +
        '<p style="margin:4px 0 0;font-size:12px;color:var(--ops-text)" id="ops-drawer-sub"></p></div>' +
        '<button type="button" class="ops-icon-btn" id="ops-drawer-close"><iconify-icon icon="lucide:x"></iconify-icon></button></div>' +
        '<div class="ops-drawer__body" id="ops-drawer-body"></div></aside>');
    document.getElementById('ops-drawer-close').addEventListener('click', closeDrawer);
    document.getElementById('ops-consult-overlay').addEventListener('click', closeDrawer);
  }

  function openDrawer() {
    document.getElementById('ops-consult-overlay').classList.add('is-open');
    document.getElementById('ops-consult-drawer').classList.add('is-open');
  }

  function closeDrawer() {
    var o = document.getElementById('ops-consult-overlay');
    var d = document.getElementById('ops-consult-drawer');
    if (o) o.classList.remove('is-open');
    if (d) d.classList.remove('is-open');
  }

  function mount(root) {
    ensureDrawer();
    var catOpts = CATEGORIES.map(function (c) {
      return '<option value="' + c.id + '">' + esc(c.label) + '</option>';
    }).join('');

    root.innerHTML =
      (window.OpsUI ? OpsUI.pageHeader('法律咨询', '全量咨询记录 · 分页管理 · 用户画像关联 · 实时接入') : '') +
      '<div class="ops-consult-toast" id="ops-consult-toast">新咨询已接入，数据已自动刷新</div>' +
      '<section class="ops-consult-stats" id="ops-consult-stats"></section>' +
      '<div class="ops-toolbar">' +
        '<input type="search" id="ops-consult-q" placeholder="搜索咨询内容、用户昵称、ID、邮箱" />' +
        '<select id="ops-consult-cat">' + catOpts + '</select>' +
        '<select id="ops-consult-risk"><option value="all">全部风险</option><option value="high">高风险</option><option value="mid">中风险</option><option value="low">低风险</option></select>' +
        '<select id="ops-consult-status"><option value="all">全部状态</option><option value="completed">已完成</option><option value="processing">处理中</option><option value="failed">失败</option></select>' +
        '<select id="ops-consult-sort"><option value="new">最新咨询</option><option value="risk">风险等级</option><option value="user">用户昵称</option></select>' +
        '<select id="ops-consult-pagesize"><option value="10">每页 10 条</option><option value="15" selected>每页 15 条</option></select>' +
      '</div>' +
      '<div class="ops-consult-list" id="ops-consult-list"></div>' +
      '<nav class="ops-pagination" id="ops-consult-pagination" aria-label="分页"></nav>';

    ['ops-consult-q', 'ops-consult-cat', 'ops-consult-risk', 'ops-consult-status', 'ops-consult-sort', 'ops-consult-pagesize'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', function () {
        if (id === 'ops-consult-pagesize') filter.page = 1;
        reload();
      });
      if (el.type === 'search') {
        el.addEventListener('input', debounce(function () { filter.page = 1; reload(); }, 320));
      }
    });

    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(function () { reload(true); }, 20000);
    try {
      var qParam = new URLSearchParams(location.search).get('q');
      if (qParam) {
        var qInput = document.getElementById('ops-consult-q');
        if (qInput) qInput.value = qParam;
        filter.search = qParam;
      }
    } catch (e) { /* ignore */ }
    reload();
  }

  function fetchStatistics() {
    statisticsLoading = true;
    renderStats(statisticsData, true);
    return OpsDataCenter.loadConsultationStatistics().then(function (data) {
      statisticsLoading = false;
      statisticsData = Object.assign(defaultStatistics(), data || {});
      renderStats(statisticsData, false);
      return statisticsData;
    }).catch(function (err) {
      statisticsLoading = false;
      console.error('statistics load failed', err);
      statisticsData = defaultStatistics();
      renderStats(statisticsData, false);
      return statisticsData;
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
    filter.search = (document.getElementById('ops-consult-q') || {}).value || '';
    filter.category = (document.getElementById('ops-consult-cat') || {}).value || 'all';
    filter.riskLevel = (document.getElementById('ops-consult-risk') || {}).value || 'all';
    filter.status = (document.getElementById('ops-consult-status') || {}).value || 'all';
    filter.sort = (document.getElementById('ops-consult-sort') || {}).value || 'new';
    filter.pageSize = parseInt((document.getElementById('ops-consult-pagesize') || {}).value, 10) || 15;
  }

  function reload(silent) {
    readFilters();
    var statsPromise = fetchStatistics();
    var listPromise = OpsDataCenter.loadConsultations(filter).then(function (data) {
      if (!data) {
        renderList([]);
        renderPagination({ total: 0, page: 1, pageSize: filter.pageSize, totalPages: 1 });
        return null;
      }
      var total = data.total || 0;
      if (silent && lastTotal > 0 && total > lastTotal) {
        var toast = document.getElementById('ops-consult-toast');
        if (toast) {
          toast.classList.add('is-show');
          toast.textContent = '新咨询已接入（+' + (total - lastTotal) + '），共 ' + total + ' 条记录';
          setTimeout(function () { toast.classList.remove('is-show'); }, 5000);
        }
      }
      lastTotal = total;
      if (data.stats && !statisticsLoading) {
        statisticsData = Object.assign(defaultStatistics(), statisticsData, data.stats);
        renderStats(statisticsData, false);
      }
      renderList(data.list);
      renderPagination(data);
      return data;
    }).catch(function (err) {
      console.error('consultations list load failed', err);
      renderList([]);
      renderPagination({ total: 0, page: 1, pageSize: filter.pageSize, totalPages: 1 });
      return null;
    });
    return Promise.all([statsPromise, listPromise]);
  }

  function renderStats(stats, loading) {
    var s = stats || defaultStatistics();
    var el = document.getElementById('ops-consult-stats');
    if (!el) return;
    if (loading) {
      el.innerHTML =
        statCardSkeleton('咨询总数') +
        statCardSkeleton('今日咨询') +
        statCardSkeleton('已处理') +
        statCardSkeleton('待处理') +
        statCardSkeleton('转文书');
      return;
    }
    el.innerHTML =
      statCard('咨询总数', numVal(s.total), 'var(--ops-title)') +
      statCard('今日咨询', numVal(s.todayCount), 'var(--ops-cyan)') +
      statCard('已处理', numVal(s.processedCount), 'var(--ops-success)') +
      statCard('待处理', numVal(s.pendingCount), 'var(--ops-gold)') +
      statCard('转文书', numVal(s.convertedCount), 'var(--ops-risk)');
  }

  function statCard(label, val, color) {
    return '<div class="ops-consult-stat"><label>' + esc(label) + '</label><strong class="ops-num" style="color:' +
      (color || 'var(--ops-title)') + '">' + val + '</strong></div>';
  }

  function statCardSkeleton(label) {
    return '<div class="ops-consult-stat ops-consult-stat--loading"><label>' + esc(label) +
      '</label><span class="ops-stat-skeleton" aria-hidden="true"></span></div>';
  }

  function renderList(list) {
    var box = document.getElementById('ops-consult-list');
    if (!box) return;
    box.innerHTML = (list || []).length ? list.map(function (c) {
      return '<article class="ops-consult-item" data-id="' + esc(c.id) + '">' +
        '<div class="ops-consult-item__top">' +
          '<div class="ops-consult-item__user">' +
            '<div class="ops-consult-item__avatar">' + esc(c.userAvatarInitial || 'U') + '</div>' +
            '<div style="min-width:0">' +
              '<h4>' + esc(c.userNickname) + ' <span style="font-weight:400;color:var(--ops-text-secondary)">· ' + esc(c.userType) + '</span></h4>' +
              '<div class="ops-consult-item__uid">' + esc(c.userId) + '</div>' +
            '</div></div>' +
          '<div class="ops-consult-item__actions">' +
            '<button type="button" class="ops-btn ops-btn--sm" data-view="' + esc(c.id) + '">查看详情</button>' +
          '</div></div>' +
        '<h3 class="ops-consult-item__title">' + esc(c.title) + '</h3>' +
        '<p class="ops-consult-item__summary">' + esc(c.summary) + '</p>' +
        '<div class="ops-consult-item__meta">' +
          riskTag(c.riskLevel) +
          '<span class="ops-tag">' + esc(c.legalType) + '</span>' +
          '<span class="ops-tag">' + esc(c.statusLabel) + '</span>' +
          '<span class="ops-online ops-online--' + esc(c.userOnlineStatus || 'offline') + '">' +
            '<span class="ops-online__dot"></span>' + esc(c.userOnlineLabel || '离线') + '</span>' +
          '<span class="ops-consult-item__time">创建 <strong>' + fmtDateTime(c.createdAt) + '</strong> · ' + fmtRel(c.createdAt) + '</span>' +
          '<span>耗时 ' + fmtDuration(c.durationMs) + '</span>' +
        '</div></article>';
    }).join('') : '<p class="ops-empty">暂无符合条件的咨询记录</p>';

    box.querySelectorAll('[data-view]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        openDetail(btn.getAttribute('data-view'));
      });
    });
    box.querySelectorAll('.ops-consult-item').forEach(function (card) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('button')) return;
        openDetail(card.getAttribute('data-id'));
      });
    });
  }

  function renderPagination(data) {
    var nav = document.getElementById('ops-consult-pagination');
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
        document.getElementById('ops-content').scrollTop = 0;
      });
    });
  }

  function openDetail(id) {
    OpsDataCenter.consultationDetail(id).then(function (d) {
      if (!d) return;
      if (window.OpsSystemLog) OpsSystemLog.view('consult', '查看咨询详情', id, d.title || d.question);
      document.getElementById('ops-drawer-title').textContent = d.title || '咨询详情';
      document.getElementById('ops-drawer-sub').textContent =
        fmtDateTime(d.createdAt) + ' · ' + fmtRel(d.createdAt) + ' · ' + (d.userNickname || '');

      var laws = (d.recommendedLaws || []).map(function (l) {
        return '<li><strong>' + esc(l.name) + '</strong> — ' + esc(l.clause) + '</li>';
      }).join('') || '<li>暂无</li>';

      var portrait = d.userPortrait || {};

      document.getElementById('ops-drawer-body').innerHTML =
        '<section class="ops-drawer__section"><h4>用户信息</h4>' +
          '<div style="display:flex;gap:12px;align-items:center">' +
            '<div class="ops-consult-item__avatar" style="width:48px;height:48px;font-size:20px">' + esc(d.userAvatarInitial || 'U') + '</div>' +
            '<div><p style="margin:0"><strong>' + esc(d.userNickname) + '</strong> · ' + esc(d.userType) + '</p>' +
            '<p style="margin:4px 0 0;font-size:12px;color:var(--ops-text)">' + esc(d.userEmail) + '</p>' +
            '<p style="margin:4px 0 0;font-size:11px;color:var(--ops-text-secondary)">ID: ' + esc(d.userId) + '</p></div></div></section>' +

        '<section class="ops-drawer__section"><h4>基础信息</h4>' +
          '<p>创建时间：' + fmtDateTime(d.createdAt) + '（' + fmtRel(d.createdAt) + '）</p>' +
          '<p>最近操作：' + fmtDateTime(d.updatedAt) + '</p>' +
          '<p>咨询时长：' + fmtDuration(d.durationMs) + '</p>' +
          '<p>当前状态：' + esc(d.statusLabel) + ' · AI 评分 ' + esc(d.aiScore || '—') + '</p></section>' +

        '<section class="ops-drawer__section"><h4>完整咨询内容</h4><p style="line-height:1.7">' + esc(d.originalContent) + '</p></section>' +

        '<section class="ops-drawer__section"><h4>AI 分析结果</h4><p style="line-height:1.7">' + esc(d.aiAnalysis) + '</p></section>' +

        '<section class="ops-drawer__section"><h4>风险识别</h4>' +
          riskTag(d.riskLevel) +
          '<p style="margin-top:8px">' + esc((d.riskDetection && d.riskDetection.summary) || '') + '</p>' +
          '<p>争议金额：' + esc(d.disputeAmount) + '</p></section>' +

        '<section class="ops-drawer__section"><h4>涉及法律领域</h4><p>' + esc(d.legalType) + '</p></section>' +

        '<section class="ops-drawer__section"><h4>相关法规</h4><ul style="margin:0;padding-left:18px;font-size:12px">' + laws + '</ul></section>' +

        '<section class="ops-drawer__section"><h4>生成文书记录</h4><ul style="margin:0;padding-left:18px;font-size:12px;color:var(--ops-text)">' +
          ((d.generatedDocuments || []).length
            ? d.generatedDocuments.map(function (doc) {
                return '<li>' + esc(doc.title) + ' · ' + esc((doc.createdAt || '').slice(0, 10)) + '</li>';
              }).join('')
            : '<li>暂无关联文书</li>') + '</ul></section>' +

        '<section class="ops-drawer__section"><h4>咨询时间轴</h4><ul class="ops-consult-timeline">' +
          (d.timeline || []).map(function (t) {
            return '<li><span style="color:var(--ops-text-secondary)">' + fmtDateTime(t.time) + '</span> · ' + esc(t.label) + '</li>';
          }).join('') + '</ul></section>' +

        '<section class="ops-drawer__section"><h4>历史咨询</h4><ul style="margin:0;padding-left:18px;font-size:12px">' +
          ((d.userHistory || []).length
            ? d.userHistory.map(function (h) {
                return '<li>' + esc(h.title) + ' · ' + esc(h.legalType) + ' · ' + fmtRel(h.createdAt) + '</li>';
              }).join('')
            : '<li>暂无历史记录</li>') + '</ul></section>' +

        '<section class="ops-drawer__section"><h4>用户画像</h4>' +
          '<p>类型：' + esc(portrait.type || '—') + '</p>' +
          '<p>活跃度：' + esc(portrait.activeLevel || '—') + ' · 得分 ' + esc(portrait.activityScore || '—') + '</p>' +
          '<p>关键词：' + esc((portrait.topKeywords || []).join('、') || '—') + '</p></section>' +

        '<section class="ops-drawer__section"><h4>系统建议</h4><ul style="margin:0;padding-left:18px;font-size:12px">' +
          (d.aiSuggestions || []).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul></section>' +

        '<section class="ops-drawer__section" style="border:none"><h4>管理员备注</h4>' +
          '<textarea id="ops-consult-note" rows="3" style="width:100%;border-radius:8px;border:1px solid var(--ops-border);background:rgba(0,0,0,.25);color:var(--ops-title);padding:8px;font-family:inherit">' +
          esc(d.adminNote || '') + '</textarea>' +
          '<button type="button" class="ops-btn ops-btn--sm" style="margin-top:8px" id="ops-save-consult-note">保存备注</button></section>';

      document.getElementById('ops-save-consult-note').onclick = function () {
        var note = (document.getElementById('ops-consult-note') || {}).value || '';
        OpsDataCenter.setConsultationNote(id, note).then(function () {
          fetchStatistics();
          openDetail(id);
        });
      };

      openDrawer();
    });
  }

  function onData(snap) {
    if (document.getElementById('ops-consult-list')) {
      reload(true);
    }
  }

  return {
    mount: mount,
    onData: onData,
    fetchStatistics: fetchStatistics,
    get statisticsData() { return statisticsData; }
  };
})();

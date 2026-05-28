/**
 * 法绎管理端 SPA（hash 路由）
 */
(function () {
  if (!window.FayiAdminAuth || !FayiAdminAuth.requireAuth()) {
    return;
  }

  var TITLES = {
    overview: '运营总览',
    users: '用户管理',
    consultations: '法律咨询',
    documents: '文书生成',
    'law-education': '普法内容'
  };

  var CAT_LABELS = {
    labor: '劳动纠纷', marriage: '婚姻纠纷', contract: '合同纠纷',
    campus: '校园问题', fraud: '网络诈骗', other: '其他'
  };

  var charts = [];
  var state = { route: 'overview', users: { page: 1, search: '' } };

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function disposeCharts() {
    charts.forEach(function (c) { try { c.dispose(); } catch (e) {} });
    charts = [];
    if (window.AdminOverviewV3) AdminOverviewV3.dispose();
  }

  function skeleton(n) {
    var h = '';
    for (var i = 0; i < n; i++) h += '<div class="adm-skeleton"></div>';
    return h;
  }

  function animateNum(node, end, dur) {
    dur = dur || 900;
    var start = 0;
    var t0 = performance.now();
    function tick(now) {
      var p = Math.min(1, (now - t0) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      node.textContent = Math.round(start + (end - start) * eased);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function paginate(total, page, pageSize, onPage) {
    var pages = Math.max(1, Math.ceil(total / pageSize));
    var wrap = el('div', 'adm-pagination');
    function btn(label, p, dis) {
      var b = el('button', 'adm-btn adm-btn--ghost adm-btn--sm', label);
      b.disabled = !!dis;
      b.onclick = function () { onPage(p); };
      return b;
    }
    wrap.appendChild(btn('上一页', page - 1, page <= 1));
    wrap.appendChild(el('span', '', '第 ' + page + ' / ' + pages + ' 页'));
    wrap.appendChild(btn('下一页', page + 1, page >= pages));
    return wrap;
  }

  function route() {
    var hash = (location.hash || '#overview').slice(1);
    if (hash === 'regulations' || hash === 'risk' || hash === 'ocr' || hash === 'logs') hash = 'overview';
    if (!TITLES[hash]) hash = 'overview';
    state.route = hash;
    document.querySelectorAll('#adm-nav a').forEach(function (a) {
      a.classList.toggle('is-active', a.getAttribute('data-route') === hash);
    });
    $('page-title').textContent = TITLES[hash];
    var kpiStrip = $('adm-kpi-strip');
    if (kpiStrip) kpiStrip.style.display = hash === 'overview' ? '' : 'none';
    disposeCharts();
    var root = $('page-root');
    root.innerHTML = skeleton(6);
    var fn = routes[hash];
    if (fn) fn(root);
    if (window.AdminShell && AdminShell.pageEnter) {
      AdminShell.pageEnter();
    } else {
      window.setTimeout(function () { animateNum(document.querySelector('.adm-kpi__value')); }, 100);
    }
  }

  function mountChart(dom, option) {
    if (!window.echarts) {
      dom.innerHTML = '<p style="color:#94a3b8">图表加载中…</p>';
      return;
    }
    var c = echarts.init(dom, null, { renderer: 'canvas' });
    c.setOption(option);
    charts.push(c);
    window.addEventListener('resize', function onR() { c.resize(); });
    return c;
  }

  var routes = {
    overview: function (root) {
      if (window.AdminOverviewV3 && window.FayiActivityCenter) {
        AdminOverviewV3.mount(root, { kpiStrip: $('adm-kpi-strip') });
        return;
      }
      root.innerHTML = '<p class="adm-error">运营总览模块未加载，请刷新页面。</p>';
    },

    users: function (root) {
      root.innerHTML =
        '<div class="adm-toolbar"><input class="adm-input" style="max-width:260px" id="user-search" placeholder="搜索邮箱/昵称">' +
        '<button class="adm-btn adm-btn--primary adm-btn--sm" id="user-search-btn">搜索</button></div>' +
        '<div class="adm-card adm-table-wrap"><table class="adm-table"><thead><tr><th>用户</th><th>邮箱</th><th>状态</th><th>注册时间</th><th>最近活跃</th><th>风险</th><th>咨询数</th><th>操作</th></tr></thead><tbody id="users-tb"></tbody></table></div><div id="users-pg"></div>';
      function load(page) {
        state.users.page = page;
        FayiAdminApi.users({ page: page, pageSize: 10, search: state.users.search }).then(function (res) {
          var tb = $('users-tb');
          tb.innerHTML = '';
          res.data.list.forEach(function (u) {
            var tr = document.createElement('tr');
            var st = u.status === 'banned' ? '<span class="adm-badge adm-badge--ban">封禁</span>' : '<span class="adm-badge adm-badge--ok">正常</span>';
            var reg = (u.createdAt || '').slice(0, 10);
            var active = (u.lastActiveAt || '').slice(0, 16).replace('T', ' ') || '—';
            var risk = u.riskLevel === 'high' ? '<span class="adm-badge adm-badge--ban">高</span>' :
              u.riskLevel === 'mid' ? '<span class="adm-badge" style="background:rgba(234,179,8,.2);color:#eab308">中</span>' :
              '<span class="adm-badge adm-badge--ok">低</span>';
            tr.innerHTML = '<td>' + (u.name || '—') + '</td><td>' + (u.email || '') + '</td><td>' + st + '</td><td>' + reg + '</td><td>' + active + '</td><td>' + risk + '</td><td>' + (u.consultCount || 0) + '</td><td class="user-actions"></td>';
            var td = tr.querySelector('.user-actions');
            var ban = el('button', 'adm-btn adm-btn--ghost adm-btn--sm', u.status === 'banned' ? '解封' : '封禁');
            ban.onclick = function () {
              FayiAdminApi.setUserStatus(u.id, u.status === 'banned' ? 'active' : 'banned').then(function () { load(page); });
            };
            var del = el('button', 'adm-btn adm-btn--danger adm-btn--sm', '删除');
            del.style.marginLeft = '6px';
            del.onclick = function () {
              if (!confirm('确定删除该用户？')) return;
              FayiAdminApi.deleteUser(u.id).then(function () { load(page); });
            };
            td.appendChild(ban);
            td.appendChild(del);
            tb.appendChild(tr);
          });
          $('users-pg').innerHTML = '';
          $('users-pg').appendChild(paginate(res.data.total, res.data.page, res.data.pageSize, load));
        });
      }
      $('user-search-btn').onclick = function () {
        state.users.search = $('user-search').value.trim();
        load(1);
      };
      load(1);
    },

    consultations: function (root) {
      root.innerHTML =
        '<div class="adm-toolbar"><input class="adm-input" style="max-width:280px" id="cons-search" placeholder="搜索内容">' +
        '<button class="adm-btn adm-btn--primary adm-btn--sm" id="cons-btn">搜索</button>' +
        '<button class="adm-btn adm-btn--ghost adm-btn--sm" id="cons-export">导出 CSV</button></div>' +
        '<div class="adm-card adm-table-wrap"><table class="adm-table"><thead><tr><th>类型</th><th>内容</th><th>风险</th><th>时间</th></tr></thead><tbody id="cons-tb"></tbody></table></div><div id="cons-pg"></div>';
      var q = { page: 1, search: '', all: [] };
      function load(page) {
        FayiAdminApi.consultations({ page: page, pageSize: 15, search: q.search }).then(function (res) {
          q.all = res.data.list;
          var tb = $('cons-tb');
          tb.innerHTML = '';
          res.data.list.forEach(function (r) {
            var tr = document.createElement('tr');
            tr.innerHTML = '<td>' + r.type + '</td><td>' + (r.preview || r.reply || '—') + '</td><td>' + (r.risk || '—') + '</td><td>' + (r.createdAt || '').slice(0, 16).replace('T', ' ') + '</td>';
            tb.appendChild(tr);
          });
          $('cons-pg').innerHTML = '';
          $('cons-pg').appendChild(paginate(res.data.total, res.data.page, res.data.pageSize, load));
        });
      }
      $('cons-btn').onclick = function () { q.search = $('cons-search').value.trim(); load(1); };
      $('cons-export').onclick = function () {
        FayiAdminApi.consultations({ page: 1, pageSize: 200, search: q.search }).then(function (res) {
          var rows = [['类型', '内容', '风险', '时间']];
          res.data.list.forEach(function (r) {
            rows.push([r.type, r.preview || '', r.risk || '', r.createdAt || '']);
          });
          var csv = rows.map(function (row) {
            return row.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(',');
          }).join('\n');
          var a = document.createElement('a');
          a.href = 'data:text/csv;charset=utf-8,\ufeff' + encodeURIComponent(csv);
          a.download = 'consultations.csv';
          a.click();
        });
      };
      load(1);
    },

    documents: function (root) {
      root.innerHTML = '<div class="adm-card adm-table-wrap"><table class="adm-table"><thead><tr><th>标题</th><th>类型</th><th>时间</th><th>操作</th></tr></thead><tbody id="doc-tb"></tbody></table></div><div id="doc-pg"></div>';
      function load(page) {
        FayiAdminApi.documents({ page: page, pageSize: 10 }).then(function (res) {
          var tb = $('doc-tb');
          tb.innerHTML = '';
          res.data.list.forEach(function (d) {
            var tr = document.createElement('tr');
            tr.innerHTML = '<td>' + (d.title || '—') + '</td><td>' + (d.docType || '文书') + '</td><td>' + (d.createdAt || '').slice(0, 16).replace('T', ' ') + '</td><td class="doc-act"></td>';
            var pdf = el('button', 'adm-btn adm-btn--ghost adm-btn--sm', 'PDF');
            pdf.onclick = function () {
              var w = window.open('', '_blank');
              w.document.write('<pre style="font-family:sans-serif;padding:24px">' + (d.content || d.title || '') + '</pre>');
              w.print();
            };
            var del = el('button', 'adm-btn adm-btn--danger adm-btn--sm', '删除');
            del.style.marginLeft = '6px';
            del.onclick = function () {
              if (!confirm('删除该记录？')) return;
              FayiAdminApi.deleteDocument(d.id).then(function () { load(page); });
            };
            tr.querySelector('.doc-act').appendChild(pdf);
            tr.querySelector('.doc-act').appendChild(del);
            tb.appendChild(tr);
          });
          $('doc-pg').innerHTML = '';
          $('doc-pg').appendChild(paginate(res.data.total, res.data.page, res.data.pageSize, load));
        });
      }
      load(1);
    },

    'law-education': function (root) {
      root.innerHTML =
        '<div class="adm-toolbar"><button class="adm-btn adm-btn--primary adm-btn--sm" id="le-add">发布文章</button></div>' +
        '<div class="adm-card adm-table-wrap"><table class="adm-table"><thead><tr><th>标题</th><th>分类</th><th>阅读量</th><th>操作</th></tr></thead><tbody id="le-tb"></tbody></table></div>';
      function load() {
        FayiAdminApi.lawArticles().then(function (res) {
          var tb = $('le-tb');
          tb.innerHTML = '';
          (res.data || []).forEach(function (a) {
            var tr = document.createElement('tr');
            tr.innerHTML = '<td>' + a.title + '</td><td>' + (a.categoryId || '') + '</td><td>' + (a.reads || 0) + '</td><td class="le-act"></td>';
            var del = el('button', 'adm-btn adm-btn--danger adm-btn--sm', '删除');
            del.onclick = function () { if (confirm('确定删除？')) FayiAdminApi.deleteLawArticle(a.id).then(load); };
            tr.querySelector('.le-act').appendChild(del);
            tb.appendChild(tr);
          });
        });
      }
      $('le-add').onclick = function () {
        var t = prompt('文章标题');
        if (!t) return;
        FayiAdminApi.saveLawArticle({ title: t, categoryId: 'consumer', summary: '', content: '', mediaType: 'article' }).then(load);
      };
      load();
    }
  };

  $('btn-logout').onclick = function () {
    FayiAdminApi.setToken('');
    location.href = '../admin-login.html';
  };

  FayiAdminApi.me().then(function (res) {
    if (window.AdmSidebar) AdmSidebar.renderAdmin(res.data);
    else {
      var nameEl = document.getElementById('adm-admin-name');
      if (nameEl) nameEl.textContent = res.data.name || res.data.email;
    }
    $('adm-shell').style.opacity = '1';
  }).catch(function () {
    $('adm-shell').style.opacity = '1';
  });

  window.addEventListener('hashchange', route);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', route);
  } else {
    route();
  }
})();

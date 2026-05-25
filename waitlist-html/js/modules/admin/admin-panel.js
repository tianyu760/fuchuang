/**
 * 管理端嵌入模块 — 个人中心扩展
 */
window.FayiAdminPanel = (function () {
  var inited = false;

  

  var TITLES = {
    overview: '数据总览',
    users: '用户管理',
    consultations: '法律咨询记录',
    documents: '法律文书管理',
    ocr: 'OCR 识别记录',
    regulations: '法律法规库'
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
    if (!TITLES[hash]) hash = 'overview';
    state.route = hash;
    document.querySelectorAll('#adm-nav a').forEach(function (a) {
      a.classList.toggle('is-active', a.getAttribute('data-route') === hash);
    });
    $('page-title').textContent = TITLES[hash];
    disposeCharts();
    var root = $('page-root');
    root.innerHTML = skeleton(6);
    var fn = routes[hash];
    if (fn) fn(root);
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
      FayiAdminApi.overview().then(function (res) {
        var s = res.data.stats;
        var ch = res.data.charts;
        root.innerHTML =
          '<div class="adm-stats" id="stats-row"></div>' +
          '<div class="adm-grid-2">' +
          '<div class="adm-card"><h3>近7日业务趋势</h3><div id="chart-trend" class="adm-chart"></div></div>' +
          '<div class="adm-card"><h3>咨询分类占比</h3><div id="chart-pie" class="adm-chart"></div></div>' +
          '</div>' +
          '<div class="adm-card" style="margin-top:20px"><h3>系统状态</h3><p id="sys-status"></p></div>';
        var stats = [
          ['总用户数', s.totalUsers],
          ['今日访问量', s.todayVisits],
          ['AI 调用次数', s.aiCalls],
          ['OCR 识别次数', s.ocrCount],
          ['法律咨询次数', s.consultCount],
          ['文书生成次数', s.documentCount]
        ];
        var row = $('stats-row');
        stats.forEach(function (item) {
          var card = el('div', 'adm-stat');
          card.innerHTML = '<div class="adm-stat__label">' + item[0] + '</div><div class="adm-stat__value" data-v="' + item[1] + '">0</div><div class="adm-stat__sub">运行正常</div>';
          row.appendChild(card);
          animateNum(card.querySelector('.adm-stat__value'), item[1]);
        });
        $('sys-status').innerHTML = '<span class="adm-badge adm-badge--ok">● ' + (s.systemStatus === 'healthy' ? '系统健康' : s.systemStatus) + '</span> · OCR 成功率 ' + s.ocrSuccessRate + '% · 更新 ' + (s.updatedAt || '').slice(11, 19);
        mountChart($('chart-trend'), {
          tooltip: { trigger: 'axis' },
          grid: { left: 48, right: 24, top: 32, bottom: 32 },
          legend: { data: ['咨询', 'OCR', '文书'], textStyle: { color: '#94a3b8' } },
          xAxis: { type: 'category', data: ch.labels, axisLine: { lineStyle: { color: '#334155' } } },
          yAxis: { type: 'value', splitLine: { lineStyle: { color: 'rgba(51,65,85,.4)' } } },
          series: [
            { name: '咨询', type: 'line', smooth: true, data: ch.consult, areaStyle: { opacity: 0.15 }, itemStyle: { color: '#3b82f6' } },
            { name: 'OCR', type: 'line', smooth: true, data: ch.ocr, itemStyle: { color: '#22c55e' } },
            { name: '文书', type: 'bar', data: ch.documents, itemStyle: { color: '#6366f1' } }
          ]
        });
        var cats = (res.data.categories || []).map(function (c) {
          return { name: CAT_LABELS[c.name] || c.name, value: c.value };
        });
        mountChart($('chart-pie'), {
          tooltip: { trigger: 'item' },
          series: [{
            type: 'pie', radius: ['42%', '68%'],
            data: cats.length ? cats : [{ name: '暂无', value: 1 }],
            label: { color: '#cbd5e1' },
            itemStyle: { borderRadius: 6 }
          }]
        });
      }).catch(function (e) { root.innerHTML = '<p style="color:#f87171">' + e.message + '</p>'; });
    },

    users: function (root) {
      root.innerHTML =
        '<div class="adm-toolbar"><input class="adm-input" style="max-width:260px" id="user-search" placeholder="搜索邮箱/昵称">' +
        '<button class="adm-btn adm-btn--primary adm-btn--sm" id="user-search-btn">搜索</button></div>' +
        '<div class="adm-card adm-table-wrap"><table class="adm-table"><thead><tr><th>用户</th><th>邮箱</th><th>状态</th><th>咨询数</th><th>操作</th></tr></thead><tbody id="users-tb"></tbody></table></div><div id="users-pg"></div>';
      function load(page) {
        state.users.page = page;
        FayiAdminApi.users({ page: page, pageSize: 10, search: state.users.search }).then(function (res) {
          var tb = $('users-tb');
          tb.innerHTML = '';
          res.data.list.forEach(function (u) {
            var tr = document.createElement('tr');
            var st = u.status === 'banned' ? '<span class="adm-badge adm-badge--ban">封禁</span>' : '<span class="adm-badge adm-badge--ok">正常</span>';
            tr.innerHTML = '<td>' + (u.name || '—') + '</td><td>' + (u.email || '') + '</td><td>' + st + '</td><td>' + (u.consultCount || 0) + '</td><td class="user-actions"></td>';
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

    ocr: function (root) {
      root.innerHTML = '<div class="adm-card adm-table-wrap"><table class="adm-table"><thead><tr><th>文件</th><th>结果摘要</th><th>状态</th><th>时间</th></tr></thead><tbody id="ocr-tb"></tbody></table></div><div id="ocr-pg"></div>';
      function load(page) {
        FayiAdminApi.ocr({ page: page, pageSize: 10 }).then(function (res) {
          var tb = $('ocr-tb');
          tb.innerHTML = '';
          res.data.list.forEach(function (r) {
            var tr = document.createElement('tr');
            var ok = r.success !== false;
            tr.innerHTML = '<td>' + (r.fileName || '—') + '</td><td>' + ((r.textPreview || r.result || '—') + '').slice(0, 80) + '</td><td>' +
              (ok ? '<span class="adm-badge adm-badge--ok">成功</span>' : '<span class="adm-badge adm-badge--ban">失败</span>') +
              '</td><td>' + (r.createdAt || '').slice(0, 16).replace('T', ' ') + '</td>';
            tb.appendChild(tr);
          });
          $('ocr-pg').innerHTML = '';
          $('ocr-pg').appendChild(paginate(res.data.total, res.data.page, res.data.pageSize, load));
        });
      }
      load(1);
    },

    regulations: function (root) {
      root.innerHTML =
        '<div class="adm-toolbar"><button class="adm-btn adm-btn--primary adm-btn--sm" id="reg-add">新增法规</button></div>' +
        '<div class="adm-card adm-table-wrap"><table class="adm-table"><thead><tr><th>标题</th><th>分类</th><th>更新</th><th>操作</th></tr></thead><tbody id="reg-tb"></tbody></table></div>' +
        '<div id="reg-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:100;align-items:center;justify-content:center">' +
        '<div class="adm-card" style="width:min(520px,92vw)"><h3 id="reg-modal-title">法规</h3>' +
        '<div class="adm-field"><label>标题</label><input id="reg-title" class="adm-input"></div>' +
        '<div class="adm-field"><label>分类</label><input id="reg-cat" class="adm-input"></div>' +
        '<div class="adm-field"><label>内容</label><textarea id="reg-content" class="adm-input" rows="6"></textarea></div>' +
        '<div style="display:flex;gap:10px;justify-content:flex-end"><button class="adm-btn adm-btn--ghost" id="reg-cancel">取消</button><button class="adm-btn adm-btn--primary" id="reg-save">保存</button></div></div></div>';
      var editingId = null;
      function openModal(item) {
        editingId = item ? item.id : null;
        $('reg-modal-title').textContent = item ? '编辑法规' : '新增法规';
        $('reg-title').value = item ? item.title : '';
        $('reg-cat').value = item ? item.category : '';
        $('reg-content').value = item ? item.content : '';
        $('reg-modal').style.display = 'flex';
      }
      function load() {
        FayiAdminApi.regulations().then(function (res) {
          var tb = $('reg-tb');
          tb.innerHTML = '';
          (res.data || []).forEach(function (r) {
            var tr = document.createElement('tr');
            tr.innerHTML = '<td>' + r.title + '</td><td>' + (r.category || '') + '</td><td>' + (r.updatedAt || '').slice(0, 10) + '</td><td class="reg-act"></td>';
            var ed = el('button', 'adm-btn adm-btn--ghost adm-btn--sm', '编辑');
            ed.onclick = function () { openModal(r); };
            var del = el('button', 'adm-btn adm-btn--danger adm-btn--sm', '删除');
            del.style.marginLeft = '6px';
            del.onclick = function () {
              if (!confirm('删除该法规？')) return;
              FayiAdminApi.deleteRegulation(r.id).then(load);
            };
            tr.querySelector('.reg-act').appendChild(ed);
            tr.querySelector('.reg-act').appendChild(del);
            tb.appendChild(tr);
          });
        });
      }
      $('reg-add').onclick = function () { openModal(null); };
      $('reg-cancel').onclick = function () { $('reg-modal').style.display = 'none'; };
      $('reg-save').onclick = function () {
        var data = {
          title: $('reg-title').value.trim(),
          category: $('reg-cat').value.trim(),
          content: $('reg-content').value
        };
        FayiAdminApi.saveRegulation(data, editingId).then(function () {
          $('reg-modal').style.display = 'none';
          load();
        });
      };
      load();
    }
  };

  

  

  window.addEventListener('hashchange', route);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', route);
  } else {
    route();
  }


  TITLES.logs = '系统日志';
  TITLES['law-education'] = '普法宣传管理';

  routes.logs = function (root) {
    root.innerHTML = '<div class="adm-card adm-table-wrap"><table class="adm-table"><thead><tr><th>类型</th><th>消息</th><th>时间</th></tr></thead><tbody id="logs-tb"></tbody></table></div>';
    FayiAdminApi.logs({ page: 1, pageSize: 30 }).then(function (res) {
      var tb = document.getElementById('logs-tb');
      if (!tb) return;
      tb.innerHTML = '';
      (res.data.list || []).forEach(function (r) {
        var tr = document.createElement('tr');
        tr.innerHTML = '<td>' + r.type + '</td><td>' + (r.message || '').slice(0, 120) + '</td><td>' + (r.createdAt || '').slice(0, 16).replace('T', ' ') + '</td>';
        tb.appendChild(tr);
      });
    }).catch(function (e) { root.innerHTML = '<p style="color:#f87171">' + e.message + '</p>'; });
  };

  var _overviewFn = routes.overview;
  routes.overview = function (root) {
    _overviewFn(root);
    FayiAdminApi.lawStats().then(function (res) {
      var row = document.getElementById('stats-row');
      if (!row || !res.data) return;
      var card = document.createElement('div');
      card.className = 'adm-stat';
      card.innerHTML = '<div class="adm-stat__label">普法阅读量</div><div class="adm-stat__value">' + (res.data.totalReads || 0) + '</div><div class="adm-stat__sub">今日 ' + (res.data.todayReads || 0) + '</div>';
      row.appendChild(card);
    }).catch(function () {});
  };

  routes['law-education'] = function (root) {
    root.innerHTML = '<div class="adm-toolbar"><button class="adm-btn adm-btn--primary adm-btn--sm" id="le-add">新增文章</button></div><div class="adm-card adm-table-wrap"><table class="adm-table"><thead><tr><th>标题</th><th>分类</th><th>阅读</th><th>操作</th></tr></thead><tbody id="le-tb"></tbody></table></div>';
    function load() {
      FayiAdminApi.lawArticles().then(function (res) {
        var tb = document.getElementById('le-tb');
        tb.innerHTML = '';
        (res.data || []).forEach(function (a) {
          var tr = document.createElement('tr');
          tr.innerHTML = '<td>' + a.title + '</td><td>' + (a.categoryId || '') + '</td><td>' + (a.reads || 0) + '</td><td class="le-act"></td>';
          var del = el('button', 'adm-btn adm-btn--danger adm-btn--sm', '删除');
          del.onclick = function () { if (confirm('删除？')) FayiAdminApi.deleteLawArticle(a.id).then(load); };
          tr.querySelector('.le-act').appendChild(del);
          tb.appendChild(tr);
        });
      });
    }
    var add = document.getElementById('le-add');
    if (add) add.onclick = function () {
      var t = prompt('文章标题'); if (!t) return;
      FayiAdminApi.saveLawArticle({ title: t, categoryId: 'consumer', summary: '', content: '', mediaType: 'article' }).then(load);
    };
    load();
  };


  function showLogin() {
    var box = document.getElementById('admin-login-box');
    var shell = document.getElementById('adm-embed-shell');
    if (box) box.style.display = 'flex';
    if (shell) shell.style.display = 'none';
  }
  function hideLogin() {
    var box = document.getElementById('admin-login-box');
    var shell = document.getElementById('adm-embed-shell');
    if (box) box.style.display = 'none';
    if (shell) shell.style.display = 'flex';
    FayiAdminApi.me().then(function (res) {
      var n = document.getElementById('admin-embed-name');
      if (n && res.data) n.textContent = res.data.name || res.data.email;
    }).catch(function () {});
  }
  function mountLoginForm() {
    var btn = document.getElementById('admin-login-btn');
    if (!btn || btn._bound) return;
    btn._bound = true;
    btn.onclick = function () {
      var err = document.getElementById('admin-login-err');
      FayiAdminApi.login(
        document.getElementById('admin-login-email').value.trim(),
        document.getElementById('admin-login-password').value
      ).then(function (res) {
        FayiAdminApi.setToken(res.data.token);
        if (err) err.style.display = 'none';
        hideLogin();
        route();
      }).catch(function (ex) {
        if (err) { err.textContent = ex.message; err.style.display = 'block'; }
      });
    };
  }
  function init() {
    mountLoginForm();
    if (!FayiAdminApi.getToken()) { showLogin(); return; }
    hideLogin();
    if (!inited) {
      inited = true;
      window.addEventListener('hashchange', route);
    }
    route();
  }
  return { init: init, mountLoginForm: mountLoginForm };
})();

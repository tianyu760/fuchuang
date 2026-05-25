const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '..', 'admin', 'js', 'admin-app.js');
const outPath = path.join(__dirname, '..', 'js', 'modules', 'admin', 'admin-panel.js');
const apiPath = path.join(__dirname, '..', 'js', 'modules', 'admin', 'admin-api.js');

let body = fs.readFileSync(srcPath, 'utf8');
body = body.replace(/\/\*\*[\s\S]*?\*\/\s*\(function \(\) \{/, '');
body = body.replace(/\}\)\(\);\s*$/, '');
body = body.replace(/if \(!FayiAdminApi\.getToken\(\)\) \{[\s\S]*?return;\s*\}/, '');
body = body.replace(/\$\('btn-logout'\)\.onclick[\s\S]*?login\.html';\s*\};/, '');
body = body.replace(/FayiAdminApi\.me\(\)[\s\S]*?\.catch\(function \(\) \{\}\);/, '');

const extra = `
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
`;

const wrapper = `/**
 * 管理端嵌入模块 — 个人中心扩展
 */
window.FayiAdminPanel = (function () {
  var inited = false;
${body}
${extra}

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
})();\n`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, wrapper, 'utf8');

if (!fs.existsSync(apiPath)) {
  fs.writeFileSync(apiPath, fs.readFileSync(path.join(__dirname, '..', 'admin', 'js', 'admin-api.js'), 'utf8').replace(
    /login\.html/g, 'profile.html#admin'
  ) + "\nFayiAdminApi.logs = function(q){ return request('GET', '/logs?page='+(q.page||1)+'&pageSize='+(q.pageSize||20)); };\n", 'utf8');
}

console.log('built', outPath);

/**
 * auth.js — 法经前端鉴权模块
 * 对接后端 REST API（http://localhost:3002/api/auth/*）
 * Token 存储在 localStorage.fayi_token，用户信息存储在 localStorage.fayi_current_user
 */
(function () {

  var API_BASE = 'http://localhost:3002';  // 统一后端地址
  var KEY_TOKEN = 'fayi_token';
  var KEY_USER  = 'fayi_current_user';
  var DEFAULT_AVATAR  = './images/avatars/1.svg';
  var DEFAULT_PERSONA = 'life_consume';

  /* ---- Toast ---- */
  if (!window.FayiToast) {
    window.FayiToast = function (message, variant) {
      variant = variant || 'info';
      var el = document.createElement('div');
      el.setAttribute('role', 'status');
      el.className = 'fayi-toast fayi-toast--' + variant;
      el.textContent = message;
      document.body.appendChild(el);
      requestAnimationFrame(function () { el.classList.add('fayi-toast--visible'); });
      window.setTimeout(function () {
        el.classList.remove('fayi-toast--visible');
        window.setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 320);
      }, 3200);
    };
  }

  /* ---- Token & User helpers ---- */
  function getToken() { return localStorage.getItem(KEY_TOKEN); }
  function setToken(t) { localStorage.setItem(KEY_TOKEN, t); }
  function clearToken() { localStorage.removeItem(KEY_TOKEN); }

  function getCurrentUser() {
    try {
      var raw = localStorage.getItem(KEY_USER);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function setCurrentUser(user) {
    localStorage.setItem(KEY_USER, JSON.stringify({
      email:   user.email,
      name:    user.name  || user.email,
      avatar:  user.avatar  || DEFAULT_AVATAR,
      persona: user.persona || DEFAULT_PERSONA,
    }));
  }

  function clearCurrentUser() { localStorage.removeItem(KEY_USER); }

  /* ---- API 工具 ---- */
  function authHeaders() {
    var t = getToken();
    return t ? { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + t }
             : { 'Content-Type': 'application/json' };
  }

  /* ---- 公开 API 调用（异步，返回 Promise） ---- */
  function apiRegister(name, email, password, avatar, persona) {
    return fetch(API_BASE + '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, email: email, password: password,
                             avatar: avatar, persona: persona }),
    }).then(function (r) { return r.json(); });
  }

  function apiLogin(email, password) {
    return fetch(API_BASE + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password }),
    }).then(function (r) { return r.json(); });
  }

  function apiUpdateProfile(patch) {
    console.log('[Auth] Updating profile with:', patch);
    return fetch(API_BASE + '/api/auth/profile', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(patch),
    }).then(function (r) {
      console.log('[Auth] Profile update response status:', r.status);
      return r.json();
    }).catch(function (err) {
      console.error('[Auth] Profile update error:', err);
      throw err;
    });
  }

  function apiChangePassword(oldPassword, newPassword) {
    return fetch(API_BASE + '/api/auth/change-password', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ oldPassword: oldPassword, newPassword: newPassword }),
    }).then(function (r) { return r.json(); });
  }

  /* ---- 本地同步版 updateProfile（供 profile.html 调用，返回 Promise） ---- */
  function updateProfile(patch) {
    return apiUpdateProfile(patch).then(function (res) {
      if (res.ok) {
        setCurrentUser(res.data);
        initAuthNav();
      }
      return res;
    });
  }

  /* ---- logout ---- */
  function logout() {
    clearToken();
    clearCurrentUser();
    window.location.href = 'index.html';
  }

  /* ---- requireAuth ---- */
  function requireAuth() {
    if (!getCurrentUser()) {
      var page = (window.location.pathname || '').split('/').pop() || 'index.html';
      if (!page || page.indexOf('.') === -1) page = 'index.html';
      window.location.replace('login.html?next=' + encodeURIComponent(page));
      return false;
    }
    return true;
  }

  /* ---- 存储 key（供 chat/knowledge 模块识别当前用户） ---- */
  function kbStorageKey()   { var u = getCurrentUser(); return u ? 'fayi_kb_'   + u.email : null; }
  function chatStorageKey() { var u = getCurrentUser(); return u ? 'fayi_chat_' + u.email : null; }

  /* ---- escapeHtml ---- */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---- 导航渲染 ---- */
  function navLinkClass(active) {
    if (active) return 'text-indigo-600 dark:text-indigo-400 rounded-lg bg-indigo-50 dark:bg-gray-800/50 py-1.5 px-2 sm:px-3 text-xs sm:text-sm font-medium transition-colors';
    return 'text-gray-800 dark:text-gray-200 rounded-lg hover:bg-indigo-100 dark:hover:bg-gray-800/30 py-1.5 px-2 sm:px-3 text-xs sm:text-sm font-medium transition-colors';
  }

  function initMainNav() {
    var ul = document.getElementById('fayi-main-nav');
    if (!ul) return;
    var active = ul.getAttribute('data-active') || '';
    var items = [
      ['index',           'index.html',           '首页'],
      ['chat',            'chat.html',            '法律咨询'],
      ['knowledge',       'knowledge.html',       '资料库'],
      ['pufa',            'pufa.html',            '普法宣传'],
      ['wenshi',          'wenshi.html',          '文书生成'],
      ['fagui',           'fagui.html',           '法规检索'],
      ['faq',             'faq.html',             '帮助'],
      ['contact',         'contact.html',         '联系'],
      ['updates',         'updates.html',         '动态']
    ];
    ul.innerHTML = items.map(function (it) {
      return '<li><a class="' + navLinkClass(it[0] === active) + '" href="' + it[1] + '">' + it[2] + '</a></li>';
    }).join('');
    ul.setAttribute('data-fayi-motion', '1');
  }

  function bootRealtimeStore() {
    if (window.FayiRealtime) return;
    if (location.pathname.indexOf('/datav/') >= 0) return;
    var s = document.createElement('script');
    s.src = 'js/modules/datav/realtime-store.js';
    s.defer = true;
    document.head.appendChild(s);
  }

  function initDatavNav() {
    bootRealtimeStore();
    var host = document.getElementById('fayi-nav-extra');
    if (!host) {
      var header = document.querySelector('header .max-w-6xl, header > div > div');
      if (!header) return;
      host = document.createElement('div');
      host.id = 'fayi-nav-extra';
      host.className = 'fayi-nav-extra flex items-center shrink-0 order-first sm:order-none';
      var authEl = document.getElementById('app-nav-auth');
      if (authEl && authEl.parentNode) {
        authEl.parentNode.insertBefore(host, authEl);
      } else {
        header.appendChild(host);
      }
    }
    host.innerHTML = '<a href="datav/index.html" id="nav-datav-link" data-no-transition="0" title="数据驾驶舱">数字大屏</a>';
    var link = document.getElementById('nav-datav-link');
    if (link) {
      link.addEventListener('click', function () {
        try {
          sessionStorage.setItem('datav-return', window.location.href);
        } catch (e) { /* ignore */ }
        if (window.FayiRealtime && FayiRealtime.setReturnUrl) {
          FayiRealtime.setReturnUrl(window.location.href);
        }
      });
    }
  }

  function bootFayiMotion() {
    if (window.FayiMotion) return;
    var s = document.createElement('script');
    s.src = 'js/fayi-motion.js';
    s.defer = true;
    document.head.appendChild(s);
  }

  function initAuthNav() {
    var el = document.getElementById('app-nav-auth');
    if (!el) return;
    var u = getCurrentUser();
    var btn     = navLinkClass(false);
    var primary = 'btn text-xs sm:text-sm text-gray-100 bg-gray-900 hover:bg-gray-800 dark:text-gray-800 dark:bg-gray-100 dark:hover:bg-white py-1.5 px-3 rounded-lg';
    if (u) {
      var av = u.avatar || DEFAULT_AVATAR;
      el.innerHTML =
        '<span class="flex items-center gap-2 max-w-[16rem]">' +
        '<a href="profile.html" class="flex items-center gap-2 min-w-0 rounded-lg hover:bg-indigo-50/80 dark:hover:bg-gray-800/40 py-0.5 pr-1 transition-transform hover:scale-[1.02]" title="个人中心">' +
        '<img src="' + escapeHtml(av) + '" alt="" class="w-8 h-8 rounded-full object-cover ring-2 ring-indigo-200/80 dark:ring-indigo-600 shrink-0" width="32" height="32" />' +
        '<span class="' + btn + ' truncate max-w-[10rem]">' + escapeHtml(u.name || u.email) + '</span></a>' +
        '<button type="button" class="' + primary + '" id="app-logout-btn">退出</button></span>';
      var logoutBtn = document.getElementById('app-logout-btn');
      if (logoutBtn) logoutBtn.onclick = function () { logout(); };
    } else {
      el.innerHTML =
        '<a class="' + btn + '" href="login.html">登录</a>' +
        '<a class="' + primary + '" href="register.html">注册</a>';
    }
    initDatavNav();
  }

  /* ---- 登录表单 ---- */
  function bindLoginForm() {
    var form = document.getElementById('login-form');
    if (!form) return;
    var params = new URLSearchParams(window.location.search);
    if (params.get('registered') === '1') {
      var ok = document.getElementById('login-success');
      if (ok) ok.classList.remove('hidden');
      FayiToast('注册成功，请使用刚才的账号登录。', 'success');
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email    = document.getElementById('login-email').value;
      var password = document.getElementById('login-password').value;
      var err      = document.getElementById('login-error');
      apiLogin(email, password).then(function (res) {
        if (!res.ok) {
          err.textContent = res.message || '登录失败';
          err.classList.remove('hidden');
          FayiToast(res.message || '登录失败', 'error');
          return;
        }
        setToken(res.data.token);
        setCurrentUser(res.data.user);
        err.classList.add('hidden');
        var next = params.get('next') || 'chat.html';
        if (!/^[a-zA-Z0-9._-]+\.html$/.test(next)) next = 'chat.html';
        window.location.href = next;
      }).catch(function () {
        err.textContent = '网络错误，请检查后端服务是否启动（http://localhost:3002）。';
        err.classList.remove('hidden');
        FayiToast('无法连接到服务器', 'error');
      });
    });
  }

  /* ---- 注册表单 ---- */
  function bindRegisterForm() {
    var form = document.getElementById('register-form');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name      = document.getElementById('register-name').value;
      var email     = document.getElementById('register-email').value;
      var password  = document.getElementById('register-password').value;
      var password2 = document.getElementById('register-password2').value;
      var err       = document.getElementById('register-error');
      if (password !== password2) {
        err.textContent = '两次输入的密码不一致。'; err.classList.remove('hidden');
        FayiToast('两次输入的密码不一致。', 'error'); return;
      }
      if (password.length < 6) {
        err.textContent = '密码长度至少 6 位。'; err.classList.remove('hidden');
        FayiToast('密码长度至少 6 位。', 'error'); return;
      }
      var avInput   = document.querySelector('input[name="register-avatar"]:checked');
      var avatar    = avInput ? avInput.value : DEFAULT_AVATAR;
      var personaEl = document.getElementById('register-persona');
      var persona   = personaEl ? personaEl.value : DEFAULT_PERSONA;
      apiRegister(name, email, password, avatar, persona).then(function (res) {
        if (!res.ok) {
          err.textContent = res.message || '注册失败';
          err.classList.remove('hidden');
          FayiToast(res.message || '注册失败', 'error'); return;
        }
        err.classList.add('hidden');
        window.setTimeout(function () {
          window.location.href = 'login.html?registered=1&next=chat.html';
        }, 400);
      }).catch(function () {
        err.textContent = '网络错误，请检查后端服务是否启动。';
        err.classList.remove('hidden');
        FayiToast('无法连接到服务器', 'error');
      });
    });
  }

  /* ---- DOMContentLoaded ---- */
  document.addEventListener('DOMContentLoaded', function () {
    var path = (window.location.pathname || '').split('/').pop() || '';
    if ((path === 'login.html' || path === 'register.html') && getCurrentUser()) {
      window.location.replace('chat.html'); return;
    }
    bootFayiMotion();
    initMainNav();
    initAuthNav();
    bindLoginForm();
    bindRegisterForm();
  });

  /* ---- 公开接口 ---- */
  window.FayiAuth = {
    getCurrentUser:  getCurrentUser,
    setCurrentUser:  setCurrentUser,
    getToken:        getToken,
    authHeaders:     authHeaders,
    logout:          logout,
    updateProfile:   updateProfile,
    changePassword:  apiChangePassword,
    requireAuth:     requireAuth,
    kbStorageKey:    kbStorageKey,
    chatStorageKey:  chatStorageKey,
    DEFAULT_AVATAR:  DEFAULT_AVATAR,
    DEFAULT_PERSONA: DEFAULT_PERSONA,
    API_BASE:        API_BASE,
  };

})();

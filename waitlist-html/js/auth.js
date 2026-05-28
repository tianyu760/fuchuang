/**
 * auth.js — 法绎前端鉴权（普通用户 / 管理员分离）
 */
(function () {

  var API_BASE = 'http://localhost:3002';
  var KEY_TOKEN = 'fayi_user_token';
  var KEY_TOKEN_LEGACY = 'fayi_token';
  var KEY_USER  = 'fayi_current_user';
  var DEFAULT_AVATAR  = './images/avatars/1.svg';
  var DEFAULT_PERSONA = 'life_consume';

  function perm() {
    return window.FayiAdminPermission || null;
  }

  function isExactAdminCode(code) {
    if (perm()) return perm().isValidAdminPermissionCode(code);
    return String(code) === 'manager';
  }

  function isAdminRoleUser(user) {
    if (!user) return false;
    if (perm()) return perm().isAdminRole(user);
    return user.role === 'admin' || user.userType === 'admin';
  }

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

  function getToken() {
    return localStorage.getItem(KEY_TOKEN) || localStorage.getItem(KEY_TOKEN_LEGACY);
  }
  function setToken(t) {
    localStorage.setItem(KEY_TOKEN, t);
    localStorage.removeItem(KEY_TOKEN_LEGACY);
  }
  function clearToken() {
    localStorage.removeItem(KEY_TOKEN);
    localStorage.removeItem(KEY_TOKEN_LEGACY);
  }

  function getCurrentUser() {
    try {
      var raw = localStorage.getItem(KEY_USER);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function setCurrentUser(user) {
    var role = user.role || (user.userType === 'admin' ? 'admin' : 'user');
    localStorage.setItem(KEY_USER, JSON.stringify({
      id:       user.id,
      email:    user.email,
      name:     user.name || user.email,
      avatar:   user.avatar || DEFAULT_AVATAR,
      persona:  user.persona || DEFAULT_PERSONA,
      userType: user.userType || role,
      role:     role
    }));
  }

  function clearCurrentUser() { localStorage.removeItem(KEY_USER); }

  function isAdminUser() {
    return isAdminRoleUser(getCurrentUser());
  }

  function authHeaders() {
    var t = getToken();
    var ct = 'application/json; charset=utf-8';
    return t ? { 'Content-Type': ct, Accept: ct, 'Authorization': 'Bearer ' + t }
             : { 'Content-Type': ct, Accept: ct };
  }

  function apiRegister(payload) {
    return fetch(API_BASE + '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
    }).then(function (r) { return r.json(); });
  }

  function apiLogin(email, password, adminPermissionCode) {
    var body = { email: email, password: password };
    if (adminPermissionCode !== undefined && adminPermissionCode !== '') {
      body.adminPermissionCode = adminPermissionCode;
    }
    return fetch(API_BASE + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    }).then(function (r) { return r.json(); });
  }

  function apiUpdateProfile(patch) {
    return fetch(API_BASE + '/api/auth/profile', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(patch),
    }).then(function (r) { return r.json(); });
  }

  function apiChangePassword(oldPassword, newPassword) {
    return fetch(API_BASE + '/api/auth/change-password', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ oldPassword: oldPassword, newPassword: newPassword }),
    }).then(function (r) { return r.json(); });
  }

  function updateProfile(patch) {
    return apiUpdateProfile(patch).then(function (res) {
      if (res.ok) {
        setCurrentUser(res.data);
        initAuthNav();
      }
      return res;
    });
  }

  function logout() {
    clearToken();
    clearCurrentUser();
    if (perm()) perm().clearAdminSession();
    else {
      localStorage.removeItem('fayi_admin_token');
      localStorage.removeItem('fayi_admin_info');
      localStorage.removeItem('fayi_admin_permission_verified');
    }
    window.location.href = 'index.html';
  }

  function completeAdminLogin(resData) {
    var user = resData.user;
    var adminToken = resData.adminToken || resData.token;
    setToken(resData.token);
    setCurrentUser(user);
    if (perm()) {
      perm().persistAdminSession(adminToken, user);
    } else {
      localStorage.setItem('fayi_admin_token', adminToken);
      localStorage.setItem('fayi_admin_info', JSON.stringify(user));
      localStorage.setItem('fayi_admin_permission_verified', '1');
    }
  }

  function requireAuth() {
    if (!getCurrentUser() || !getToken()) {
      var page = (window.location.pathname || '').split('/').pop() || 'index.html';
      if (!page || page.indexOf('.') === -1) page = 'index.html';
      window.location.replace('login.html?next=' + encodeURIComponent(page));
      return false;
    }
    if (isAdminUser() && perm() && !perm().isAdminVerified()) {
      window.location.replace('login.html');
      return false;
    }
    return true;
  }

  function guardUserPages() {
    var path = (window.location.pathname || '').split('/').pop() || '';
    var adminPages = ['admin-dashboard.html', 'admin-login.html', '/admin/'];
    if (adminPages.indexOf(path) >= 0) return;
    if (isAdminUser() && getToken() && perm() && !perm().isAdminVerified()) {
      window.location.replace('login.html');
    }
  }

  function kbStorageKey()   { var u = getCurrentUser(); return u ? 'fayi_kb_'   + u.email : null; }
  function chatStorageKey() { var u = getCurrentUser(); return u ? 'fayi_chat_' + u.email : null; }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function navLinkClass(active) {
    if (active) return 'text-indigo-600 dark:text-indigo-400 rounded-lg bg-indigo-50 dark:bg-gray-800/50 py-1.5 px-2 sm:px-3 text-xs sm:text-sm font-medium transition-colors';
    return 'text-gray-800 dark:text-gray-200 rounded-lg hover:bg-indigo-100 dark:hover:bg-gray-800/30 py-1.5 px-2 sm:px-3 text-xs sm:text-sm font-medium transition-colors';
  }

  function initMainNav() {
    var ul = document.getElementById('fayi-main-nav');
    if (!ul) return;
    var active = ul.getAttribute('data-active') || '';
    var items = [
      ['index', 'index.html', '首页'],
      ['chat', 'chat.html', '法律咨询'],
      ['knowledge', 'knowledge.html', '资料库'],
      ['pufa', 'pufa.html', '普法宣传'],
      ['wenshi', 'wenshi.html', '文书生成'],
      ['fagui', 'fagui.html', '法规检索'],
      ['faq', 'faq.html', '帮助'],
      ['contact', 'contact.html', '联系'],
      ['updates', 'updates.html', '动态']
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
    host.innerHTML = '<a href="datav/index.html" id="nav-datav-link" title="数据驾驶舱">数字大屏</a>';
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
    if (u && !isAdminUser()) {
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

  function bindLoginForm() {
    var form = document.getElementById('login-form');
    if (!form) return;
    var params = new URLSearchParams(window.location.search);
    if (params.get('registered') === '1') {
      var ok = document.getElementById('login-success');
      if (ok) {
        ok.classList.remove('hidden');
        ok.classList.add('is-show');
      }
      var emailParam = params.get('email');
      if (emailParam) {
        var emailElReg = document.getElementById('login-email');
        if (emailElReg) emailElReg.value = emailParam;
      }
      FayiToast('注册成功，请登录您的账号', 'success');
    }

    var adminWrap = document.getElementById('lg-admin-code-wrap');
    var adminInput = document.getElementById('login-admin-permission-code');

    function showAdminCodeField() {
      if (adminWrap) {
        adminWrap.classList.add('is-visible');
        adminWrap.setAttribute('aria-hidden', 'false');
      }
    }

    if (params.get('admin') === '1') {
      showAdminCodeField();
      var emailParam = params.get('email');
      if (emailParam) {
        var emailEl = document.getElementById('login-email');
        if (emailEl) emailEl.value = emailParam;
      }
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email    = document.getElementById('login-email').value.trim();
      var password = document.getElementById('login-password').value;
      var err      = document.getElementById('login-error');
      var adminCode = adminInput ? adminInput.value : '';
      var submitBtn = document.getElementById('lg-submit-btn');
      var btnText = document.getElementById('lg-btn-text');

      if (submitBtn) submitBtn.disabled = true;
      if (btnText) btnText.textContent = '登录中...';

      function resetBtn() {
        if (submitBtn) submitBtn.disabled = false;
        if (btnText) btnText.textContent = '登录';
      }

      apiLogin(email, password, adminCode).then(function (res) {
        if (!res.ok) {
          if (res.code === 'ADMIN_CODE_REQUIRED') {
            showAdminCodeField();
          }
          if (res.code === 'ADMIN_CODE_INVALID' || res.code === 'ADMIN_CODE_REQUIRED') {
            if (adminInput) {
              adminInput.classList.add('error');
              if (perm()) perm().shakeEl(adminInput);
            }
          }
          if (err) {
            err.textContent = res.message || '登录失败';
            err.classList.add('is-show');
          }
          FayiToast(res.message || '登录失败', 'error');
          resetBtn();
          return;
        }

        var user = res.data.user;
        if (isAdminRoleUser(user)) {
          completeAdminLogin(res.data);
          FayiToast('管理员验证成功', 'success');
          window.location.href = 'admin/dashboard.html';
          return;
        }

        if (perm()) perm().clearAdminSession();
        else {
          localStorage.removeItem('fayi_admin_token');
          localStorage.removeItem('fayi_admin_info');
          localStorage.removeItem('fayi_admin_permission_verified');
        }
        setToken(res.data.token);
        setCurrentUser(user);
        if (window.FayiActivityTracker) {
          FayiActivityTracker.trackLogin(user.email || email);
        }
        if (err) {
          err.textContent = '';
          err.classList.remove('is-show');
        }
        var next = params.get('next') || 'index.html';
        if (!/^[a-zA-Z0-9._-]+\.html$/.test(next)) next = 'index.html';
        window.location.href = next;
      }).catch(function () {
        if (err) {
          err.textContent = '网络错误，请检查后端服务是否启动（http://localhost:3002）。';
          err.classList.add('is-show');
        }
        FayiToast('无法连接到服务器', 'error');
        resetBtn();
      });
    });
  }

  function getRegisterUserType() {
    var checked = document.querySelector('input[name="register-user-type"]:checked');
    return checked ? checked.value : 'user';
  }

  function bindRegisterForm() {
    var form = document.getElementById('register-form');
    if (!form) return;

    document.querySelectorAll('input[name="register-user-type"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        document.querySelectorAll('.auth-type-card').forEach(function (card) {
          card.classList.toggle('is-active', card.getAttribute('data-type') === radio.value);
        });
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name      = document.getElementById('register-name').value;
      var email     = document.getElementById('register-email').value;
      var password  = document.getElementById('register-password').value;
      var password2 = document.getElementById('register-password2').value;
      var err       = document.getElementById('register-error');
      var userType  = getRegisterUserType();

      if (password !== password2) {
        err.textContent = '两次输入的密码不一致。';
        err.classList.remove('hidden');
        err.classList.add('is-show');
        FayiToast('两次输入的密码不一致。', 'error');
        return;
      }
      if (password.length < 6) {
        err.textContent = '密码长度至少 6 位。';
        err.classList.remove('hidden');
        err.classList.add('is-show');
        FayiToast('密码长度至少 6 位。', 'error');
        return;
      }

      var avInput = document.querySelector('input[name="register-avatar"]:checked');
      var avatar  = avInput ? avInput.value : DEFAULT_AVATAR;
      if (userType === 'admin') {
        var codeEl = document.getElementById('register-admin-permission-code');
        var codeVal = codeEl ? codeEl.value : '';
        if (!isExactAdminCode(codeVal)) {
          err.textContent = '管理员权限验证码错误，无法注册管理员账号';
          err.classList.remove('hidden');
          err.classList.add('is-show');
          FayiToast('管理员权限验证码错误，无法注册管理员账号', 'error');
          if (codeEl) {
            codeEl.classList.add('error');
            var ap = window.FayiAdminPermission;
            if (ap) ap.shakeEl(codeEl);
          }
          return;
        }
      }

      var payload = {
        name: name,
        email: email,
        password: password,
        avatar: avatar,
        userType: userType
      };
      if (userType === 'admin') {
        payload.adminPermissionCode = document.getElementById('register-admin-permission-code').value;
      }

      var btn = document.getElementById('rg-submit-btn');
      var btnText = document.getElementById('rg-btn-text');
      if (btn) btn.disabled = true;
      if (btnText) btnText.textContent = '注册中...';

      apiRegister(payload).then(function (res) {
        if (!res.ok) {
          err.textContent = res.message || '注册失败';
          err.classList.remove('hidden');
          err.classList.add('is-show');
          FayiToast(res.message || '注册失败', 'error');
          if (res.code === 'ADMIN_CODE_INVALID' && userType === 'admin') {
            var codeEl = document.getElementById('register-admin-permission-code');
            if (codeEl) {
              codeEl.classList.add('error');
              var ap2 = window.FayiAdminPermission;
              if (ap2) ap2.shakeEl(codeEl);
            }
          }
          if (btn) btn.disabled = false;
          if (btnText) btnText.textContent = '创建账号';
          return;
        }
        err.classList.add('hidden');
        if (window.FayiActivityTracker) {
          FayiActivityTracker.trackRegister(email.trim());
        }

        if (userType === 'admin') {
          FayiToast('管理员账号已创建，请前往管理端登录', 'success');
          window.location.href = 'admin-login.html?registered=1&email=' + encodeURIComponent(email.trim());
          return;
        }

        FayiToast('注册成功，请登录您的账号', 'success');
        window.location.href = 'login.html?registered=1&email=' + encodeURIComponent(email.trim());
      }).catch(function () {
        err.textContent = '网络错误，请检查后端服务是否启动。';
        err.classList.remove('hidden');
        FayiToast('无法连接到服务器', 'error');
        if (btn) btn.disabled = false;
        if (btnText) btnText.textContent = '创建账号';
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var path = (window.location.pathname || '').split('/').pop() || '';
    if ((path === 'login.html' || path === 'register.html') && getCurrentUser() && !isAdminUser()) {
      window.location.replace('index.html');
      return;
    }
    guardUserPages();
    bootFayiMotion();
    initMainNav();
    initAuthNav();
    bindLoginForm();
    bindRegisterForm();
  });

  window.FayiAuth = {
    getCurrentUser:  getCurrentUser,
    setCurrentUser:  setCurrentUser,
    getToken:        getToken,
    authHeaders:     authHeaders,
    logout:          logout,
    updateProfile:   updateProfile,
    changePassword:  apiChangePassword,
    requireAuth:     requireAuth,
    isAdminUser:     isAdminUser,
    isAdminRoleUser: isAdminRoleUser,
    completeAdminLogin: completeAdminLogin,
    kbStorageKey:    kbStorageKey,
    chatStorageKey:  chatStorageKey,
    DEFAULT_AVATAR:  DEFAULT_AVATAR,
    DEFAULT_PERSONA: DEFAULT_PERSONA,
    API_BASE:        API_BASE,
  };

})();

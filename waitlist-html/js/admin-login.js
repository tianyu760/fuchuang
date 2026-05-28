/**
 * 管理端登录 — 邮箱 + 密码 + 身份验证码 manager
 */
(function () {
  var FIXED_ADMIN_CODE = 'manager';

  if (window.FayiAdminAuth && FayiAdminAuth.isLoggedIn()) {
    window.location.replace('admin-dashboard.html');
    return;
  }

  var errEl = document.getElementById('al-error');
  var form = document.getElementById('al-login-form');
  var submitBtn = document.getElementById('al-submit');
  var emailInput = document.getElementById('al-email');
  var passwordInput = document.getElementById('al-password');
  var identityInput = document.getElementById('al-identity');
  var eyeBtn = document.getElementById('al-eye-pw');

  (function handleRegisteredRedirect() {
    var params = new URLSearchParams(window.location.search);
    if (params.get('registered') !== '1') return;
    var emailParam = params.get('email');
    if (emailParam && emailInput) {
      emailInput.value = emailParam;
    }
    if (window.FayiToast) {
      FayiToast('管理员账号已创建，请使用邮箱、密码及身份验证码登录', 'success');
    }
  })();

  function showError(msg) {
    if (!errEl) return;
    errEl.textContent = msg;
    errEl.classList.add('is-show');
  }

  function clearError() {
    if (!errEl) return;
    errEl.textContent = '';
    errEl.classList.remove('is-show');
  }

  function shakeEl(el) {
    if (!el) return;
    el.classList.add('error', 'auth-shake');
    if (window.FayiAdminPermission) FayiAdminPermission.shakeEl(el);
    setTimeout(function () {
      el.classList.remove('auth-shake');
    }, 500);
  }

  function syncCodeVisual() {
    if (!identityInput) return;
    var val = identityInput.value.trim();
    identityInput.classList.remove('success', 'error');
    if (val === FIXED_ADMIN_CODE) {
      identityInput.classList.add('success');
    }
  }

  if (identityInput) {
    identityInput.addEventListener('input', syncCodeVisual);
    identityInput.addEventListener('blur', syncCodeVisual);
  }

  if (eyeBtn && passwordInput) {
    eyeBtn.addEventListener('click', function () {
      passwordInput.type = passwordInput.type === 'password' ? 'text' : 'password';
    });
  }

  function enterDashboard(token, admin) {
    var info = {
      id: admin.id,
      email: admin.email,
      nickname: admin.nickname || admin.name,
      name: admin.name || admin.nickname || '系统管理员',
      userType: 'admin',
      identityCode: FIXED_ADMIN_CODE,
      role: admin.role || 'admin'
    };

    if (window.FayiAdminPermission) {
      FayiAdminPermission.persistAdminSession(token, info);
    } else {
      localStorage.setItem('fayi_admin_token', token);
      localStorage.setItem('fayi_admin_info', JSON.stringify(info));
      localStorage.setItem('fayi_admin_permission_verified', '1');
    }
    FayiAdminApi.setToken(token);
    FayiAdminApi.setAdminInfo(info);

    localStorage.removeItem('fayi_user_token');
    localStorage.removeItem('fayi_token');
    localStorage.removeItem('fayi_current_user');

    window.location.href = 'admin-dashboard.html';
  }

  if (!form) return;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearError();

    var email = emailInput ? emailInput.value.trim() : '';
    var password = passwordInput ? passwordInput.value : '';
    var identityCode = identityInput ? identityInput.value.trim() : '';

    [emailInput, passwordInput, identityInput].forEach(function (el) {
      if (el) el.classList.remove('error', 'success');
    });

    if (!email) {
      showError('请输入管理员邮箱');
      shakeEl(emailInput);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showError('邮箱格式不正确');
      shakeEl(emailInput);
      return;
    }
    if (!password) {
      showError('请输入密码');
      shakeEl(passwordInput);
      return;
    }
    if (!identityCode) {
      showError('请输入身份验证码');
      shakeEl(identityInput);
      return;
    }
    if (identityCode !== FIXED_ADMIN_CODE) {
      showError('身份验证码错误，无权进入管理系统');
      shakeEl(identityInput);
      if (window.FayiToast) FayiToast('身份验证码错误', 'error');
      return;
    }

    if (identityInput) identityInput.classList.add('success');
    if (submitBtn) submitBtn.disabled = true;

    FayiAdminApi.login(email, password, identityCode)
      .then(function (res) {
        var data = res.data || {};
        var token = data.token;
        var admin = data.admin;
        if (!token || !admin) {
          showError('登录失败，请确认后端服务已启动');
          if (submitBtn) submitBtn.disabled = false;
          return;
        }
        if (window.FayiToast) FayiToast('管理员验证成功', 'success');
        enterDashboard(token, admin);
      })
      .catch(function (err) {
        var msg = err.message || '登录失败，请确认服务已启动（端口 3002）';
        showError(msg);
        if (/验证码/.test(msg)) {
          shakeEl(identityInput);
        } else if (/密码|账号|邮箱|用户/.test(msg)) {
          shakeEl(emailInput);
          shakeEl(passwordInput);
        }
        if (window.FayiToast) FayiToast(msg, 'error');
        if (submitBtn) submitBtn.disabled = false;
      });
  });
})();

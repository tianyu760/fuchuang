/**
 * 管理端登录 — 仅凭身份验证码 manager
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

  function showError(msg) {
    if (!errEl) return;
    errEl.textContent = msg;
    errEl.classList.add('is-show');
    errEl.style.color = '#dc2626';
    errEl.style.background = '#fef2f2';
    errEl.style.borderColor = '#fecaca';
  }

  function enterDashboard(token, admin) {
    var info = {
      id: admin.id,
      email: admin.email,
      nickname: admin.nickname || admin.name,
      name: admin.name || admin.nickname || '系统管理员',
      userType: 'admin',
      identityCode: FIXED_ADMIN_CODE,
      role: 'admin'
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
    var identityCode = document.getElementById('al-identity').value || '';

    if (identityCode !== FIXED_ADMIN_CODE) {
      showError('管理员权限验证失败');
      var inp = document.getElementById('al-identity');
      if (inp) {
        inp.classList.add('error');
        if (window.FayiAdminPermission) FayiAdminPermission.shakeEl(inp);
      }
      if (window.FayiToast) FayiToast('管理员权限验证失败', 'error');
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    if (errEl) errEl.classList.remove('is-show');

    FayiAdminApi.loginByCode(identityCode)
      .then(function (res) {
        var data = res.data || {};
        var token = data.token;
        var admin = data.admin;
        if (!token || !admin) {
          showError('验证失败，请确认后端服务已启动');
          if (submitBtn) submitBtn.disabled = false;
          return;
        }
        enterDashboard(token, admin);
      })
      .catch(function (err) {
        showError(err.message || '验证失败，请确认服务已启动（端口 3002）');
        if (submitBtn) submitBtn.disabled = false;
      });
  });
})();

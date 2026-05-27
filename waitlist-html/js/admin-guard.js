/**
 * 管理后台路由守卫
 */
(function () {
  var TOKEN_KEY = 'fayi_admin_token';
  var INFO_KEY = 'fayi_admin_info';

  function redirectLogin() {
    window.location.replace('login.html');
  }

  function deny(msg) {
    if (window.FayiToast) FayiToast(msg || '无权访问管理后台', 'error');
    if (window.FayiAdminPermission) FayiAdminPermission.clearAdminSession();
    else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(INFO_KEY);
      localStorage.removeItem('fayi_admin_permission_verified');
    }
    redirectLogin();
  }

  var token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    deny('请先登录并完成管理员权限验证');
    return;
  }

  var verified = window.FayiAdminPermission
    ? FayiAdminPermission.isAdminVerified()
    : localStorage.getItem('fayi_admin_permission_verified') === '1';

  if (!verified) {
    deny('管理员权限验证码未通过，无法进入后台');
    return;
  }

  try {
    var info = JSON.parse(localStorage.getItem(INFO_KEY) || 'null');
    var isAdmin = info && (info.role === 'admin' || info.userType === 'admin');
    if (!isAdmin) {
      deny('当前账号不是管理员');
      return;
    }
  } catch (e) {
    deny('登录状态无效，请重新登录');
  }
})();

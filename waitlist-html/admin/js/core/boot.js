/**
 * 运营后台 · 鉴权与路径
 */
(function () {
  var LOGIN = '../admin-login.html';

  function patchAuth() {
    if (!window.FayiAdminAuth) return;
    var orig = FayiAdminAuth.requireAuth;
    FayiAdminAuth.requireAuth = function () {
      if (!FayiAdminAuth.getToken()) {
        window.location.replace(LOGIN);
        return false;
      }
      if (localStorage.getItem('fayi_admin_permission_verified') !== '1') {
        FayiAdminAuth.clearToken();
        window.location.replace(LOGIN);
        return false;
      }
      var info = FayiAdminAuth.getAdminInfo();
      var okRole = info && (
        info.userType === 'admin' ||
        info.role === 'admin' ||
        info.role === 'super_admin' ||
        info.role === 'platform_admin' ||
        info.identityCode === 'manager'
      );
      if (!okRole) {
        FayiAdminAuth.clearToken();
        window.location.replace(LOGIN);
        return false;
      }
      return true;
    };
    FayiAdminAuth.logout = function () {
      FayiAdminAuth.clearToken();
      try {
        localStorage.removeItem('fayi_user_token');
        localStorage.removeItem('fayi_token');
        localStorage.removeItem('fayi_current_user');
      } catch (e) { /* ignore */ }
      if (window.OpsRuntime && OpsRuntime.invalidate) OpsRuntime.invalidate('');
      window.location.replace(LOGIN);
    };
  }

  patchAuth();
  if (!window.FayiAdminAuth || !FayiAdminAuth.requireAuth()) return;

  function finishBoot(admin) {
    window.OpsBoot = {
      loginUrl: LOGIN,
      adminInfo: admin || FayiAdminAuth.getAdminInfo()
    };
    document.dispatchEvent(new CustomEvent('ops:auth-ready'));
  }

  if (window.FayiAdminApi && FayiAdminApi.me) {
    FayiAdminApi.me().then(function (res) {
      var data = res.data || res;
      var admin = data.admin || data;
      if (admin && admin.id) FayiAdminAuth.setAdminInfo(admin);
      finishBoot(admin);
    }).catch(function () {
      FayiAdminAuth.clearToken();
      window.location.replace(LOGIN);
    });
    return;
  }

  finishBoot();
})();

/**
 * 管理员权限验证码（固定 manager，区分大小写，不允许空格）
 */
(function (global) {
  var ADMIN_PERMISSION_CODE = 'manager';
  var VERIFIED_KEY = 'fayi_admin_permission_verified';

  function isValidAdminPermissionCode(code) {
    return String(code) === ADMIN_PERMISSION_CODE;
  }

  function isAdminRole(user) {
    if (!user) return false;
    return user.role === 'admin' || user.userType === 'admin';
  }

  function isAdminVerified() {
    return localStorage.getItem(VERIFIED_KEY) === '1';
  }

  function setAdminVerified(verified) {
    if (verified) {
      localStorage.setItem(VERIFIED_KEY, '1');
    } else {
      localStorage.removeItem(VERIFIED_KEY);
    }
  }

  function clearAdminSession() {
    localStorage.removeItem('fayi_admin_token');
    localStorage.removeItem('fayi_admin_info');
    localStorage.removeItem(VERIFIED_KEY);
  }

  function persistAdminSession(adminToken, adminUser) {
    if (!adminToken) return;
    localStorage.setItem('fayi_admin_token', adminToken);
    localStorage.setItem(
      'fayi_admin_info',
      JSON.stringify({
        id: adminUser.id,
        email: adminUser.email,
        nickname: adminUser.nickname || adminUser.name,
        name: adminUser.name || adminUser.nickname || '系统管理员',
        userType: 'admin',
        role: 'admin',
        identityCode: ADMIN_PERMISSION_CODE,
        adminPermissionVerified: true
      })
    );
    setAdminVerified(true);
  }

  function shakeEl(el) {
    if (!el) return;
    el.classList.remove('auth-shake');
    void el.offsetWidth;
    el.classList.add('auth-shake');
    window.setTimeout(function () { el.classList.remove('auth-shake'); }, 520);
  }

  global.FayiAdminPermission = {
    CODE: ADMIN_PERMISSION_CODE,
    VERIFIED_KEY: VERIFIED_KEY,
    isValidAdminPermissionCode: isValidAdminPermissionCode,
    isAdminRole: isAdminRole,
    isAdminVerified: isAdminVerified,
    setAdminVerified: setAdminVerified,
    clearAdminSession: clearAdminSession,
    persistAdminSession: persistAdminSession,
    shakeEl: shakeEl
  };
})(window);

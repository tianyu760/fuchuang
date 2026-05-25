/**
 * 法绎 · 全局系统配置（与 src/config/system.ts 保持同步）
 */
(function (global) {
  var SYSTEM_CONFIG = {
    SERVICE_PHONE: '19050277657',
    COPYRIGHT_YEAR: '2026'
  };

  function formatServicePhone(phone) {
    phone = phone || SYSTEM_CONFIG.SERVICE_PHONE;
    var digits = String(phone).replace(/\D/g, '');
    if (digits.length === 11) {
      return digits.slice(0, 3) + '-' + digits.slice(3, 7) + '-' + digits.slice(7);
    }
    return String(phone);
  }

  function bindSystemConfig() {
    var phone = SYSTEM_CONFIG.SERVICE_PHONE;
    var display = formatServicePhone(phone);
    var year = SYSTEM_CONFIG.COPYRIGHT_YEAR;

    document.querySelectorAll('[data-fayi-phone]').forEach(function (el) {
      el.textContent = display;
      if (el.tagName === 'A') {
        el.setAttribute('href', 'tel:' + phone);
      }
    });

    document.querySelectorAll('[data-fayi-copyright]').forEach(function (el) {
      var suffix = el.getAttribute('data-fayi-copyright-suffix') || '';
      if (suffix) {
        el.innerHTML = '&copy; ' + year + ' ' + suffix;
      }
    });

    document.querySelectorAll('[data-fayi-year]').forEach(function (el) {
      el.textContent = year;
    });
  }

  global.SYSTEM_CONFIG = SYSTEM_CONFIG;
  global.FayiSystem = {
    SYSTEM_CONFIG: SYSTEM_CONFIG,
    formatServicePhone: formatServicePhone,
    bindSystemConfig: bindSystemConfig
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindSystemConfig);
  } else {
    bindSystemConfig();
  }
})(typeof window !== 'undefined' ? window : global);

/**
 * 各页面公共脚本列表（按顺序加载）
 * 在 HTML 中复用同一组 script 标签
 */
window.OpsScriptList = [
  'https://cdn.jsdelivr.net/npm/iconify-icon@2.1.0/dist/iconify-icon.min.js',
  '../js/lib/http-client.js',
  '../js/config/env.js',
  '../js/admin-permission.js',
  '../js/modules/admin/admin-api.js',
  '../js/utils/activityTracker.js',
  '../js/utils/fayiActivityCenter.js',
  'js/core/activity-center.js',
  'js/core/boot.js',
  'js/components/sidebar.js',
  'js/components/topbar.js',
  'js/core/shell.js',
  'charts/ops-charts.js'
];

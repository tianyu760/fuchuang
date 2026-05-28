/**
 * 运营后台 · 通用 UI 片段
 */
window.OpsUI = {
  pageHeader: function (title, sub, chips) {
    return (
      '<header class="ops-page-header">' +
        '<div class="ops-page-header__main">' +
          '<h1 class="ops-page-title">' + (title || '') + '</h1>' +
          (sub ? '<p class="ops-page-sub">' + sub + '</p>' : '') +
        '</div>' +
        (chips ? '<div class="ops-page-meta">' + chips + '</div>' : '') +
      '</header>'
    );
  },

  metaChip: function (label, value, type) {
    var cls = 'ops-meta-chip' + (type ? ' ops-meta-chip--' + type : '');
    return '<span class="' + cls + '">' + label + ' <strong class="ops-num">' + value + '</strong></span>';
  }
};

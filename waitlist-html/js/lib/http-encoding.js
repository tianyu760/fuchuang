/**
 * 法绎 · 前端 HTTP UTF-8 请求头（所有 JSON 请求统一 charset）
 */
(function (global) {
  var JSON_UTF8 = 'application/json; charset=utf-8';

  function jsonHeaders(extra) {
    return Object.assign({ 'Content-Type': JSON_UTF8, Accept: JSON_UTF8 }, extra || {});
  }

  function withAuth(extra) {
    var h = jsonHeaders(extra);
    if (global.FayiAuth && FayiAuth.getToken) {
      var t = FayiAuth.getToken();
      if (t) h.Authorization = 'Bearer ' + t;
    }
    return h;
  }

  global.FayiHttpEncoding = {
    JSON_UTF8: JSON_UTF8,
    jsonHeaders: jsonHeaders,
    withAuth: withAuth
  };
})(typeof window !== 'undefined' ? window : global);

/**
 * 法绎 · 统一 fetch 客户端（content-type 校验、JSON 安全解析、Toast、401 处理）
 */
(function (global) {
  var JSON_UTF8 = 'application/json; charset=utf-8';

  function ensureToast() {
    if (global.FayiToast) return;
    global.FayiToast = function (message, variant) {
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

  function isJsonContentType(ct) {
    return (ct || '').toLowerCase().indexOf('application/json') >= 0;
  }

  function normalizeBody(json, status) {
    if (!json || typeof json !== 'object') {
      return { code: status >= 200 && status < 300 ? 0 : status, message: 'ok', data: json };
    }
    if (typeof json.code === 'number') {
      return {
        code: json.code,
        message: json.message || '',
        data: json.data !== undefined ? json.data : null,
        success: json.code === 0
      };
    }
    if (json.success !== undefined) {
      return {
        code: json.success ? 0 : (json.code || 1),
        message: json.message || json.error || '',
        data: json.data !== undefined ? json.data : null,
        success: !!json.success
      };
    }
    if (json.ok !== undefined) {
      return {
        code: json.ok ? 0 : 1,
        message: json.message || '',
        data: json.data !== undefined ? json.data : null,
        success: !!json.ok
      };
    }
    return { code: 0, message: 'ok', data: json, success: true };
  }

  function parseResponse(res) {
    var ct = res.headers.get('content-type') || '';
    if (!isJsonContentType(ct)) {
      return res.text().then(function (text) {
        var preview = (text || '').replace(/\s+/g, ' ').trim().slice(0, 80);
        var hint = preview.indexOf('<') >= 0
          ? '接口返回了 HTML 页面而非 JSON（常见于后端未启动或路径错误）'
          : '接口返回了非 JSON 数据';
        var err = new Error(hint + (preview ? '：' + preview : ''));
        err.status = res.status;
        err.isHtml = preview.indexOf('<') >= 0;
        throw err;
      });
    }
    return res.text().then(function (text) {
      if (!text) return normalizeBody({}, res.status);
      try {
        return normalizeBody(JSON.parse(text), res.status);
      } catch (e) {
        var err = new Error('JSON 解析失败：' + e.message);
        err.status = res.status;
        throw err;
      }
    });
  }

  function notifyError(message, options) {
    options = options || {};
    if (!options.silent && global.FayiToast) {
      ensureToast();
      FayiToast(message, options.variant || 'error');
    }
  }

  function request(url, options) {
    options = options || {};
    var opts = {
      method: options.method || 'GET',
      headers: Object.assign({ Accept: JSON_UTF8 }, options.headers || {}),
      credentials: options.credentials,
      signal: options.signal,
      body: options.body
    };
    if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
      opts.headers['Content-Type'] = opts.headers['Content-Type'] || JSON_UTF8;
      opts.body = JSON.stringify(opts.body);
    }

    return fetch(url, opts).then(function (res) {
      return parseResponse(res).then(function (body) {
        if (res.status === 401 || body.code === 401) {
          if (options.onUnauthorized) options.onUnauthorized(body);
          var authErr = new Error(body.message || '登录已过期，请重新登录');
          authErr.status = 401;
          authErr.body = body;
          if (!options.silent) notifyError(authErr.message, options);
          throw authErr;
        }
        if (res.status === 403 || body.code === 403) {
          var forbidden = new Error(body.message || '无权访问');
          forbidden.status = 403;
          if (!options.silent) notifyError(forbidden.message, options);
          throw forbidden;
        }
        if (!res.ok || (typeof body.code === 'number' && body.code !== 0)) {
          var fail = new Error(body.message || '请求失败（HTTP ' + res.status + '）');
          fail.status = res.status;
          fail.body = body;
          if (!options.silent) notifyError(fail.message, options);
          throw fail;
        }
        body.success = true;
        return body;
      });
    }).catch(function (err) {
      if (err && err.status) throw err;
      var netErr = new Error((err && err.message) || '网络请求失败');
      netErr.cause = err;
      if (!options.silent) notifyError(netErr.message, options);
      throw netErr;
    });
  }

  global.FayiHttp = {
    JSON_UTF8: JSON_UTF8,
    request: request,
    get: function (url, options) {
      return request(url, Object.assign({}, options || {}, { method: 'GET' }));
    },
    post: function (url, body, options) {
      return request(url, Object.assign({}, options || {}, { method: 'POST', body: body }));
    },
    put: function (url, body, options) {
      return request(url, Object.assign({}, options || {}, { method: 'PUT', body: body }));
    },
    del: function (url, options) {
      return request(url, Object.assign({}, options || {}, { method: 'DELETE' }));
    },
    parseResponse: parseResponse,
    notifyError: notifyError
  };
})(typeof window !== 'undefined' ? window : global);

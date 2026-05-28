/**
 * 统一 API 响应：{ code, message, data }
 * code === 0 表示成功
 */
const { JSON_UTF8 } = require('./encoding-utils');

function sendOk(res, data, message) {
  return res.status(200).json({
    code: 0,
    message: message || 'ok',
    data: data === undefined ? null : data,
    success: true
  });
}

function sendFail(res, httpStatus, code, message, data) {
  const status = httpStatus || 500;
  const c = typeof code === 'number' ? code : status;
  return res.status(status).json({
    code: c,
    message: message || 'error',
    data: data === undefined ? null : data,
    success: false
  });
}

function installAdminJsonEnvelope(router) {
  if (!router || router.__fayiJsonEnvelope) return;
  router.__fayiJsonEnvelope = true;
  router.use(function (req, res, next) {
    const origJson = res.json.bind(res);
    res.json = function (body) {
      res.setHeader('Content-Type', JSON_UTF8);
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return origJson({ code: 0, message: 'ok', data: body, success: true });
      }
      if (typeof body.code === 'number') {
        body.success = body.code === 0;
        return origJson(body);
      }
      if (body.success !== undefined) {
        return origJson({
          code: body.success ? 0 : (body.code || 1),
          message: body.message || body.error || '',
          data: body.data !== undefined ? body.data : null,
          success: !!body.success
        });
      }
      if (body.ok !== undefined) {
        return origJson({
          code: body.ok ? 0 : 1,
          message: body.message || '',
          data: body.data !== undefined ? body.data : null,
          success: !!body.ok
        });
      }
      return origJson({ code: 0, message: 'ok', data: body, success: true });
    };
    next();
  });
}

function installApiErrorHandlers(app) {
  if (!app || app.__fayiApiErrors) return;
  app.__fayiApiErrors = true;

  app.use('/api', function (req, res) {
    sendFail(res, 404, 404, '接口不存在: ' + req.method + ' ' + req.originalUrl, null);
  });

  app.use(function (err, req, res, next) {
    if (res.headersSent) return next(err);
    console.error('[api-error]', req.method, req.originalUrl, err.message);
    sendFail(res, 500, 500, err.message || '服务器内部错误', null);
  });
}

module.exports = {
  sendOk,
  sendFail,
  installAdminJsonEnvelope,
  installApiErrorHandlers
};

/**
 * 平台配置 API · /api/settings
 */
const express = require('express');
const auth = require('./admin/admin-auth');
const settingsCenter = require('./admin/settings-center');
const settingsRuntime = require('./admin/settings-runtime');
const logCenter = require('./admin/log-center');
const { JSON_UTF8 } = require('../lib/encoding-utils');

const router = express.Router();

router.use(function (req, res, next) {
  res.setHeader('Content-Type', JSON_UTF8);
  res.setHeader('Cache-Control', 'no-store');
  next();
});

function clientIp(req) {
  return req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
}

router.get('/public', function (req, res) {
  res.json({ success: true, data: settingsRuntime.getPublicConfig() });
});

function logSettingsChange(req, module, patch) {
  try {
    const admin = req.admin || {};
    logCenter.createLog({
      actionType: 'update',
      module: 'system',
      actionName: '更新' + module + '配置',
      targetId: module,
      description: '配置项已更新',
      userId: admin.id || admin.email || 'admin',
      userName: admin.email || admin.name || '管理员',
      status: 'success',
      requestData: patch,
      ipAddress: clientIp(req)
    }, { ip: clientIp(req) });
  } catch (e) { /* non-blocking */ }
}

settingsCenter.MODULES.forEach(function (mod) {
  router.get('/' + mod, auth.requireAdmin, function (req, res) {
    try {
      res.json({ success: true, data: settingsCenter.getModule(mod) });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  router.post('/' + mod + '/update', auth.requireAdmin, function (req, res) {
    try {
      const updated = settingsCenter.updateModule(mod, req.body || {});
      settingsRuntime.invalidate();
      logSettingsChange(req, mod, req.body);
      res.json({
        success: true,
        data: updated,
        message: '配置已更新，将实时生效'
      });
    } catch (err) {
      res.status(err.statusCode || 500).json({ success: false, message: err.message });
    }
  });
});

router.get('/', auth.requireAdmin, function (req, res) {
  res.json({ success: true, data: settingsCenter.getAll() });
});

router.post('/reset', auth.requireAdmin, function (req, res) {
  const mod = req.body && req.body.module;
  try {
    if (mod && settingsCenter.MODULES.indexOf(mod) >= 0) {
      const data = settingsCenter.resetModule(mod);
      logSettingsChange(req, mod, { reset: true });
      return res.json({ success: true, data: data, message: '已恢复默认配置' });
    }
    const all = settingsCenter.resetAll();
    logSettingsChange(req, 'all', { reset: true });
    res.json({ success: true, data: all, message: '已恢复全部默认配置' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

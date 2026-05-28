/**
 * 系统日志 API · /api/logs
 */
const express = require('express');
const auth = require('./admin/admin-auth');
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

router.get('/health', function (req, res) {
  res.json({
    success: true,
    data: { service: 'fayi-logs', status: 'ok', time: new Date().toISOString() }
  });
});

router.get('/overview', auth.requireAdmin, function (req, res) {
  try {
    res.json({ success: true, data: logCenter.buildOverview() });
  } catch (err) {
    console.error('[logs/overview]', err);
    res.json({ success: true, data: logCenter.emptyOverview() });
  }
});

router.get('/list', auth.requireAdmin, function (req, res) {
  try {
    res.json({
      success: true,
      data: logCenter.list({
        page: req.query.page,
        pageSize: req.query.pageSize,
        module: req.query.module,
        actionType: req.query.actionType || req.query.type,
        userId: req.query.userId,
        status: req.query.status,
        keyword: req.query.keyword || req.query.search,
        dateFrom: req.query.dateFrom || (req.query.dateRange && req.query.dateRange.split(',')[0]),
        dateTo: req.query.dateTo || (req.query.dateRange && req.query.dateRange.split(',')[1])
      })
    });
  } catch (err) {
    console.error('[logs/list]', err);
    res.json({
      success: true,
      data: { list: [], total: 0, page: 1, pageSize: 20, totalPages: 1 }
    });
  }
});

router.get('/detail/:id', auth.requireAdmin, function (req, res) {
  try {
    const detail = logCenter.getDetail(req.params.id);
    if (!detail) return res.status(404).json({ success: false, message: '日志不存在' });
    res.json({ success: true, data: detail });
  } catch (err) {
    console.error('[logs/detail]', err);
    res.status(500).json({ success: false, message: err.message || '读取失败' });
  }
});

router.post('/create', function (req, res) {
  try {
    const body = req.body || {};
    const row = logCenter.createLog(body, { ip: clientIp(req), userId: body.userId });
    if (row && row.skipped) {
      return res.json({ success: true, data: row, message: 'deduplicated' });
    }
    res.json({ success: true, data: row });
  } catch (err) {
    console.error('[logs/create]', err);
    res.status(500).json({ success: false, message: err.message || '写入失败' });
  }
});

router.get('/', auth.requireAdmin, function (req, res) {
  try {
    res.json({
      success: true,
      data: logCenter.list({
        page: req.query.page,
        pageSize: req.query.pageSize,
        module: req.query.module,
        actionType: req.query.actionType || req.query.type,
        userId: req.query.userId,
        status: req.query.status,
        keyword: req.query.keyword || req.query.search,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo
      })
    });
  } catch (err) {
    res.json({ success: true, data: { list: [], total: 0, page: 1, pageSize: 20, totalPages: 1 } });
  }
});

module.exports = router;

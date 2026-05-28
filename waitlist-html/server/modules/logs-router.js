/**
 * 系统日志 API · 始终返回 JSON（/api/logs）
 */
const express = require('express');
const auth = require('./admin/admin-auth');
const store = require('./admin/admin-store');
const { JSON_UTF8 } = require('../lib/encoding-utils');

const router = express.Router();

router.use(function (req, res, next) {
  res.setHeader('Content-Type', JSON_UTF8);
  res.setHeader('Cache-Control', 'no-store');
  next();
});

function mapLogRow(e) {
  return {
    id: e.id,
    type: e.type,
    module: e.module || 'system',
    action: e.action || '',
    status: e.status || 'success',
    payload: e.payload,
    createdAt: e.createdAt,
    message: store.formatEventMessage(e)
  };
}

function handleLogsList(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, parseInt(req.query.pageSize, 10) || 20);
    const rows = store.listLogs({
      type: req.query.type,
      search: req.query.search
    });
    const total = rows.length;
    const start = (page - 1) * pageSize;
    res.status(200).json({
      success: true,
      data: {
        list: rows.slice(start, start + pageSize).map(mapLogRow),
        total,
        page,
        pageSize
      }
    });
  } catch (err) {
    console.error('[api/logs]', err.message);
    res.status(500).json({
      success: false,
      message: err.message || '读取系统日志失败',
      data: null
    });
  }
}

router.get('/health', function (req, res) {
  res.json({
    success: true,
    data: {
      service: 'fayi-logs',
      status: 'ok',
      time: new Date().toISOString()
    }
  });
});

router.get('/', auth.requireAdmin, handleLogsList);

module.exports = router;

const express = require('express');
const store = require('./law-store');
const { callYuanqiJson, apiSuccess, apiError } = require('../../lib/ai-utils');

const router = express.Router();

router.get('/categories', function (req, res) {
  res.json(apiSuccess(store.getCategories()));
});

router.get('/articles', function (req, res) {
  res.json(apiSuccess(store.listArticles({
    categoryId: req.query.categoryId,
    search: req.query.search
  })));
});

router.get('/articles/:id', function (req, res) {
  const item = store.getArticle(req.params.id);
  if (!item) return res.status(404).json(apiError('文章不存在'));
  store.bumpRead(req.params.id);
  res.json(apiSuccess(item));
});

router.post('/articles/:id/like', function (req, res) {
  if (!store.bumpLike(req.params.id)) return res.status(404).json(apiError('不存在'));
  res.json(apiSuccess({ ok: true }));
});

router.get('/cases', function (req, res) {
  res.json(apiSuccess(store.listCases()));
});

router.post('/ai-assist', async function (req, res) {
  const question = (req.body && req.body.question) ? String(req.body.question).trim() : '';
  if (!question) return res.status(400).json(apiError('请输入问题'));
  try {
    const { data } = await callYuanqiJson(question);
    res.json(apiSuccess(data));
  } catch (err) {
    res.status(500).json(apiError(err.message || 'AI 服务不可用'));
  }
});

router.get('/stats/publicity', function (req, res) {
  res.json(apiSuccess(store.getPublicityStats()));
});

module.exports = router;
module.exports.store = store;

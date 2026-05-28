const express = require('express');
const fs = require('fs');
const path = require('path');
const store = require('./admin-store');
const auth = require('./admin-auth');
let lawStore;
try { lawStore = require('../law-education/law-store'); } catch (e) { lawStore = null; }

const router = express.Router();
const crypto = require('crypto');
const USERS_FILE = path.join(__dirname, '..', '..', 'users.json');
const FIXED_ADMIN_CODE = 'manager';

function hashUserPwd(pwd) {
  return crypto.createHash('sha256').update(pwd + 'fayi_salt_2024').digest('hex');
}

function normEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function loadUsersMutable() {
  return store.loadPlatformUsers();
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

function findPlatformAdmin(email, password) {
  const emailNorm = normEmail(email);
  const pwdHash = hashUserPwd(password);
  const users = loadUsersMutable();
  const idx = users.findIndex(function (u) {
    return normEmail(u.email) === emailNorm && u.password === pwdHash;
  });
  if (idx === -1) return null;

  const user = users[idx];
  if (user.userType !== 'admin' && user.role !== 'admin') return null;

  if (user.identityCode !== FIXED_ADMIN_CODE) {
    user.identityCode = FIXED_ADMIN_CODE;
    users[idx] = user;
    saveUsers(users);
  }
  return user;
}

/** 仅凭验证码进入管理端 */
router.post('/auth/code-login', function (req, res) {
  const inputCode = (req.body && req.body.identityCode) != null ? String(req.body.identityCode) : '';
  const result = auth.loginByCode(inputCode === FIXED_ADMIN_CODE ? inputCode : '');
  if (!result) {
    return res.status(403).json({
      success: false,
      message: '身份验证码错误，无权进入管理系统'
    });
  }
  store.logEvent('admin_code_login', { email: result.admin.email });
  res.json({
    success: true,
    data: result,
    message: '验证成功'
  });
});

router.post('/auth/login', function (req, res) {
  const { email, password, identityCode } = req.body || {};
  const inputCode = identityCode != null ? String(identityCode).trim() : '';

  if (!email || !password) {
    return res.status(400).json({ success: false, message: '请输入管理员邮箱和密码' });
  }

  if (!inputCode) {
    return res.status(400).json({ success: false, message: '请输入身份验证码' });
  }

  if (inputCode !== FIXED_ADMIN_CODE) {
    return res.status(403).json({
      success: false,
      message: '身份验证码错误或管理员权限无效'
    });
  }

  const platformUser = findPlatformAdmin(email, password);
  if (platformUser) {
    if (platformUser.status === 'banned') {
      return res.status(403).json({ success: false, message: '管理员账号已被禁用' });
    }
    const token = auth.loginPlatformUser(platformUser);
    store.logEvent('admin_login', { email: platformUser.email, source: 'platform_user' });
    return res.json({
      success: true,
      data: {
        token: token,
        admin: {
          id: platformUser.id,
          email: platformUser.email,
          nickname: platformUser.nickname || platformUser.name,
          name: platformUser.name || platformUser.nickname,
          userType: 'admin',
          identityCode: FIXED_ADMIN_CODE,
          role: 'platform_admin'
        }
      },
      message: '登录成功'
    });
  }

  const emailNorm = normEmail(email);
  const users = loadUsersMutable();
  const anyUser = users.find(function (u) {
    return normEmail(u.email) === emailNorm && u.password === hashUserPwd(password);
  });
  if (anyUser && anyUser.userType !== 'admin') {
    return res.status(403).json({ success: false, message: '普通用户请使用前台登录页' });
  }

  const result = auth.login(emailNorm, password);
  if (!result) {
    return res.status(401).json({ success: false, message: '账号或密码错误' });
  }
  store.logEvent('admin_login', { email: result.admin.email, source: 'legacy_admin' });
  res.json({
    success: true,
    data: {
      token: result.token,
      admin: Object.assign({}, result.admin, {
        userType: 'admin',
        identityCode: FIXED_ADMIN_CODE
      })
    },
    message: '登录成功'
  });
});

router.get('/auth/me', auth.requireAdmin, function (req, res) {
  res.json({ success: true, data: req.admin });
});

router.get('/auth/check-email', function (req, res) {
  const email = normEmail(req.query.email);
  const admins = store.readJson(store.FILES.admins, []);
  const users = loadUsersMutable();
  const isAdmin = admins.some(function (a) {
    return normEmail(a.email) === email;
  }) || users.some(function (u) {
    return normEmail(u.email) === email && u.userType === 'admin';
  });
  res.json({ success: true, data: { isAdmin: isAdmin } });
});

router.get('/dashboard/overview', auth.requireAdmin, function (req, res) {
  const range = req.query.range || 'week';
  res.json({
    success: true,
    data: store.buildRealtimePayload(lawStore, range)
  });
});

router.get('/dashboard/stats', auth.requireAdmin, function (req, res) {
  res.json({ success: true, data: store.statsOverview() });
});

router.get('/dashboard/charts', auth.requireAdmin, function (req, res) {
  const range = req.query.range || req.query.period || 'week';
  res.json({ success: true, data: store.chartSeries(range) });
});

router.get('/dashboard/feed', auth.requireAdmin, function (req, res) {
  const limit = Math.min(100, parseInt(req.query.limit, 10) || 40);
  const metrics = require('./admin-metrics');
  res.json({ success: true, data: metrics.behaviorFeed(limit) });
});

router.get('/users', auth.requireAdmin, function (req, res) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(50, parseInt(req.query.pageSize, 10) || 10);
  const search = (req.query.search || '').trim().toLowerCase();
  const metaMap = store.getUserMetaMap();
  let users = store.loadPlatformUsers()
    .filter(function (u) { return (u.userType || 'user') !== 'admin'; })
    .map(function (u) {
    const meta = metaMap[u.id] || {};
    return {
      id: u.id, name: u.name, email: u.email,
      status: u.status === 'banned' || meta.status === 'banned' ? 'banned' : 'active',
      userType: u.userType || 'user',
      consultCount: meta.consultCount || 0,
      riskLevel: meta.riskLevel || 'low',
      lastActiveAt: meta.lastActiveAt || u.createdAt,
      createdAt: u.createdAt
    };
  });
  if (search) {
    users = users.filter(function (u) {
      return (u.email && u.email.toLowerCase().indexOf(search) >= 0) ||
        (u.name && u.name.toLowerCase().indexOf(search) >= 0);
    });
  }
  const total = users.length;
  const start = (page - 1) * pageSize;
  res.json({ success: true, data: { list: users.slice(start, start + pageSize), total, page, pageSize } });
});

router.put('/users/:id/status', auth.requireAdmin, function (req, res) {
  const userId = req.params.id;
  const status = (req.body && req.body.status) === 'banned' ? 'banned' : 'active';
  const list = store.readJson(store.FILES.userMeta, []);
  const idx = list.findIndex(function (m) { return m.userId === userId; });
  const entry = idx >= 0 ? list[idx] : { userId: userId };
  entry.status = status;
  entry.updatedAt = new Date().toISOString();
  if (idx >= 0) list[idx] = entry; else list.push(entry);
  store.saveUserMetaList(list);
  const users = store.loadPlatformUsers();
  const uIdx = users.findIndex(function (u) { return u.id === userId; });
  if (uIdx >= 0) {
    users[uIdx].status = status;
    saveUsers(users);
  }
  store.logEvent(status === 'banned' ? 'user_ban' : 'user_unban', { userId: userId });
  res.json({ success: true, message: status === 'banned' ? '已封禁' : '已解封' });
});

router.delete('/users/:id', auth.requireAdmin, function (req, res) {
  const userId = req.params.id;
  const users = store.loadPlatformUsers();
  const filtered = users.filter(function (u) { return u.id !== userId; });
  if (filtered.length === users.length) return res.status(404).json({ success: false, message: '用户不存在' });
  saveUsers(filtered);
  store.saveUserMetaList(store.readJson(store.FILES.userMeta, []).filter(function (m) { return m.userId !== userId; }));
  store.logEvent('user_delete', { userId: userId });
  res.json({ success: true, message: '已删除' });
});

router.get('/consultations', auth.requireAdmin, function (req, res) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(50, parseInt(req.query.pageSize, 10) || 10);
  const search = (req.query.search || '').trim().toLowerCase();
  let rows = store.listLogs({}).filter(function (e) {
    return e.type === 'ai_chat' || e.type === 'ai_case' || e.type === 'ai_fagui';
  }).map(function (e) {
    return {
      id: e.id, type: e.type,
      preview: (e.payload && e.payload.preview) || (e.payload && e.payload.keyword) || '',
      risk: (e.payload && e.payload.risk) || '—',
      createdAt: e.createdAt
    };
  });
  if (search) rows = rows.filter(function (r) { return JSON.stringify(r).toLowerCase().indexOf(search) >= 0; });
  const total = rows.length;
  const start = (page - 1) * pageSize;
  res.json({ success: true, data: { list: rows.slice(start, start + pageSize), total, page, pageSize } });
});

router.get('/documents', auth.requireAdmin, function (req, res) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(50, parseInt(req.query.pageSize, 10) || 10);
  const list = store.readJson(store.FILES.docRecords, []);
  const total = list.length;
  const start = (page - 1) * pageSize;
  res.json({ success: true, data: { list: list.slice(start, start + pageSize), total, page, pageSize } });
});

router.delete('/documents/:id', auth.requireAdmin, function (req, res) {
  let list = store.readJson(store.FILES.docRecords, []);
  const n = list.length;
  list = list.filter(function (d) { return d.id !== req.params.id; });
  if (list.length === n) return res.status(404).json({ success: false, message: '不存在' });
  store.writeJson(store.FILES.docRecords, list);
  res.json({ success: true, message: '已删除' });
});

router.get('/ocr/stats', auth.requireAdmin, function (req, res) {
  res.json({ success: true, data: store.getOcrStats() });
});

router.get('/ocr', auth.requireAdmin, function (req, res) {
  const data = store.listOcrRecords({
    page: req.query.page,
    pageSize: req.query.pageSize,
    search: req.query.search,
    status: req.query.status,
    ocrType: req.query.ocrType,
    riskLevel: req.query.riskLevel,
    dateFrom: req.query.dateFrom,
    dateTo: req.query.dateTo
  });
  res.json({ success: true, data: data });
});

router.get('/ocr/:id', auth.requireAdmin, function (req, res) {
  const item = store.getOcrById(req.params.id);
  if (!item) return res.status(404).json({ success: false, message: 'OCR 记录不存在' });
  res.json({ success: true, data: item });
});

let chatPassthrough;
try {
  chatPassthrough = require('../../lib/yuanqi-ai').chatPassthrough;
} catch (e) {
  chatPassthrough = null;
}

router.post('/ocr/:id/ai-correct', auth.requireAdmin, async function (req, res) {
  const item = store.getOcrById(req.params.id);
  if (!item) return res.status(404).json({ success: false, message: 'OCR 记录不存在' });
  const source = String(item.correctedText || item.fullText || item.textPreview || '').trim();
  if (!source) return res.status(400).json({ success: false, message: '无可纠错文本' });

  let corrected = source;
  try {
    if (chatPassthrough) {
      corrected = await chatPassthrough({
        messages: [{
          role: 'user',
          content: '你是 OCR 文本校对助手。请修正以下识别文本中的错别字、乱码和错误断行，只输出修正后的完整正文，不要解释：\n\n' + source
        }],
        userId: 'admin_ocr_correct_' + (req.admin && req.admin.id)
      });
      corrected = String(corrected || source).trim();
    }
  } catch (err) {
    console.warn('[ocr/ai-correct]', err.message);
    return res.status(503).json({ success: false, message: 'AI 纠错服务暂不可用：' + err.message });
  }

  const updated = store.updateOcrRecord(req.params.id, {
    correctedText: corrected,
    aiCorrectedAt: new Date().toISOString()
  });
  res.json({ success: true, data: { correctedText: corrected, record: updated } });
});

if (lawStore) {
  router.get('/law-education/articles', auth.requireAdmin, function (req, res) {
    res.json({ success: true, data: lawStore.listArticles({ search: req.query.search }) });
  });
  router.post('/law-education/articles', auth.requireAdmin, function (req, res) {
    if (!req.body || !req.body.title) return res.status(400).json({ success: false, message: '标题不能为空' });
    res.json({ success: true, data: lawStore.saveArticle(req.body) });
  });
  router.put('/law-education/articles/:id', auth.requireAdmin, function (req, res) {
    const item = lawStore.saveArticle(req.body || {}, req.params.id);
    if (!item) return res.status(404).json({ success: false, message: '不存在' });
    res.json({ success: true, data: item });
  });
  router.delete('/law-education/articles/:id', auth.requireAdmin, function (req, res) {
    if (!lawStore.deleteArticle(req.params.id)) return res.status(404).json({ success: false, message: '不存在' });
    res.json({ success: true });
  });
  router.get('/law-education/stats', auth.requireAdmin, function (req, res) {
    res.json({ success: true, data: lawStore.getPublicityStats() });
  });
}

function handleSystemLogs(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, parseInt(req.query.pageSize, 10) || 20);
    const rows = store.listLogs({ type: req.query.type, search: req.query.search });
    const total = rows.length;
    const start = (page - 1) * pageSize;
    res.json({
      success: true,
      data: {
        list: rows.slice(start, start + pageSize).map(function (e) {
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
        }),
        total,
        page,
        pageSize
      }
    });
  } catch (err) {
    console.error('[admin/system-logs]', err.message);
    res.status(500).json({ success: false, message: err.message || '读取系统日志失败' });
  }
}

router.get('/system-logs', auth.requireAdmin, handleSystemLogs);
router.get('/logs', auth.requireAdmin, handleSystemLogs);

router.get('/datav/health', function (req, res) {
  var os = require('os');
  var totalMem = os.totalmem();
  var freeMem = os.freemem();
  var cpuPct = Math.min(98, Math.round((os.loadavg()[0] / Math.max(1, os.cpus().length)) * 100));
  var memPct = Math.round((1 - freeMem / totalMem) * 100);
  var stats = store.statsOverview();
  res.json({
    success: true,
    service: 'fayi-datav',
    port: 3002,
    endpoints: [
      '/api/admin/datav/realtime',
      '/api/admin/datav/stream',
      '/api/admin/ws'
    ],
    revision: store.getDataRevision(),
    time: new Date().toISOString(),
    services: {
      gpt: 'online',
      ocr: (stats.ocrSuccessRate || 0) >= 60 ? 'online' : 'degraded',
      vector: 'online',
      cache: 'memory'
    },
    system: {
      cpuPercent: cpuPct,
      memoryPercent: memPct,
      responseMs: stats.avgResponseMs || 0,
      onlineUsers: stats.onlineUsers || 0
    }
  });
});

router.get('/datav/realtime', function (req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.json({ success: true, data: store.buildRealtimePayload(lawStore) });
});

router.get('/datav/stream', function (req, res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();

  var lastSeq = -1;
  function push() {
    var payload = store.buildRealtimePayload(lawStore);
    var seq = (payload.revision && payload.revision.seq) || 0;
    if (seq !== lastSeq) {
      lastSeq = seq;
      res.write('event: update\ndata: ' + JSON.stringify({ success: true, data: payload }) + '\n\n');
    } else {
      res.write('event: ping\ndata: ' + JSON.stringify({ serverTime: payload.serverTime }) + '\n\n');
    }
  }
  push();
  var timer = setInterval(push, 2000);
  req.on('close', function () { clearInterval(timer); });
});

router.post('/datav/bump', function (req, res) {
  res.json({ success: true, revision: store.getDataRevision() });
});

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket.remoteAddress || '';
}

router.post('/track/visit', function (req, res) {
  const page = (req.body && req.body.page) || '';
  store.bumpVisit(page, {
    ip: clientIp(req),
    page: page
  });
  res.json({ success: true });
});

router.post('/track/heartbeat', function (req, res) {
  const body = req.body || {};
  const info = store.touchHeartbeat({
    userId: body.userId || body.user_id || 'guest',
    userName: body.userName || body.email || '',
    ip: clientIp(req),
    sourcePage: body.page || body.sourcePage || '',
    connectionId: body.connectionId || ''
  });
  res.json({ success: true, data: info });
});

router.post('/datav/operation-log', function (req, res) {
  const body = req.body || {};
  body.meta = Object.assign({}, body.meta || {}, {
    ip: clientIp(req),
    page: (body.meta && body.meta.page) || ''
  });
  const row = store.logOperationFromClient(body);
  res.json({ success: true, id: row && row.id });
});

router.post('/datav/pufa-read', function (req, res) {
  const body = req.body || {};
  const st = store.bumpPufaRead(body);
  res.json({ success: true, data: st });
});

module.exports = router;
module.exports.store = store;
module.exports.auth = auth;

const realtimeHub = require('./admin-realtime-hub');
store.setRealtimeHub(realtimeHub);
module.exports.realtimeHub = realtimeHub;

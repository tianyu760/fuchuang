const express = require('express');
const fs = require('fs');
const path = require('path');
const store = require('./admin-store');
const auth = require('./admin-auth');
const userProfiles = require('./admin-user-profiles');
const metrics = require('./admin-metrics');
let lawStore;
try { lawStore = require('../law-education/law-store'); } catch (e) { lawStore = null; }

const router = express.Router();
const settingsRuntime = require('./settings-runtime');
const crypto = require('crypto');
const USERS_FILE = path.join(__dirname, '..', '..', 'users.json');
const FIXED_ADMIN_CODE = 'manager';

function hashUserPwd(pwd) {
  return crypto.createHash('sha256').update(pwd + 'fayi_salt_2024').digest('hex');
}

function normEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function clientIp(req) {
  return req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
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

router.use(function (req, res, next) {
  if (!settingsRuntime.isIpAllowed(clientIp(req))) {
    return res.status(403).json({
      success: false,
      code: 403,
      message: '当前 IP 不在管理端访问白名单内'
    });
  }
  next();
});

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

  if (settingsRuntime.isLoginCaptchaRequired()) {
    if (!inputCode) {
      return res.status(400).json({ success: false, message: '请输入身份验证码' });
    }
    if (inputCode !== FIXED_ADMIN_CODE) {
      return res.status(403).json({
        success: false,
        message: '身份验证码错误或管理员权限无效'
      });
    }
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

router.get('/dashboard/summary', auth.requireAdmin, function (req, res) {
  const documentCenter = require('./document-center');
  const consultCenter = require('./consult-center');
  res.json({
    success: true,
    data: {
      documents: documentCenter.computeStatistics(),
      consultations: consultCenter.computeStatistics(),
      ocr: store.getOcrStats(),
      platform: store.statsOverview()
    }
  });
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
  res.json({ success: true, data: metrics.behaviorFeed(limit) });
});

router.get('/users', auth.requireAdmin, function (req, res) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, parseInt(req.query.pageSize, 10) || 24);
  const search = (req.query.search || '').trim().toLowerCase();
  const riskFilter = (req.query.riskLevel || '').trim();
  const statusFilter = (req.query.status || '').trim();
  const onlineFilter = (req.query.online || '').trim();
  const sort = (req.query.sort || 'active').trim();
  const metaMap = store.getUserMetaMap();
  const presenceMap = require('./admin-data-db').getPresenceMap();
  let users = store.loadPlatformUsers()
    .filter(function (u) { return (u.userType || 'user') !== 'admin'; })
    .map(function (u) {
      return userProfiles.enrichUserRow(u, metaMap[u.id] || {}, presenceMap);
    });
  if (search) {
    users = users.filter(function (u) {
      return (u.email && u.email.toLowerCase().indexOf(search) >= 0) ||
        (u.name && u.name.toLowerCase().indexOf(search) >= 0) ||
        (u.tags || []).join(',').toLowerCase().indexOf(search) >= 0;
    });
  }
  if (riskFilter && riskFilter !== 'all') {
    users = users.filter(function (u) { return u.riskLevel === riskFilter; });
  }
  if (statusFilter && statusFilter !== 'all') {
    users = users.filter(function (u) { return u.status === statusFilter; });
  }
  if (onlineFilter && onlineFilter !== 'all') {
    users = users.filter(function (u) { return u.onlineStatus === onlineFilter; });
  }
  if (sort === 'consult') {
    users.sort(function (a, b) { return (b.consultCount || 0) - (a.consultCount || 0); });
  } else if (sort === 'risk') {
    const order = { high: 3, mid: 2, low: 1 };
    users.sort(function (a, b) { return (order[b.riskLevel] || 0) - (order[a.riskLevel] || 0); });
  } else if (sort === 'new') {
    users.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  } else {
    users.sort(function (a, b) { return String(b.lastActiveAt).localeCompare(String(a.lastActiveAt)); });
  }
  const total = users.length;
  const start = (page - 1) * pageSize;
  res.json({ success: true, data: { list: users.slice(start, start + pageSize), total, page, pageSize } });
});

router.get('/users/:id', auth.requireAdmin, function (req, res) {
  const users = store.loadPlatformUsers();
  const u = users.find(function (x) { return x.id === req.params.id; });
  if (!u || (u.userType || 'user') === 'admin') {
    return res.status(404).json({ success: false, message: '用户不存在' });
  }
  const metaMap = store.getUserMetaMap();
  const presenceMap = require('./admin-data-db').getPresenceMap();
  res.json({ success: true, data: userProfiles.buildUserProfile(u, metaMap[u.id] || {}, presenceMap) });
});

router.put('/users/:id/tags', auth.requireAdmin, function (req, res) {
  const userId = req.params.id;
  const tags = Array.isArray(req.body && req.body.tags) ? req.body.tags.slice(0, 12) : [];
  const list = store.readJson(store.FILES.userMeta, []);
  const idx = list.findIndex(function (m) { return m.userId === userId; });
  const entry = idx >= 0 ? list[idx] : { userId: userId };
  entry.tags = tags;
  entry.updatedAt = new Date().toISOString();
  if (idx >= 0) list[idx] = entry; else list.push(entry);
  store.saveUserMetaList(list);
  res.json({ success: true, data: { tags: tags } });
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
  if (settingsRuntime.isSensitiveOpsConfirmRequired()) {
    const confirmed = req.body && (req.body.confirm === true || req.body.confirm === 'true');
    const headerOk = req.headers['x-confirm-sensitive'] === '1';
    if (!confirmed && !headerOk) {
      return res.status(400).json({
        success: false,
        message: '删除用户为敏感操作，请确认后重试（confirm: true）'
      });
    }
  }
  const userId = req.params.id;
  const users = store.loadPlatformUsers();
  const filtered = users.filter(function (u) { return u.id !== userId; });
  if (filtered.length === users.length) return res.status(404).json({ success: false, message: '用户不存在' });
  saveUsers(filtered);
  store.saveUserMetaList(store.readJson(store.FILES.userMeta, []).filter(function (m) { return m.userId !== userId; }));
  store.logEvent('user_delete', {
    userId: userId,
    sensitive: settingsRuntime.isSensitiveOpLogEnabled()
  });
  res.json({ success: true, message: '已删除' });
});

const consultCenter = require('./consult-center');

router.get('/consultations/statistics', auth.requireAdmin, function (req, res) {
  res.json({ success: true, data: consultCenter.computeStatistics() });
});

router.get('/consultations', auth.requireAdmin, function (req, res) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, parseInt(req.query.pageSize, 10) || 15);
  const search = (req.query.search || '').trim();
  const category = (req.query.category || 'all').trim();
  const riskLevel = (req.query.riskLevel || 'all').trim();
  const status = (req.query.status || 'all').trim();
  const sort = (req.query.sort || 'new').trim();

  const rows = consultCenter.listAll({
    search: search,
    category: category,
    riskLevel: riskLevel,
    status: status,
    sort: sort
  });
  const stats = consultCenter.computeStats(rows);
  const total = rows.length;
  const start = (page - 1) * pageSize;
  res.json({
    success: true,
    data: {
      list: rows.slice(start, start + pageSize),
      total: total,
      page: page,
      pageSize: pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      stats: stats
    }
  });
});

router.get('/consultations/:id', auth.requireAdmin, function (req, res) {
  const detail = consultCenter.getDetail(req.params.id);
  if (!detail) {
    return res.status(404).json({ success: false, message: '咨询记录不存在' });
  }
  res.json({ success: true, data: detail });
});

router.put('/consultations/:id/note', auth.requireAdmin, function (req, res) {
  const note = (req.body && req.body.note) != null ? req.body.note : '';
  const row = consultCenter.updateAdminNote(req.params.id, note);
  if (!row) {
    return res.status(404).json({ success: false, message: '咨询记录不存在' });
  }
  res.json({ success: true, data: { adminNote: row.adminNote } });
});

const regulationCenter = require('./regulation-center');
const operationCenter = require('./operation-center');

router.get('/regulations/statistics', auth.requireAdmin, function (req, res) {
  res.json({ success: true, data: regulationCenter.statistics() });
});

router.post('/regulations/batch-init', auth.requireAdmin, function (req, res) {
  const body = req.body || {};
  const items = Array.isArray(body.items) ? body.items : (Array.isArray(body) ? body : []);
  const overwrite = body.overwrite === true;
  let result;
  if (items.length) {
    result = regulationCenter.batchInit(items, { overwrite: overwrite });
  } else {
    result = regulationCenter.seedRegulations();
  }
  res.json({
    success: true,
    data: Object.assign({}, result, { statistics: regulationCenter.statistics() })
  });
});

router.get('/regulations/list', auth.requireAdmin, function (req, res) {
  res.json({
    success: true,
    data: regulationCenter.list({
      page: req.query.page,
      pageSize: req.query.pageSize,
      category: req.query.category,
      region: req.query.region,
      keyword: req.query.keyword || req.query.search
    })
  });
});

router.get('/regulations/detail/:id', auth.requireAdmin, function (req, res) {
  const detail = regulationCenter.getDetail(req.params.id);
  if (!detail) return res.status(404).json({ success: false, message: '法规不存在' });
  res.json({ success: true, data: detail });
});

router.get('/regulations/regions', auth.requireAdmin, function (req, res) {
  res.json({ success: true, data: regulationCenter.listRegions() });
});

router.get('/regulations', auth.requireAdmin, function (req, res) {
  if (req.query.page || req.query.category || req.query.region || req.query.keyword) {
    return res.json({
      success: true,
      data: regulationCenter.list({
        page: req.query.page,
        pageSize: req.query.pageSize,
        category: req.query.category,
        region: req.query.region,
        keyword: req.query.keyword || req.query.search
      })
    });
  }
  const data = regulationCenter.list({ page: 1, pageSize: 500 });
  res.json({ success: true, data: data.list });
});

const analyticsCenter = require('./analytics-center');

router.get('/analytics/dashboard', auth.requireAdmin, function (req, res) {
  try {
    res.json({
      success: true,
      data: analyticsCenter.buildDashboard({ days: req.query.days })
    });
  } catch (err) {
    console.error('[analytics/dashboard]', err);
    res.json({ success: true, data: analyticsCenter.emptyDashboard() });
  }
});

router.get('/analytics/overview', auth.requireAdmin, function (req, res) {
  try {
    res.json({
      success: true,
      data: analyticsCenter.buildOverview({ days: req.query.days })
    });
  } catch (err) {
    console.error('[analytics/overview]', err);
    res.json({ success: true, data: analyticsCenter.emptyOverview() });
  }
});

router.get('/analytics/correlation', auth.requireAdmin, function (req, res) {
  try {
    const intelligence = require('./analytics-intelligence');
    res.json({ success: true, data: intelligence.buildCorrelation() });
  } catch (err) {
    console.error('[analytics/correlation]', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/analytics/prediction', auth.requireAdmin, function (req, res) {
  try {
    const intelligence = require('./analytics-intelligence');
    const charts = analyticsCenter.buildDashboard({ days: req.query.days });
    res.json({ success: true, data: intelligence.buildPrediction(charts) });
  } catch (err) {
    console.error('[analytics/prediction]', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/analytics/anomaly', auth.requireAdmin, function (req, res) {
  try {
    const intelligence = require('./analytics-intelligence');
    const charts = analyticsCenter.buildDashboard({ days: req.query.days });
    res.json({ success: true, data: intelligence.buildAnomaly(charts) });
  } catch (err) {
    console.error('[analytics/anomaly]', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/analytics/insight', auth.requireAdmin, function (req, res) {
  try {
    const days = (req.body && req.body.days) || req.query.days;
    const data = analyticsCenter.buildInsightPayload({ days: days });
    res.json({ success: true, data: data, message: '分析已生成' });
  } catch (err) {
    console.error('[analytics/insight]', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/analytics/regulation-heat', auth.requireAdmin, function (req, res) {
  res.json({
    success: true,
    data: metrics.regulationHeatFromBehavior(parseInt(req.query.limit, 10) || 20)
  });
});

const riskCenter = require('./risk-center');
const logCenter = require('./log-center');
const settingsCenter = require('./settings-center');

function requireSuperAdmin(req, res, next) {
  const admin = req.admin || {};
  if (admin.identityCode === 'manager' || admin.adminLevel === 'super' || admin.role === 'super_admin') {
    return next();
  }
  return res.status(403).json({ success: false, message: '需要超级管理员权限' });
}

function logSettingsUpdate(req, module, patch) {
  try {
    const admin = req.admin || {};
    logCenter.createLog({
      actionType: 'update',
      module: 'system',
      actionName: '更新平台配置 · ' + module,
      targetId: module,
      description: '配置已更新，将实时生效',
      userId: admin.id || admin.email || 'admin',
      userName: admin.email || admin.name || '管理员',
      status: 'success',
      requestData: patch || {},
      ipAddress: req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''
    }, { ip: req.headers['x-forwarded-for'] || '' });
  } catch (e) { /* ignore */ }
}

function mountSettingsRoutes(mod, superOnly) {
  router.get('/settings/' + mod, auth.requireAdmin, function (req, res) {
    res.json({ success: true, data: settingsCenter.getModule(mod) });
  });
  router.post('/settings/' + mod + '/update', auth.requireAdmin, function (req, res, next) {
    if (superOnly) return requireSuperAdmin(req, res, next);
    next();
  }, function (req, res) {
    try {
      const updated = settingsCenter.updateModule(mod, req.body || {});
      logSettingsUpdate(req, mod, req.body);
      res.json({ success: true, data: updated, message: '配置已更新，将实时生效' });
    } catch (err) {
      res.status(err.statusCode || 500).json({ success: false, message: err.message });
    }
  });
}

mountSettingsRoutes('system', true);
mountSettingsRoutes('ai', false);
mountSettingsRoutes('data', false);
mountSettingsRoutes('security', true);

router.get('/settings', auth.requireAdmin, function (req, res) {
  res.json({ success: true, data: settingsCenter.getAll() });
});

router.post('/settings/reset', auth.requireAdmin, requireSuperAdmin, function (req, res) {
  try {
    const mod = req.body && req.body.module;
    if (mod && settingsCenter.MODULES.indexOf(mod) >= 0) {
      const data = settingsCenter.resetModule(mod);
      logSettingsUpdate(req, mod, { reset: true });
      return res.json({ success: true, data: data, message: '已恢复默认配置' });
    }
    const all = settingsCenter.resetAll();
    logSettingsUpdate(req, 'all', { reset: true });
    res.json({ success: true, data: all, message: '已恢复全部默认配置' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/risk/overview', auth.requireAdmin, function (req, res) {
  try {
    res.json({ success: true, data: riskCenter.buildOverview() });
  } catch (err) {
    console.error('[risk/overview]', err);
    res.json({ success: true, data: riskCenter.emptyOverview() });
  }
});

router.get('/risk/dashboard', auth.requireAdmin, function (req, res) {
  try {
    res.json({
      success: true,
      data: riskCenter.buildDashboard({
        page: req.query.page,
        pageSize: req.query.pageSize,
        range: req.query.range
      })
    });
  } catch (err) {
    console.error('[risk/dashboard]', err);
    res.json({
      success: true,
      data: {
        overview: riskCenter.emptyOverview(),
        list: { list: [], total: 0, page: 1, pageSize: 20, totalPages: 1 },
        statistics: { levelDistribution: [], byModule: [] },
        realtime: []
      }
    });
  }
});

router.get('/risk/list', auth.requireAdmin, function (req, res) {
  res.json({
    success: true,
    data: riskCenter.list({
      page: req.query.page,
      pageSize: req.query.pageSize,
      level: req.query.level || req.query.riskLevel,
      riskType: req.query.riskType || req.query.type,
      status: req.query.status,
      keyword: req.query.keyword || req.query.search
    })
  });
});

router.get('/risk/detail/:id', auth.requireAdmin, function (req, res) {
  const detail = riskCenter.getDetail(req.params.id);
  if (!detail) return res.status(404).json({ success: false, message: '风险记录不存在' });
  res.json({ success: true, data: detail });
});

router.get('/risk/statistics', auth.requireAdmin, function (req, res) {
  res.json({
    success: true,
    data: riskCenter.buildStatistics(req.query.range || 'week')
  });
});

router.get('/risk/realtime', auth.requireAdmin, function (req, res) {
  const limit = Math.min(50, parseInt(req.query.limit, 10) || 20);
  res.json({ success: true, data: riskCenter.buildRealtime(limit) });
});

router.put('/risk/:id/status', auth.requireAdmin, function (req, res) {
  try {
    const body = req.body || {};
    const status = body.status || req.query.status;
    const row = riskCenter.updateStatus(req.params.id, status, body.adminNote || body.note);
    res.json({ success: true, data: row });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
});

router.get('/risks', auth.requireAdmin, function (req, res) {
  const level = (req.query.level || '').trim();
  const data = riskCenter.list({
    page: 1,
    pageSize: Math.min(80, parseInt(req.query.limit, 10) || 40),
    level: level
  });
  const stats = riskCenter.buildStatistics('week');
  res.json({
    success: true,
    data: {
      list: data.list,
      breakdown: stats.breakdown || metrics.riskBreakdownFromLogs()
    }
  });
});

const documentCenter = require('./document-center');

router.get('/documents/statistics', auth.requireAdmin, function (req, res) {
  res.json({ success: true, data: documentCenter.computeStatistics() });
});

router.get('/documents/list', auth.requireAdmin, function (req, res) {
  res.json({
    success: true,
    data: documentCenter.list({
      page: req.query.page,
      pageSize: req.query.pageSize,
      search: req.query.search,
      docType: req.query.docType,
      status: req.query.status,
      date: req.query.date
    })
  });
});

router.get('/documents', auth.requireAdmin, function (req, res) {
  const data = documentCenter.list({
    page: req.query.page,
    pageSize: req.query.pageSize,
    search: req.query.search,
    docType: req.query.docType,
    status: req.query.status,
    date: req.query.date
  });
  res.json({ success: true, data: data });
});

router.post('/documents/regenerate', auth.requireAdmin, async function (req, res) {
  const id = (req.body && req.body.id) ? String(req.body.id) : '';
  if (!id) return res.status(400).json({ success: false, message: '缺少文书 ID' });
  try {
    const detail = await documentCenter.regenerate(id);
    if (!detail) return res.status(404).json({ success: false, message: '文书不存在' });
    res.json({ success: true, data: detail, message: '文书已重新生成' });
  } catch (e) {
    res.status(e.statusCode || 500).json({ success: false, message: e.message || '重新生成失败' });
  }
});

router.get('/documents/:id', auth.requireAdmin, function (req, res) {
  const detail = documentCenter.getDetail(req.params.id);
  if (!detail) return res.status(404).json({ success: false, message: '文书不存在' });
  res.json({ success: true, data: detail });
});

router.put('/documents/:id', auth.requireAdmin, function (req, res) {
  const body = req.body || {};
  const patch = {};
  if (body.title != null) patch.title = String(body.title);
  if (body.content != null) patch.content = String(body.content);
  if (body.docType != null) patch.docType = String(body.docType);
  if (body.caseNo != null) patch.caseNo = String(body.caseNo);
  if (body.adminStatus != null) patch.adminStatus = String(body.adminStatus);
  if (body.adminNote != null) patch.adminNote = String(body.adminNote);
  const detail = documentCenter.updateRecord(req.params.id, patch);
  if (!detail) return res.status(404).json({ success: false, message: '文书不存在' });
  res.json({ success: true, data: detail, message: '已保存' });
});

router.delete('/documents/:id', auth.requireAdmin, function (req, res) {
  const ok = documentCenter.deleteRecord(req.params.id);
  if (!ok) return res.status(404).json({ success: false, message: '不存在' });
  res.json({ success: true, message: '已删除' });
});

const ocrCenter = require('./ocr-center');

router.get('/ocr/stats', auth.requireAdmin, function (req, res) {
  res.json({ success: true, data: store.getOcrStats() });
});

router.get('/ocr/list', auth.requireAdmin, function (req, res) {
  res.json({
    success: true,
    data: ocrCenter.list({
      page: req.query.page,
      pageSize: req.query.pageSize,
      search: req.query.search,
      status: req.query.status,
      ocrType: req.query.ocrType,
      riskLevel: req.query.riskLevel,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo
    }, req)
  });
});

router.get('/ocr/detail/:id', auth.requireAdmin, function (req, res) {
  const detail = ocrCenter.getDetail(req.params.id, req);
  if (!detail) return res.status(404).json({ success: false, message: 'OCR 记录不存在' });
  res.json({ success: true, data: detail });
});

router.get('/ocr/image/:id', auth.requireAdmin, function (req, res) {
  const fp = ocrCenter.getImagePath(req.params.id);
  if (!fp) return res.status(404).json({ success: false, message: '图片不存在' });
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(fp);
});

router.get('/ocr', auth.requireAdmin, function (req, res) {
  res.json({
    success: true,
    data: ocrCenter.list({
      page: req.query.page,
      pageSize: req.query.pageSize,
      search: req.query.search,
      status: req.query.status,
      ocrType: req.query.ocrType,
      riskLevel: req.query.riskLevel,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo
    }, req)
  });
});

router.get('/ocr/:id', auth.requireAdmin, function (req, res) {
  const detail = ocrCenter.getDetail(req.params.id, req);
  if (!detail) return res.status(404).json({ success: false, message: 'OCR 记录不存在' });
  res.json({ success: true, data: detail });
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

router.get('/operation/overview', auth.requireAdmin, function (req, res) {
  res.json({ success: true, data: operationCenter.buildOverview() });
});

router.get('/operation/funnel', auth.requireAdmin, function (req, res) {
  res.json({ success: true, data: operationCenter.buildFunnel() });
});

router.get('/operation/hot-issues', auth.requireAdmin, function (req, res) {
  const limit = Math.min(50, parseInt(req.query.limit, 10) || 15);
  res.json({ success: true, data: operationCenter.buildHotIssues(limit) });
});

router.get('/operation/dashboard', auth.requireAdmin, function (req, res) {
  try {
    res.json({ success: true, data: operationCenter.buildDashboard() });
  } catch (err) {
    console.error('[operation/dashboard]', err);
    res.status(500).json({ success: false, message: err.message || '运营数据聚合失败' });
  }
});

router.post('/operation/generate-content', auth.requireAdmin, async function (req, res) {
  try {
    const body = req.body || {};
    const topic = body.topic || body.subject || body.title;
    const data = await operationCenter.generateContent(topic, {
      publish: body.publish === true
    });
    res.json({ success: true, data: data });
  } catch (err) {
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || '生成失败'
    });
  }
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

router.get('/logs/overview', auth.requireAdmin, function (req, res) {
  try {
    res.json({ success: true, data: logCenter.buildOverview() });
  } catch (err) {
    res.json({ success: true, data: logCenter.emptyOverview() });
  }
});

router.get('/logs/list', auth.requireAdmin, function (req, res) {
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

router.get('/logs/detail/:id', auth.requireAdmin, function (req, res) {
  const detail = logCenter.getDetail(req.params.id);
  if (!detail) return res.status(404).json({ success: false, message: '日志不存在' });
  res.json({ success: true, data: detail });
});

router.post('/logs/create', auth.requireAdmin, function (req, res) {
  try {
    const body = req.body || {};
    const admin = req.admin || {};
    if (!body.userId && admin.id) body.userId = admin.id;
    if (!body.userName && admin.email) body.userName = admin.email;
    const row = logCenter.createLog(body, {
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      userId: body.userId
    });
    res.json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || '写入失败' });
  }
});

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

/**
 * 法律咨询管理中心 · 全量数据 / 分页 / 用户关联
 */
const dataDb = require('./admin-data-db');
const analytics = require('./analytics-engine');
const consultRecords = require('./consult-records');
const userProfiles = require('./admin-user-profiles');

const STATUS_LABEL = {
  processing: '处理中',
  completed: '已完成',
  failed: '失败',
  pending: '待受理'
};

function riskLabel(lv) {
  if (lv === 'high') return '高风险';
  if (lv === 'low') return '低风险';
  return '中风险';
}

function buildUserMap() {
  const store = require('./admin-store');
  const users = store.loadPlatformUsers();
  const map = {};
  users.forEach(function (u) {
    map[u.id] = u;
    if (u.email) map[u.email] = u;
  });
  return map;
}

function rowFromDb(rec, userMap, presenceMap) {
  const user = userMap[rec.userId] || {};
  const question = String(rec.question || '').trim();
  const title = question.length > 50 ? question.slice(0, 50) + '…' : (question || '法律咨询');
  const name = user.name || user.nickname || (user.email ? user.email.split('@')[0] : '') || rec.userId || '访客';
  const lastAt = rec.updatedAt || rec.createdAt;
  const online = userProfiles.resolveOnlineStatus(lastAt, presenceMap && presenceMap[rec.userId]);

  return {
    id: rec.id,
    title: title,
    summary: question.slice(0, 200) || '（无摘要）',
    originalPreview: question,
    userId: rec.userId || 'guest',
    userNickname: name,
    userEmail: user.email || '',
    userAvatarInitial: String(name).trim()[0] || 'U',
    userType: (user.userType || 'user') === 'admin' ? '管理员' : '普通用户',
    userOnlineStatus: online.onlineStatus,
    userOnlineLabel: online.onlineLabel,
    legalType: analytics.categoryLabel(rec.category) || '其他咨询',
    category: rec.category || 'other',
    riskLevel: rec.riskLevel || 'mid',
    riskLabel: riskLabel(rec.riskLevel),
    status: rec.status || 'completed',
    statusLabel: STATUS_LABEL[rec.status] || STATUS_LABEL.completed,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt || rec.createdAt,
    durationMs: Number(rec.durationMs || rec.duration || 0),
    keywords: rec.keywords || [],
    aiScore: rec.aiScore || (rec.riskLevel === 'high' ? 58 : rec.riskLevel === 'low' ? 86 : 74),
    adminNote: rec.adminNote || ''
  };
}

function mergeEventSummaries(dbRows, events, userMap, presenceMap) {
  const byId = {};
  dbRows.forEach(function (r) { byId[r.id] = r; });

  (events || []).filter(function (e) { return consultRecords.isConsultType(e.type); }).forEach(function (e) {
    if (byId[e.id]) return;
    const sum = consultRecords.mapConsultSummary(e);
    const user = userMap[sum.userId] || {};
    const online = userProfiles.resolveOnlineStatus(sum.createdAt, presenceMap && presenceMap[sum.userId]);
    byId[e.id] = {
      id: sum.id,
      title: sum.title,
      summary: sum.preview || sum.title,
      originalPreview: sum.preview,
      userId: sum.userId,
      userNickname: user.name || sum.userNickname,
      userEmail: user.email || sum.userEmail || '',
      userAvatarInitial: String(user.name || sum.userNickname || 'U')[0],
      userType: '普通用户',
      userOnlineStatus: online.onlineStatus,
      userOnlineLabel: online.onlineLabel,
      legalType: sum.legalType,
      category: sum.category,
      riskLevel: sum.riskLevel,
      riskLabel: sum.riskLabel,
      status: sum.status,
      statusLabel: sum.statusLabel,
      createdAt: sum.createdAt,
      updatedAt: sum.createdAt,
      durationMs: 0,
      keywords: sum.keywords || [],
      aiScore: sum.aiScore,
      adminNote: ''
    };
  });

  return Object.keys(byId).map(function (k) { return byId[k]; });
}

function listAll(opts) {
  opts = opts || {};
  const userMap = buildUserMap();
  const presenceMap = dataDb.getPresenceMap();
  const dbList = dataDb.listConsult({});
  const store = require('./admin-store');
  const events = store.listLogs({});

  let rows = mergeEventSummaries(
    dbList.map(function (r) { return rowFromDb(r, userMap, presenceMap); }),
    events,
    userMap,
    presenceMap
  );

  rows.sort(function (a, b) {
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });

  if (opts.search) {
    const q = String(opts.search).toLowerCase();
    rows = rows.filter(function (r) {
      return (r.title && r.title.toLowerCase().indexOf(q) >= 0) ||
        (r.summary && r.summary.toLowerCase().indexOf(q) >= 0) ||
        (r.userNickname && r.userNickname.toLowerCase().indexOf(q) >= 0) ||
        (r.userId && r.userId.toLowerCase().indexOf(q) >= 0) ||
        (r.userEmail && r.userEmail.toLowerCase().indexOf(q) >= 0);
    });
  }

  if (opts.category && opts.category !== 'all') {
    rows = rows.filter(function (r) { return r.category === opts.category; });
  }

  if (opts.riskLevel && opts.riskLevel !== 'all') {
    rows = rows.filter(function (r) { return r.riskLevel === opts.riskLevel; });
  }

  if (opts.status && opts.status !== 'all') {
    rows = rows.filter(function (r) { return r.status === opts.status; });
  }

  if (opts.sort === 'risk') {
    const order = { high: 3, mid: 2, low: 1 };
    rows.sort(function (a, b) { return (order[b.riskLevel] || 0) - (order[a.riskLevel] || 0); });
  } else if (opts.sort === 'user') {
    rows.sort(function (a, b) { return String(a.userNickname).localeCompare(String(b.userNickname)); });
  } else {
    rows.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  }

  return rows;
}

function buildDocIndexByUser() {
  const docByUser = {};
  dataDb.listDocumentGenerate({}).forEach(function (d) {
    const uid = d.userId || 'guest';
    if (!docByUser[uid]) docByUser[uid] = [];
    docByUser[uid].push(d);
  });
  return docByUser;
}

function hasLinkedDocument(row, docByUser) {
  if (row.hasGeneratedDocument) return true;
  const docs = docByUser[row.userId] || [];
  const consultAt = new Date(row.createdAt || 0).getTime();
  if (!consultAt) return false;
  return docs.some(function (d) {
    const docAt = new Date(d.createdAt || 0).getTime();
    return docAt >= consultAt && docAt - consultAt < 7 * 86400000;
  });
}

function computeStats(rows) {
  const today = new Date().toISOString().slice(0, 10);
  const todayRows = rows.filter(function (r) { return String(r.createdAt || '').slice(0, 10) === today; });
  const docByUser = buildDocIndexByUser();
  let convertedCount = 0;
  rows.forEach(function (r) {
    if (hasLinkedDocument(r, docByUser)) convertedCount++;
  });

  return {
    total: rows.length,
    todayCount: todayRows.length,
    processedCount: rows.filter(function (r) {
      return r.status === 'completed' || r.status === 'processed';
    }).length,
    pendingCount: rows.filter(function (r) {
      return r.status === 'processing' || r.status === 'pending';
    }).length,
    convertedCount: convertedCount,
    highRisk: rows.filter(function (r) { return r.riskLevel === 'high'; }).length,
    labor: rows.filter(function (r) { return r.category === 'labor'; }).length,
    contract: rows.filter(function (r) { return r.category === 'contract'; }).length,
    activeUsers: (function () {
      const s = {};
      todayRows.forEach(function (r) { if (r.userId) s[r.userId] = 1; });
      return Object.keys(s).length;
    })()
  };
}

function computeStatistics() {
  return computeStats(listAll({}));
}

function getDetail(id) {
  const store = require('./admin-store');
  const events = store.listLogs({});
  const fromEvent = consultRecords.getConsultationDetail(events, id);
  if (fromEvent) {
    const userMap = buildUserMap();
    const user = userMap[fromEvent.userId] || {};
    fromEvent.userNickname = user.name || fromEvent.userNickname;
    fromEvent.userEmail = user.email || fromEvent.userEmail;
    fromEvent.userAvatarInitial = String(fromEvent.userNickname || 'U')[0];
    return fromEvent;
  }

  const rec = dataDb.listConsult({}).find(function (r) { return r.id === id; });
  if (!rec) return null;

  const userMap = buildUserMap();
  const presenceMap = dataDb.getPresenceMap();
  const summary = rowFromDb(rec, userMap, presenceMap);
  const metaMap = store.getUserMetaMap();
  const platformUser = userMap[rec.userId];
  let portrait = null;
  if (platformUser) {
    portrait = userProfiles.buildUserProfile(platformUser, metaMap[rec.userId] || {}, presenceMap);
  }

  const keywords = rec.keywords || analytics.extractKeywords(rec.question || '', 8);
  const docs = dataDb.listDocumentGenerate({}).filter(function (d) {
    return d.userId === rec.userId;
  }).slice(0, 6);

  const userHistory = dataDb.listConsult({}).filter(function (c) {
    return c.userId === rec.userId && c.id !== id;
  }).sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); }).slice(0, 10).map(function (c) {
    return {
      id: c.id,
      title: String(c.question || '').slice(0, 40),
      legalType: analytics.categoryLabel(c.category),
      createdAt: c.createdAt,
      riskLevel: c.riskLevel
    };
  });

  return Object.assign({}, summary, {
    originalContent: rec.question || '（无原文）',
    aiAnalysis: rec.aiAnalysis || rec.reply || (
      '系统已对用户「' + summary.legalType + '」类咨询完成结构化分析。' +
      (keywords.length ? ' 识别关键词：' + keywords.join('、') + '。' : '')
    ),
    riskDetection: {
      level: summary.riskLevel,
      label: summary.riskLabel,
      summary: summary.riskLabel + '：请结合证据材料与争议金额综合判断。',
      factors: keywords.slice(0, 4)
    },
    recommendedLaws: (rec.recommendedLaws || []).length ? rec.recommendedLaws : [
      { name: '《中华人民共和国民法典》', clause: '民事权利义务相关规定' },
      { name: '《中华人民共和国劳动合同法》', clause: '劳动争议处理' }
    ],
    similarCases: [],
    timeline: [
      { time: rec.createdAt, label: '用户提交咨询', type: 'submit' },
      { time: rec.updatedAt || rec.createdAt, label: 'AI 完成分析', type: 'done' }
    ],
    userHistory: userHistory,
    emotionAnalysis: { label: '待分析', score: 50 },
    disputeAmount: rec.disputeAmount || '—',
    aiSuggestions: [
      '建议用户整理合同、聊天记录、转账凭证等关键证据',
      summary.riskLevel === 'high' ? '建议升级人工法务复核' : '可引导用户使用文书生成或法规检索'
    ],
    processLogs: [
      { time: rec.createdAt, message: '咨询记录入库', operator: '系统' },
      { time: rec.updatedAt || rec.createdAt, message: '风险评估完成', operator: '法绎 AI' }
    ],
    operationRecords: [
      { time: rec.createdAt, action: '创建咨询', user: summary.userNickname },
      { time: rec.updatedAt || rec.createdAt, action: 'AI 分析', user: '系统' }
    ],
    generatedDocuments: docs.map(function (d) {
      return { title: d.title || d.docType, status: d.status, createdAt: d.createdAt };
    }),
    userPortrait: portrait ? {
      type: portrait.portrait && portrait.portrait.type,
      activeLevel: portrait.portrait && portrait.portrait.activeLevel,
      topKeywords: portrait.topKeywords,
      activityScore: portrait.activityScore
    } : null,
    adminNote: rec.adminNote || ''
  });
}

function updateAdminNote(id, note) {
  const list = dataDb.listConsult({});
  const idx = list.findIndex(function (r) { return r.id === id; });
  if (idx < 0) return null;
  list[idx].adminNote = String(note || '').slice(0, 500);
  list[idx].updatedAt = new Date().toISOString();
  dataDb.writeTable(dataDb.TABLES.consultRecords, list);
  return list[idx];
}

module.exports = {
  listAll: listAll,
  computeStats: computeStats,
  computeStatistics: computeStatistics,
  getDetail: getDetail,
  updateAdminNote: updateAdminNote
};

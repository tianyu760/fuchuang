/**
 * 文书系统管理中心 · 列表 / 详情 / 更新 / 重生成
 */
const store = require('./admin-store');
const dataDb = require('./admin-data-db');
const userProfiles = require('./admin-user-profiles');

const STATUS_MAP = {
  success: { code: 'completed', label: '已完成' },
  completed: { code: 'completed', label: '已完成' },
  generated: { code: 'completed', label: '已完成' },
  pending: { code: 'pending_review', label: '待审核' },
  pending_review: { code: 'pending_review', label: '待审核' },
  processing: { code: 'processing', label: '处理中' },
  archived: { code: 'archived', label: '已归档' }
};

function statusOf(rec) {
  const raw = rec.adminStatus || rec.status || 'success';
  return STATUS_MAP[raw] || STATUS_MAP.success;
}

function buildUserMap() {
  const users = store.loadPlatformUsers();
  const map = {};
  users.forEach(function (u) {
    map[u.id] = u;
    if (u.email) map[u.email] = u;
  });
  return map;
}

function resolveUserName(rec, userMap) {
  const user = userMap[rec.userId] || {};
  return rec.userName || user.name || user.nickname ||
    (user.email ? user.email.split('@')[0] : '') || rec.userId || '访客';
}

function extractLegalBasis(content) {
  const text = String(content || '');
  const refs = [];
  const re = /《[^》]{2,40}》/g;
  let m;
  const seen = {};
  while ((m = re.exec(text)) !== null) {
    const name = m[0];
    if (seen[name]) continue;
    seen[name] = 1;
    refs.push({ name: name, clause: '正文引用' });
    if (refs.length >= 12) break;
  }
  return refs;
}

function findRelatedOcr(rec) {
  const list = store.readJson(store.FILES.ocrRecords, []);
  const uid = rec.userId;
  const docAt = new Date(rec.createdAt || 0).getTime();
  if (!docAt) return null;

  let best = null;
  let bestDiff = Infinity;
  list.forEach(function (o) {
    if (uid && o.userId && o.userId !== uid) return;
    const oAt = new Date(o.createdAt || 0).getTime();
    const diff = docAt - oAt;
    if (diff < 0 || diff > 7200000) return;
    if (diff < bestDiff) {
      bestDiff = diff;
      best = o;
    }
  });
  return best;
}

function findWenshiEvent(id, rec) {
  const events = store.listLogs({}) || [];
  let hit = events.find(function (e) {
    return e.type === 'ai_wenshi' && (e.id === id || (e.payload && e.payload.docId === id));
  });
  if (hit) return hit;

  const title = String(rec.title || '').slice(0, 30);
  const t0 = new Date(rec.createdAt || 0).getTime();
  events.forEach(function (e) {
    if (e.type !== 'ai_wenshi') return;
    const p = e.payload || e;
    const et = new Date(e.timestamp || e.createdAt || 0).getTime();
    if (Math.abs(et - t0) > 300000) return;
    if (title && String(p.title || '').indexOf(title.slice(0, 12)) >= 0) hit = e;
    else if (!title && Math.abs(et - t0) < 60000) hit = e;
  });
  return hit || null;
}

var GENERIC_DOC_TITLES = {
  '法律文书': 1,
  '法律文书参考': 1,
  '合同': 1,
  '答辩状': 1,
  '起诉状': 1,
  '民事起诉状': 1,
  '律师函': 1
};

var ANSWER_NOISE = [
  /It seems like you['']ve entered[\s\S]*?(?=\n\n|$)/gi,
  /Could you please provide more details[\s\S]*?(?=\n\n|$)/gi,
  /看起来您可能没有输入[\s\S]*?(?=\n\n|$)/g,
  /很抱歉，我不确定您要问什么[\s\S]*?(?=\n\n|$)/g,
  /您能否提供更多背景信息[\s\S]*?(?=\n\n|$)/g
];

function isGarbledText(text) {
  const t = String(text || '').trim();
  if (!t || t.length < 2) return true;
  const marks = (t.match(/[?？]/g) || []).length;
  if (marks >= 3 && marks / t.length >= 0.22) return true;
  if (/^[\s?？,，。!！、]+$/.test(t)) return true;
  return false;
}

function pickValidText() {
  for (let i = 0; i < arguments.length; i++) {
    const v = arguments[i];
    if (v == null) continue;
    const t = String(v).trim();
    if (t && !isGarbledText(t)) return t;
  }
  return '';
}

function isGenericDocTitle(title) {
  const t = String(title || '').trim();
  if (!t) return true;
  if (GENERIC_DOC_TITLES[t]) return true;
  if (t.length < 10 && !/[？?请]/.test(t)) return true;
  return false;
}

function looksLikeQuestion(text) {
  const t = String(text || '').trim();
  if (!t || isGarbledText(t)) return false;
  if (t.length >= 18) return true;
  return /[？?]|请|如何|怎样|什么|是否|能否|需要|提供|生成|撰写|拟定/.test(t);
}

function cleanAnswerBody(raw) {
  let t = String(raw || '').trim();
  if (!t || isGarbledText(t)) return '';
  ANSWER_NOISE.forEach(function (re) {
    t = t.replace(re, '').trim();
  });
  const lines = t.split(/\n+/).map(function (l) { return l.trim(); }).filter(Boolean);
  const kept = lines.filter(function (line) {
    return !isGarbledText(line) &&
      !/question marks|entered a series/i.test(line) &&
      line.length > 2;
  });
  return kept.join('\n').trim();
}

function resolveQuestion(rec, evtPayload) {
  const p = evtPayload || {};
  const fromTitle = !isGenericDocTitle(rec.title) && looksLikeQuestion(rec.title)
    ? String(rec.title).trim()
    : '';
  let q = pickValidText(
    rec.question,
    p.question,
    rec.preview,
    p.preview,
    fromTitle,
    p.summary
  );
  if (!q && rec.docType && rec.docType !== '法律文书') {
    q = '请生成一份' + rec.docType + '，并说明结构要点与填写注意事项。';
  }
  if (!q) {
    q = '请生成规范法律文书（' + (rec.docType || '法律文书') + '）。';
  }
  return q;
}

function resolveAnswer(rec, evtPayload, question) {
  const p = evtPayload || {};
  const raw = pickValidText(
    rec.content,
    rec.body,
    rec.document_content,
    p.summary,
    p.content,
    p.body_markdown
  );
  let body = cleanAnswerBody(raw);
  const qNorm = String(question || '').trim();
  if (body && qNorm && body === qNorm) {
    body = '';
  }
  if (!body && !isGenericDocTitle(rec.title)) {
    const title = String(rec.title || '').trim();
    if (title.length > 12 && !looksLikeQuestion(title)) {
      body = title;
    }
  }
  if (!body) {
    return '系统已记录本次生成任务；当前正文不完整或仅为占位内容，请打开详情查看或点击「重新生成」获取完整文书。';
  }
  return body.length > 320 ? body.slice(0, 320) + '…' : body;
}

function formatListPreview(question, answer) {
  const q = String(question || '').trim();
  const a = String(answer || '').trim();
  const qShort = q.length > 96 ? q.slice(0, 96) + '…' : q;
  const aShort = a.length > 140 ? a.slice(0, 140) + '…' : a;
  return '问：' + qShort + '\n答：' + aShort;
}

function enrichRecord(rec) {
  const evt = findWenshiEvent(rec.id, rec);
  const p = evt ? (evt.payload || evt) : {};
  const question = resolveQuestion(rec, p);
  const answerSnippet = resolveAnswer(rec, p, question);
  const preview = formatListPreview(question, answerSnippet);
  const out = Object.assign({}, rec, {
    question: question,
    answerSnippet: answerSnippet,
    preview: preview
  });
  if (isGarbledText(rec.content)) {
    const cleaned = cleanAnswerBody(rec.content);
    if (cleaned && cleaned.length > 40 && cleaned !== question) {
      out.content = cleaned;
    }
  }
  if (isGenericDocTitle(rec.title) && looksLikeQuestion(question)) {
    const firstLine = String(answerSnippet || '').split(/\n+/)[0] || '';
    if (firstLine.length > 4 && firstLine.length < 48 && !isGarbledText(firstLine)) {
      out.title = firstLine.replace(/[：:]\s*$/, '');
    }
  }
  return out;
}

function persistRepairedIfNeeded(originalList, enrichedList) {
  let changed = false;
  const patched = originalList.map(function (orig) {
    const en = enrichedList.find(function (r) { return r.id === orig.id; });
    if (!en) return orig;
    const need =
      isGarbledText(orig.preview) ||
      isGarbledText(orig.question) ||
      (orig.preview !== en.preview && en.preview && en.preview.indexOf('问：') === 0);
    if (!need) return orig;
    changed = true;
    return Object.assign({}, orig, {
      preview: en.preview,
      question: en.question,
      answerSnippet: en.answerSnippet,
      content: en.content || orig.content,
      title: en.title || orig.title
    });
  });
  if (changed) {
    store.writeJson(store.FILES.docRecords, patched);
  }
}

function rowFromRecord(rec, userMap) {
  const st = statusOf(rec);
  const name = resolveUserName(rec, userMap);
  const enriched = enrichRecord(rec);
  return {
    id: enriched.id,
    title: enriched.title || '法律文书',
    docType: enriched.docType || enriched.type || '法律文书',
    caseNo: enriched.caseNo || ('DOC-' + String(enriched.id || '').slice(-8).toUpperCase()),
    userId: enriched.userId || 'guest',
    userName: name,
    userNickname: name,
    status: st.code,
    statusLabel: st.label,
    createdAt: enriched.createdAt,
    updatedAt: enriched.updatedAt || enriched.createdAt,
    question: enriched.question,
    answerSnippet: enriched.answerSnippet,
    preview: enriched.preview,
    contentLength: String(enriched.content || '').length,
    source: enriched.source || 'ai'
  };
}

function loadAllRecords() {
  const docList = store.readJson(store.FILES.docRecords, []);
  const byId = {};
  docList.forEach(function (d) { byId[d.id] = d; });

  dataDb.listDocumentGenerate({}).forEach(function (log) {
    if (byId[log.id]) {
      byId[log.id] = Object.assign({}, byId[log.id], {
        userId: log.userId || byId[log.id].userId,
        docType: log.docType || byId[log.id].docType,
        title: log.title || byId[log.id].title,
        status: log.status || byId[log.id].status
      });
      return;
    }
    byId[log.id] = {
      id: log.id,
      userId: log.userId || 'guest',
      docType: log.docType || '法律文书',
      title: log.title || '法律文书',
      status: log.status || 'success',
      createdAt: log.createdAt,
      content: '',
      preview: log.title || ''
    };
  });

  const rawList = Object.keys(byId).map(function (k) { return byId[k]; })
    .sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  const enriched = rawList.map(enrichRecord);
  persistRepairedIfNeeded(docList, enriched);
  return enriched;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function computeStatistics() {
  const userMap = buildUserMap();
  const rows = loadAllRecords().map(function (r) { return rowFromRecord(r, userMap); });
  const today = todayStr();
  return {
    total: rows.length,
    todayCount: rows.filter(function (r) {
      return String(r.createdAt || '').slice(0, 10) === today;
    }).length,
    processingCount: rows.filter(function (r) { return r.status === 'processing'; }).length,
    completedCount: rows.filter(function (r) {
      return r.status === 'completed' || r.status === 'generated';
    }).length,
    pendingReviewCount: rows.filter(function (r) { return r.status === 'pending_review'; }).length,
    archivedCount: rows.filter(function (r) { return r.status === 'archived'; }).length,
    generated: rows.filter(function (r) {
      return r.status === 'completed' || r.status === 'generated';
    }).length,
    pending: rows.filter(function (r) { return r.status === 'pending_review'; }).length,
    archived: rows.filter(function (r) { return r.status === 'archived'; }).length
  };
}

function matchesStatusFilter(row, statusFilter) {
  if (!statusFilter || statusFilter === 'all') return true;
  if (statusFilter === 'completed') {
    return row.status === 'completed' || row.status === 'generated';
  }
  return row.status === statusFilter;
}

function list(opts) {
  opts = opts || {};
  const userMap = buildUserMap();
  let rows = loadAllRecords().map(function (r) { return rowFromRecord(r, userMap); });

  if (opts.search) {
    const q = String(opts.search).toLowerCase();
    rows = rows.filter(function (r) {
      return (r.title && r.title.toLowerCase().indexOf(q) >= 0) ||
        (r.userName && r.userName.toLowerCase().indexOf(q) >= 0) ||
        (r.userId && r.userId.toLowerCase().indexOf(q) >= 0) ||
        (r.caseNo && r.caseNo.toLowerCase().indexOf(q) >= 0) ||
        (r.docType && r.docType.toLowerCase().indexOf(q) >= 0);
    });
  }

  if (opts.docType && opts.docType !== 'all') {
    rows = rows.filter(function (r) { return r.docType === opts.docType; });
  }

  if (opts.date === 'today') {
    const today = todayStr();
    rows = rows.filter(function (r) {
      return String(r.createdAt || '').slice(0, 10) === today;
    });
  }

  if (opts.status && opts.status !== 'all') {
    rows = rows.filter(function (r) { return matchesStatusFilter(r, opts.status); });
  }

  const stats = computeStatistics();

  const page = Math.max(1, parseInt(opts.page, 10) || 1);
  const pageSize = Math.min(50, parseInt(opts.pageSize, 10) || 15);
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;

  return {
    list: rows.slice(start, start + pageSize),
    total: total,
    page: page,
    pageSize: pageSize,
    totalPages: totalPages,
    stats: stats
  };
}

function getDetail(id) {
  const all = loadAllRecords();
  const raw = store.readJson(store.FILES.docRecords, []).find(function (d) { return d.id === id; });
  const rec = raw ? enrichRecord(raw) : all.find(function (d) { return d.id === id; });
  if (!rec) return null;

  const userMap = buildUserMap();
  const summary = rowFromRecord(rec, userMap);
  const ocr = findRelatedOcr(rec);
  const evt = findWenshiEvent(id, rec);
  const evtPayload = evt ? (evt.payload || evt) : {};

  const content = rec.content || rec.body || rec.document_content || '';
  const legalBasis = (rec.legalBasis && rec.legalBasis.length)
    ? rec.legalBasis
    : extractLegalBasis(content);

  const ocrAt = ocr && ocr.createdAt;
  const aiAt = rec.aiGeneratedAt || evt && (evt.timestamp || evt.createdAt) || rec.createdAt;
  const submitAt = rec.submittedAt || rec.createdAt;
  const reviewAt = rec.reviewedAt || rec.auditedAt || null;

  const timeline = [];
  if (ocrAt) {
    timeline.push({ time: ocrAt, label: 'OCR 识别完成', type: 'ocr' });
  }
  if (aiAt) {
    timeline.push({ time: aiAt, label: 'AI 生成文书', type: 'ai' });
  }
  if (submitAt) {
    timeline.push({ time: submitAt, label: '用户提交生成请求', type: 'submit' });
  }
  if (reviewAt) {
    timeline.push({ time: reviewAt, label: '管理员审核', type: 'review' });
  }
  timeline.sort(function (a, b) { return String(a.time).localeCompare(String(b.time)); });

  const fullContent = pickValidText(content) || cleanAnswerBody(content) || summary.answerSnippet || '';

  return Object.assign({}, summary, {
    preview: summary.preview || formatListPreview(summary.question, summary.answerSnippet),
    content: fullContent,
    question: summary.question,
    answerSnippet: summary.answerSnippet,
    ocrContent: rec.ocrContent || (ocr && (ocr.fullText || ocr.textPreview)) || '',
    ocrFileName: ocr && ocr.fileName,
    legalBasis: legalBasis,
    dataSource: rec.source === 'manual' ? '人工编辑' : 'AI生成',
    adminNote: rec.adminNote || '',
    timeline: timeline,
    regeneratedAt: rec.regeneratedAt || null,
    eventMeta: evt ? {
      type: evt.type,
      timestamp: evt.timestamp || evt.createdAt
    } : null
  });
}

function updateRecord(id, patch) {
  let list = store.readJson(store.FILES.docRecords, []);
  const idx = list.findIndex(function (d) { return d.id === id; });
  if (idx < 0) return null;

  const next = Object.assign({}, list[idx], patch || {}, {
    updatedAt: new Date().toISOString()
  });
  list[idx] = next;
  store.writeJson(store.FILES.docRecords, list);
  return getDetail(id);
}

function deleteRecord(id) {
  let list = store.readJson(store.FILES.docRecords, []);
  const n = list.length;
  list = list.filter(function (d) { return d.id !== id; });
  if (list.length === n) {
    const had = loadAllRecords().some(function (d) { return d.id === id; });
    if (!had) return false;
  } else {
    store.writeJson(store.FILES.docRecords, list);
  }

  const logs = dataDb.listDocumentGenerate({});
  const filtered = logs.filter(function (d) { return d.id !== id; });
  if (filtered.length !== logs.length) {
    dataDb.writeTable(dataDb.TABLES.documentGenerateLogs, filtered);
  }
  return true;
}

async function regenerate(id) {
  const detail = getDetail(id);
  if (!detail) return null;

  const prompt = String(detail.preview || detail.title || '请重新生成一份完整的法律文书').trim();
  let content;
  try {
    const { generateLegalDocumentByQwen } = require('../../lib/qwen-legal-document');
    content = await generateLegalDocumentByQwen(prompt);
  } catch (e) {
    const err = new Error(e.message || 'AI 服务暂不可用');
    err.statusCode = 503;
    throw err;
  }

  const firstLine = String(content || '').split(/\n+/).find(Boolean) || detail.title;
  const title = firstLine.replace(/^《|》$/g, '').trim() || detail.title;

  return updateRecord(id, {
    title: title,
    content: content,
    preview: prompt.slice(0, 200),
    status: 'success',
    adminStatus: 'completed',
    aiGeneratedAt: new Date().toISOString(),
    regeneratedAt: new Date().toISOString(),
    source: 'ai'
  });
}

module.exports = {
  list: list,
  computeStatistics: computeStatistics,
  getDetail: getDetail,
  updateRecord: updateRecord,
  deleteRecord: deleteRecord,
  regenerate: regenerate
};

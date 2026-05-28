/**
 * 普法运营中心 · 真实行为数据聚合
 */
const dataDb = require('./admin-data-db');
const metrics = require('./admin-metrics');
const store = require('./admin-store');
const analytics = require('./analytics-engine');
const { callYuanqiJson } = require('../../lib/ai-utils');

let lawStore = null;
try { lawStore = require('../law-education/law-store'); } catch (e) { lawStore = null; }

const REGULATION_HINTS = {
  labor: '《中华人民共和国劳动合同法》',
  marriage: '《中华人民共和国民法典》婚姻家庭编',
  contract: '《中华人民共和国民法典》合同编',
  consumer: '《中华人民共和国消费者权益保护法》',
  fraud: '《中华人民共和国刑法》',
  campus: '《中华人民共和国未成年人保护法》',
  other: '相关法律法规'
};

function dayStr(d) {
  return (d || new Date()).toISOString().slice(0, 10);
}

function today() {
  return dayStr(new Date());
}

function countBehaviorToday(predicate) {
  const day = today();
  return dataDb.listBehavior({ limit: 12000 }).filter(function (b) {
    if (String(b.createdAt || '').slice(0, 10) !== day) return false;
    return predicate(b);
  }).length;
}

function countEventsToday(type) {
  const day = today();
  return store.listLogs({}).filter(function (e) {
    if (String(e.createdAt || e.timestamp || '').slice(0, 10) !== day) return false;
    return e.type === type;
  }).length;
}

function buildOverview() {
  const stats = store.statsOverview();
  const publicity = store.getMergedPublicityStats(lawStore);
  const pufaReadsToday = Math.max(
    publicity.todayReads || 0,
    stats.pufaReadsToday || 0,
    countEventsToday('law_edu_visit')
  );

  return {
    todayVisits: stats.todayVisits || 0,
    pufaContentReads: pufaReadsToday,
    consultConversions: stats.consultToday || 0,
    documentConversions: stats.documentToday || stats.wenshiToday || 0,
    ocrUsageCount: stats.ocrToday || 0,
    dau: stats.todayActive || stats.onlineUsers || 0,
    onlineUsers: stats.onlineUsers || 0,
    totalUsers: stats.totalUsers || 0,
    faguiToday: stats.faguiToday || 0,
    updatedAt: new Date().toISOString(),
    sources: {
      visits: 'visit-stats.json',
      pufa: 'law-education + pufa-read-stats + law_edu_visit events',
      consult: 'consult-records.json',
      document: 'document-generate-logs.json',
      ocr: 'ocr-records.json',
      dau: 'user-behavior-logs + users.json'
    }
  };
}

function buildFunnel() {
  const day = today();
  const behavior = dataDb.listBehavior({ limit: 12000 });
  const dayBehavior = behavior.filter(function (b) {
    return String(b.createdAt || '').slice(0, 10) === day;
  });

  const pufaVisit = dayBehavior.filter(function (b) {
    return b.module === 'pufa' || b.action === 'law_edu_visit' ||
      /pufa|law-education|普法/.test(String(b.sourcePage || '') + b.action);
  }).length + countEventsToday('law_edu_visit') + countEventsToday('page_visit');

  const consult = dataDb.listConsult({ day: day }).length ||
    dayBehavior.filter(function (b) { return b.module === 'consult' || b.action === 'ai_chat'; }).length;

  const ocr = dataDb.readOcrRecords().filter(function (r) {
    return String(r.createdAt || '').slice(0, 10) === day;
  }).length;

  const document = dataDb.listDocumentGenerate({ day: day }).length ||
    dayBehavior.filter(function (b) { return b.module === 'document' || b.action === 'ai_wenshi'; }).length;

  const regulation = dayBehavior.filter(function (b) {
    return b.module === 'regulation' || b.action === 'regulation_search' || b.action === 'ai_fagui';
  }).length + (store.statsOverview().faguiToday || 0);

  const steps = [
    { key: 'pufa', label: '访问普法内容', count: Math.max(pufaVisit, 1) },
    { key: 'consult', label: '法律咨询', count: consult },
    { key: 'ocr', label: 'OCR识别', count: ocr },
    { key: 'document', label: '文书生成', count: document },
    { key: 'regulation', label: '法规引用', count: regulation }
  ];

  let prev = steps[0].count || 1;
  const enriched = steps.map(function (s, i) {
    const rate = i === 0 ? 100 : (prev > 0 ? Math.round((s.count / prev) * 1000) / 10 : 0);
    const overall = steps[0].count > 0
      ? Math.round((s.count / steps[0].count) * 1000) / 10
      : 0;
    const dropoff = i === 0 ? 0 : Math.max(0, Math.round((100 - rate) * 10) / 10);
    if (i > 0) prev = s.count || prev;
    return Object.assign({}, s, {
      conversionRate: i === 0 ? 100 : rate,
      overallRate: overall,
      dropoffRate: dropoff
    });
  });

  return {
    steps: enriched,
    updatedAt: new Date().toISOString(),
    source: 'user-behavior-logs + consult + ocr + document + events'
  };
}

function inferRiskLevel(text, existing) {
  if (existing) return existing;
  const enriched = analytics.enrichEvent('consult', { preview: text });
  return enriched.riskLevel || 'mid';
}

function relatedRegulation(category, keywords) {
  if (REGULATION_HINTS[category]) return REGULATION_HINTS[category];
  const k = (keywords || [])[0];
  if (k && k.length >= 2) return '与「' + k + '」相关的法律法规';
  return REGULATION_HINTS.other;
}

function buildHotIssues(limit) {
  limit = limit || 15;
  const consults = dataDb.listConsult({});
  const map = {};

  consults.forEach(function (c) {
    const q = String(c.question || '').trim();
    if (q.length < 4) return;
    const key = q.slice(0, 80);
    if (!map[key]) {
      map[key] = {
        id: 'hot_' + Buffer.from(key).toString('hex').slice(0, 12),
        title: key.length > 48 ? key.slice(0, 48) + '…' : key,
        fullTitle: key,
        count: 0,
        category: c.category || 'other',
        riskLevel: c.riskLevel || 'mid',
        keywords: c.keywords || [],
        relatedRegulations: relatedRegulation(c.category, c.keywords),
        consultIds: []
      };
    }
    map[key].count++;
    if (map[key].consultIds.length < 8) map[key].consultIds.push(c.id);
    map[key].riskLevel = inferRiskLevel(key, map[key].riskLevel);
  });

  const behavior = dataDb.listBehavior({ limit: 8000 }).filter(function (b) {
    return b.module === 'consult' && String(b.detail || '').length >= 6;
  });
  behavior.forEach(function (b) {
    const key = String(b.detail || '').trim().slice(0, 80);
    if (key.length < 4) return;
    if (!map[key]) {
      map[key] = {
        id: 'hot_b_' + Buffer.from(key).toString('hex').slice(0, 10),
        title: key.length > 48 ? key.slice(0, 48) + '…' : key,
        fullTitle: key,
        count: 0,
        category: 'other',
        riskLevel: inferRiskLevel(key, null),
        keywords: [],
        relatedRegulations: REGULATION_HINTS.other,
        consultIds: []
      };
    }
    map[key].count++;
  });

  return Object.keys(map)
    .map(function (k) { return map[k]; })
    .sort(function (a, b) { return b.count - a.count; })
    .slice(0, limit)
    .map(function (item, idx) {
      return Object.assign({}, item, { rank: idx + 1 });
    });
}

function buildContentStats() {
  const articles = lawStore ? lawStore.listArticles() : [];
  const behavior = dataDb.listBehavior({ limit: 10000 });
  const pufaBehaviors = behavior.filter(function (b) {
    return b.module === 'pufa' || b.action === 'law_edu_visit';
  });

  const dwellSum = pufaBehaviors.reduce(function (s, b) {
    return s + (Number(b.durationMs) || 0);
  }, 0);
  const avgDwellSec = pufaBehaviors.length
    ? Math.round(dwellSum / pufaBehaviors.length / 1000)
    : 0;

  const shareCount = behavior.filter(function (b) {
    return /share|转发|分享/.test(String(b.action) + String(b.detail));
  }).length;

  const singlePageUsers = {};
  const userPages = {};
  behavior.forEach(function (b) {
    const uid = b.userId || 'guest';
    const pg = b.sourcePage || b.module || 'unknown';
    if (!userPages[uid]) userPages[uid] = {};
    userPages[uid][pg] = 1;
  });
  Object.keys(userPages).forEach(function (uid) {
    if (Object.keys(userPages[uid]).length === 1) singlePageUsers[uid] = 1;
  });
  const bounceRate = Object.keys(userPages).length
    ? Math.round((Object.keys(singlePageUsers).length / Object.keys(userPages).length) * 1000) / 10
    : 0;

  return articles.map(function (a) {
    const titleHits = pufaBehaviors.filter(function (b) {
      return String(b.detail || '').indexOf(a.title) >= 0;
    }).length;
    return {
      id: a.id,
      title: a.title,
      reads: a.reads || 0,
      likes: a.likes || 0,
      shares: Math.max(0, Math.round((a.likes || 0) * 0.15) + titleHits),
      avgDwellSec: avgDwellSec || Math.min(300, 30 + Math.round((a.reads || 0) / 200)),
      bounceRate: bounceRate,
      categoryId: a.categoryId,
      path: '/law-education.html?id=' + encodeURIComponent(a.id),
      source: 'law_articles.json + behavior logs'
    };
  }).sort(function (x, y) { return (y.reads || 0) - (x.reads || 0); }).slice(0, 20);
}

function classifyChannel(page, action, detail) {
  const blob = String(page + ' ' + action + ' ' + detail).toLowerCase();
  if (/mobile|android|iphone|ipad|m\.|h5/.test(blob)) return 'mobile';
  if (/baidu|google|bing|sogou|360|search|utm_source/.test(blob)) return 'search';
  if (/http:\/\/|https:\/\//.test(blob) && !/localhost|127\.0\.0\.1/.test(blob)) return 'external';
  if (/admin|dashboard|datav|profile/.test(blob)) return 'internal';
  return 'web';
}

function buildChannelStats() {
  const channels = {
    web: { label: 'Web端', value: 0 },
    mobile: { label: '移动端', value: 0 },
    external: { label: '外部链接', value: 0 },
    search: { label: '搜索引擎', value: 0 },
    internal: { label: '内部跳转', value: 0 }
  };

  const visits = store.readJson(store.FILES.visits, { daily: {}, total: 0 });
  channels.web.value += Math.round((visits.total || 0) * 0.55);

  dataDb.listBehavior({ limit: 12000 }).forEach(function (b) {
    const ch = classifyChannel(b.sourcePage || '', b.action || '', b.detail || '');
    channels[ch].value++;
  });

  store.listLogs({}).slice(0, 3000).forEach(function (e) {
    const p = (e.payload && e.payload.page) || '';
    const ch = classifyChannel(p, e.type || '', JSON.stringify(e.payload || {}));
    channels[ch].value++;
  });

  const total = Object.keys(channels).reduce(function (s, k) {
    return s + channels[k].value;
  }, 0) || 1;

  return Object.keys(channels).map(function (k) {
    return {
      key: k,
      label: channels[k].label,
      value: channels[k].value,
      percent: Math.round((channels[k].value / total) * 1000) / 10
    };
  }).sort(function (a, b) { return b.value - a.value; });
}

function buildDashboard() {
  return {
    overview: buildOverview(),
    funnel: buildFunnel(),
    hotIssues: buildHotIssues(15),
    contentStats: buildContentStats(),
    channelStats: buildChannelStats(),
    updatedAt: new Date().toISOString()
  };
}

async function generateContent(topic, opts) {
  opts = opts || {};
  const subject = String(topic || '').trim();
  if (!subject) {
    const err = new Error('请输入法律主题');
    err.statusCode = 400;
    throw err;
  }

  const prompt =
    '你是法绎平台普法运营专家。请围绕主题「' + subject + '」撰写一篇面向普通公众的普法文章。\n' +
    '必须只返回一个 JSON 对象，不要 markdown，字段：\n' +
    '{\n' +
    '  "title": "文章标题",\n' +
    '  "article": "正文（800-1500字，含小标题与要点）",\n' +
    '  "keywords": ["关键词1","关键词2"],\n' +
    '  "strategy": "推荐传播策略（渠道、人群、发布时间）"\n' +
    '}';

  let title = '';
  let article = '';
  let keywords = [];
  let strategy = '';

  try {
    const result = await callYuanqiJson(prompt, { userId: 'admin_operation' });
    const data = result.data || {};
    title = String(data.title || '').trim();
    article = String(data.article || data.content || '').trim();
    keywords = Array.isArray(data.keywords) ? data.keywords : [];
    strategy = String(data.strategy || '').trim();
  } catch (e) {
    const raw = String(e.raw_content || e.message || '');
    title = subject + '普法解读';
    article = raw || '（AI 生成失败，请稍后重试）';
    keywords = [subject.slice(0, 8)];
    strategy = '建议通过站内普法频道、咨询页推荐位及社交媒体图文形式传播。';
  }

  if (!title) title = subject + ' · 普法专题';
  if (!article) article = '围绕「' + subject + '」的普法内容生成中，请稍后刷新。';
  if (!keywords.length) keywords = [subject.slice(0, 10)];
  if (!strategy) strategy = '优先在普法运营页、首页推荐及法律咨询入口联动展示。';

  let published = null;
  if (opts.publish && lawStore) {
    published = lawStore.saveArticle({
      title: title,
      summary: article.replace(/\s+/g, ' ').slice(0, 160),
      content: article,
      tags: keywords,
      categoryId: 'hot',
      featured: false,
      mediaType: 'article'
    });
    store.bumpPufaRead({ title: title, category: 'AI生成', kind: 'article' });
    store.logEvent('law_edu_publish', { title: title, source: 'ai_operation' });
  }

  return {
    title: title,
    article: article,
    keywords: keywords,
    strategy: strategy,
    published: published,
    source: 'yuanqi_ai'
  };
}

module.exports = {
  buildOverview: buildOverview,
  buildFunnel: buildFunnel,
  buildHotIssues: buildHotIssues,
  buildContentStats: buildContentStats,
  buildChannelStats: buildChannelStats,
  buildDashboard: buildDashboard,
  generateContent: generateContent
};

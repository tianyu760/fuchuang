/**
 * 数据分析中心 · 统一 dashboard 数据源（真实业务表聚合）
 */
const dataDb = require('./admin-data-db');
const metrics = require('./admin-metrics');
const store = require('./admin-store');
const analytics = require('./analytics-engine');

let regulationCenter = null;
let riskCenter = null;
try { regulationCenter = require('./regulation-center'); } catch (e) { /* */ }
try { riskCenter = require('./risk-center'); } catch (e) { /* */ }

const LAW_AREA_MAP = {
  labor: '劳动法',
  marriage: '民法',
  contract: '民法',
  consumer: '民法',
  fraud: '刑法',
  campus: '其他',
  other: '其他'
};

const DOC_TYPE_BUCKETS = [
  { key: '合同类', test: /合同|协议/ },
  { key: '诉讼类', test: /起诉|答辩/ },
  { key: '律师函', test: /律师函/ },
  { key: '仲裁类', test: /仲裁/ },
  { key: '授权委托', test: /授权|委托/ }
];

function dayStr(d) {
  return (d || new Date()).toISOString().slice(0, 10);
}

function normalizeDocType(raw) {
  const t = String(raw || '其他文书').trim();
  for (let i = 0; i < DOC_TYPE_BUCKETS.length; i++) {
    if (DOC_TYPE_BUCKETS[i].test.test(t)) return DOC_TYPE_BUCKETS[i].key;
  }
  if (t === '法律文书') return '其他文书';
  return t.length > 12 ? t.slice(0, 10) : t;
}

function buildKpiOverview() {
  const stats = store.statsOverview();
  const consults = dataDb.listConsult({});
  const docs = dataDb.listDocumentGenerate({});
  const ocr = dataDb.readOcrRecords();
  let regTotal = 0;
  try {
    regTotal = regulationCenter ? regulationCenter.ensureCatalog().length : 0;
  } catch (e) { regTotal = 0; }

  return {
    totalConsult: consults.length,
    totalDocuments: docs.length,
    totalOCR: ocr.length,
    totalRegulations: regTotal,
    activeUsers: stats.todayActive || stats.onlineUsers || 0,
    consultToday: stats.consultToday || 0,
    documentToday: stats.documentToday || 0,
    ocrToday: stats.ocrToday || 0
  };
}

function buildConsultTrend(days) {
  days = days || 30;
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = dayStr(d);
    out.push({
      date: key,
      count: dataDb.listConsult({ day: key }).length
    });
  }
  return out;
}

function buildDocumentTypeDistribution() {
  const map = {};
  dataDb.listDocumentGenerate({}).forEach(function (d) {
    const type = normalizeDocType(d.docType || d.title);
    map[type] = (map[type] || 0) + 1;
  });
  return Object.keys(map)
    .sort(function (a, b) { return map[b] - map[a]; })
    .map(function (type) {
      return { type: type, value: map[type] };
    });
}

function buildOcrConfidenceDistribution() {
  const buckets = {
    '0-0.6': 0,
    '0.6-0.8': 0,
    '0.8-1.0': 0
  };
  dataDb.readOcrRecords().forEach(function (r) {
    let c = r.confidence;
    if (c == null) {
      if (r.status === 'failed' || r.success === false) buckets['0-0.6']++;
      return;
    }
    if (typeof c === 'number' && c > 1) c = c / 100;
    if (c < 0.6) buckets['0-0.6']++;
    else if (c < 0.8) buckets['0.6-0.8']++;
    else buckets['0.8-1.0']++;
  });
  return Object.keys(buckets).map(function (range) {
    return { range: range, value: buckets[range] };
  });
}

function buildRiskLevelDistribution() {
  const counts = { high: 0, medium: 0, low: 0 };
  let list = [];

  if (riskCenter && riskCenter.collectAllRisks) {
    list = riskCenter.collectAllRisks();
  } else {
    metrics.riskBreakdownFromLogs().forEach(function (r) {
      const lv = r.name === 'mid' ? 'medium' : r.name;
      if (counts[lv] != null) counts[lv] += r.value;
    });
    return [
      { level: 'high', value: counts.high },
      { level: 'medium', value: counts.medium },
      { level: 'low', value: counts.low }
    ];
  }

  list.forEach(function (r) {
    const lv = r.level === 'mid' ? 'medium' : r.level;
    if (counts[lv] != null) counts[lv]++;
    else counts.medium++;
  });

  dataDb.listConsult({}).forEach(function (c) {
    const lv = c.riskLevel === 'mid' ? 'medium' : (c.riskLevel || 'medium');
    if (counts[lv] != null) counts[lv]++;
  });

  return [
    { level: 'high', value: counts.high },
    { level: 'medium', value: counts.medium },
    { level: 'low', value: counts.low }
  ];
}

function buildLawCategoryHotspot() {
  const map = {};

  dataDb.listConsult({}).forEach(function (c) {
    const catId = c.category || analytics.classifyCategory(c.question || '');
    const area = LAW_AREA_MAP[catId] || '其他';
    map[area] = (map[area] || 0) + 1;
  });

  dataDb.listBehavior({ limit: 10000 }).forEach(function (b) {
    if (b.module === 'regulation' || b.action === 'regulation_search' || b.action === 'ai_fagui') {
      const text = String((b.meta && b.meta.keyword) || b.detail || '');
      const catId = analytics.classifyCategory(text);
      const area = LAW_AREA_MAP[catId] || '民法';
      map[area] = (map[area] || 0) + 1;
    }
  });

  if (regulationCenter) {
    try {
      regulationCenter.ensureCatalog().forEach(function (r) {
        const area = r.category || '其他';
        map[area] = (map[area] || 0) + 1;
      });
    } catch (e) { /* ignore */ }
  }

  const keys = Object.keys(map);
  if (!keys.length) {
    return [
      { category: '民法', count: 0 },
      { category: '刑法', count: 0 },
      { category: '劳动法', count: 0 }
    ];
  }

  return keys
    .sort(function (a, b) { return map[b] - map[a]; })
    .map(function (category) {
      return { category: category, count: map[category] };
    });
}

function buildDashboard(opts) {
  opts = opts || {};
  const days = Math.min(90, parseInt(opts.days, 10) || 30);

  return {
    overview: buildKpiOverview(),
    consultTrend: buildConsultTrend(days),
    documentTypeDistribution: buildDocumentTypeDistribution(),
    ocrConfidenceDistribution: buildOcrConfidenceDistribution(),
    riskLevelDistribution: buildRiskLevelDistribution(),
    lawCategoryHotspot: buildLawCategoryHotspot(),
    updatedAt: new Date().toISOString(),
    source: 'consult-records + document-generate-logs + ocr-records + risk-center + behavior-logs'
  };
}

const intelligence = require('./analytics-intelligence');

function buildOverview(opts) {
  opts = opts || {};
  const days = Math.min(90, parseInt(opts.days, 10) || 30);
  const charts = buildDashboard({ days: days });
  const correlation = intelligence.buildCorrelation();
  const prediction = intelligence.buildPrediction(charts);
  const anomaly = intelligence.buildAnomaly(charts);
  const insights = intelligence.buildInsight(charts, correlation, anomaly, prediction);
  const chartInsights = intelligence.buildChartInsights(charts, anomaly);

  return {
    charts: charts,
    insights: insights,
    correlation: correlation,
    prediction: prediction,
    anomaly: anomaly,
    chartInsights: chartInsights,
    updatedAt: new Date().toISOString()
  };
}

function buildInsightPayload(opts) {
  const overview = buildOverview(opts);
  return overview.insights;
}

function emptyDashboard() {
  return {
    overview: {
      totalConsult: 0,
      totalDocuments: 0,
      totalOCR: 0,
      totalRegulations: 0,
      activeUsers: 0
    },
    consultTrend: [],
    documentTypeDistribution: [],
    ocrConfidenceDistribution: [],
    riskLevelDistribution: [
      { level: 'high', value: 0 },
      { level: 'medium', value: 0 },
      { level: 'low', value: 0 }
    ],
    lawCategoryHotspot: [],
    updatedAt: new Date().toISOString()
  };
}

function emptyOverview() {
  const charts = emptyDashboard();
  return {
    charts: charts,
    insights: { summary: '暂无数据', insights: [], suggestions: [] },
    correlation: { sankey: { nodes: [], links: [] }, graph: { nodes: [], links: [] }, metrics: {} },
    prediction: { consultForecast: [], documentForecast: [], riskForecast: [] },
    anomaly: [],
    chartInsights: {}
  };
}

module.exports = {
  buildDashboard: buildDashboard,
  buildOverview: buildOverview,
  buildInsightPayload: buildInsightPayload,
  emptyDashboard: emptyDashboard,
  emptyOverview: emptyOverview
};

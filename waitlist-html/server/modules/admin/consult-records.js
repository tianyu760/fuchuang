/**
 * 法律咨询记录 · 列表摘要与详情组装
 */
const analytics = require('./analytics-engine');

const CONSULT_TYPES = ['ai_chat', 'ai_case', 'ai_fagui'];
const TYPE_LABEL = {
  ai_chat: '法律咨询',
  ai_case: '案件分析',
  ai_fagui: '法规检索'
};
const STATUS_LABEL = {
  processing: '处理中',
  completed: '已完成',
  failed: '失败',
  pending: '待受理'
};

function isConsultType(type) {
  return CONSULT_TYPES.indexOf(type) >= 0;
}

function riskLevelLabel(lv) {
  if (lv === 'high') return '高风险';
  if (lv === 'low') return '低风险';
  return '中风险';
}

function normalizeRiskLevel(p, e) {
  let lv = (p && p.riskLevel) || 'mid';
  if (p && p.risk) {
    const r = String(p.risk).toLowerCase();
    if (/高|high/.test(r)) lv = 'high';
    else if (/低|low/.test(r)) lv = 'low';
  }
  if (e && e.status === 'failed') lv = 'high';
  return lv;
}

function computeAiScore(riskLevel, p, e) {
  let base = riskLevel === 'low' ? 86 : riskLevel === 'high' ? 58 : 74;
  if (p && p.duration) base += Math.min(10, Math.floor(Number(p.duration) / 800));
  if (p && p.keywords && p.keywords.length > 2) base += 3;
  if (e && e.status === 'failed') base -= 18;
  return Math.max(42, Math.min(97, base));
}

function consultTitle(p, type) {
  const text = String((p && (p.preview || p.keyword || p.title)) || '').trim();
  if (text.length > 40) return text.slice(0, 40) + '…';
  return text || TYPE_LABEL[type] || '法律咨询';
}

function consultStatus(p, e) {
  if (e.status === 'failed') return 'failed';
  if (p && (p.reply || p.answered || p.completed)) return 'completed';
  if (p && p.pending) return 'pending';
  return 'processing';
}

function collectText(e) {
  const p = e.payload || {};
  return [p.preview, p.keyword, p.title, p.reply, p.analysis].filter(Boolean).join(' ');
}

function estimateAmount(text) {
  const m = String(text || '').match(/(\d+(?:\.\d+)?)\s*(?:万|万元|元)/);
  if (m) return m[0];
  if (/借款|欠款|赔偿/.test(text)) return '待核实';
  return '—';
}

function emotionFromText(text) {
  if (/焦虑|着急|恐慌|担心/.test(text)) return { label: '焦虑偏高', score: 72 };
  if (/愤怒|气愤|不满/.test(text)) return { label: '情绪紧张', score: 68 };
  if (/感谢|明白|清楚/.test(text)) return { label: '相对平稳', score: 35 };
  return { label: '中性', score: 48 };
}

function lawsFromKeywords(keywords, category) {
  const base = [
    { name: '《中华人民共和国民法典》', clause: '相关民事权利义务条款' },
    { name: '《中华人民共和国劳动合同法》', clause: '劳动争议处理' }
  ];
  const kws = keywords || [];
  return base.slice(0, 2).map(function (law, i) {
    return {
      name: law.name,
      clause: kws[i] ? '与「' + kws[i] + '」相关的' + law.clause : law.clause
    };
  });
}

function similarCases(category, type) {
  const cat = category || 'other';
  return [
    { title: TYPE_LABEL[type] + '参考案例 A', similarity: 82, summary: '同类' + analytics.categoryLabel(cat) + '纠纷调解结案' },
    { title: TYPE_LABEL[type] + '参考案例 B', similarity: 71, summary: '法院支持部分诉求的典型判决' }
  ];
}

function buildTimeline(e, p) {
  const t0 = e.createdAt;
  const items = [
    { time: t0, label: '用户提交咨询', type: 'submit' },
    { time: t0, label: 'AI 受理并分类', type: 'ai' },
    { time: t0, label: e.status === 'failed' ? '分析异常' : '生成分析结果', type: e.status === 'failed' ? 'warn' : 'done' }
  ];
  if (p && p.reply) {
    items.push({ time: t0, label: '回复已推送用户', type: 'done' });
  }
  return items;
}

function mapConsultSummary(e) {
  const p = e.payload || {};
  const riskLevel = normalizeRiskLevel(p, e);
  const status = consultStatus(p, e);
  return {
    id: e.id,
    title: consultTitle(p, e.type),
    userNickname: p.nickname || (p.email ? String(p.email).split('@')[0] : '') || e.userId || '访客',
    userId: p.userId || e.userId || 'guest',
    userEmail: p.email || '',
    legalType: analytics.categoryLabel(p.category) || TYPE_LABEL[e.type] || '其他咨询',
    typeCode: e.type,
    category: p.category || 'other',
    riskLevel: riskLevel,
    riskLabel: riskLevelLabel(riskLevel),
    status: status,
    statusLabel: STATUS_LABEL[status] || status,
    createdAt: e.createdAt,
    aiScore: computeAiScore(riskLevel, p, e),
    keywords: (p.keywords || []).slice(0, 6),
    preview: String(p.preview || p.keyword || '').slice(0, 160)
  };
}

function buildConsultDetail(e, allEvents) {
  const p = e.payload || {};
  const summary = mapConsultSummary(e);
  const text = collectText(e);
  const keywords = p.keywords || analytics.extractKeywords(text, 8);
  const userId = summary.userId;

  const userHistory = (allEvents || [])
    .filter(function (x) {
      return isConsultType(x.type) && x.id !== e.id &&
        ((x.payload && x.payload.userId) || x.userId) === userId;
    })
    .slice(-8)
    .reverse()
    .map(function (x) {
      const s = mapConsultSummary(x);
      return {
        id: s.id,
        title: s.title,
        legalType: s.legalType,
        createdAt: s.createdAt,
        riskLevel: s.riskLevel
      };
    });

  const riskSummary = riskLevelLabel(summary.riskLevel) + '：' +
    (summary.riskLevel === 'high'
      ? '存在较大履约/争议风险，建议人工复核。'
      : summary.riskLevel === 'low'
        ? '风险可控，可按标准流程处理。'
        : '存在一定争议点，建议关注关键证据。');

  return Object.assign({}, summary, {
    originalContent: p.preview || p.keyword || p.title || '（无原文）',
    aiAnalysis: p.reply || p.analysis || (
      '基于用户描述的「' + summary.legalType + '」问题，系统识别核心争议点并给出结构化分析。' +
      (keywords.length ? ' 关键词：' + keywords.join('、') + '。' : '')
    ),
    riskDetection: {
      level: summary.riskLevel,
      label: summary.riskLabel,
      summary: riskSummary,
      factors: keywords.length ? keywords.slice(0, 4) : ['待补充材料']
    },
    recommendedLaws: lawsFromKeywords(keywords, p.category),
    similarCases: similarCases(p.category, e.type),
    timeline: buildTimeline(e, p),
    userHistory: userHistory,
    emotionAnalysis: emotionFromText(text),
    disputeAmount: p.amount || p.disputeAmount || estimateAmount(text),
    aiSuggestions: [
      '建议先固定证据材料（合同、转账记录、聊天记录等）',
      '优先通过协商/调解方式降低维权成本',
      summary.riskLevel === 'high' ? '高风险案件建议升级人工律师复核' : '可继续 AI 辅助生成文书或法规检索'
    ],
    processLogs: [
      { time: e.createdAt, message: '系统接收咨询请求', operator: '系统' },
      { time: e.createdAt, message: '完成意图识别与分类：' + summary.legalType, operator: 'AI' },
      {
        time: e.createdAt,
        message: e.status === 'failed' ? '分析链路异常' : '输出风险评估与建议',
        operator: 'AI'
      }
    ],
    operationRecords: [
      { time: e.createdAt, action: '创建记录', user: summary.userNickname },
      { time: e.createdAt, action: '自动分析', user: '法绎 AI' }
    ],
    starred: !!p.starred,
    durationMs: Number(p.duration || e.duration || 0)
  });
}

function listConsultations(events, opts) {
  opts = opts || {};
  let rows = (events || []).filter(function (e) { return isConsultType(e.type); });
  if (opts.search) {
    const q = String(opts.search).toLowerCase();
    rows = rows.filter(function (e) {
      return JSON.stringify(mapConsultSummary(e)).toLowerCase().indexOf(q) >= 0;
    });
  }
  return rows.map(mapConsultSummary);
}

function getConsultationDetail(events, id) {
  const e = (events || []).find(function (x) { return x.id === id && isConsultType(x.type); });
  if (!e) return null;
  return buildConsultDetail(e, events);
}

module.exports = {
  isConsultType: isConsultType,
  listConsultations: listConsultations,
  getConsultationDetail: getConsultationDetail,
  mapConsultSummary: mapConsultSummary
};

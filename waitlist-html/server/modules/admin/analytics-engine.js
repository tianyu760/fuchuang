/**
 * 法绎 · 大屏数据分析引擎（关键词 / 分类 / 风险 / 地域）
 */
const PROVINCES = [
  '北京', '天津', '上海', '重庆', '河北', '山西', '辽宁', '吉林', '黑龙江',
  '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南', '湖北', '湖南',
  '广东', '海南', '四川', '贵州', '云南', '陕西', '甘肃', '青海', '内蒙古',
  '广西', '西藏', '宁夏', '新疆', '香港', '澳门', '台湾'
];

const CATEGORY_RULES = [
  { id: 'labor', label: '劳动纠纷', patterns: [/劳动|工资|辞退|工伤|社保|劳动合同|加班|解雇/] },
  { id: 'marriage', label: '婚姻纠纷', patterns: [/婚姻|离婚|抚养|彩礼|夫妻|财产分割/] },
  { id: 'contract', label: '合同纠纷', patterns: [/合同|租赁|违约|欠款|协议|借条|买卖/] },
  { id: 'campus', label: '校园问题', patterns: [/校园|学生|学校|霸凌|学籍|宿舍/] },
  { id: 'fraud', label: '网络诈骗', patterns: [/诈骗|网络|转账|刷单|网贷|电信诈骗|非法集资/] },
  { id: 'consumer', label: '消费维权', patterns: [/消费|退货|维权|假货|三包|退款|商家/] }
];

const RISK_HIGH = [/刑事|诈骗|拘留|逮捕|重伤|死亡|高利贷|非法集资|黑社会/];
const RISK_LOW = [/咨询|一般|轻微|低风险|民事调解|格式合同/];

const STOP_WORDS = new Set([
  '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
  '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好',
  '自己', '这', '请', '帮', '分析', '法律', '问题', '怎么', '什么', '如何', '吗'
]);

function collectText(type, payload) {
  const p = payload || {};
  const parts = [
    p.preview, p.title, p.keyword, p.textPreview, p.ocrText, p.content,
    p.summary, p.question, p.query, p.riskDesc, p.analysis, p._text
  ];
  if (p.risk) parts.push(String(p.risk));
  if (p.risk_level) parts.push(String(p.risk_level));
  return parts.filter(Boolean).join(' ').slice(0, 8000);
}

function classifyCategory(text) {
  const t = String(text || '');
  let best = 'other';
  let bestScore = 0;
  CATEGORY_RULES.forEach(function (rule) {
    let score = 0;
    rule.patterns.forEach(function (re) {
      if (re.test(t)) score += 2;
    });
    if (score > bestScore) {
      bestScore = score;
      best = rule.id;
    }
  });
  return best;
}

function parseRiskLevel(text, explicit) {
  const s = String(explicit || '') + ' ' + String(text || '');
  if (/高|high|严重|危险/i.test(s)) return 'high';
  if (/低|low|轻微|一般风险较低/i.test(s)) return 'low';
  if (RISK_HIGH.some(function (re) { return re.test(s); })) return 'high';
  if (RISK_LOW.some(function (re) { return re.test(s); }) && !RISK_HIGH.some(function (re) { return re.test(s); })) {
    return 'low';
  }
  return 'mid';
}

function extractKeywords(text, limit) {
  limit = limit || 12;
  const t = String(text || '');
  const freq = {};
  const phrases = [
    '劳动合同', '网络诈骗', '校园霸凌', '消费维权', '离婚纠纷', '合同纠纷',
    '工伤赔偿', '电信诈骗', '民间借贷', '房屋租赁', '劳动仲裁', '证据保全'
  ];
  phrases.forEach(function (ph) {
    if (t.indexOf(ph) >= 0) freq[ph] = (freq[ph] || 0) + 3;
  });
  const chunks = t.match(/[\u4e00-\u9fa5]{2,6}/g) || [];
  chunks.forEach(function (w) {
    if (STOP_WORDS.has(w) || w.length < 2) return;
    freq[w] = (freq[w] || 0) + 1;
  });
  return Object.keys(freq)
    .sort(function (a, b) { return freq[b] - freq[a]; })
    .slice(0, limit);
}

function regionFromUserId(userId) {
  if (!userId || userId === 'guest' || userId === 'fayi_image_user') return null;
  let h = 0;
  const s = String(userId);
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i);
  return PROVINCES[Math.abs(h) % PROVINCES.length];
}

function enrichEvent(type, payload) {
  const p = Object.assign({}, payload || {});
  const text = collectText(type, p);
  p.category = p.category || classifyCategory(text);
  p.keywords = p.keywords && p.keywords.length ? p.keywords : extractKeywords(text, 10);
  p.riskLevel = p.riskLevel || parseRiskLevel(text, p.risk || p.risk_level);
  if (!p.region) p.region = regionFromUserId(p.userId);
  if (!p.preview && text) p.preview = text.slice(0, 120);
  return p;
}

function categoryLabel(id) {
  const rule = CATEGORY_RULES.find(function (r) { return r.id === id; });
  if (rule) return rule.label;
  if (id === 'other') return '其他咨询';
  return id;
}

module.exports = {
  PROVINCES,
  CATEGORY_RULES,
  collectText,
  classifyCategory,
  parseRiskLevel,
  extractKeywords,
  regionFromUserId,
  enrichEvent,
  categoryLabel
};

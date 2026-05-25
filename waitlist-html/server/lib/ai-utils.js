/**
 * 法绎 · AI 响应解析与 JSON 规范化
 */
const {
  sanitizeLegalPlaceholders,
  chineseDate,
  PLACEHOLDER_LINE
} = require('./legal-text-sanitize');

function detectDocumentType(question) {
  const q = question || '';
  if (/起诉状|民事起诉/.test(q)) return '起诉状';
  if (/答辩状/.test(q)) return '答辩状';
  if (/律师函/.test(q)) return '律师函';
  if (/仲裁申请/.test(q)) return '仲裁申请书';
  if (/合同|协议/.test(q)) return '合同';
  if (/授权委托/.test(q)) return '授权委托书';
  return '其他文书';
}

function apiSuccess(data, message = '') {
  return { success: true, data, message };
}

function apiError(message, error = '', extra = {}) {
  return { success: false, message, error: error || message, ...extra };
}

function cleanAiContent(raw) {
  if (raw == null) return '';
  let s = String(raw).trim();
  s = s.replace(/^\uFEFF/, '');
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/g, '');
  const objMatch = s.match(/\{[\s\S]*\}/);
  if (objMatch) s = objMatch[0];
  return s.trim();
}

function safeParseJson(content) {
  const cleaned = cleanAiContent(content);
  if (!cleaned) {
    return {
      ok: false,
      message: 'AI返回JSON解析失败',
      error: '内容为空',
      raw_content: content
    };
  }
  try {
    const data = JSON.parse(cleaned);
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('根节点必须是 JSON 对象');
    }
    return { ok: true, data };
  } catch (e) {
    return {
      ok: false,
      message: 'AI返回JSON解析失败',
      error: String(e.message || e),
      raw_content: content
    };
  }
}

function asNonEmptyString(val, fallback) {
  const s = val == null ? '' : String(val).trim();
  return s || fallback;
}

function asStringArray(val, fallbackItem) {
  if (!Array.isArray(val)) {
    if (typeof val === 'string' && val.trim()) return [val.trim()];
    return fallbackItem ? [fallbackItem] : [];
  }
  const arr = val.map(v => String(v == null ? '' : v).trim()).filter(Boolean);
  return arr.length ? arr : (fallbackItem ? [fallbackItem] : []);
}

function defaultSignature() {
  return `此致\n\nXXX人民法院\n\n具状人：${PLACEHOLDER_LINE}\n${chineseDate()}`;
}

function normalizeWenshiData(raw, question) {
  const d = raw && typeof raw === 'object' ? raw : {};
  const q = asNonEmptyString(question, '用户咨询');
  const bodyRaw = asNonEmptyString(
    d.body_markdown || d.document_content || d.markdown,
    asNonEmptyString(d.summary, '暂无文书正文，请补充案情后重新生成')
  );
  const body = sanitizeLegalPlaceholders(bodyRaw);
  const riskNotes = asStringArray(d.risk_notes);
  const suggestions = asStringArray(d.suggestions, riskNotes.length ? riskNotes : ['建议咨询执业律师完善文书细节']);
  const evidence = asStringArray(d.evidence_list);

  return {
    doc_type: asNonEmptyString(d.doc_type, detectDocumentType(q)),
    title: sanitizeLegalPlaceholders(asNonEmptyString(d.title, '法律文书')),
    summary: sanitizeLegalPlaceholders(asNonEmptyString(d.summary, q.slice(0, 200))),
    risk_level: asNonEmptyString(d.risk_level, '中'),
    legal_basis: asStringArray(d.legal_basis, '请结合具体案由进一步检索法律依据')
      .map(sanitizeLegalPlaceholders),
    risk_notes: (riskNotes.length ? riskNotes : suggestions.slice(0, 3))
      .map(sanitizeLegalPlaceholders),
    suggestions: suggestions.map(sanitizeLegalPlaceholders),
    evidence_list: evidence.map(sanitizeLegalPlaceholders),
    body_markdown: body,
    document_content: body,
    signature: sanitizeLegalPlaceholders(asNonEmptyString(d.signature, defaultSignature())),
    followups: asStringArray(d.followups)
  };
}

function normalizeFaguiData(raw, query) {
  const d = raw && typeof raw === 'object' ? raw : {};
  let laws = Array.isArray(d.matched_laws) ? d.matched_laws : [];
  laws = laws.map(item => ({
    law_name: asNonEmptyString(item && item.law_name, '相关法律'),
    article: asNonEmptyString(item && item.article, '相关条款'),
    content: sanitizeLegalPlaceholders(asNonEmptyString(item && item.content, '请结合案情核对具体条文表述'))
  })).filter(l => l.law_name || l.article || l.content);

  if (!laws.length) {
    laws = [{
      law_name: '检索提示',
      article: '—',
      content: asNonEmptyString(
        d.analysis,
        '暂未匹配到具体法条，请补充关键词后重新检索：' + asNonEmptyString(query, '')
      )
    }];
  }

  return {
    keyword: asNonEmptyString(d.keyword, asNonEmptyString(query, '法规检索')),
    matched_laws: laws,
    analysis: sanitizeLegalPlaceholders(asNonEmptyString(d.analysis, '暂无综合分析')),
    risk_warning: sanitizeLegalPlaceholders(asNonEmptyString(d.risk_warning, '本结果仅供参考，不构成正式法律意见')),
    followups: asStringArray(d.followups)
  };
}

function plainTextToWenshi(raw, question) {
  const text = sanitizeLegalPlaceholders(String(raw || '').trim());
  return normalizeWenshiData({
    title: detectDocumentType(question) !== '其他文书' ? detectDocumentType(question) : '法律文书参考',
    summary: asNonEmptyString(question, '用户咨询'),
    risk_level: '中',
    legal_basis: ['请结合具体案由进一步检索法律依据'],
    suggestions: ['建议咨询执业律师完善文书细节'],
    body_markdown: text || '暂无文书正文',
    signature: defaultSignature()
  }, question);
}

function plainTextToFagui(raw, query) {
  const text = String(raw || '').trim();
  return {
    keyword: asNonEmptyString(query, '法规检索'),
    matched_laws: [{
      law_name: '智能体分析',
      article: '—',
      content: text || '暂无检索内容'
    }],
    analysis: text,
    risk_warning: '本结果仅供参考，不构成正式法律意见',
    followups: []
  };
}

const { taskPassthrough } = require('./yuanqi-ai');

/**
 * 透传用户内容至腾讯元器，并尝试解析 JSON 响应
 */
async function callYuanqiJson(userContent, options = {}) {
  const raw = await taskPassthrough(String(userContent || ''), {
    history: options.history,
    userId: options.userId
  });
  const parsed = safeParseJson(raw);
  if (parsed.ok) {
    return { raw, data: parsed.data, degraded: false };
  }

  if (options.fallback === 'wenshi') {
    console.warn('[callYuanqiJson] 元器未返回 JSON，文书生成降级为纯文本展示');
    return { raw, data: plainTextToWenshi(raw, userContent), degraded: true };
  }
  if (options.fallback === 'fagui') {
    console.warn('[callYuanqiJson] 元器未返回 JSON，法规检索降级为纯文本展示');
    return { raw, data: plainTextToFagui(raw, userContent), degraded: true };
  }

  const err = new Error(parsed.message);
  err.statusCode = 502;
  err.raw_content = parsed.raw_content;
  err.parseError = parsed.error;
  throw err;
}

module.exports = {
  apiSuccess,
  apiError,
  cleanAiContent,
  safeParseJson,
  normalizeWenshiData,
  normalizeFaguiData,
  detectDocumentType,
  callYuanqiJson
};

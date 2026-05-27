function stripMarkdown(text) {
  return String(text || '')
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/\*\*|__|`{1,3}/g, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/---+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function asString(v, fallback) {
  const s = String(v == null ? '' : v).trim();
  return s || (fallback || '');
}

function asArray(v) {
  if (!Array.isArray(v)) return [];
  return v;
}

function safeParse(content) {
  const raw = String(content || '').trim();
  if (!raw) return null;
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/g, '')
    .trim();
  try {
    const data = JSON.parse(cleaned);
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

function normalizeLawItems(laws) {
  return asArray(laws).map(function (item) {
    const it = item && typeof item === 'object' ? item : {};
    return {
      lawName: stripMarkdown(asString(it.law_name, '相关法律')),
      article: stripMarkdown(asString(it.article, '相关条文')),
      content: stripMarkdown(asString(it.content, '请结合官方法条数据库核验具体条文内容。')),
      interpretation: stripMarkdown(asString(it.interpretation, '请结合案情理解本条款的适用边界。')),
      scenario: stripMarkdown(asString(it.scenario, '适用于与检索问题相关的争议处理场景。'))
    };
  }).filter(function (x) {
    return x.lawName || x.content;
  });
}

function fallbackFromText(question, text) {
  const t = stripMarkdown(text);
  return {
    title: '法规检索结果',
    keyword: stripMarkdown(question || ''),
    laws: [{
      lawName: '检索提示',
      article: '—',
      content: t || '暂未返回结构化法条结果，请稍后重试。',
      interpretation: '请基于官方法条库进一步核验后再引用。',
      scenario: '适用于初步法规检索阶段。'
    }],
    analysis: t || '当前未获得稳定结构化结果。',
    practicalAdvice: '请补充更具体的案件关键词（主体、行为、争议点）后重试。',
    riskNotice: '法规检索结果仅供参考，正式法律意见应由执业律师审核。',
    followups: []
  };
}

function formatLegalSearchResult(question, rawContent) {
  const parsed = safeParse(rawContent);
  if (!parsed) return fallbackFromText(question, rawContent);
  const laws = normalizeLawItems(parsed.laws);
  return {
    title: stripMarkdown(asString(parsed.title, '法规检索结果')),
    keyword: stripMarkdown(asString(question, parsed.keyword || '')),
    laws: laws.length ? laws : fallbackFromText(question, rawContent).laws,
    analysis: stripMarkdown(asString(parsed.analysis, '请结合具体案情对条文进行逐项适用分析。')),
    practicalAdvice: stripMarkdown(asString(parsed.practical_advice, '建议结合证据与事实细节进一步咨询执业律师。')),
    riskNotice: stripMarkdown(asString(parsed.risk_notice, '法规检索结果仅供参考，正式法律意见应由执业律师审核。')),
    followups: asArray(parsed.followups).map(function (x) { return stripMarkdown(asString(x)); }).filter(Boolean)
  };
}

module.exports = {
  stripMarkdown,
  formatLegalSearchResult
};

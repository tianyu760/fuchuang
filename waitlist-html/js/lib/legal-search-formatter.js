/**
 * 法规检索结果格式化：去 Markdown + 结构化卡片数据
 */
(function (global) {
  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

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

  function normalizeLaw(law) {
    var x = law || {};
    return {
      lawName: stripMarkdown(x.lawName || x.law_name || '相关法律'),
      article: stripMarkdown(x.article || '相关条文'),
      content: stripMarkdown(x.content || ''),
      interpretation: stripMarkdown(x.interpretation || ''),
      scenario: stripMarkdown(x.scenario || '')
    };
  }

  function normalizePayload(data) {
    var d = data || {};
    var laws = Array.isArray(d.laws) ? d.laws.map(normalizeLaw) : [];
    if (!laws.length && Array.isArray(d.matched_laws)) {
      laws = d.matched_laws.map(function (it) {
        return normalizeLaw({
          law_name: it.law_name,
          article: it.article,
          content: it.content,
          interpretation: '',
          scenario: ''
        });
      });
    }
    return {
      title: stripMarkdown(d.title || '法规检索结果'),
      keyword: stripMarkdown(d.keyword || ''),
      laws: laws,
      analysis: stripMarkdown(d.analysis || ''),
      practicalAdvice: stripMarkdown(d.practicalAdvice || d.practical_advice || d.practical_advice || ''),
      riskNotice: stripMarkdown(d.riskNotice || d.risk_notice || d.risk_warning || '法规检索结果仅供参考。'),
      followups: Array.isArray(d.followups) ? d.followups.map(stripMarkdown).filter(Boolean) : []
    };
  }

  function renderLawCards(laws) {
    if (!laws || !laws.length) {
      return '<div class="ls-empty">未检索到结构化法条，请调整关键词后重试。</div>';
    }
    return laws.map(function (law, idx) {
      return '' +
        '<article class="ls-law-card">' +
        '  <div class="ls-law-card__head"><span class="ls-law-index">' + (idx + 1) + '</span>' +
        '    <div class="ls-law-meta"><h4>' + esc(law.lawName) + '</h4><p>' + esc(law.article) + '</p></div>' +
        '  </div>' +
        '  <div class="ls-law-content">' + esc(law.content) + '</div>' +
        (law.interpretation ? '<div class="ls-law-interpret"><strong>法条解析：</strong>' + esc(law.interpretation) + '</div>' : '') +
        (law.scenario ? '<div class="ls-law-scenario"><strong>适用场景：</strong>' + esc(law.scenario) + '</div>' : '') +
        '</article>';
    }).join('');
  }

  function renderLegalSearch(data) {
    var d = normalizePayload(data);
    var html = '';
    html += '<section class="ls-section"><h3>【相关法条】</h3><div class="ls-law-grid">' + renderLawCards(d.laws) + '</div></section>';
    html += '<section class="ls-section"><h3>【法条解析】</h3><p>' + esc(d.analysis || '请结合具体案情逐条适用。') + '</p></section>';
    html += '<section class="ls-section"><h3>【适用说明】</h3><p>' + esc(d.practicalAdvice || '建议结合完整证据材料进行实体与程序双重审查。') + '</p></section>';
    html += '<section class="ls-risk"><h3>⚠ 【风险提示】</h3><p>' + esc(d.riskNotice) + '</p></section>';
    return { normalized: d, html: html };
  }

  global.FayiLegalSearchFormatter = {
    stripMarkdown: stripMarkdown,
    normalizePayload: normalizePayload,
    renderLegalSearch: renderLegalSearch
  };
})(typeof window !== 'undefined' ? window : global);

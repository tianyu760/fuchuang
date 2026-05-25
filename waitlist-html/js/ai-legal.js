/**
 * 法绎 · 法律文书 / 法规检索 统一前端 AI 客户端
 */
(function (global) {
  var API_BASE = 'http://localhost:3002';
  var D = 'div';

  function escHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function md2html(raw) {
    var text = raw;
    if (global.FayiContentFormatter && FayiContentFormatter.sanitizeLegalText) {
      text = FayiContentFormatter.sanitizeLegalText(text);
    }
    if (global.FayiAIResponse && FayiAIResponse.normalizeChatOutput) {
      text = FayiAIResponse.normalizeChatOutput(raw);
    }
    if (global.FayiChatStyle && FayiChatStyle.formatChatHtml) {
      return FayiChatStyle.formatChatHtml(text, escHtml);
    }
    var normalized = global.FayiChatStyle && FayiChatStyle.normalizeConsultText
      ? FayiChatStyle.normalizeConsultText(raw)
      : String(raw || '');
    return normalized.split(/\n+/).map(function (p) {
      p = escHtml(p.trim());
      if (!p) return '';
      if (/^【.+】$/.test(p)) return '<div class="ai-section-title">' + p + '</div>';
      return '<p class="ai-md-p">' + p + '</p>';
    }).join('');
  }

  function postJson(path, body) {
    return fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      return r.json().then(function (json) {
        if (!r.ok || (json && json.success === false)) {
          var msg = (json && (json.message || json.error)) || ('HTTP ' + r.status);
          var err = new Error(msg);
          err.detail = json;
          throw err;
        }
        if (window.FayiRealtime && FayiRealtime.notify) {
          FayiRealtime.notify({ type: path });
        }
        return json;
      });
    });
  }

  function renderFollowups(followups, container, pillClass, onClick) {
    if (!container) return;
    if (!followups || !followups.length) {
      container.innerHTML = '';
      return;
    }
    var pillCls = pillClass || 'ai-followup-pill';
    var html = '<' + D + ' class="ai-followup-wrap"><' + D + ' class="ai-followup-label">您可能还想了解</' + D + '><' + D + ' class="ai-followup-pills">';
    followups.forEach(function (q) {
      html += '<button type="button" class="' + pillCls + '" data-q="' + escHtml(q) + '">' + escHtml(q) + '</button>';
    });
    html += '</' + D + '></' + D + '>';
    container.innerHTML = html;
    container.querySelectorAll('.' + pillCls).forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (onClick) onClick(btn.getAttribute('data-q'));
      });
    });
  }

  function renderWenshiResult(data) {
    var d = data || {};
    if (global.FayiContentFormatter && FayiContentFormatter.sanitizeLegalText) {
      d = Object.assign({}, d, {
        title: FayiContentFormatter.sanitizeLegalText(d.title || ''),
        summary: FayiContentFormatter.sanitizeLegalText(d.summary || ''),
        body_markdown: FayiContentFormatter.sanitizeLegalText(d.body_markdown || d.document_content || ''),
        document_content: FayiContentFormatter.sanitizeLegalText(d.document_content || d.body_markdown || ''),
        signature: FayiContentFormatter.sanitizeLegalText(d.signature || '')
      });
    }
    if (global.FayiLegalRender && FayiLegalRender.renderWenshiDocument) {
      var title = escHtml(d.title || '法律文书');
      var html = '<' + D + ' class="legal-doc-stage">';
      html += '<' + D + ' class="legal-doc-toolbar">';
      html += '<span class="legal-doc-toolbar__title">' + title + '</span>';
      html += '<' + D + ' class="legal-doc-toolbar__actions">';
      html += '<button type="button" id="legal-btn-pdf" class="legal-tool-btn legal-tool-btn--primary">导出 PDF</button>';
      html += '<button type="button" id="legal-btn-word" class="legal-tool-btn">另存为 Word</button>';
      html += '<button type="button" id="legal-btn-copy" class="legal-tool-btn">复制内容</button>';
      html += '<button type="button" id="legal-btn-regen" class="legal-tool-btn">重新生成</button>';
      html += '</' + D + '></' + D + '>';
      html += FayiLegalRender.renderWenshiDocument(d);
      html += '<p class="legal-doc-disclaimer">本内容仅供参考，不构成正式法律意见。提交法院前请咨询执业律师审核。</p>';
      html += '</' + D + '>';
      return html;
    }
    var risk = escHtml(d.risk_level || '中');
    var riskClass = /高/.test(risk) ? 'risk-high' : (/低/.test(risk) ? 'risk-low' : 'risk-mid');
    var html = '';
    html += '<h3 class="ai-result-title">' + escHtml(d.title) + '</h3>';
    html += '<p class="ai-meta"><span class="ai-risk ' + riskClass + '">风险等级：' + risk + '</span></p>';
    html += '<h4 class="ai-section-h">案情摘要</h4><' + D + ' class="ai-section-body">' + md2html(d.summary) + '</' + D + '>';
    if (d.legal_basis && d.legal_basis.length) {
      html += '<h4 class="ai-section-h">法律依据</h4><ul class="ai-list">';
      d.legal_basis.forEach(function (item) { html += '<li>' + escHtml(item) + '</li>'; });
      html += '</ul>';
    }
    if (d.suggestions && d.suggestions.length) {
      html += '<h4 class="ai-section-h">建议方案</h4><ul class="ai-list">';
      d.suggestions.forEach(function (item) { html += '<li>' + escHtml(item) + '</li>'; });
      html += '</ul>';
    }
    html += '<h4 class="ai-section-h">文书内容 / 要点</h4><' + D + ' class="ai-doc-block">' + md2html(d.document_content) + '</' + D + '>';
    return html;
  }

  function renderFaguiResult(data) {
    var d = data || {};
    var html = '<p class="ai-meta"><strong>检索关键词：</strong>' + escHtml(d.keyword) + '</p>';
    if (d.matched_laws && d.matched_laws.length) {
      html += '<h4 class="ai-section-h">匹配法条（' + d.matched_laws.length + ' 条）</h4><' + D + ' class="ai-law-list">';
      d.matched_laws.forEach(function (law, idx) {
        html += '<article class="ai-law-card"><' + D + ' class="ai-law-card__hd"><span class="ai-law-idx">' + (idx + 1) + '</span>';
        html += '<strong>' + escHtml(law.law_name) + '</strong>';
        if (law.article) html += ' <span class="ai-law-article">' + escHtml(law.article) + '</span>';
        html += '</' + D + '><p class="ai-law-card__body">' + escHtml(law.content) + '</p></article>';
      });
      html += '</' + D + '>';
    }
    html += '<h4 class="ai-section-h">综合分析</h4><' + D + ' class="ai-section-body">' + md2html(d.analysis) + '</' + D + '>';
    html += '<h4 class="ai-section-h">风险提示</h4><p class="ai-warning">' + escHtml(d.risk_warning) + '</p>';
    return html;
  }

  function wenshiToMarkdown(data, question) {
    var d = data || {};
    var lines = [];
    if (question) lines.push('# ' + (d.title || '法律文书') + '\n\n> 用户诉求：' + question);
    else if (d.title) lines.push('# ' + d.title);
    if (d.risk_level) lines.push('\n**风险等级：** ' + d.risk_level);
    if (d.summary) lines.push('\n## 案情摘要\n\n' + d.summary);
    if (d.legal_basis && d.legal_basis.length) {
      lines.push('\n## 法律依据');
      d.legal_basis.forEach(function (item) { lines.push('- ' + item); });
    }
    var risks = d.risk_notes || d.suggestions || [];
    if (risks.length) {
      lines.push('\n## 风险提示');
      risks.forEach(function (item) { lines.push('- ' + item); });
    }
    if (d.evidence_list && d.evidence_list.length) {
      lines.push('\n## 证据目录');
      d.evidence_list.forEach(function (item, i) { lines.push((i + 1) + '. ' + item); });
    }
    var body = d.body_markdown || d.document_content;
    if (body) lines.push('\n## 文书正文\n\n' + body);
    if (d.signature) lines.push('\n---\n\n' + d.signature);
    return lines.join('\n');
  }

  function faguiToMarkdown(data, query) {
    var d = data || {};
    var lines = [];
    lines.push('# 法规检索报告');
    if (query) lines.push('\n> 检索问题：' + query);
    if (d.keyword) lines.push('\n**关键词：** ' + d.keyword);
    if (d.matched_laws && d.matched_laws.length) {
      lines.push('\n## 匹配法条');
      d.matched_laws.forEach(function (law, idx) {
        lines.push('\n### ' + (idx + 1) + '. ' + (law.law_name || '') + (law.article ? ' ' + law.article : ''));
        if (law.content) lines.push('\n> ' + law.content.replace(/\n/g, '\n> '));
      });
    }
    if (d.analysis) lines.push('\n## 综合分析\n\n' + d.analysis);
    if (d.risk_warning) lines.push('\n## 风险提示\n\n' + d.risk_warning);
    return lines.join('\n');
  }

  global.FayiAiLegal = {
    API_BASE: API_BASE,
    escHtml: escHtml,
    md2html: md2html,
    wenshiToMarkdown: wenshiToMarkdown,
    faguiToMarkdown: faguiToMarkdown,
    renderFollowups: renderFollowups,
    renderWenshiResult: renderWenshiResult,
    renderFaguiResult: renderFaguiResult,
    generateWenshi: function (question, history, options) {
      if (global.FayiAI) return FayiAI.generateWenshi(question, history, options);
      return postJson('/api/wenshi/generate', {
        question: question,
        history: history || [],
        conversationId: options && options.conversationId
      });
    },
    searchFagui: function (query, history, options) {
      if (global.FayiAI) return FayiAI.searchFagui(query, history, options);
      return postJson('/api/fagui/search', {
        query: query,
        history: history || [],
        conversationId: options && options.conversationId
      });
    }
  };
})(typeof window !== 'undefined' ? window : global);

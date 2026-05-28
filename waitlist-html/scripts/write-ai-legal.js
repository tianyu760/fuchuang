const fs = require('fs');
const path = require('path');
const out = path.join(__dirname, '..', 'js', 'ai-legal.js');
const D = 'div';

const content = `/**
 * 法绎 · 法律文书 / 法规检索 统一前端 AI 客户端
 */
(function (global) {
  var API_BASE = 'http://localhost:3002';
  var D = '${D}';

  function escHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function md2html(raw) {
    var s = escHtml(raw)
      .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
      .replace(/^#{1,3}\\s+(.+)$/gm, '<h4 class="ai-md-h4">$1</h4>')
      .replace(/^[-*]\\s+(.+)$/gm, '<li class="ai-md-li">$1</li>');
    s = s.replace(/(<li class="ai-md-li">[\\s\\S]*?<\\/li>\\s*)+/g, function (m) {
      return '<ul class="ai-md-ul">' + m + '</ul>';
    });
    return s.split(/\\n\\n+/).map(function (p) {
      if (/^<(h4|ul)/.test(p.trim())) return p;
      return '<p class="ai-md-p">' + p.replace(/\\n/g, '<br>') + '</p>';
    }).join('');
  }

  function postJson(path, body) {
    return fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      return r.json().then(function (json) {
        if (!r.ok || (json && json.success === false)) {
          var msg = (json && (json.message || json.error)) || ('HTTP ' + r.status);
          var err = new Error(msg);
          err.detail = json;
          throw err;
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

  global.FayiAiLegal = {
    API_BASE: API_BASE,
    escHtml: escHtml,
    md2html: md2html,
    renderFollowups: renderFollowups,
    renderWenshiResult: renderWenshiResult,
    renderFaguiResult: renderFaguiResult,
    generateWenshi: function (question, history) {
      return postJson('/api/wenshi/generate', { question: question, history: history || [] });
    },
    searchFagui: function (query, history) {
      return postJson('/api/fagui/search', { query: query, history: history || [] });
    }
  };
})(typeof window !== 'undefined' ? window : global);
`;

fs.writeFileSync(out, content, 'utf8');
console.log('written', out);

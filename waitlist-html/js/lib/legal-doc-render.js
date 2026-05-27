/**
 * 简化版法律文书渲染：纯文本 -> 自动排版
 */
(function (global) {
  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatLegalText(raw) {
    return String(raw || '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/^\s*#{1,6}\s*/gm, '')
      .replace(/\*\*|__|`{1,3}/g, '')
      .replace(/^\s*>\s?/gm, '')
      .replace(/^\s*(以下是|当然可以|作为AI|我作为AI)[^\n]*$/gim, '')
      .replace(/⟦[^⟧]*⟧/g, '________________')
      .replace(/^\s*[-*]\s+/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function splitTitleAndBody(text, fallbackTitle) {
    var lines = formatLegalText(text).split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    if (!lines.length) return { title: fallbackTitle || '法律文书', body: [] };
    var first = lines[0];
    var isTitle = /状|书|函|合同|申请/.test(first) && first.length <= 20;
    return {
      title: isTitle ? first.replace(/^《|》$/g, '') : (fallbackTitle || '法律文书'),
      body: isTitle ? lines.slice(1) : lines
    };
  }

  function wrapLine(line) {
    var t = line.trim();
    if (!t) return '';
    var isNumbered = /^(?:[一二三四五六七八九十]+[、.]|（[一二三四五六七八九十]+）|\d+[、.])/.test(t);
    var cls = isNumbered ? 'legal-line legal-line--numbered' : 'legal-line';
    return '<p class="' + cls + '">' + esc(t) + '</p>';
  }

  function renderWenshiDocument(data) {
    var d = data || {};
    var merged = d.document_content || d.body_markdown || '';
    var parsed = splitTitleAndBody(merged, d.title || '法律文书');
    var html = '<article class="legal-doc-paper" id="legal-doc-paper">';
    html += '<h1 class="legal-doc-title">' + esc(parsed.title) + '</h1>';
    html += '<section class="legal-doc-body">';
    html += parsed.body.map(wrapLine).join('');
    html += '</section></article>';
    return html;
  }

  global.FayiLegalRender = {
    formatLegalText: formatLegalText,
    renderWenshiDocument: renderWenshiDocument
  };
})(typeof window !== 'undefined' ? window : global);

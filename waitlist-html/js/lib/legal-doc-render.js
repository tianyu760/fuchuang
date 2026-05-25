/**
 * 法律文书 Markdown → HTML 渲染（独立于聊天 IM 样式，避免 ⟦B:⟧ 污染）
 */
(function (global) {
  var sanitize = global.FayiLegalSanitize && FayiLegalSanitize.sanitizeLegalPlaceholders
    ? FayiLegalSanitize.sanitizeLegalPlaceholders
    : function (s) { return s || ''; };

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtText(s) {
    var out = sanitize(s || '');
    if (global.FayiContentFormatter && FayiContentFormatter.formatLegalText) {
      out = FayiContentFormatter.formatLegalText(out, { tone: 'formal_legal' });
    } else if (global.FayiContentFormatter && FayiContentFormatter.sanitizeLegalText) {
      out = FayiContentFormatter.sanitizeLegalText(out);
    }
    return out;
  }

  function cleanAiFlavor(text) {
    return String(text || '')
      .replace(/^\s*(以下是|根据您的情况|结合你的情况|建议您|建议你|AI分析|综合来看)[^\n]*$/gim, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function normalizePlaceholder(s) {
    var t = String(s || '');
    if (global.FayiContentFormatter && FayiContentFormatter.shortenPlaceholders) {
      return FayiContentFormatter.shortenPlaceholders(t);
    }
    return t.replace(/_{10,}/g, '________').replace(/【待填写】/g, '[ 待填写 ]');
  }

  var LEGAL_DOC_TYPOGRAPHY = {
    h1: 22,
    h2: 16,
    body: 14,
    law: 13,
    risk: 13,
    signature: 14,
    footer: 12
  };

  var FIELD_WIDTH = {
    short: 80,
    medium: 180,
    long: 320,
    address: 420
  };

  function cleanFieldValue(s) {
    return String(s || '')
      .replace(/_{2,}/g, '')
      .replace(/[—＿]+/g, '')
      .replace(/\[\s*待填写\s*\]/g, '')
      .trim();
  }

  function getFieldWidth(type, value) {
    if (type === 'case_no') {
      var len = cleanFieldValue(value).length || 12;
      return Math.max(FIELD_WIDTH.medium, Math.min(FIELD_WIDTH.long, len * 11 + 24));
    }
    return FIELD_WIDTH[type] || FIELD_WIDTH.medium;
  }

  function generateFieldLine(type, value) {
    var kind = FIELD_WIDTH[type] ? type : (type === 'case_no' ? 'case_no' : 'medium');
    var width = getFieldWidth(kind, value);
    var text = cleanFieldValue(normalizePlaceholder(fmtText(value || '')));
    var cls = kind === 'case_no' ? 'medium' : kind;
    return '' +
      '<span class="legal-field-line legal-field-line--' + cls + '" style="width:' + width + 'px;">' +
      '<span class="legal-field-line__text">' + esc(text || ' ') + '</span>' +
      '</span>';
  }

  function fieldLine(label, value, type) {
    return '' +
      '<div class="legal-field legal-field--' + esc(type || 'medium') + '">' +
      '  <span class="legal-field__label">' + esc(label) + '：</span>' +
      '  <span class="legal-field__input">' + generateFieldLine(type || 'medium', value) + '</span>' +
      '</div>';
  }

  function renderMarkdownLegal(md) {
    md = fmtText(md);
    md = cleanAiFlavor(md);
    if (!md) return '<p class="legal-p">（暂无正文）</p>';

    if (global.marked && marked.parse) {
      try {
        marked.setOptions({ breaks: true, gfm: true });
        var html = marked.parse(md);
        html = html.replace(/⟦B:([^⟧]*)⟧/g, function (_, inner) {
          return (inner && inner.trim()) ? '<strong>' + esc(inner.trim()) + '</strong>' : '________________';
        }).replace(/⟦[^⟧]*⟧/g, '【待填写】');
        html = html.replace(/<h1/gi, '<h3 class="legal-h3"').replace(/<\/h1>/gi, '</h3>');
        html = html.replace(/<h2/gi, '<h3 class="legal-h3"').replace(/<\/h2>/gi, '</h3>');
        html = html.replace(/<blockquote/gi, '<blockquote class="legal-law-quote"');
        html = sanitize(html);
        if (global.FayiContentFormatter && FayiContentFormatter.sanitizeLegalHtml) {
          html = FayiContentFormatter.sanitizeLegalHtml(html);
        }
        return html;
      } catch (e) { /* fallback */ }
    }

    return md.split(/\n\n+/).map(function (block) {
      block = block.trim();
      if (!block) return '';
      if (/^#\s/.test(block)) {
        return '<h1 class="legal-h1">' + esc(block.replace(/^#\s+/, '')) + '</h1>';
      }
      if (/^##\s/.test(block)) {
        return '<h2 class="legal-h2">' + esc(block.replace(/^##\s+/, '')) + '</h2>';
      }
      if (/^>\s/.test(block)) {
        return '<blockquote class="legal-quote">' + esc(block.replace(/^>\s?/gm, '')).replace(/\n/g, '<br/>') + '</blockquote>';
      }
      if (/^[-*]\s/.test(block)) {
        var items = block.split(/\n/).map(function (l) {
          return '<li>' + esc(l.replace(/^[-*]\s+/, '')) + '</li>';
        }).join('');
        return '<ul class="legal-ul">' + items + '</ul>';
      }
      if (/^\d+[\.、）)]\s/.test(block)) {
        var oitems = block.split(/\n/).map(function (l) {
          return '<li>' + esc(l.replace(/^\d+[\.、）)]\s+/, '')) + '</li>';
        }).join('');
        return '<ol class="legal-ol">' + oitems + '</ol>';
      }
      return '<p class="legal-p">' + esc(block).replace(/\n/g, '<br/>') + '</p>';
    }).join('');
  }

  function renderSignature(sig) {
    sig = fmtText(sig || '');
    if (!sig) return '';
    var lines = sig.split(/\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    var court = lines.find(function (l) { return /人民法院/.test(l); }) || '';
    var signer = lines.find(function (l) { return /(具状人|答辩人|申请人|原告|被告)/.test(l); }) || '';
    var date = lines.find(function (l) { return /年.*月.*日/.test(l); }) || '';
    return '' +
      '<section class="legal-section legal-section--signature">' +
      '  <h2 class="legal-h2">落款</h2>' +
      '  <div class="legal-signature">' +
      '    <p>此致</p>' +
      '    <p><span class="legal-signature__label">受理法院：</span>' + generateFieldLine('long', court) + '</p>' +
      '    <p class="legal-signature__spacer"></p>' +
      '    <p><span class="legal-signature__label">当事人：</span>' + generateFieldLine('medium', normalizePlaceholder(signer)) + '</p>' +
      '    <p><span class="legal-signature__label">日期：</span>' + generateFieldLine('medium', normalizePlaceholder(date)) + '</p>' +
      '  </div>' +
      '</section>';
  }

  function renderLegalBasis(list) {
    var items = Array.isArray(list) ? list : [];
    if (!items.length) items = ['《相关法律法规》第____条：请结合案情补充具体法条内容。'];
    return '' +
      '<section class="legal-section legal-section--law">' +
      '  <h2 class="legal-h2">法律依据</h2>' +
      '  <div class="legal-law-list">' +
      items.map(function (item, idx) {
        return '' +
          '<div class="legal-law-item">' +
          '  <div class="legal-law-item__index">' + (idx + 1) + '.</div>' +
          '  <blockquote class="legal-law-quote">' + esc(fmtText(item)) + '</blockquote>' +
          '</div>';
      }).join('') +
      '  </div>' +
      '</section>';
  }

  function renderRiskNotes(list) {
    var items = Array.isArray(list) ? list : [];
    if (!items.length) return '';
    return '' +
      '<section class="legal-section legal-section--risk">' +
      '  <h2 class="legal-h2">风险提示</h2>' +
      '  <div class="legal-risk-card">' +
      '    <ul>' +
      items.map(function (item) {
        return '<li>' + esc(fmtText(item)) + '</li>';
      }).join('') +
      '    </ul>' +
      '  </div>' +
      '</section>';
  }

  function renderWenshiDocument(data) {
    var d = data || {};
    var body = fmtText(d.body_markdown || d.document_content || d.markdown || '');
    body = cleanAiFlavor(body);
    var risks = d.risk_notes || d.suggestions || [];

    var html = '';
    html += '<article class="legal-doc-paper" id="legal-doc-paper">';
    html += '<header class="legal-doc-header"><h1 class="legal-h1">' + esc(fmtText(d.title || '法律文书')) + '</h1></header>';

    html += '<section class="legal-section legal-section--info">';
    html += '<h2 class="legal-h2">基础信息区</h2>';
    html += '<div class="legal-fields-grid">';
    html += fieldLine('答辩人', d.respondent || d.party_name || '', 'short');
    html += fieldLine('性别', d.gender || '', 'short');
    html += fieldLine('出生日期', d.birth_date || '', 'medium');
    html += fieldLine('身份证号', d.id_number || '', 'medium');
    html += fieldLine('联系电话', d.contact || d.phone || '', 'medium');
    html += fieldLine('住址', d.address || '', 'address');
    html += '</div></section>';

    html += '<section class="legal-section legal-section--info">';
    html += '<h2 class="legal-h2">案件信息区</h2>';
    html += '<div class="legal-fields-grid">';
    html += fieldLine('案号', d.case_no || '', 'case_no');
    html += fieldLine('案由', d.case_cause || d.doc_type || '', 'long');
    html += fieldLine('原告', d.plaintiff || '', 'medium');
    html += fieldLine('被告', d.defendant || '', 'medium');
    html += fieldLine('受理法院', d.court || '', 'long');
    html += '</div></section>';

    html += '<section class="legal-section legal-section--body">';
    html += '<h2 class="legal-h2">正文区</h2>';
    if (d.summary) {
      html += '<h3 class="legal-h3">一、案件概况</h3><p class="legal-p">' + esc(fmtText(d.summary)) + '</p>';
    }
    html += '<h3 class="legal-h3">' + (d.summary ? '二、事实与理由' : '一、事实与理由') + '</h3>';
    html += '<div class="legal-doc-body">' + renderMarkdownLegal(body) + '</div>';
    if (d.evidence_list && d.evidence_list.length) {
      html += '<h3 class="legal-h3">证据目录</h3><ol class="legal-evidence-list">';
      d.evidence_list.forEach(function (item) { html += '<li>' + esc(fmtText(item)) + '</li>'; });
      html += '</ol>';
    }
    html += '</section>';

    html += renderLegalBasis(d.legal_basis || []);
    html += renderRiskNotes(risks);
    html += renderSignature(d.signature || '');
    html += '</article>';

    return html;
  }

  global.FayiLegalRender = {
    LEGAL_DOC_TYPOGRAPHY: LEGAL_DOC_TYPOGRAPHY,
    FIELD_WIDTH: FIELD_WIDTH,
    generateFieldLine: generateFieldLine,
    renderMarkdownLegal: renderMarkdownLegal,
    renderWenshiDocument: renderWenshiDocument
  };
})(typeof window !== 'undefined' ? window : global);

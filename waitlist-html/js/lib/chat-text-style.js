/**
 * 法绎 · AI 回复展示层渲染（纯前端，不改后端/元器）
 * formatAIResponse：去 Markdown 标题 + ChatGPT 风格排版
 */
(function (global) {
  var PLAIN_CHAT_MODE = true;

  var LEGAL_KEYWORDS = [
    '核心诉求', '风险提示', '风险点', '法律风险', '建议', '证据材料', '证据清单',
    '适用法条', '法律依据', '注意事项', '结论', '处理建议', '维权路径',
    '诉讼时效', '管辖法院', '赔偿标准', '责任认定', '关键事实', '案件概况',
    '行动建议', '下一步', '重点提示', '免责声明'
  ];

  function defaultEsc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function isTableRow(line) {
    var t = line.trim();
    return t.indexOf('|') >= 0 && (t.charAt(0) === '|' || /\|.+\|/.test(t));
  }

  function isTableSeparator(line) {
    return /^\|?[\s\-:|]+\|?$/.test(line.trim()) && line.indexOf('-') >= 0;
  }

  function parseTableCells(row) {
    return row.split('|').map(function (c) { return c.trim(); }).filter(function (c) {
      return c && !/^[-:]+$/.test(c);
    });
  }

  /** 解析 Markdown 为结构化块（去 # 标题，保留层级） */
  function filterMarkdown(raw) {
    if (raw == null) return [];
    var text = String(raw).replace(/\r\n/g, '\n');
    if (global.FayiContentFormatter && FayiContentFormatter.formatLegalText) {
      text = FayiContentFormatter.formatLegalText(text, { tone: 'formal_legal', enforceSections: true });
    }

    text = text.replace(/```[\s\S]*?```/g, function (block) {
      return block.replace(/^```\w*\n?/, '').replace(/\n?```$/, '').trim();
    });

    var lines = text.split('\n');
    var out = [];
    var tableBuf = [];

    function flushTable() {
      if (!tableBuf.length) return;
      var dataRows = [];
      tableBuf.forEach(function (row) {
        if (isTableSeparator(row)) return;
        var cells = parseTableCells(row);
        if (cells.length) dataRows.push(cells);
      });
      if (dataRows.length === 1) {
        out.push({ type: 'list', text: dataRows[0].join(' · ') });
      } else if (dataRows.length > 1) {
        var header = dataRows[0];
        for (var i = 1; i < dataRows.length; i++) {
          var parts = [];
          for (var j = 0; j < dataRows[i].length; j++) {
            parts.push((header[j] || ('项' + (j + 1))) + '：' + dataRows[i][j]);
          }
          out.push({ type: 'list', text: parts.join('；') });
        }
      }
      tableBuf = [];
    }

    lines.forEach(function (line) {
      var t = line.replace(/\t/g, ' ').replace(/\s+$/g, '');

      if (isTableRow(t)) {
        tableBuf.push(t);
        return;
      }
      if (tableBuf.length) flushTable();

      if (/^[-*_]{3,}\s*$/.test(t.trim())) return;
      if (/^>\s?/.test(t)) t = t.replace(/^>\s?/, '');

      var hash = t.match(/^([#＃]{1,6})\s*(.+)$/);
      if (hash) {
        var level = hash[1].length <= 2 ? 1 : 2;
        var title = hash[2].trim().replace(/^[#＃]+\s*/, '').replace(/\s*[#＃]+\s*$/, '');
        if (title && !/^[#＃]+$/.test(title)) {
          out.push({ type: level === 1 ? 'title-l1' : 'title-l2', text: title });
        }
        return;
      }
      if (/^[#＃]{1,6}$/.test(t.trim())) return;

      var ordered = t.match(/^[\s]*(\d+)[\.、)\]]\s+(.+)$/);
      if (ordered) {
        out.push({ type: 'list', text: ordered[2].trim() });
        return;
      }

      var list = t.match(/^[\s]*[-*+•]\s+(.+)$/);
      if (list) {
        out.push({ type: 'list', text: list[1].trim() });
        return;
      }

      t = t.replace(/\*\*(.+?)\*\*/g, '⟦B:$1⟧');
      t = t.replace(/__(.+?)__/g, '⟦B:$1⟧');
      t = t.replace(/\*(.+?)\*/g, '$1');
      t = t.replace(/_(.+?)_/g, '$1');
      t = t.replace(/`([^`]+)`/g, '$1');
      t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

      if (!t.trim()) {
        out.push({ type: 'break' });
        return;
      }

      var trimmed = t.trim().replace(/^\s*[#＃]{1,6}\s*/, '');
      if (!trimmed) return;
      if (/^【.+】$/.test(trimmed)) {
        out.push({ type: 'title-l1', text: trimmed.replace(/^【|】$/g, '') });
        return;
      }
      if (/^([一二三四五六七八九十百千]+[、.．]|（[一二三四五六七八九十]+）|\d+[\.、．])/.test(trimmed)
          && trimmed.length <= 48 && !/[。！？；，]$/.test(trimmed)) {
        out.push({ type: 'title-l2', text: trimmed });
        return;
      }
      if (/^[^：:\n]{2,24}[：:]\s*$/.test(trimmed)) {
        out.push({ type: 'title-l2', text: trimmed.replace(/[：:]\s*$/, '') });
        return;
      }

      out.push({ type: 'paragraph', text: trimmed });
    });

    if (tableBuf.length) flushTable();
    return out;
  }

  function highlightKeywordsAndBold(text, esc) {
    var safe = esc(text);
    safe = safe.replace(/⟦B:([^⟧]+)⟧/g, '<strong class="ai-emphasis">$1</strong>');
    LEGAL_KEYWORDS.forEach(function (kw) {
      var re = new RegExp('(' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'g');
      safe = safe.replace(re, '<span class="ai-kw">$1</span>');
    });
    return safe;
  }

  /** 主入口：清洗 + 排版 + HTML */
  function formatAIResponse(content, escapeHtml) {
    if (!PLAIN_CHAT_MODE) return String(content || '');
    var esc = escapeHtml || defaultEsc;
    var blocks = filterMarkdown(content);
    if (!blocks.length) {
      return '<div class="ai-message ai-chat-plain"></div>';
    }

    var parts = ['<div class="ai-message ai-chat-plain">'];
    var inList = false;

    function closeList() {
      if (inList) {
        parts.push('</ul>');
        inList = false;
      }
    }

    blocks.forEach(function (block) {
      if (block.type === 'break') {
        closeList();
        parts.push('<div class="ai-paragraph-break"></div>');
        return;
      }

      var html = highlightKeywordsAndBold(block.text, esc);

      if (block.type === 'title-l1') {
        closeList();
        parts.push('<div class="ai-title-l1">' + html + '</div>');
        return;
      }
      if (block.type === 'title-l2') {
        closeList();
        parts.push('<div class="ai-title-l2">' + html + '</div>');
        return;
      }
      if (block.type === 'list') {
        if (!inList) {
          parts.push('<ul class="ai-list">');
          inList = true;
        }
        parts.push('<li class="ai-list-item">' + html + '</li>');
        return;
      }

      closeList();
      if (/^(注意|重要|提示|建议|警告|提醒|关键|免责)/.test(block.text)) {
        parts.push('<p class="ai-paragraph ai-tip-line">' + html + '</p>');
      } else {
        parts.push('<p class="ai-paragraph">' + html + '</p>');
      }
    });

    closeList();
    parts.push('</div>');
    return parts.join('');
  }

  function normalizeConsultText(raw) {
    var blocks = filterMarkdown(raw);
    return blocks.filter(function (b) { return b.type !== 'break'; })
      .map(function (b) {
        return b.text.replace(/⟦B:([^⟧]+)⟧/g, '$1').replace(/⟦[^⟧]*⟧/g, '【待填写】');
      }).join('\n').trim();
  }

  /** 兼容旧接口 */
  function formatChatHtml(content, escapeHtml, options) {
    if (options && options.tone === 'formal_legal' && global.FayiContentFormatter && FayiContentFormatter.formatLegalText) {
      content = FayiContentFormatter.formatLegalText(content, { tone: 'formal_legal', enforceSections: true });
    }
    return formatAIResponse(content, escapeHtml);
  }

  global.FayiChatStyle = {
    PLAIN_CHAT_MODE: PLAIN_CHAT_MODE,
    filterMarkdown: function (raw) {
      return normalizeConsultText(raw);
    },
    normalizeConsultText: normalizeConsultText,
    formatAIResponse: formatAIResponse,
    formatChatHtml: formatChatHtml
  };
})(typeof window !== 'undefined' ? window : global);

/**
 * 服务端 Markdown 过滤器（与前端 filterMarkdown 逻辑一致，供可选后处理）
 */
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

function filterMarkdown(raw) {
  if (raw == null) return '';
  var text = String(raw).replace(/\r\n/g, '\n');

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
      out.push('· ' + dataRows[0].join(' · '));
    } else if (dataRows.length > 1) {
      var header = dataRows[0];
      for (var i = 1; i < dataRows.length; i++) {
        var parts = [];
        for (var j = 0; j < dataRows[i].length; j++) {
          parts.push((header[j] || ('项' + (j + 1))) + '：' + dataRows[i][j]);
        }
        out.push('· ' + parts.join('；'));
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

    var hash = t.match(/^#{1,6}\s*(.+)$/);
    if (hash) {
      var title = hash[1].trim().replace(/^#+\s*/, '');
      if (!title || /^#+$/.test(title)) return;
      out.push(/^【.+】$/.test(title) ? title : '【' + title + '】');
      return;
    }
    if (/^#{1,6}$/.test(t.trim())) return;

    var ordered = t.match(/^[\s]*(\d+)[\.、)\]]\s+(.+)$/);
    if (ordered) {
      out.push(ordered[1] + '. ' + ordered[2].trim());
      return;
    }

    var list = t.match(/^[\s]*[-*+•]\s+(.+)$/);
    if (list) {
      out.push('· ' + list[1].trim());
      return;
    }

    t = t.replace(/\*\*(.+?)\*\*/g, '$1');
    t = t.replace(/__(.+?)__/g, '$1');
    t = t.replace(/\*(.+?)\*/g, '$1');
    t = t.replace(/_(.+?)_/g, '$1');
    t = t.replace(/`([^`]+)`/g, '$1');
    t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

    if (t.trim()) out.push(t);
  });

  if (tableBuf.length) flushTable();
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function normalizeConsultText(raw) {
  return filterMarkdown(raw);
}

module.exports = { filterMarkdown, normalizeConsultText };

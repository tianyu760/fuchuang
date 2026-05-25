/**
 * 文书内容后处理：乱码修复、标签泄露清理、基础排版标准化
 */
(function (global) {
  var ALLOWED_TAGS = {
    p: 1, h1: 1, h2: 1, h3: 1, h4: 1, h5: 1, h6: 1,
    ul: 1, ol: 1, li: 1, blockquote: 1, strong: 1, em: 1,
    br: 1, hr: 1, div: 1, span: 1, article: 1, section: 1
  };

  function asText(v) {
    return v == null ? '' : String(v);
  }

  function stripLeakedTagText(text) {
    return asText(text)
      .replace(/(^|[\s>])\/(span|h1|h2|h3|h4|h5|h6|p|button|div|li|ul|ol|section|article)>/gi, '$1')
      .replace(/(^|[\s>])<(span|h1|h2|h3|h4|h5|h6|p|button|div|li|ul|ol|section|article)\s*$/gim, '$1');
  }

  function stripBrokenUnicode(text) {
    return asText(text)
      .replace(/�?/g, '')
      .replace(/�/g, '')
      .replace(/\uFEFF/g, '');
  }

  function removeMarkdownHeadingTokens(text) {
    return asText(text).split('\n').map(function (line) {
      return line.replace(/^\s*[#＃]{1,6}\s+/, '');
    }).join('\n');
  }

  function normalizeParagraphs(text) {
    return asText(text)
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function shortenPlaceholders(text) {
    return asText(text)
      .replace(/_{10,}/g, '________')
      .replace(/-{10,}/g, '________')
      .replace(/（\s*待填写\s*）/g, '[ 待填写 ]')
      .replace(/【待填写】/g, '[ 待填写 ]');
  }

  function splitLongParagraphs(text) {
    return asText(text).split('\n').map(function (line) {
      var t = line.trim();
      if (!t) return '';
      if (t.length <= 110) return line;
      if (/^(一、|二、|三、|四、|五、|六、|七、|八、|九、|\d+[\.、])/.test(t)) return line;
      return t.replace(/([。；！？])/g, '$1\n').replace(/\n{2,}/g, '\n');
    }).join('\n');
  }

  function toFormalLegalTone(text) {
    var out = asText(text);
    var banMap = [
      [/以下是/g, '现就相关事项说明如下'],
      [/根据您的情况|结合你的情况|结合您当前情况/g, '结合现有事实材料'],
      [/建议您|建议你/g, '建议当事人'],
      [/AI分析|智能体分析|模型分析/g, '法律分析'],
      [/综合来看|简单来说/g, '综合判断如下'],
      [/你可以|您可以/g, '当事人可'],
      [/我认为|我建议/g, '建议'],
      [/AI生成|AI输出|智能体回复/g, '法律意见文本'],
      [/综合来看/g, '经审阅现有材料']
    ];
    banMap.forEach(function (pair) {
      out = out.replace(pair[0], pair[1]);
    });
    out = out.replace(/\b(tone|formal_legal)\b/gi, '');
    return out;
  }

  function normalizeLegalSections(text) {
    var src = normalizeParagraphs(toFormalLegalTone(text));
    if (!src) return src;

    var hasStructured = /(案件概况|争议焦点|法律依据|风险提示|建议行动|可生成文书)/.test(src);
    if (hasStructured) return src;

    var lines = src.split('\n').filter(function (l) { return l.trim(); });
    var brief = lines.slice(0, 2).join('\n');
    return [
      '案件概况：',
      brief || '请补充核心事实后继续分析。',
      '',
      '争议焦点：',
      '请补充劳动关系成立事实、解除过程及争议金额。',
      '',
      '法律依据：',
      '请补充关键事实后再匹配具体法条。',
      '',
      '风险提示：',
      '材料不足时结论可能偏差，应先完成事实校验。',
      '',
      '建议行动：',
      '先补全时间线、证据清单和诉求目标。',
      '',
      '可生成文书：',
      '劳动仲裁申请书、证据目录、答辩意见书。'
    ].join('\n');
  }

  function sanitizeLegalText(text) {
    var out = asText(text);
    out = stripBrokenUnicode(out);
    out = stripLeakedTagText(out);
    out = removeMarkdownHeadingTokens(out);
    out = shortenPlaceholders(out);
    out = splitLongParagraphs(out);
    out = normalizeParagraphs(out);
    return out;
  }

  function formatLegalText(text, options) {
    options = options || {};
    var out = sanitizeLegalText(text);
    if (options.tone === 'formal_legal') {
      out = toFormalLegalTone(out);
      out = shortenPlaceholders(out);
      out = splitLongParagraphs(out);
      if (options.enforceSections) {
        out = normalizeLegalSections(out);
      }
      out = normalizeParagraphs(out);
    }
    return out;
  }

  function sanitizeLegalHtml(html) {
    var input = stripBrokenUnicode(stripLeakedTagText(html));
    if (typeof window === 'undefined' || !window.DOMParser) {
      return input
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
        .replace(/\son\w+="[^"]*"/gi, '')
        .replace(/\son\w+='[^']*'/gi, '');
    }

    try {
      var parser = new DOMParser();
      var doc = parser.parseFromString('<div>' + input + '</div>', 'text/html');
      var root = doc.body && doc.body.firstElementChild ? doc.body.firstElementChild : null;
      if (!root) return '';

      var nodes = root.querySelectorAll('*');
      Array.prototype.forEach.call(nodes, function (el) {
        var tag = (el.tagName || '').toLowerCase();
        if (!ALLOWED_TAGS[tag]) {
          var txt = doc.createTextNode(el.textContent || '');
          el.parentNode && el.parentNode.replaceChild(txt, el);
          return;
        }

        Array.prototype.slice.call(el.attributes || []).forEach(function (attr) {
          var name = (attr.name || '').toLowerCase();
          if (name.indexOf('on') === 0 || name === 'style' || name === 'srcdoc') {
            el.removeAttribute(attr.name);
          }
        });
      });
      return root.innerHTML;
    } catch (e) {
      return input;
    }
  }

  global.FayiContentFormatter = {
    sanitizeLegalText: sanitizeLegalText,
    sanitizeLegalHtml: sanitizeLegalHtml,
    formatLegalText: formatLegalText,
    normalizeLegalSections: normalizeLegalSections,
    shortenPlaceholders: shortenPlaceholders
  };
})(typeof window !== 'undefined' ? window : global);

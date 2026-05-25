/**
 * AI 响应清洗：去除 JSON 符号污染、转义符、代码块、半截 JSON
 */
(function (global) {
  var extractFn = function (v) {
    if (global.FayiAIResponse && FayiAIResponse.extractAIContent) {
      return FayiAIResponse.extractAIContent(v);
    }
    return v == null ? '' : String(v);
  };

  var JSON_KEY_LINE = /^"?(choices|delta|message|content|role|id|object|created|model|assistant_id|finish_reason|index)"?\s*:\s*[\{\[\]"'\d\s,]*$/i;
  var JSON_KEY_ONLY = /^"?(choices|delta|message|content|role)"?\s*:\s*"?$/i;
  var JSON_ONLY_LINE = /^[\{\}\[\],:`"\s\\]+$/;

  function unescapeText(s) {
    return String(s)
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }

  function extractEmbeddedContentStrings(text) {
    var found = [];
    var re = /"content"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    var m;
    while ((m = re.exec(text))) {
      if (m[1] && m[1].length > 2) found.push(unescapeText(m[1]));
    }
    if (found.length) return found.join('\n');
    return '';
  }

  function stripJsonArtifactLines(text) {
    return text.split('\n').filter(function (line) {
      var t = line.trim();
      if (!t) return true;
      if (JSON_ONLY_LINE.test(t)) return false;
      if (JSON_KEY_LINE.test(t)) return false;
      if (JSON_KEY_ONLY.test(t)) return false;
      if (/^"?(choices|delta|message|content)"?\s*:\s*\[?\s*\{?\s*$/.test(t)) return false;
      return true;
    }).join('\n');
  }

  function stripCodeFences(text) {
    return text
      .replace(/```(?:json|javascript|js|text)?\s*[\s\S]*?```/gi, function (block) {
        return block.replace(/^```\w*\n?/, '').replace(/\n?```$/, '').trim();
      })
      .replace(/^```\w*\n?/gm, '')
      .replace(/\n?```$/gm, '');
  }

  function stripOrphanJsonPunctuation(text) {
    return text
      .replace(/^\s*[\{\[]\s*$/gm, '')
      .replace(/^\s*[\}\]]\s*,?\s*$/gm, '')
      .replace(/^\s*,\s*$/gm, '');
  }

  function stripMarkdownHeadingMarks(text) {
    return String(text || '')
      .split('\n')
      .map(function (line) {
        var t = line.trim();
        if (!t) return '';
        if (/^[#＃]{1,6}\s*$/.test(t)) return '';
        return line.replace(/^\s*[#＃]{1,6}\s*/, '');
      })
      .join('\n');
  }

  function looksLikeJsonPollution(text) {
    if (!text || text.length < 8) return false;
    var hits = 0;
    if (/"choices"\s*:/.test(text)) hits++;
    if (/"delta"\s*:/.test(text)) hits++;
    if (/"message"\s*:\s*\{/.test(text)) hits++;
    if (/"content"\s*:\s*"/.test(text)) hits++;
    if (/^\s*\{\s*$/.test(text)) hits++;
    return hits >= 2 || (hits >= 1 && /[\{\}\[\]]/.test(text) && text.length < 500);
  }

  function cleanAIResponse(raw) {
    var text = extractFn(raw);
    if (!text) return '';

    text = unescapeText(text);
    text = stripCodeFences(text);

    if (looksLikeJsonPollution(text)) {
      var embedded = extractEmbeddedContentStrings(text);
      var reparsed = extractFn(text);
      if (embedded && embedded.length > (reparsed || '').length * 0.5) {
        text = embedded;
      } else if (reparsed && reparsed !== text) {
        text = reparsed;
      } else if (embedded) {
        text = embedded;
      }
    }

    text = text.split('\n').map(function (line) {
      return line.replace(/^[\s"]*(choices|delta|message|content)[\s"]*:\s*"?/gi, '').replace(/"$/,'').trim();
    }).join('\n');

    text = stripJsonArtifactLines(text);
    text = stripOrphanJsonPunctuation(text);
    text = stripMarkdownHeadingMarks(text);
    if (global.FayiContentFormatter && FayiContentFormatter.sanitizeLegalText) {
      text = FayiContentFormatter.sanitizeLegalText(text);
    }
    text = text.replace(/`+/g, '');
    text = text.replace(/\n{3,}/g, '\n\n').trim();

    if (global.FayiChatStyle && FayiChatStyle.filterMarkdown) {
      text = FayiChatStyle.filterMarkdown(text);
    }

    return text;
  }

  /** 提取 + 清洗，供聊天页统一调用 */
  function normalizeChatOutput(raw) {
    return cleanAIResponse(raw);
  }

  global.FayiAIResponse = global.FayiAIResponse || {};
  global.FayiAIResponse.cleanAIResponse = cleanAIResponse;
  global.FayiAIResponse.normalizeChatOutput = normalizeChatOutput;
})(typeof window !== 'undefined' ? window : global);

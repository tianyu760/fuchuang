/**
 * 从各类 AI 接口响应中只提取纯文本 content
 * 兼容：腾讯元器 / OpenAI / SSE 流式 / 多层嵌套
 */
(function (global) {
  var CONTENT_KEYS = ['content', 'text', 'reply', 'answer', 'result', 'output', 'message'];

  function isPlainObject(v) {
    return v != null && typeof v === 'object' && !Array.isArray(v);
  }

  function getPath(obj, keys) {
    var cur = obj;
    for (var i = 0; i < keys.length; i++) {
      if (cur == null) return undefined;
      cur = cur[keys[i]];
    }
    return cur;
  }

  function joinContentParts(parts) {
    if (!parts || !parts.length) return '';
    return parts.map(function (p) {
      return extractAIContent(p);
    }).join('');
  }

  function extractFromObject(obj, depth) {
    if (!obj || depth > 6) return '';

    var paths = [
      ['choices', 0, 'message', 'content'],
      ['choices', 0, 'delta', 'content'],
      ['data', 'choices', 0, 'message', 'content'],
      ['data', 'choices', 0, 'delta', 'content'],
      ['data', 'message', 'content'],
      ['data', 'reply'],
      ['data', 'content'],
      ['data', 'text'],
      ['message', 'content'],
      ['delta', 'content'],
      ['reply'],
      ['content'],
      ['text'],
      ['answer'],
      ['result'],
      ['output']
    ];

    for (var i = 0; i < paths.length; i++) {
      var val = getPath(obj, paths[i]);
      if (val != null && val !== '') {
        var extracted = extractAIContent(val, depth + 1);
        if (extracted) return extracted;
      }
    }

    for (var k = 0; k < CONTENT_KEYS.length; k++) {
      var key = CONTENT_KEYS[k];
      if (obj[key] != null && obj[key] !== '' && obj !== obj[key]) {
        var inner = extractAIContent(obj[key], depth + 1);
        if (inner) return inner;
      }
    }

    return '';
  }

  function extractAIContent(input, depth) {
    depth = depth || 0;
    if (input == null) return '';

    if (typeof input === 'string') {
      var s = input.trim();
      if (!s) return '';

      if (s.indexOf('data:') >= 0 && (s.indexOf('choices') >= 0 || s.indexOf('"content"') >= 0)) {
        var streamAcc = '';
        s.split('\n').forEach(function (line) {
          line = line.trim();
          if (!line.startsWith('data:')) return;
          var payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') return;
          try {
            streamAcc += extractAIContent(JSON.parse(payload), depth + 1);
          } catch (e) { /* ignore */ }
        });
        if (streamAcc.trim()) return streamAcc.trim();
      }

      if ((s.charAt(0) === '{' && s.charAt(s.length - 1) === '}') ||
          (s.charAt(0) === '[' && s.charAt(s.length - 1) === ']')) {
        try {
          var parsed = JSON.parse(s);
          var fromJson = extractAIContent(parsed, depth + 1);
          if (fromJson) return fromJson;
        } catch (e) { /* keep string */ }
      }

      return s;
    }

    if (typeof input === 'number' || typeof input === 'boolean') {
      return String(input);
    }

    if (Array.isArray(input)) {
      if (input.length && isPlainObject(input[0]) && (input[0].type || input[0].text)) {
        return joinContentParts(input);
      }
      return joinContentParts(input);
    }

    if (isPlainObject(input)) {
      if (input.type === 'text' && input.text != null) {
        return extractAIContent(input.text, depth + 1);
      }
      return extractFromObject(input, depth);
    }

    return '';
  }

  global.FayiAIResponse = {
    extractAIContent: extractAIContent
  };
})(typeof window !== 'undefined' ? window : global);

/**
 * 服务端：AI 响应提取 + 清洗
 */
const { filterMarkdown } = require('./chat-text-style');

const CONTENT_KEYS = ['content', 'text', 'reply', 'answer', 'result', 'output', 'message'];

function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function getPath(obj, keys) {
  let cur = obj;
  for (let i = 0; i < keys.length; i++) {
    if (cur == null) return undefined;
    cur = cur[keys[i]];
  }
  return cur;
}

function extractAIContent(input, depth = 0) {
  if (input == null) return '';

  if (typeof input === 'string') {
    const s = input.trim();
    if (!s) return '';

    if (s.includes('data:') && (s.includes('choices') || s.includes('"content"'))) {
      let streamAcc = '';
      s.split('\n').forEach(function (line) {
        line = line.trim();
        if (!line.startsWith('data:')) return;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') return;
        try {
          streamAcc += extractAIContent(JSON.parse(payload), depth + 1);
        } catch (e) { /* ignore */ }
      });
      if (streamAcc.trim()) return streamAcc.trim();
    }

    if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
      try {
        const fromJson = extractAIContent(JSON.parse(s), depth + 1);
        if (fromJson) return fromJson;
      } catch (e) { /* keep */ }
    }
    return s;
  }

  if (typeof input === 'number' || typeof input === 'boolean') return String(input);

  if (Array.isArray(input)) {
    return input.map(function (p) { return extractAIContent(p, depth + 1); }).join('');
  }

  if (depth > 6) return '';

  if (isPlainObject(input)) {
    if (input.type === 'text' && input.text != null) {
      return extractAIContent(input.text, depth + 1);
    }

    const paths = [
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

    for (const path of paths) {
      const val = getPath(input, path);
      if (val != null && val !== '') {
        const extracted = extractAIContent(val, depth + 1);
        if (extracted) return extracted;
      }
    }

    for (const key of CONTENT_KEYS) {
      if (input[key] != null && input[key] !== '') {
        const inner = extractAIContent(input[key], depth + 1);
        if (inner) return inner;
      }
    }
  }

  return '';
}

const JSON_KEY_LINE = /^"?(choices|delta|message|content|role|id|object|created|model|assistant_id|finish_reason|index)"?\s*:\s*[\{\[\]"'\d\s,]*$/i;
const JSON_KEY_ONLY = /^"?(choices|delta|message|content|role)"?\s*:\s*"?$/i;
const JSON_ONLY_LINE = /^[\{\}\[\],:`"\s\\]+$/;

function unescapeText(s) {
  return String(s)
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function extractEmbeddedContentStrings(text) {
  const found = [];
  const re = /"content"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(text))) {
    if (m[1] && m[1].length > 2) found.push(unescapeText(m[1]));
  }
  return found.length ? found.join('\n') : '';
}

function looksLikeJsonPollution(text) {
  if (!text || text.length < 8) return false;
  let hits = 0;
  if (/"choices"\s*:/.test(text)) hits++;
  if (/"delta"\s*:/.test(text)) hits++;
  if (/"message"\s*:\s*\{/.test(text)) hits++;
  if (/"content"\s*:\s*"/.test(text)) hits++;
  if (/^\s*\{\s*$/m.test(text)) hits++;
  return hits >= 2 || (hits >= 1 && /[\{\}\[\]]/.test(text) && text.length < 500);
}

function cleanAIResponse(raw) {
  let text = extractAIContent(raw);
  if (!text) return '';

  text = unescapeText(text);
  text = text.replace(/```(?:json|javascript|js|text)?\s*[\s\S]*?```/gi, function (block) {
    return block.replace(/^```\w*\n?/, '').replace(/\n?```$/, '').trim();
  });

  if (looksLikeJsonPollution(text)) {
    const embedded = extractEmbeddedContentStrings(text);
    const reparsed = extractAIContent(text);
    if (embedded && embedded.length > (reparsed || '').length * 0.5) text = embedded;
    else if (reparsed && reparsed !== text) text = reparsed;
    else if (embedded) text = embedded;
  }

  text = text.split('\n').map(function (line) {
    return line.replace(/^[\s"]*(choices|delta|message|content)[\s"]*:\s*"?/gi, '').replace(/"$/, '').trim();
  }).join('\n');

  text = text.split('\n').filter(function (line) {
    const t = line.trim();
    if (!t) return true;
    if (JSON_ONLY_LINE.test(t)) return false;
    if (JSON_KEY_LINE.test(t)) return false;
    if (JSON_KEY_ONLY.test(t)) return false;
    if (/^"?(choices|delta|message)"?\s*:\s*\[?\s*\{?\s*$/.test(t)) return false;
    return true;
  }).join('\n');

  text = text.replace(/^\s*[\{\[]\s*$/gm, '')
    .replace(/^\s*[\}\]]\s*,?\s*$/gm, '')
    .replace(/^\s*,\s*$/gm, '')
    .replace(/`+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return filterMarkdown(text);
}

function normalizeChatOutput(raw) {
  return cleanAIResponse(raw);
}

module.exports = {
  extractAIContent,
  cleanAIResponse,
  normalizeChatOutput
};

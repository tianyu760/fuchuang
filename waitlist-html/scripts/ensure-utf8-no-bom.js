/**
 * 将文本文件转为 UTF-8 无 BOM（html/js/css/json/md/properties/ts 等）
 * 用法: node scripts/ensure-utf8-no-bom.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EXT = new Set([
  '.html', '.htm', '.css', '.js', '.json', '.md', '.txt', '.xml',
  '.properties', '.ts', '.vue', '.sql', '.editorconfig'
]);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'uploads', 'data']);

function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      walk(full, out);
      continue;
    }
    const ext = path.extname(name).toLowerCase();
    if (!EXT.has(ext)) continue;
    out.push(full);
  }
}

function stripBom(buf) {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.slice(3);
  }
  return buf;
}

function normalizeMetaCharset(text) {
  return text.replace(
    /<meta\s+charset\s*=\s*["']?utf-8["']?\s*\/?>/gi,
    '<meta charset="UTF-8" />'
  );
}

const files = [];
walk(ROOT, files);
let changed = 0;

for (const file of files) {
  let buf = stripBom(fs.readFileSync(file));
  let text = buf.toString('utf8');
  const isHtml = file.endsWith('.html') || file.endsWith('.htm');
  if (isHtml) {
    const next = normalizeMetaCharset(text);
    if (next !== text) text = next;
    if (!/<meta\s+charset/i.test(text) && /<head[\s>]/i.test(text)) {
      text = text.replace(/<head([^>]*)>/i, '<head$1>\n    <meta charset="UTF-8" />');
    }
  }
  const out = Buffer.from(text, 'utf8');
  if (!buf.equals(out)) {
    fs.writeFileSync(file, out);
    changed++;
    console.log('[utf8] updated:', path.relative(ROOT, file));
  }
}

console.log('Done. Files scanned:', files.length, '| Changed:', changed);

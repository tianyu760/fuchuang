/**
 * 法绎 · 全项目 UTF-8 编码工具（Node）
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const JSON_UTF8 = 'application/json; charset=utf-8';

function hasCjk(s) {
  return /[\u3400-\u9FFF\uF900-\uFAFF]/.test(String(s || ''));
}

/**
 * 修复 multipart / multer 原始文件名乱码
 */
function fixFileName(name) {
  var raw = String(name || '').trim();
  if (!raw) return '未命名文件';
  if (hasCjk(raw)) return raw;

  try {
    var fromLatin = Buffer.from(raw, 'latin1').toString('utf8');
    if (hasCjk(fromLatin)) return fromLatin;
  } catch (e) { /* ignore */ }

  try {
    var decoded = decodeURIComponent(encodeURIComponent(raw));
    if (decoded && decoded.indexOf('\uFFFD') === -1 && decoded !== raw) return decoded;
  } catch (e) { /* ignore */ }

  try {
    return decodeURIComponent(raw);
  } catch (e2) {
    return raw;
  }
}

/**
 * 磁盘存储名：timestamp_uuid.ext（不使用中文文件名）
 */
function safeStorageFileName(originalName) {
  var ext = path.extname(fixFileName(originalName) || '').toLowerCase();
  if (!/^\.[a-z0-9]{1,8}$/.test(ext)) ext = '';
  var id = Date.now() + '_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return id + ext;
}

/**
 * 确保字符串为合法 UTF-8 文本（入库 / 日志前调用）
 */
function ensureUtf8String(input) {
  if (input == null) return '';
  var s = String(input);
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  try {
    return Buffer.from(s, 'utf8').toString('utf8');
  } catch (e) {
    return s;
  }
}

function readUtf8File(filePath) {
  return ensureUtf8String(fs.readFileSync(filePath, 'utf8'));
}

function writeUtf8File(filePath, data) {
  var content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  fs.writeFileSync(filePath, ensureUtf8String(content), { encoding: 'utf8' });
}

function applyNodeUtf8Locale() {
  if (!process.env.LANG) process.env.LANG = 'zh_CN.UTF-8';
  if (!process.env.LC_ALL) process.env.LC_ALL = 'zh_CN.UTF-8';
}

function installExpressUtf8Json(app) {
  if (!app || app.__fayiUtf8JsonInstalled) return;
  app.__fayiUtf8JsonInstalled = true;
  app.use(function (req, res, next) {
    var origJson = res.json.bind(res);
    res.json = function (body) {
      res.setHeader('Content-Type', JSON_UTF8);
      return origJson(body);
    };
    next();
  });
}

function axiosUtf8Config(extra) {
  return Object.assign({
    headers: {
      'Content-Type': JSON_UTF8,
      Accept: 'application/json; charset=utf-8'
    },
    responseType: 'json',
    responseEncoding: 'utf8'
  }, extra || {});
}

module.exports = {
  JSON_UTF8,
  fixFileName,
  safeStorageFileName,
  ensureUtf8String,
  readUtf8File,
  writeUtf8File,
  applyNodeUtf8Locale,
  installExpressUtf8Json,
  axiosUtf8Config
};

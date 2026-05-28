/**
 * OCR 管理中心 · 列表 / 详情 API 映射
 */
const path = require('path');
const fs = require('fs');
const store = require('./admin-store');

const UPLOAD_DIRS = [
  path.join(__dirname, '..', '..', 'uploads'),
  path.join(__dirname, '..', '..', '..', 'file-server', 'uploads'),
  path.join(__dirname, '..', '..', '..', 'uploads')
];

const PUBLIC_ORIGIN = process.env.FAYI_PUBLIC_ORIGIN || process.env.PUBLIC_ORIGIN || '';
const MULTIMODAL_ORIGIN = process.env.FAYI_MULTIMODAL_ORIGIN || process.env.MULTIMODAL_ORIGIN || 'http://127.0.0.1:3002';

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp)$/i;
const MATCH_WINDOW_MS = 8 * 60 * 1000;

const STATUS_LABEL = {
  success: '已完成',
  completed: '已完成',
  processing: '处理中',
  failed: '失败',
  pending: '处理中'
};

var uploadIndexCache = { at: 0, files: [] };

function normalizeConfidence(val) {
  if (val == null || val === '') return null;
  var n = Number(val);
  if (isNaN(n)) return null;
  if (n > 1) n = n / 100;
  return Math.round(n * 1000) / 1000;
}

function resolvePublicOrigin(req) {
  if (PUBLIC_ORIGIN) return String(PUBLIC_ORIGIN).replace(/\/$/, '');
  if (req && req.protocol && req.get('host')) {
    return req.protocol + '://' + req.get('host');
  }
  return 'http://127.0.0.1:3003';
}

function ocrIdTimestamp(id) {
  var m = String(id || '').match(/^ocr_(\d{10,})$/);
  return m ? parseInt(m[1], 10) : null;
}

function recordTimestamp(rec) {
  var fromId = ocrIdTimestamp(rec.id);
  if (fromId) return fromId;
  var t = new Date(rec.createdAt || 0).getTime();
  return isNaN(t) ? 0 : t;
}

function listUploadFiles() {
  var now = Date.now();
  if (uploadIndexCache.files.length && now - uploadIndexCache.at < 15000) {
    return uploadIndexCache.files;
  }
  var out = [];
  UPLOAD_DIRS.forEach(function (dir) {
    if (!fs.existsSync(dir)) return;
    try {
      fs.readdirSync(dir).forEach(function (name) {
        if (!IMAGE_EXT.test(name)) return;
        var fp = path.join(dir, name);
        var st;
        try { st = fs.statSync(fp); } catch (e) { return; }
        if (!st.isFile()) return;
        var prefixTs = 0;
        var pm = name.match(/^(\d{10,13})/);
        if (pm) prefixTs = parseInt(pm[1], 10);
        out.push({
          name: name,
          path: fp,
          mtimeMs: st.mtimeMs,
          prefixTs: prefixTs
        });
      });
    } catch (e) { /* ignore */ }
  });
  uploadIndexCache = { at: now, files: out };
  return out;
}

function fileExists(name) {
  if (!name) return null;
  for (var i = 0; i < UPLOAD_DIRS.length; i++) {
    var fp = path.join(UPLOAD_DIRS[i], name);
    if (fs.existsSync(fp)) return { name: name, path: fp };
  }
  return null;
}

function resolveStoredFile(rec, usedFiles) {
  usedFiles = usedFiles || {};
  if (rec.storedFile && fileExists(rec.storedFile)) {
    return rec.storedFile;
  }
  if (rec.fileUrl) {
    var m = String(rec.fileUrl).match(/\/([^/]+)$/);
    if (m && m[1] && fileExists(m[1])) return m[1];
  }

  var target = recordTimestamp(rec);
  if (!target) return '';

  var uploads = listUploadFiles();
  var bestName = '';
  var bestDiff = Infinity;

  uploads.forEach(function (f) {
    if (usedFiles[f.name]) return;
    var diff = f.prefixTs
      ? Math.abs(f.prefixTs - target)
      : Math.abs(f.mtimeMs - target);
    if (diff < bestDiff && diff <= MATCH_WINDOW_MS) {
      bestDiff = diff;
      bestName = f.name;
    }
  });

  return bestName;
}

function backfillRecordImage(rec, usedFiles) {
  var stored = resolveStoredFile(rec, usedFiles);
  if (!stored) return rec;
  if (usedFiles) usedFiles[stored] = true;
  if (rec.storedFile === stored && rec.fileUrl) return rec;
  return Object.assign({}, rec, {
    storedFile: stored,
    fileUrl: '/uploads/' + stored
  });
}

function persistOcrImageBackfill(rec) {
  if (!rec || !rec.id || !rec.storedFile) return;
  store.updateOcrRecord(rec.id, {
    storedFile: rec.storedFile,
    fileUrl: rec.fileUrl || '/uploads/' + rec.storedFile
  });
}

function enrichOcrRecord(rec, usedFiles) {
  var next = backfillRecordImage(rec, usedFiles);
  if (next.storedFile && (!rec.storedFile || rec.storedFile !== next.storedFile)) {
    persistOcrImageBackfill(next);
    uploadIndexCache.at = 0;
  }
  return next;
}

function backfillAllMissingImages() {
  var list = store.readJson(store.FILES.ocrRecords, []);
  var used = {};
  var sorted = list.slice().sort(function (a, b) {
    return recordTimestamp(a) - recordTimestamp(b);
  });
  sorted.forEach(function (rec) {
    enrichOcrRecord(rec, used);
  });
}

function adminImageUrl(id, req) {
  var origin = resolvePublicOrigin(req);
  return origin + '/api/admin/ocr/image/' + encodeURIComponent(id);
}

function publicUploadUrl(storedFile, req) {
  if (!storedFile) return '';
  var multimodal = String(MULTIMODAL_ORIGIN).replace(/\/$/, '');
  return multimodal + '/uploads/' + storedFile;
}

function resolveImageUrl(rec, req) {
  var stored = resolveStoredFile(rec);
  if (stored) {
    return adminImageUrl(rec.id, req);
  }
  var fileUrl = rec.fileUrl || '';
  if (!fileUrl) return adminImageUrl(rec.id, req);
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
  if (fileUrl.indexOf('/uploads/') === 0) {
    return publicUploadUrl(fileUrl.replace(/^\/uploads\//, ''), req);
  }
  var origin = resolvePublicOrigin(req);
  return origin + (fileUrl.charAt(0) === '/' ? fileUrl : '/' + fileUrl);
}

function buildAnalysisResult(rec) {
  var text = String(rec.riskAnalysis || rec.summary || '').trim();
  var parts = [];
  if (rec.legalCategory) parts.push('法律分类：' + rec.legalCategory);
  if (rec.ocrType && rec.ocrType !== 'general') parts.push('识别类型：' + rec.ocrType);
  if (rec.lines) parts.push('识别行数：' + rec.lines);
  if (parts.length) {
    text = (text ? text + '\n\n' : '') + parts.join(' · ');
  }
  return {
    text: text || '',
    summary: rec.summary || '',
    riskLevel: rec.riskLevel || 'low',
    riskLabel: rec.riskLevel === 'high' ? '高风险' : rec.riskLevel === 'mid' ? '中风险' : '低风险',
    legalCategory: rec.legalCategory || '',
    legalCategoryId: rec.legalCategoryId || '',
    keywords: rec.keywords || [],
    riskAnalysis: rec.riskAnalysis || '',
    structured: {
      ocrType: rec.ocrType || 'general',
      fileType: rec.fileType || '',
      lines: rec.lines || 0,
      durationMs: rec.durationMs || 0,
      userId: rec.userId || '',
      userName: rec.userName || ''
    }
  };
}

function toApiRow(rec, req) {
  var row = enrichOcrRecord(rec);
  var conf = normalizeConfidence(row.confidence);
  var ocrText = String(row.correctedText || row.fullText || row.textPreview || '').trim();
  var preview = ocrText.replace(/\s+/g, ' ').slice(0, 200);
  var st = row.status || (row.success === false ? 'failed' : 'success');
  var hasImage = !!(row.storedFile && fileExists(row.storedFile));
  return {
    id: row.id,
    fileName: row.fileName || '未命名文件',
    imageUrl: hasImage ? resolveImageUrl(row, req) : '',
    hasImage: hasImage,
    ocrText: ocrText,
    textPreview: preview,
    confidence: conf,
    confidencePercent: conf != null ? Math.round(conf * 100) : null,
    analysisResult: buildAnalysisResult(row),
    createdAt: row.createdAt,
    status: st,
    statusLabel: STATUS_LABEL[st] || STATUS_LABEL.success,
    riskLevel: row.riskLevel || 'low',
    userId: row.userId,
    userName: row.userName
  };
}

function list(opts, req) {
  opts = opts || {};
  backfillAllMissingImages();
  var data = store.listOcrRecords({
    page: opts.page,
    pageSize: opts.pageSize,
    search: opts.search,
    status: opts.status,
    ocrType: opts.ocrType,
    riskLevel: opts.riskLevel,
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo
  });
  var used = {};
  var list = (data.list || []).map(function (r) { return toApiRow(r, req, used); });
  return {
    list: list,
    total: data.total || list.length,
    page: data.page || 1,
    pageSize: data.pageSize || 15,
    totalPages: Math.max(1, Math.ceil((data.total || 0) / (data.pageSize || 15)))
  };
}

function getDetail(id, req) {
  var raw = store.getOcrById(id);
  if (!raw) return null;
  var rec = enrichOcrRecord(raw);
  var row = toApiRow(rec, req);
  return Object.assign({}, row, {
    fullText: rec.fullText || row.ocrText,
    correctedText: rec.correctedText || '',
    storedFile: rec.storedFile || resolveStoredFile(rec) || '',
    fileUrl: rec.fileUrl || '',
    durationMs: rec.durationMs || 0,
    lines: rec.lines || 0,
    ocrType: rec.ocrType || 'general',
    errorMessage: rec.errorMessage || '',
    aiCorrectedAt: rec.aiCorrectedAt || null,
    updatedAt: rec.updatedAt || rec.createdAt
  });
}

function getImagePath(id) {
  var rec = store.getOcrById(id);
  if (!rec) return null;
  var enriched = enrichOcrRecord(rec);
  var name = resolveStoredFile(enriched);
  if (!name) return null;
  var hit = fileExists(name);
  return hit ? hit.path : null;
}

module.exports = {
  list: list,
  getDetail: getDetail,
  getImagePath: getImagePath,
  resolveImageUrl: resolveImageUrl,
  resolveStoredFile: resolveStoredFile,
  toApiRow: toApiRow
};

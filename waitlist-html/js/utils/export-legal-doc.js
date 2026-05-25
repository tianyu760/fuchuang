/**
 * 法律文书 Word / PDF 导出
 */
(function (global) {
  var sanitize = global.FayiLegalSanitize && FayiLegalSanitize.sanitizeLegalPlaceholders
    ? FayiLegalSanitize.sanitizeLegalPlaceholders
    : function (s) { return s || ''; };

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  var LEGAL_PDF_MODE = 'legal_pdf';
  var FONT_CANDIDATES = [
    { name: 'SourceHanSerifCN', file: 'SourceHanSerifCN-Regular.ttf' },
    { name: 'NotoSansSC', file: 'NotoSansSC-Regular.ttf' },
    { name: 'NotoSerifSC', file: 'NotoSerifSC-Regular.ttf' }
  ];
  var fontLoadCache = {};
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

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function buildBaseFilename(data) {
    var title = (data && data.title) ? String(data.title).replace(/[/\\?%*:|"<>]/g, '_') : '法律文书';
    var d = new Date();
    return title + '_' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function buildFilename(data) {
    return buildBaseFilename(data) + '.docx';
  }

  function sanitizeText(s) {
    var out = sanitize(s || '');
    if (global.FayiContentFormatter && FayiContentFormatter.formatLegalText) {
      out = FayiContentFormatter.formatLegalText(out, { tone: 'formal_legal' });
    } else if (global.FayiContentFormatter && FayiContentFormatter.sanitizeLegalText) {
      out = FayiContentFormatter.sanitizeLegalText(out);
    }
    return out;
  }

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
    var display = cleanFieldValue(value);
    var cls = kind === 'case_no' ? 'medium' : kind;
    return '<span class="legal-field-line legal-field-line--' + cls + '" style="width:' + width + 'px;"><span class="legal-field-line__text">' + esc(display || ' ') + '</span></span>';
  }

  function normalizeFieldLinesHtml(html) {
    var out = String(html || '');
    // 限制残留超长占位横线，统一为表单化字段线
    out = out.replace(/_{4,}/g, function () { return generateFieldLine('long', ''); });
    out = out.replace(/[—＿]{6,}/g, function () { return generateFieldLine('long', ''); });
    return out;
  }

  function ensureLeadingTitle(innerHtml, title) {
    var t = esc(sanitizeText(title || '法律文书'));
    if (/<h1[\s>]/i.test(innerHtml)) return innerHtml;
    return '<h1 class="legal-h1">' + t + '</h1>' + innerHtml;
  }

  function buildFormalPaperHtml(data) {
    var d = data || {};
    var paper = document.getElementById('legal-doc-paper');
    var inner = paper ? paper.innerHTML : '';
    if (!inner && global.FayiLegalRender) {
      inner = FayiLegalRender.renderWenshiDocument(d);
    }
    if (global.FayiContentFormatter && FayiContentFormatter.sanitizeLegalHtml) {
      inner = FayiContentFormatter.sanitizeLegalHtml(inner);
    }
    inner = normalizeFieldLinesHtml(inner);
    inner = ensureLeadingTitle(inner, d.title || '法律文书');
    return inner;
  }

  function buildExportHtml(data) {
    var inner = buildFormalPaperHtml(data);
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
      '@page{size:A4;margin:26mm 20mm 22mm 20mm;}' +
      'body{font-family:"SimSun","Source Han Serif SC","Songti SC","Times New Roman",serif;line-height:1.8;color:#000;font-size:' + LEGAL_DOC_TYPOGRAPHY.body + 'px;}' +
      '.legal-doc-paper{max-width:none;border:none;padding:0;margin:0;background:#fff;}' +
      '.legal-h1{font-size:' + LEGAL_DOC_TYPOGRAPHY.h1 + 'px;font-weight:700;text-align:center;margin:0 0 28px;line-height:1.5;letter-spacing:1px;font-family:"Source Han Serif SC SemiBold","Source Han Serif SC","SimSun",serif;}' +
      '.legal-section{margin:16px 0 24px;page-break-inside:avoid;}' +
      '.legal-h2{font-size:' + LEGAL_DOC_TYPOGRAPHY.h2 + 'px;font-weight:600;margin:0 0 12px;padding-bottom:6px;border-bottom:1px solid #999;page-break-after:avoid;font-family:"Source Han Serif SC SemiBold","Source Han Serif SC","SimSun",serif;}' +
      '.legal-h3{font-size:' + LEGAL_DOC_TYPOGRAPHY.body + 'px;font-weight:600;margin:12px 0 8px;page-break-after:avoid;}' +
      '.legal-fields-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;}' +
      '.legal-field{display:flex;align-items:flex-end;gap:8px;min-height:30px;}' +
      '.legal-field__label{width:84px;min-width:84px;font-weight:600;font-size:' + LEGAL_DOC_TYPOGRAPHY.body + 'px;line-height:1.8;}' +
      '.legal-field__input{display:flex;align-items:flex-end;min-width:0;}' +
      '.legal-field-line{display:inline-flex;align-items:flex-end;min-height:28px;border-bottom:1px solid #222;padding:0 4px;line-height:1.6;vertical-align:bottom;}' +
      '.legal-field-line__text{font-size:' + LEGAL_DOC_TYPOGRAPHY.body + 'px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
      '.legal-doc-body p,.legal-p{margin:0 0 12px;text-indent:2em;text-align:justify;word-break:break-word;line-height:1.8;font-size:' + LEGAL_DOC_TYPOGRAPHY.body + 'px;}' +
      '.legal-evidence-list,ul,ol{margin:8px 0 14px;padding-left:22px;}' +
      'li{margin:4px 0;line-height:1.8;font-size:' + LEGAL_DOC_TYPOGRAPHY.body + 'px;}' +
      '.legal-law-item{display:flex;gap:6pt;page-break-inside:avoid;}' +
      '.legal-law-item__index{font-weight:700;min-width:14pt;font-size:' + LEGAL_DOC_TYPOGRAPHY.law + 'px;}' +
      '.legal-law-quote{margin:0 0 6pt;padding:6pt 8pt;border-left:2pt solid #666;background:#f8f8f8;text-indent:0;font-family:"KaiTi","STKaiti","FangSong",serif;font-size:' + LEGAL_DOC_TYPOGRAPHY.law + 'px;line-height:1.8;}' +
      '.legal-risk-card{border:1pt solid #bbb;padding:8pt;background:#fcfcfc;page-break-inside:avoid;font-size:' + LEGAL_DOC_TYPOGRAPHY.risk + 'px;line-height:1.8;}' +
      '.legal-risk-card ul{margin:0;padding-left:18pt;}' +
      '.legal-signature{text-align:right;margin-top:24pt;page-break-inside:avoid;}' +
      '.legal-signature p{text-indent:0;text-align:right;margin:2pt 0;font-size:' + LEGAL_DOC_TYPOGRAPHY.signature + 'px;line-height:1.8;}' +
      '.legal-signature__label{display:inline-block;min-width:74px;text-align:right;margin-right:6px;}' +
      '.legal-signature__spacer{min-height:14pt;}' +
      'strong{font-weight:700;}' +
      '</style></head><body>' + inner + '</body></html>';
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
  }

  function exportLegalDocument(data, options) {
    options = options || {};
    if (typeof htmlDocx === 'undefined') {
      if (global.FayiToast) FayiToast('Word 导出库未加载', 'error');
      return Promise.reject(new Error('htmlDocx missing'));
    }
    var html = buildExportHtml(data);
    var blob = htmlDocx.asBlob(html, {
      orientation: 'portrait',
      margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
    });
    var filename = options.filename || buildFilename(data);
    downloadBlob(blob, filename);
    if (!options.silent && global.FayiToast) FayiToast('Word 文档已下载：' + filename, 'success');
    return Promise.resolve(filename);
  }

  function mountPdfTarget(data) {
    var target = document.getElementById('legal-doc-export-target');
    if (!target) return null;
    var paperHtml = buildFormalPaperHtml(data);
    target.innerHTML = '' +
      '<div class="legal-export-print">' +
      paperHtml +
      '</div>';
    var root = target.querySelector('.legal-export-print');
    if (root) {
      root.querySelectorAll('.legal-section, .legal-law-item, .legal-signature').forEach(function (el) {
        el.style.breakInside = 'avoid';
        el.style.pageBreakInside = 'avoid';
      });
      root.querySelectorAll('.legal-h2, .legal-h3').forEach(function (el) {
        el.style.breakAfter = 'avoid';
        el.style.pageBreakAfter = 'avoid';
      });
    }
    target.style.display = 'block';
    return target;
  }

  function arrayBufferToBase64(buffer) {
    var binary = '';
    var bytes = new Uint8Array(buffer);
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      var slice = bytes.subarray(i, i + chunk);
      binary += String.fromCharCode.apply(null, slice);
    }
    return btoa(binary);
  }

  function registerPdfFont(pdf, fontName, fileName, base64Data) {
    pdf.addFileToVFS(fileName, base64Data);
    pdf.addFont(fileName, fontName, 'normal');
  }

  function ensurePdfLegalFont(pdf) {
    if (!pdf || !global.fetch) return Promise.resolve(null);
    var key = FONT_CANDIDATES.map(function (f) { return f.file; }).join('|');
    if (fontLoadCache[key]) return fontLoadCache[key];

    fontLoadCache[key] = (function loadNext(idx) {
      if (idx >= FONT_CANDIDATES.length) return Promise.resolve(null);
      var candidate = FONT_CANDIDATES[idx];
      var url = './assets/fonts/' + candidate.file;
      return fetch(url).then(function (resp) {
        if (!resp.ok) throw new Error('font missing');
        return resp.arrayBuffer();
      }).then(function (buf) {
        var b64 = arrayBufferToBase64(buf);
        registerPdfFont(pdf, candidate.name, candidate.file, b64);
        return candidate.name;
      }).catch(function () {
        return loadNext(idx + 1);
      });
    })(0);

    return fontLoadCache[key];
  }

  function cleanupTarget(target) {
    if (!target) return;
    target.innerHTML = '';
    target.style.display = 'none';
  }

  function exportLegalPdf(data, options) {
    options = options || {};
    var mode = options.mode || LEGAL_PDF_MODE;
    if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') {
      if (global.FayiToast) FayiToast('PDF 导出库未加载', 'error');
      return Promise.reject(new Error('pdf libs missing'));
    }
    var target = mountPdfTarget(data);
    if (!target) return Promise.reject(new Error('export target missing'));

    var printable = target.querySelector('.legal-export-print');
    if (!printable) return Promise.reject(new Error('export print root missing'));

    return new Promise(function (resolve, reject) {
      var pdf = new jspdf.jsPDF('p', 'mm', 'a4');
      var fname = buildBaseFilename(data) + '.pdf';
      var pageW = pdf.internal.pageSize.getWidth();
      var pageH = pdf.internal.pageSize.getHeight();
      var margin = 18;
      var imgW = pageW - margin * 2;
      var printableH = pageH - margin * 2 - 8;

      ensurePdfLegalFont(pdf).then(function (fontName) {
        return html2canvas(printable, {
          scale: mode === LEGAL_PDF_MODE ? 3 : 2.2,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
          windowWidth: 794
        }).then(function (canvas) {
          var sliceH = (canvas.width * printableH) / imgW;
          var yPos = 0;
          var page = 0;
          var totalPages = Math.ceil(canvas.height / sliceH);

          while (yPos < canvas.height) {
            if (page > 0) pdf.addPage();
            var sliceCanvas = document.createElement('canvas');
            sliceCanvas.width = canvas.width;
            sliceCanvas.height = Math.min(sliceH, canvas.height - yPos);
            var ctx = sliceCanvas.getContext('2d');
            ctx.drawImage(
              canvas,
              0,
              yPos,
              canvas.width,
              sliceCanvas.height,
              0,
              0,
              canvas.width,
              sliceCanvas.height
            );
            var img = sliceCanvas.toDataURL('image/jpeg', 0.95);
            var renderH = (sliceCanvas.height * imgW) / canvas.width;
            pdf.addImage(img, 'JPEG', margin, margin, imgW, renderH);

            if (fontName) {
              pdf.setFont(fontName, 'normal');
            } else {
              pdf.setFont('times', 'normal');
            }
            pdf.setFontSize(9);
            var pageText = fontName
              ? ('第 ' + (page + 1) + ' / ' + totalPages + ' 页')
              : ('Page ' + (page + 1) + ' / ' + totalPages);
            pdf.text(pageText, pageW / 2, pageH - 8, { align: 'center' });

            yPos += sliceH;
            page++;
          }

          pdf.save(fname);
          if (!options.silent && global.FayiToast) FayiToast('PDF 已下载', 'success');
          cleanupTarget(target);
          resolve(fname);
        });
      }).catch(function (err) {
        cleanupTarget(target);
        reject(err);
      });
    });
  }

  function exportLegalDefault(data, options) {
    return exportLegalPdf(data, options);
  }

  function copyLegalContent(data) {
    var body = sanitize((data && (data.body_markdown || data.document_content)) || '');
    var title = (data && data.title) ? data.title + '\n\n' : '';
    var text = title + body;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () {
        if (global.FayiToast) FayiToast('文书内容已复制', 'success');
      });
    }
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    if (global.FayiToast) FayiToast('文书内容已复制', 'success');
    return Promise.resolve();
  }

  global.FayiLegalExport = {
    LEGAL_DOC_TYPOGRAPHY: LEGAL_DOC_TYPOGRAPHY,
    FIELD_WIDTH: FIELD_WIDTH,
    generateFieldLine: generateFieldLine,
    buildFilename: buildFilename,
    buildBaseFilename: buildBaseFilename,
    exportLegalDocument: exportLegalDocument,
    exportLegalPdf: exportLegalPdf,
    exportLegalDefault: exportLegalDefault,
    copyLegalContent: copyLegalContent
  };
})(typeof window !== 'undefined' ? window : global);

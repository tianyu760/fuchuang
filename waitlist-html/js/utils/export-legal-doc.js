/**
 * 法律文书 Word / PDF 导出
 * PDF：html2canvas 截图 + jsPDF 分页（避免 jsPDF 内置字体导致中文乱码）
 */
(function (global) {
  var sanitize = global.FayiLegalSanitize && FayiLegalSanitize.sanitizeLegalPlaceholders
    ? FayiLegalSanitize.sanitizeLegalPlaceholders
    : function (s) { return s || ''; };

  var FONT_LINK_ID = 'fayi-legal-export-fonts';
  var NOTO_FONT_URL = 'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap';
  var CJK_FONT_STACK = '"Noto Sans SC","Microsoft YaHei","PingFang SC","SimSun",sans-serif';

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function sanitizeFilenamePart(name, fallback) {
    var raw = String(name || '').trim();
    var cleaned = raw
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .replace(/[. ]+$/g, '')
      .trim();
    if (!cleaned) cleaned = fallback || '法律文书';
    return cleaned.slice(0, 80);
  }

  function buildBaseFilename(data) {
    var title = sanitizeFilenamePart(data && data.title, '法律文书');
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

  function ensureLeadingTitle(innerHtml, title) {
    var t = esc(sanitizeText(title || '法律文书'));
    if (/<h1[\s>]/i.test(innerHtml)) return innerHtml;
    return '<h1 class="legal-doc-title">' + t + '</h1>' + innerHtml;
  }

  function buildFormalPaperHtml(data) {
    var d = data || {};
    var paper = document.getElementById('legal-doc-paper');
    var inner = paper ? paper.innerHTML : '';
    if (!inner && global.FayiLegalRender) {
      inner = FayiLegalRender.renderWenshiDocument(d);
      if (FayiLegalRender.renderRiskNotes) {
        inner += FayiLegalRender.renderRiskNotes(d.risk_notes || d.suggestions || []);
      }
    }
    if (global.FayiContentFormatter && FayiContentFormatter.sanitizeLegalHtml) {
      inner = FayiContentFormatter.sanitizeLegalHtml(inner);
    }
    inner = ensureLeadingTitle(inner, d.title || '法律文书');
    return inner;
  }

  function buildExportHtml(data) {
    var inner = buildFormalPaperHtml(data);
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
      '@page{size:A4;margin:26mm 22mm;}' +
      'body{font-family:' + CJK_FONT_STACK + ';line-height:2;color:#000;font-size:14px;}' +
      '.legal-doc-paper{max-width:none;border:none;padding:0;margin:0;background:#fff;}' +
      '.legal-doc-title{font-size:22pt;font-family:' + CJK_FONT_STACK + ';text-align:center;font-weight:700;line-height:1.6;margin:0 0 22pt;color:#1e3a5f;}' +
      '.legal-sec-title{font-family:' + CJK_FONT_STACK + ';font-size:16pt;margin:16pt 0 8pt;page-break-after:avoid;font-weight:700;}' +
      '.legal-paragraph,.legal-party-line,.legal-signature-block p,.legal-line{font-family:' + CJK_FONT_STACK + ';font-size:14pt;line-height:2;text-align:justify;text-indent:2em;margin:0 0 8pt;word-break:break-word;}' +
      '.legal-line--numbered{font-weight:600;color:#1e3a5f;}' +
      '.legal-party-block{margin-bottom:6pt;}' +
      '.legal-ordered-list{margin:0;padding-left:24pt;}' +
      '.legal-ordered-list li{font-family:' + CJK_FONT_STACK + ';line-height:2;margin-bottom:6pt;}' +
      '.legal-law-block{margin-top:6pt;}' +
      '.legal-law-quote{margin:0 0 8pt;padding:8pt 10pt;background:#f6f7f9;border-left:3pt solid #4b6cb7;font-family:' + CJK_FONT_STACK + ';font-size:13.5pt;line-height:2;text-indent:0;}' +
      '.legal-risk-panel{margin-top:14pt;padding:10pt;border:1pt solid #d48484;background:#fff2f2;page-break-inside:avoid;}' +
      '.legal-risk-title{font-family:' + CJK_FONT_STACK + ';color:#af3030;font-size:13pt;font-weight:700;margin-bottom:4pt;}' +
      '.legal-risk-list{margin:0;padding-left:20pt;}' +
      '.legal-risk-list li{font-family:' + CJK_FONT_STACK + ';line-height:1.9;}' +
      '.legal-section,.legal-law-quote,.legal-risk-panel{break-inside:avoid;page-break-inside:avoid;}' +
      '.legal-signature-block{text-align:right;margin-top:20pt;}' +
      '.legal-signature-block p{text-align:right;text-indent:0;}' +
      '</style></head><body>' + inner + '</body></html>';
  }

  function getExportPrintStyles() {
    return '<style>' +
      '@import url("' + NOTO_FONT_URL + '");' +
      '.legal-export-print{' +
      'font-family:' + CJK_FONT_STACK + ';' +
      'font-size:16px;line-height:2;color:#111827;' +
      'width:794px;box-sizing:border-box;' +
      'padding:56px 52px 80px;background:#fff;' +
      '}' +
      '.legal-export-print .legal-doc-paper{margin:0;padding:0;box-shadow:none;border-radius:0;max-width:none;}' +
      '.legal-export-print .legal-doc-title{' +
      'font-family:' + CJK_FONT_STACK + ';' +
      'font-size:28px;font-weight:700;text-align:center;' +
      'color:#1e3a5f;margin:0 0 28px;letter-spacing:2px;line-height:1.5;' +
      '}' +
      '.legal-export-print .legal-doc-body{' +
      'font-family:' + CJK_FONT_STACK + ';font-size:16px;line-height:2.05;color:#1f2937;' +
      '}' +
      '.legal-export-print .legal-line{' +
      'margin:0 0 12px;text-indent:2em;word-break:break-word;' +
      '}' +
      '.legal-export-print .legal-line--numbered{' +
      'font-weight:600;color:#1e3a5f;text-indent:0;' +
      '}' +
      '</style>';
  }

  function ensureExportFonts() {
    if (document.getElementById(FONT_LINK_ID)) {
      return waitFontsReady();
    }
    return new Promise(function (resolve) {
      var link = document.createElement('link');
      link.id = FONT_LINK_ID;
      link.rel = 'stylesheet';
      link.href = NOTO_FONT_URL;
      link.onload = function () { waitFontsReady().then(resolve); };
      link.onerror = function () { waitFontsReady().then(resolve); };
      document.head.appendChild(link);
    });
  }

  function waitFontsReady() {
    if (document.fonts && document.fonts.ready) {
      return document.fonts.ready;
    }
    return Promise.resolve();
  }

  function downloadBlob(blob, filename) {
    var safeName = sanitizeFilenamePart(filename, '法律文书').replace(/\.+$/, '');
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    a.setAttribute('download', safeName);
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
    target.innerHTML = getExportPrintStyles() +
      '<div class="legal-export-print">' + paperHtml + '</div>';
    var root = target.querySelector('.legal-export-print');
    if (root) {
      root.querySelectorAll('.legal-section, .legal-law-item, .legal-signature').forEach(function (el) {
        el.style.breakInside = 'avoid';
        el.style.pageBreakInside = 'avoid';
      });
    }
    target.style.display = 'block';
    return target;
  }

  function cleanupTarget(target) {
    if (!target) return;
    target.innerHTML = '';
    target.style.display = 'none';
  }

  /**
   * 将 canvas 按 A4 分页写入 PDF（纯图片，中文由 HTML 字体渲染，不经过 jsPDF.text）
   */
  function canvasToA4Pdf(canvas, filename) {
    var pdf = new jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    var pageW = pdf.internal.pageSize.getWidth();
    var pageH = pdf.internal.pageSize.getHeight();
    var margin = 12;
    var contentW = pageW - margin * 2;
    var contentH = pageH - margin * 2;
    var sliceHpx = Math.floor((canvas.width * contentH) / contentW);
    var yPos = 0;
    var pageNum = 0;
    var totalPages = Math.max(1, Math.ceil(canvas.height / sliceHpx));

    while (yPos < canvas.height) {
      if (pageNum > 0) pdf.addPage();
      var sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = Math.min(sliceHpx, canvas.height - yPos);
      var ctx = sliceCanvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(
        canvas,
        0, yPos, canvas.width, sliceCanvas.height,
        0, 0, sliceCanvas.width, sliceCanvas.height
      );
      ctx.font = '13px "Microsoft YaHei", "Noto Sans SC", "PingFang SC", sans-serif';
      ctx.fillStyle = '#64748b';
      ctx.textAlign = 'center';
      ctx.fillText(
        '第 ' + (pageNum + 1) + ' / ' + totalPages + ' 页',
        sliceCanvas.width / 2,
        sliceCanvas.height - 14
      );
      var imgData = sliceCanvas.toDataURL('image/jpeg', 0.95);
      var renderH = (sliceCanvas.height * contentW) / canvas.width;
      pdf.addImage(imgData, 'JPEG', margin, margin, contentW, renderH);
      yPos += sliceHpx;
      pageNum++;
    }

    pdf.save(filename);
    return filename;
  }

  function captureElementToCanvas(el, scale) {
    return html2canvas(el, {
      scale: scale || 2,
      useCORS: true,
      allowTaint: false,
      logging: false,
      backgroundColor: '#ffffff',
      width: el.scrollWidth,
      height: el.scrollHeight,
      windowWidth: el.scrollWidth,
      windowHeight: el.scrollHeight
    });
  }

  function exportLegalPdf(data, options) {
    options = options || {};
    if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') {
      if (global.FayiToast) FayiToast('PDF 导出库未加载', 'error');
      return Promise.reject(new Error('pdf libs missing'));
    }

    var fname = buildBaseFilename(data) + '.pdf';

    return ensureExportFonts()
      .then(function () {
        var target = mountPdfTarget(data);
        if (!target) return Promise.reject(new Error('export target missing'));
        var printable = target.querySelector('.legal-export-print');
        if (!printable) {
          cleanupTarget(target);
          return Promise.reject(new Error('export print root missing'));
        }
        return new Promise(function (resolve, reject) {
          requestAnimationFrame(function () {
            setTimeout(function () {
              captureElementToCanvas(printable, 2)
                .then(function (canvas) {
                  canvasToA4Pdf(canvas, fname);
                  if (!options.silent && global.FayiToast) {
                    FayiToast('PDF 已下载', 'success');
                  }
                  cleanupTarget(target);
                  resolve(fname);
                })
                .catch(function (err) {
                  cleanupTarget(target);
                  reject(err);
                });
            }, 150);
          });
        });
      });
  }

  function exportLegalDefault(data, options) {
    return exportLegalPdf(data, options);
  }

  function copyLegalContent(data) {
    var body = sanitize((data && (data.body_markdown || data.document_content)) || '');
    if (global.FayiLegalRender && FayiLegalRender.formatLegalText) {
      body = FayiLegalRender.formatLegalText(body);
    }
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

  function printLegalDocument(data) {
    return ensureExportFonts().then(function () {
      var target = mountPdfTarget(data);
      if (!target) return;
      setTimeout(function () {
        global.print();
        setTimeout(function () { cleanupTarget(target); }, 500);
      }, 120);
    });
  }

  global.FayiLegalExport = {
    buildFilename: buildFilename,
    buildBaseFilename: buildBaseFilename,
    exportLegalDocument: exportLegalDocument,
    exportLegalPdf: exportLegalPdf,
    exportLegalDefault: exportLegalDefault,
    copyLegalContent: copyLegalContent,
    printLegalDocument: printLegalDocument,
    canvasToA4Pdf: canvasToA4Pdf,
    ensureExportFonts: ensureExportFonts
  };
})(typeof window !== 'undefined' ? window : global);

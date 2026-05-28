/**
 * 管理端文书 PDF 导出（html2canvas + jsPDF，避免中文乱码）
 */
window.OpsDocumentPdf = (function () {
  var TARGET_ID = 'ops-doc-pdf-target';
  var FONT_URL = 'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap';
  var CJK_STACK = '"Noto Sans SC","Microsoft YaHei","PingFang SC","SimSun",sans-serif';

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function fmtTime(iso) {
    if (!iso) return '—';
    return String(iso).replace('T', ' ').slice(0, 19);
  }

  function sanitizePart(s, fallback) {
    var raw = String(s || '').trim();
    var cleaned = raw.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
    return (cleaned || fallback || '未命名').slice(0, 60);
  }

  function buildFilename(doc) {
    var title = sanitizePart(doc.title, '法律文书');
    var user = sanitizePart(doc.userName || doc.userNickname, '用户');
    return title + '_' + user + '_' + Date.now() + '.pdf';
  }

  function ensureTarget() {
    var el = document.getElementById(TARGET_ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = TARGET_ID;
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;z-index:-1;pointer-events:none;';
    document.body.appendChild(el);
    return el;
  }

  function ensureFonts() {
    return new Promise(function (resolve) {
      if (document.getElementById('ops-doc-pdf-fonts')) {
        if (document.fonts && document.fonts.ready) return document.fonts.ready.then(resolve);
        return resolve();
      }
      var link = document.createElement('link');
      link.id = 'ops-doc-pdf-fonts';
      link.rel = 'stylesheet';
      link.href = FONT_URL;
      link.onload = function () {
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(resolve);
        else resolve();
      };
      link.onerror = function () { resolve(); };
      document.head.appendChild(link);
    });
  }

  function buildPrintHtml(doc) {
    var d = doc || {};
    var body = esc(d.content || '（暂无正文）').replace(/\n/g, '<br/>');
    var ocr = d.ocrContent
      ? '<section class="ops-pdf-sec"><h2>OCR 原始内容</h2><div class="ops-pdf-body">' +
        esc(d.ocrContent).replace(/\n/g, '<br/>') + '</div></section>'
      : '';

    return '<div class="ops-pdf-root" style="font-family:' + CJK_STACK + '">' +
      '<h1 class="ops-pdf-title">' + esc(d.title || '法律文书') + '</h1>' +
      '<section class="ops-pdf-sec"><h2>基础信息</h2><ul class="ops-pdf-meta">' +
        '<li>用户：' + esc(d.userName || d.userNickname || '—') + '（ID: ' + esc(d.userId || '—') + '）</li>' +
        '<li>文书类型：' + esc(d.docType || '—') + '</li>' +
        '<li>案件编号：' + esc(d.caseNo || '—') + '</li>' +
        '<li>创建时间：' + esc(fmtTime(d.createdAt)) + '</li>' +
      '</ul></section>' +
      '<section class="ops-pdf-sec"><h2>正文内容</h2><div class="ops-pdf-body">' + body + '</div></section>' +
      ocr +
      '<section class="ops-pdf-sec ops-pdf-footer"><p>系统生成时间：' + esc(fmtTime(new Date().toISOString())) + '</p>' +
        '<p>数据来源：' + esc(d.dataSource || 'AI生成') + '</p></section>' +
      '</div>';
  }

  function getStyles() {
    return '<style>' +
      '.ops-pdf-root{width:794px;box-sizing:border-box;padding:48px 52px 64px;background:#fff;color:#111;font-size:14px;line-height:1.85;}' +
      '.ops-pdf-title{font-size:22px;font-weight:700;text-align:center;margin:0 0 28px;color:#1e3a5f;}' +
      '.ops-pdf-sec{margin-bottom:22px;}' +
      '.ops-pdf-sec h2{font-size:15px;font-weight:700;margin:0 0 10px;color:#334155;border-bottom:1px solid #e2e8f0;padding-bottom:6px;}' +
      '.ops-pdf-meta{margin:0;padding-left:20px;}' +
      '.ops-pdf-meta li{margin-bottom:4px;}' +
      '.ops-pdf-body{text-align:justify;word-break:break-word;}' +
      '.ops-pdf-footer{font-size:12px;color:#64748b;margin-top:24px;}' +
      '</style>';
  }

  function canvasToPdf(canvas, filename) {
    var pdf = new jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    var pageW = pdf.internal.pageSize.getWidth();
    var pageH = pdf.internal.pageSize.getHeight();
    var margin = 12;
    var contentW = pageW - margin * 2;
    var contentH = pageH - margin * 2;
    var sliceHpx = Math.floor((canvas.width * contentH) / contentW);
    var yPos = 0;
    var pageNum = 0;

    while (yPos < canvas.height) {
      if (pageNum > 0) pdf.addPage();
      var sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = Math.min(sliceHpx, canvas.height - yPos);
      var ctx = sliceCanvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(canvas, 0, yPos, canvas.width, sliceCanvas.height, 0, 0, sliceCanvas.width, sliceCanvas.height);
      var imgData = sliceCanvas.toDataURL('image/jpeg', 0.92);
      var renderH = (sliceCanvas.height * contentW) / canvas.width;
      pdf.addImage(imgData, 'JPEG', margin, margin, contentW, renderH);
      yPos += sliceHpx;
      pageNum++;
    }

    pdf.save(filename);
    return filename;
  }

  function generateDocumentPDF(doc) {
    if (!doc) return Promise.reject(new Error('无文书数据'));
    if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') {
      return Promise.reject(new Error('PDF 库未加载'));
    }

    var filename = buildFilename(doc);
    var target = ensureTarget();
    target.innerHTML = getStyles() + buildPrintHtml(doc);
    target.style.display = 'block';

    var printable = target.querySelector('.ops-pdf-root');
    if (!printable) {
      target.style.display = 'none';
      return Promise.reject(new Error('渲染失败'));
    }

    return ensureFonts().then(function () {
      return new Promise(function (resolve, reject) {
        requestAnimationFrame(function () {
          setTimeout(function () {
            html2canvas(printable, {
              scale: 2,
              useCORS: true,
              backgroundColor: '#ffffff',
              logging: false,
              width: printable.scrollWidth,
              height: printable.scrollHeight
            }).then(function (canvas) {
              canvasToPdf(canvas, filename);
              target.innerHTML = '';
              target.style.display = 'none';
              resolve(filename);
            }).catch(function (err) {
              target.innerHTML = '';
              target.style.display = 'none';
              reject(err);
            });
          }, 120);
        });
      });
    });
  }

  return { generateDocumentPDF: generateDocumentPDF };
})();

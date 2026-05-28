const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..');
const pages = ['dashboard', 'consultations', 'users', 'ocr', 'regulations', 'risks', 'logs', 'settings', 'analytics', 'law-education'];

pages.forEach(function (p) {
  const f = path.join(dir, p + '.html');
  if (!fs.existsSync(f)) return;
  let h = fs.readFileSync(f, 'utf8');
  if (!h.includes('ops-perf.css') && h.includes('ops-modules.css')) {
    h = h.replace(
      '<link rel="stylesheet" href="css/ops-modules.css" />',
      '<link rel="stylesheet" href="css/ops-modules.css" />\n  <link rel="stylesheet" href="css/ops-perf.css" />'
    );
  }
  h = h.replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/echarts[^"]+"><\/script>\s*/g, '');
  h = h.replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/echarts-wordcloud[^"]+"><\/script>\s*/g, '');
  h = h.replace(/<script src="charts\/ops-charts\.js"><\/script>\s*/g, '');
  h = h.replace(/<script src="js\/pages\/[^"]+\.js"><\/script>\s*/g, '');
  const marker = '<script src="../js/modules/admin/admin-api.js"></script>';
  if (h.includes(marker) && !h.includes('ops-runtime.js')) {
    h = h.replace(marker, '<script src="js/core/ops-runtime.js"></script>\n    ' + marker);
  }
  if (!h.includes('ops-script-loader.js')) {
    h = h.replace(
      '<script src="js/dataCenter.js"></script>',
      '<script src="js/core/ops-prefetch.js"></script>\n    <script src="js/core/ops-script-loader.js"></script>\n    <script src="js/dataCenter.js"></script>'
    );
  }
  const re = /(\s*<script src="js\/core\/app\.js"><\/script>)[\s\S]*?(<\/body>)/;
  if (re.test(h) && h.includes('js/pages/')) {
    h = h.replace(re, '$1\n$2');
  }
  fs.writeFileSync(f, h, 'utf8');
  console.log('patched', p);
});

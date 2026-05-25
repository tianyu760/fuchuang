const fs = require('fs');
const path = require('path');

function strip(file) {
  let html = fs.readFileSync(file, 'utf8');
  const re = /\s*<script>\s*\(function \(\) \{\s*\/\* legacy removed[\s\S]*?<\/script>(?=\s*<\/body>)/;
  if (!re.test(html)) {
    console.log('no match', file);
    return;
  }
  html = html.replace(re, '');
  fs.writeFileSync(file, html, 'utf8');
  console.log('ok', file);
}

strip(path.join(__dirname, '..', 'wenshi.html'));
strip(path.join(__dirname, '..', 'fagui.html'));

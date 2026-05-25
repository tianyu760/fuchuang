const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const htmlFiles = fs.readdirSync(root).filter(function (f) { return f.endsWith('.html'); });

htmlFiles.forEach(function (file) {
  const fp = path.join(root, file);
  let s = fs.readFileSync(fp, 'utf8');
  if (s.includes('js/config/system.js')) return;
  if (!s.includes('js/main.js')) return;
  s = s.replace(
    /(<script src="\.\/js\/main\.js[^"]*"><\/script>)/,
    '<script src="./js/config/system.js"></script>\n    $1'
  );
  fs.writeFileSync(fp, s, 'utf8');
  console.log('injected system.js:', file);
});

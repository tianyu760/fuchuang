const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const targets = [
  path.join(root, 'server', 'data'),
  path.join(root, 'server', 'knowledge-data.json'),
  path.join(root, 'server', 'tokens.json')
];

function shouldSkip(filePath) {
  return filePath.includes('node_modules') ||
    filePath.endsWith('.lock') ||
    filePath.includes('package-lock.json');
}

function walkAndReplace(filePath) {
  if (shouldSkip(filePath)) return 0;
  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    let count = 0;
    fs.readdirSync(filePath).forEach(function (name) {
      count += walkAndReplace(path.join(filePath, name));
    });
    return count;
  }
  if (!/\.json$/i.test(filePath)) return 0;
  const raw = fs.readFileSync(filePath, 'utf8');
  if (!raw.includes('2025')) return 0;
  const next = raw.replace(/2025/g, '2026');
  fs.writeFileSync(filePath, next, 'utf8');
  console.log('updated:', path.relative(root, filePath));
  return 1;
}

let total = 0;
targets.forEach(function (t) {
  if (!fs.existsSync(t)) return;
  total += walkAndReplace(t);
});
console.log('JSON files updated:', total);

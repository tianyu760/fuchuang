/**
 * 服务端 · 法律文书文本清洗（与前端 legal-doc-sanitize.js 逻辑一致）
 */
const PLACEHOLDER_LINE = '________________';

function sanitizeLegalPlaceholders(text) {
  if (text == null) return '';
  let s = String(text);

  s = s.replace(/⟦B:([^⟧]*)⟧/g, (_, inner) => (inner && inner.trim()) ? inner.trim() : PLACEHOLDER_LINE);
  s = s.replace(/⟦[^⟧]*⟧/g, '【待填写】');
  s = s.replace(/\[placeholder\]/gi, '【待填写】');
  s = s.replace(/\bTODO\b/gi, '【待填写】');
  s = s.replace(/\bTBD\b/gi, '【待填写】');
  s = s.replace(/_{3,}/g, PLACEHOLDER_LINE);
  s = s.replace(/(\*\*|__)\s*(\*\*|__)/g, PLACEHOLDER_LINE);
  s = s.replace(/([：:])\s*(【待填写】|\[.*?\]|xxx+|yyy+|XXX+|YYY+)\s*$/gim, (_, colon) => colon + PLACEHOLDER_LINE);
  s = s.replace(/^(原告|被告|申请人|被申请人|委托人|受托人|甲方|乙方|姓名|名称|身份证号|统一社会信用代码|住址|地址|联系方式|联系电话|法定代表人)\s*[：:]\s*$/gim,
    (line) => line + PLACEHOLDER_LINE);
  s = s.replace(/\n{4,}/g, '\n\n\n');
  return s.trim();
}

function chineseDate(d = new Date()) {
  const cn = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const digitYear = (y) => String(y).split('').map((c) => cn[parseInt(c, 10)]).join('');
  const digitMonthDay = (n) => {
    if (n <= 10) return n === 10 ? '十' : (n === 1 ? '十' : '十' + cn[n]);
    if (n < 20) return '十' + cn[n - 10];
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return cn[tens] + '十' + (ones ? cn[ones] : '');
  };
  return `${digitYear(d.getFullYear())}年${digitMonthDay(d.getMonth() + 1)}月${digitMonthDay(d.getDate())}日`;
}

module.exports = {
  PLACEHOLDER_LINE,
  sanitizeLegalPlaceholders,
  chineseDate
};

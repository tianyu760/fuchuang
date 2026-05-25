/**
 * 法律文书文本清洗：去除 ⟦B:⟧ 等占位污染，规范为中文法律文书格式
 */
(function (global) {
  var PLACEHOLDER_LINE = '________________';

  function sanitizeLegalPlaceholders(text) {
    if (text == null) return '';
    var s = String(text);

    s = s.replace(/⟦B:([^⟧]*)⟧/g, function (_, inner) {
      return (inner && inner.trim()) ? inner.trim() : PLACEHOLDER_LINE;
    });
    s = s.replace(/⟦[^⟧]*⟧/g, '【待填写】');
    s = s.replace(/\[placeholder\]/gi, '【待填写】');
    s = s.replace(/\bTODO\b/gi, '【待填写】');
    s = s.replace(/\bTBD\b/gi, '【待填写】');
    s = s.replace(/_{3,}/g, PLACEHOLDER_LINE);
    s = s.replace(/(\*\*|__)\s*(\*\*|__)/g, PLACEHOLDER_LINE);

    s = s.replace(/([：:])\s*(【待填写】|\[.*?\]|xxx+|yyy+|XXX+|YYY+)\s*$/gim, function (_, colon) {
      return colon + PLACEHOLDER_LINE;
    });

    s = s.replace(/^(原告|被告|申请人|被申请人|委托人|受托人|甲方|乙方|姓名|名称|身份证号|统一社会信用代码|住址|地址|联系方式|联系电话|法定代表人)\s*[：:]\s*$/gim,
      function (line) { return line + PLACEHOLDER_LINE; });

    s = s.replace(/\n{4,}/g, '\n\n\n');
    return s.trim();
  }

  function chineseDate(d) {
    d = d || new Date();
    var cn = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    function digitYear(y) {
      return String(y).split('').map(function (c) { return cn[parseInt(c, 10)]; }).join('');
    }
    function digitMonthDay(n) {
      if (n <= 10) return n === 10 ? '十' : (cn[n] === '一' ? '十' : '十' + cn[n]);
      if (n < 20) return '十' + cn[n - 10];
      var tens = Math.floor(n / 10);
      var ones = n % 10;
      return cn[tens] + '十' + (ones ? cn[ones] : '');
    }
    return digitYear(d.getFullYear()) + '年' + digitMonthDay(d.getMonth() + 1) + '月' + digitMonthDay(d.getDate()) + '日';
  }

  function defaultSignature() {
    return '此致\n\nXXX人民法院\n\n具状人：' + PLACEHOLDER_LINE + '\n' + chineseDate();
  }

  global.FayiLegalSanitize = {
    PLACEHOLDER_LINE: PLACEHOLDER_LINE,
    sanitizeLegalPlaceholders: sanitizeLegalPlaceholders,
    chineseDate: chineseDate,
    defaultSignature: defaultSignature
  };
})(typeof window !== 'undefined' ? window : global);

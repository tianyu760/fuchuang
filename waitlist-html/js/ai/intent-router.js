/**
 * 前端意图识别：用于模块路由与上下文冲突检测
 */
(function (global) {
  var INTENT_KEYWORDS = {
    legal_consultation: [
      '怎么办', '如何维权', '报警', '立案', '量刑', '抢劫', '诈骗', '刑事',
      '公安', '律师建议', '怎么处理', '是否违法', '责任'
    ],
    regulation_search: [
      '法律依据', '法条', '第几条', '量刑标准', '司法解释', '检索',
      '法规', '条文', '法律规定', '处罚标准'
    ],
    legal_document: [
      '起诉状', '答辩状', '律师函', '申请书', '合同模板', '文书',
      '诉状', '委托书', '仲裁申请书', '请帮我写'
    ],
    evidence_analysis: [
      '证据', '证据链', '证据充分', '举证', '证据不足', '证据体检',
      '证据分析', '证明力', '证据材料'
    ],
    ocr_material_analysis: [
      '上传', '图片', '识别', 'ocr', '扫描件', '合同照片', '票据照片',
      '分析我上传', '附件分析'
    ]
  };

  var CRIME_DOMAIN = ['抢劫', '诈骗', '刑事', '报警', '公安', '受害人', '立案'];
  var LOAN_DOMAIN = ['借贷', '借款', '欠款', '转账', '还款', '利息', '债权'];

  function hitWords(input, words) {
    input = String(input || '');
    return words.filter(function (w) { return input.indexOf(w) >= 0; });
  }

  function detectIntent(question) {
    var q = String(question || '').trim();
    if (!q) {
      return { intent: 'legal_consultation', score: 0, reason: 'empty_input_default', hitKeywords: [] };
    }
    var best = { intent: 'legal_consultation', score: 0, reason: 'default', hitKeywords: [] };
    Object.keys(INTENT_KEYWORDS).forEach(function (intent) {
      var hits = hitWords(q, INTENT_KEYWORDS[intent]);
      if (hits.length > best.score) {
        best = { intent: intent, score: hits.length, reason: 'keyword_match', hitKeywords: hits };
      }
    });
    if (best.score === 0) best.reason = 'fallback_consultation';
    return best;
  }

  function isKeywordConflict(question, historyText) {
    var q = String(question || '');
    var h = String(historyText || '');
    if (!q || !h) return false;
    var qCrime = hitWords(q, CRIME_DOMAIN).length > 0;
    var qLoan = hitWords(q, LOAN_DOMAIN).length > 0;
    var hCrime = hitWords(h, CRIME_DOMAIN).length > 0;
    var hLoan = hitWords(h, LOAN_DOMAIN).length > 0;
    return (qCrime && hLoan) || (qLoan && hCrime);
  }

  global.FayiIntentRouter = {
    detectIntent: detectIntent,
    isKeywordConflict: isKeywordConflict
  };
})(typeof window !== 'undefined' ? window : global);


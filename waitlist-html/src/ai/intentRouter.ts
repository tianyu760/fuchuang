export type AIIntent =
  | 'legal_consultation'
  | 'regulation_search'
  | 'legal_document'
  | 'evidence_analysis'
  | 'ocr_material_analysis';

export interface IntentResult {
  intent: AIIntent;
  score: number;
  reason: string;
  hitKeywords: string[];
}

const INTENT_KEYWORDS: Record<AIIntent, string[]> = {
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

const CRIME_DOMAIN = ['抢劫', '诈骗', '刑事', '报警', '公安', '受害人', '立案'];
const LOAN_DOMAIN = ['借贷', '借款', '欠款', '转账', '还款', '利息', '债权'];

function countHits(input: string, words: string[]): string[] {
  return words.filter((w) => input.includes(w));
}

export function detectIntent(question: string): IntentResult {
  const q = String(question || '').trim();
  if (!q) {
    return {
      intent: 'legal_consultation',
      score: 0,
      reason: 'empty_input_default',
      hitKeywords: []
    };
  }

  let best: IntentResult = {
    intent: 'legal_consultation',
    score: 0,
    reason: 'default',
    hitKeywords: []
  };

  (Object.keys(INTENT_KEYWORDS) as AIIntent[]).forEach((intent) => {
    const hits = countHits(q, INTENT_KEYWORDS[intent]);
    if (hits.length > best.score) {
      best = {
        intent,
        score: hits.length,
        reason: 'keyword_match',
        hitKeywords: hits
      };
    }
  });

  if (best.score === 0) {
    best.reason = 'fallback_consultation';
  }
  return best;
}

export function isKeywordConflict(question: string, historyText: string): boolean {
  const q = String(question || '');
  const h = String(historyText || '');
  if (!q || !h) return false;

  const qCrime = countHits(q, CRIME_DOMAIN).length > 0;
  const qLoan = countHits(q, LOAN_DOMAIN).length > 0;
  const hCrime = countHits(h, CRIME_DOMAIN).length > 0;
  const hLoan = countHits(h, LOAN_DOMAIN).length > 0;

  return (qCrime && hLoan) || (qLoan && hCrime);
}


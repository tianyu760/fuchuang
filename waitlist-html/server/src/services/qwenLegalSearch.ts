import axios from 'axios';

export type QwenLawItem = {
  law_name: string;
  article: string;
  content: string;
  interpretation: string;
  scenario: string;
};

export type QwenLegalSearchPayload = {
  title: string;
  laws: QwenLawItem[];
  analysis: string;
  practical_advice: string;
  risk_notice: string;
};

const SYSTEM_PROMPT = [
  '你是一名专业的中国法律法规检索助手。',
  '你需要准确检索中国法律法规与司法解释，并以正式法律语言输出。',
  '禁止输出 Markdown 符号（#、##、---），禁止引用历史上下文。',
  '仅输出 JSON，格式如下：',
  '{',
  '  "title": "法规检索标题",',
  '  "laws": [{',
  '    "law_name": "法律名称",',
  '    "article": "条文编号",',
  '    "content": "条文要点",',
  '    "interpretation": "法条解析",',
  '    "scenario": "适用场景"',
  '  }],',
  '  "analysis": "法条解析",',
  '  "practical_advice": "适用说明",',
  '  "risk_notice": "风险提示"',
  '}'
].join('\n');

export async function qwenLegalSearch(question: string): Promise<string> {
  const apiKey = (process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY || '').trim();
  const baseURL = process.env.QWEN_LEGAL_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
  const model = process.env.QWEN_LEGAL_MODEL || 'qwen-plus';
  if (!apiKey) {
    throw new Error('未配置 DASHSCOPE_API_KEY/QWEN_API_KEY');
  }

  const res = await axios.post(baseURL, {
    model,
    temperature: 0.15,
    max_tokens: 2200,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: String(question || '').trim() }
    ]
  }, {
    timeout: Number(process.env.QWEN_LEGAL_TIMEOUT_MS || 25000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json; charset=utf-8'
    }
  });

  return String(res?.data?.choices?.[0]?.message?.content || '').trim();
}

const axios = require('axios');

const LEGAL_SEARCH_SYSTEM_PROMPT = [
  '你是一名专业的中国法律法规检索助手。',
  '你的职责：',
  '1. 准确检索中国法律法规',
  '2. 输出相关法条',
  '3. 给出简要法律解释',
  '4. 保持正式法律语言',
  '5. 不生成无关案件内容',
  '6. 不输出AI口语化内容',
  '7. 不引用历史上下文',
  '8. 不虚构法律条文',
  '输出必须是一个合法 JSON 对象，禁止输出 Markdown 符号（#、##、---）。',
  'JSON Schema：',
  '{',
  '  "title": "法规检索标题",',
  '  "laws": [',
  '    {',
  '      "law_name": "法律名称",',
  '      "article": "条文编号",',
  '      "content": "条文内容或要点",',
  '      "interpretation": "法条解析",',
  '      "scenario": "适用场景"',
  '    }',
  '  ],',
  '  "analysis": "法条解析",',
  '  "practical_advice": "适用说明",',
  '  "risk_notice": "风险提示"',
  '}'
].join('\n');

function getConfig() {
  return {
    apiKey: (process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY || '').trim(),
    baseURL: process.env.QWEN_LEGAL_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    model: process.env.QWEN_LEGAL_MODEL || 'qwen-plus',
    timeout: Number(process.env.QWEN_LEGAL_TIMEOUT_MS || 60000)
  };
}

function extractContent(resp) {
  return String(
    resp &&
    resp.data &&
    resp.data.choices &&
    resp.data.choices[0] &&
    resp.data.choices[0].message &&
    resp.data.choices[0].message.content || ''
  ).trim();
}

async function searchLegalByQwen(userQuestion) {
  const cfg = getConfig();
  if (!cfg.apiKey) {
    const err = new Error('未配置 DASHSCOPE_API_KEY/QWEN_API_KEY');
    err.statusCode = 500;
    throw err;
  }
  const question = String(userQuestion || '').trim();
  if (!question) {
    const err = new Error('检索词不能为空');
    err.statusCode = 400;
    throw err;
  }

  const payload = {
    model: cfg.model,
    temperature: 0.15,
    max_tokens: 2200,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: LEGAL_SEARCH_SYSTEM_PROMPT },
      { role: 'user', content: question }
    ]
  };

  const resp = await axios.post(cfg.baseURL, payload, {
    timeout: cfg.timeout,
    headers: {
      Authorization: 'Bearer ' + cfg.apiKey,
      'Content-Type': 'application/json'
    }
  });

  const content = extractContent(resp);
  if (!content) {
    const err = new Error('法规检索模型返回为空');
    err.statusCode = 502;
    throw err;
  }
  return content;
}

module.exports = {
  LEGAL_SEARCH_SYSTEM_PROMPT,
  searchLegalByQwen
};

const axios = require('axios');

const LEGAL_DOCUMENT_SYSTEM_PROMPT = [
  '你是一名专业中国法律文书助手。',
  '请根据用户描述，生成正式、规范、简洁的法律文书。',
  '要求：',
  '1. 使用正式法律语言',
  '2. 保持清晰结构',
  '3. 自动分段',
  '4. 不输出Markdown符号',
  '5. 不输出#',
  '6. 不输出AI口语',
  '7. 不输出“当然可以”',
  '8. 不输出乱码占位符',
  '输出为纯文本法律文书，不要JSON，不要解释前缀。'
].join('\n');

function getConfig() {
  return {
    apiKey: (process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY || '').trim(),
    baseURL: process.env.QWEN_LEGAL_DOC_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    model: process.env.QWEN_LEGAL_DOC_MODEL || 'qwen-plus',
    timeout: Number(process.env.QWEN_LEGAL_DOC_TIMEOUT_MS || 30000)
  };
}

function cleanOutput(text) {
  return String(text || '')
    .replace(/^```[\s\S]*?\n/g, '')
    .replace(/```$/g, '')
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/^\s*(以下是|当然可以|作为AI|我作为AI)[^\n]*$/gim, '')
    .replace(/\*\*|__|`{1,3}/g, '')
    .replace(/⟦[^⟧]*⟧/g, '________________')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function generateLegalDocumentByQwen(question) {
  const cfg = getConfig();
  if (!cfg.apiKey) {
    const err = new Error('未配置 DASHSCOPE_API_KEY/QWEN_API_KEY');
    err.statusCode = 500;
    throw err;
  }
  const q = String(question || '').trim();
  if (!q) {
    const err = new Error('问题不能为空');
    err.statusCode = 400;
    throw err;
  }

  const resp = await axios.post(cfg.baseURL, {
    model: cfg.model,
    temperature: 0.2,
    max_tokens: 2200,
    messages: [
      { role: 'system', content: LEGAL_DOCUMENT_SYSTEM_PROMPT },
      { role: 'user', content: q }
    ]
  }, {
    timeout: cfg.timeout,
    headers: {
      Authorization: 'Bearer ' + cfg.apiKey,
      'Content-Type': 'application/json'
    }
  });

  const content = String(resp?.data?.choices?.[0]?.message?.content || '').trim();
  if (!content) {
    const err = new Error('文书生成模型返回为空');
    err.statusCode = 502;
    throw err;
  }
  return cleanOutput(content);
}

module.exports = {
  generateLegalDocumentByQwen,
  LEGAL_DOCUMENT_SYSTEM_PROMPT,
  cleanOutput
};

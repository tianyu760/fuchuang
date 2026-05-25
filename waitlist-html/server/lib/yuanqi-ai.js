/**
 * 法绎 · 腾讯元器统一 AI 请求层（纯透传，不拼接业务 Prompt）
 * 智能体工作流（系统提示、法律逻辑、输出规范）均在元器平台配置。
 */
const axios = require('axios');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { normalizeChatOutput } = require('./ai-response');

const YUANQI_API_KEY = process.env.YUANQI_API_KEY || 'RaqhXeGobiQ4x1aoAPfggylMGhEbW7yB';
const YUANQI_ASSISTANT_ID = process.env.YUANQI_ASSISTANT_ID || '2038958111366997824';
const YUANQI_BASE_URL = process.env.YUANQI_BASE_URL || 'https://yuanqi.tencent.com/openapi/v1/agent/chat/completions';

/** 文档说明用：元器 API 不支持 system role，此常量不注入请求 */
const MINIMAL_SYSTEM_NOTE = '你是法绎AI助手。\n请直接基于腾讯元器工作流进行回答。';

/**
 * 建议在元器控制台配置的对话输出风格（不注入 API，供运维参考）
 * 代码侧通过 chat-text-style.js 做后处理兜底。
 */
const CONSULT_OUTPUT_STYLE = [
  '回答风格：自然、简洁，像真实律师沟通，减少机械化结构。',
  '禁止使用 Markdown 标题符号（# ## ###）及复杂列表、分隔线。',
  '如需分层，使用【章节名】或「一、章节名」等自然段落标题。',
  '保留适度换行即可，避免 AI 模板感。'
].join('\n');

const PLACEHOLDER = {
  image: '[图片]',
  file: '[文件]',
  empty: '[消息]'
};

function normalizeMessages(msgs) {
  if (!msgs || msgs.length === 0) return [];

  const nonEmpty = msgs.filter(function (m) {
    return m && m.content && String(m.content).trim() !== '';
  });
  if (nonEmpty.length === 0) return [];

  const merged = [];
  for (var i = 0; i < nonEmpty.length; i++) {
    var msg = nonEmpty[i];
    if (merged.length > 0 && merged[merged.length - 1].role === msg.role) {
      merged[merged.length - 1].content += '\n' + msg.content;
    } else {
      merged.push({ role: msg.role, content: String(msg.content) });
    }
  }

  while (merged.length > 0 && merged[0].role !== 'user') merged.shift();
  while (merged.length > 0 && merged[merged.length - 1].role !== 'user') merged.pop();

  return merged.slice(-40);
}

/**
 * 调用腾讯元器（user/assistant 透传）
 * @param {Array<{role:string,content:string}>} apiMessages
 * @param {string} userId
 * @returns {Promise<string>}
 */
async function callTencentAgent(apiMessages, userId) {
  if (!YUANQI_API_KEY) {
    throw new Error('YUANQI_API_KEY 未配置');
  }

  const normalizedMessages = normalizeMessages(apiMessages);
  if (!normalizedMessages.length) {
    throw new Error('messages 不能为空');
  }

  const reqBody = {
    assistant_id: YUANQI_ASSISTANT_ID,
    user_id: userId || 'fayi_user',
    stream: false,
    messages: normalizedMessages.map(function (m) {
      return {
        role: m.role,
        content: [{ type: 'text', text: String(m.content || '') }]
      };
    })
  };

  const reqHeaders = {
    Authorization: 'Bearer ' + YUANQI_API_KEY,
    'Content-Type': 'application/json',
    'X-Source': 'openapi'
  };

  try {
    const response = await axios.post(YUANQI_BASE_URL, reqBody, {
      headers: reqHeaders,
      timeout: 120000
    });

    const reply = normalizeChatOutput(response.data);

    return reply || '智能体未返回内容，请检查 messages 结构';
  } catch (err) {
    const errData = err.response?.data;
    const errStatus = err.response?.status || 500;
    const errMessage = (errData && (errData.message || errData.error?.message || JSON.stringify(errData))) || err.message;
    const e = new Error(errMessage);
    e.statusCode = errStatus;
    e.responseData = errData;
    throw e;
  }
}

/** 格式化附件块（无业务指令，仅数据透传） */
function formatAttachment(label, text) {
  var body = String(text || '').trim();
  if (!body) return '';
  return '[' + label + ']\n' + body;
}

/** 合并用户输入与上下文附件为单条 user 消息 */
function buildPassthroughUserContent(userText, attachments) {
  var parts = [];
  (attachments || []).forEach(function (a) {
    if (a && a.label) parts.push(formatAttachment(a.label, a.text));
  });
  var user = String(userText || '').trim();
  if (user) parts.push(user);
  return parts.join('\n\n---\n\n') || PLACEHOLDER.empty;
}

/** 带历史的多轮透传 */
async function chatPassthrough(options) {
  options = options || {};
  var history = (options.messages || options.history || [])
    .filter(function (m) { return m && (m.role === 'user' || m.role === 'assistant'); })
    .map(function (m) { return { role: m.role, content: String(m.content || '') }; });

  if (options.attachments && options.attachments.length) {
    var lastUserIdx = -1;
    for (var i = history.length - 1; i >= 0; i--) {
      if (history[i].role === 'user') { lastUserIdx = i; break; }
    }
    var merged = buildPassthroughUserContent(
      lastUserIdx >= 0 ? history[lastUserIdx].content : '',
      options.attachments
    );
    if (lastUserIdx >= 0) history[lastUserIdx].content = merged;
    else history.push({ role: 'user', content: merged });
  }

  return callTencentAgent(history, options.userId || 'fayi_user');
}

/** 单轮任务透传（文书/法规/普法等） */
async function taskPassthrough(userContent, options) {
  options = options || {};
  var history = (options.history || [])
    .filter(function (m) { return m && m.role && m.content; })
    .map(function (m) { return { role: m.role, content: String(m.content) }; });
  history.push({ role: 'user', content: String(userContent || '').trim() || PLACEHOLDER.empty });
  return callTencentAgent(history, options.userId || 'fayi_task_user');
}

module.exports = {
  YUANQI_API_KEY,
  YUANQI_ASSISTANT_ID,
  YUANQI_BASE_URL,
  MINIMAL_SYSTEM_NOTE,
  CONSULT_OUTPUT_STYLE,
  PLACEHOLDER,
  normalizeMessages,
  callTencentAgent,
  formatAttachment,
  buildPassthroughUserContent,
  chatPassthrough,
  taskPassthrough
};

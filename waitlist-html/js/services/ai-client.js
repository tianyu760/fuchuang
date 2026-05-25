/**
 * 法绎 · 统一 AI 客户端（纯透传，禁止页面内拼接业务 Prompt）
 * 所有 AI 能力经此模块调用 3002 后端 → 腾讯元器工作流
 */
(function (global) {
  var API_BASE = 'http://localhost:3002';

  function getAuthHeaders(extra) {
    var h = Object.assign({ 'Content-Type': 'application/json' }, extra || {});
    if (global.FayiAuth && FayiAuth.getToken) {
      var t = FayiAuth.getToken();
      if (t) h.Authorization = 'Bearer ' + t;
    }
    return h;
  }

  function getFormAuthHeaders() {
    var h = {};
    if (global.FayiAuth && FayiAuth.getToken) {
      var t = FayiAuth.getToken();
      if (t) h.Authorization = 'Bearer ' + t;
    }
    return h;
  }

  function notifyRealtime(path) {
    if (global.FayiRealtime && FayiRealtime.notify) {
      FayiRealtime.notify({ type: path });
    }
  }

  function normalizeReply(json) {
    if (!json) return json;
    var norm = global.FayiAIResponse && FayiAIResponse.normalizeChatOutput
      ? FayiAIResponse.normalizeChatOutput
      : null;
    if (!norm) return json;
    if (json.content != null) json.content = norm(json.content);
    if (json.raw != null) json.raw = norm(json.raw);
    if (json.analysis != null) json.analysis = norm(json.analysis);
    return json;
  }

  function postJson(path, body, extraHeaders) {
    return fetch(API_BASE + path, {
      method: 'POST',
      headers: getAuthHeaders(extraHeaders),
      body: JSON.stringify(body || {})
    }).then(function (r) {
      return r.json().then(function (json) {
        if (!r.ok || (json && json.success === false && json.ok === false)) {
          var msg = (json && (json.message || json.error)) || ('HTTP ' + r.status);
          var err = new Error(msg);
          err.detail = json;
          throw err;
        }
        notifyRealtime(path);
        return normalizeReply(json);
      });
    });
  }

  function postForm(path, formData, signal) {
    var opts = {
      method: 'POST',
      headers: getFormAuthHeaders(),
      body: formData
    };
    if (signal) opts.signal = signal;
    return fetch(API_BASE + path, opts).then(function (r) {
      return r.json().then(function (json) {
        if (!r.ok && json && json.success !== false) {
          var err = new Error((json && (json.message || json.error)) || ('HTTP ' + r.status));
          err.detail = json;
          throw err;
        }
        notifyRealtime(path);
        return normalizeReply(json);
      });
    });
  }

  /** 展示层：提取 + 清洗 + IM 渲染 */
  function formatForDisplay(raw) {
    var text = raw;
    if (global.FayiAIResponse && FayiAIResponse.normalizeChatOutput) {
      text = FayiAIResponse.normalizeChatOutput(raw);
    }
    if (global.FayiChatStyle && FayiChatStyle.formatAIResponse && global.FayiAiLegal && FayiAiLegal.escHtml) {
      return FayiChatStyle.formatAIResponse(text, FayiAiLegal.escHtml);
    }
    if (global.FayiChatStyle && FayiChatStyle.formatChatHtml && global.FayiAiLegal && FayiAiLegal.escHtml) {
      return FayiChatStyle.formatChatHtml(text, FayiAiLegal.escHtml);
    }
    return text == null ? '' : String(text);
  }

  function filterMarkdownText(raw) {
    if (global.FayiChatStyle && FayiChatStyle.filterMarkdown) {
      return FayiChatStyle.filterMarkdown(raw);
    }
    return raw == null ? '' : String(raw);
  }

  global.FayiAI = {
    API_BASE: API_BASE,
    formatForDisplay: formatForDisplay,
    filterMarkdown: filterMarkdownText,
    normalizeChatOutput: function (raw) {
      if (global.FayiAIResponse && FayiAIResponse.normalizeChatOutput) {
        return FayiAIResponse.normalizeChatOutput(raw);
      }
      return raw == null ? '' : String(raw);
    },

    /** 法律咨询多轮对话 */
    chat: function (payload) {
      var lastUser = (payload && payload.messages || []).slice().reverse().find(function (m) {
        return m && m.role === 'user';
      });
      var intent = (global.FayiIntentRouter && FayiIntentRouter.detectIntent)
        ? FayiIntentRouter.detectIntent(lastUser && lastUser.content || '')
        : { intent: 'legal_consultation' };
      return postJson('/api/chat', {
        messages: (payload && payload.messages) || [],
        imageFiles: (payload && payload.imageFiles) || [],
        docFiles: (payload && payload.docFiles) || [],
        strictWorkflow: payload && payload.strictWorkflow !== false,
        carryHistory: !!(payload && payload.carryHistory),
        module: 'legal_consultation',
        intent: intent.intent,
        conversationId: payload && payload.conversationId,
        sessionId: payload && payload.sessionId
      });
    },

    /** 案件分析（OCR + 文件）— 返回元器原始文本 */
    processCase: function (formData, options) {
      return postForm('/api/process-case', formData, options && options.signal);
    },

    /** 图片 OCR + 分析 */
    processImage: function (formData, options) {
      return postForm('/api/process-image', formData, options && options.signal);
    },

    /** 法律文书生成 */
    generateWenshi: function (question, history, options) {
      var intent = (global.FayiIntentRouter && FayiIntentRouter.detectIntent)
        ? FayiIntentRouter.detectIntent(question || '')
        : { intent: 'legal_document' };
      return postJson('/api/wenshi/generate', {
        question: question,
        history: history || [],
        module: 'legal_document',
        intent: intent.intent,
        conversationId: options && options.conversationId
      });
    },

    /** 法规检索 */
    searchFagui: function (query, history, options) {
      var intent = (global.FayiIntentRouter && FayiIntentRouter.detectIntent)
        ? FayiIntentRouter.detectIntent(query || '')
        : { intent: 'regulation_search' };
      return postJson('/api/fagui/search', {
        query: query,
        history: history || [],
        module: 'regulation_search',
        intent: intent.intent,
        conversationId: options && options.conversationId
      });
    },

    /** 普法 AI 辅助 */
    lawAssist: function (question, options) {
      return postJson('/api/law-education/ai-assist', {
        question: question,
        conversationId: options && options.conversationId
      });
    }
  };
})(typeof window !== 'undefined' ? window : global);

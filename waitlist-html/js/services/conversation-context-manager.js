/**
 * 模块级上下文隔离管理器
 * - 每个模块单独历史
 * - 模块切换自动清理上一个模块的临时上下文
 */
(function (global) {
  var STORAGE_KEY = 'fayi_module_context_v1';
  var activeModule = null;
  var contextMap = load();

  function load() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function persist() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(contextMap));
    } catch (e) {
      // ignore
    }
  }

  function ensure(moduleName) {
    if (!contextMap[moduleName]) {
      contextMap[moduleName] = { messages: [], updatedAt: Date.now() };
    }
    return contextMap[moduleName];
  }

  function clearContext(moduleName) {
    if (moduleName) {
      delete contextMap[moduleName];
    } else {
      contextMap = {};
    }
    persist();
  }

  function switchModule(moduleName) {
    if (!moduleName) return;
    if (activeModule && activeModule !== moduleName) {
      // 切模块时清理上一个模块，防止跨模块串台
      clearContext(activeModule);
    }
    activeModule = moduleName;
    ensure(moduleName);
    persist();
  }

  function getMessages(moduleName) {
    return (ensure(moduleName).messages || []).slice();
  }

  function setMessages(moduleName, messages) {
    var ctx = ensure(moduleName);
    ctx.messages = Array.isArray(messages) ? messages.slice(-12) : [];
    ctx.updatedAt = Date.now();
    persist();
    return ctx.messages.slice();
  }

  function appendMessages(moduleName, messages) {
    var ctx = ensure(moduleName);
    var incoming = Array.isArray(messages) ? messages : [];
    ctx.messages = (ctx.messages || []).concat(incoming).slice(-12);
    ctx.updatedAt = Date.now();
    persist();
    return ctx.messages.slice();
  }

  global.FayiContextManager = {
    switchModule: switchModule,
    clearContext: clearContext,
    getMessages: getMessages,
    setMessages: setMessages,
    appendMessages: appendMessages
  };
})(typeof window !== 'undefined' ? window : global);


(function () {
  var MODULE = 'regulation_search';
  var chatHistory = [];
  var conversationId = sessionStorage.getItem('fayi_fagui_conversation_id') || ('fagui_' + Date.now());
  sessionStorage.setItem('fayi_fagui_conversation_id', conversationId);

  function doSearch(query) {
    if (!query || !window.FayiAiLegal) return;

    var submitBtn   = document.getElementById('fagui-submit');
    var resultDiv   = document.getElementById('fagui-result');
    var answerDiv   = document.getElementById('fagui-answer');
    var loadingDiv  = document.getElementById('fagui-loading');
    var followupDiv = document.getElementById('fagui-followups');

    resultDiv.classList.add('hidden');
    followupDiv.innerHTML = '';
    loadingDiv.classList.remove('hidden');
    if (submitBtn) submitBtn.disabled = true;

    if (window.FayiIntentRouter && window.FayiContextManager) {
      var histText = chatHistory.map(function (m) { return m.content || ''; }).join('\n');
      if (FayiIntentRouter.isKeywordConflict(query, histText)) {
        chatHistory = [];
        FayiContextManager.clearContext(MODULE);
        if (window.FayiToast) FayiToast('检测到历史上下文冲突，已自动清空检索会话', 'success');
      }
    }

    FayiAiLegal.searchFagui(query, chatHistory, { conversationId: conversationId })
      .then(function (res) {
        var data = res.data || {};
        chatHistory.push({ role: 'user', content: query });
        chatHistory.push({ role: 'assistant', content: JSON.stringify(data) });
        if (chatHistory.length > 12) chatHistory = chatHistory.slice(chatHistory.length - 12);
        if (window.FayiContextManager) {
          FayiContextManager.setMessages(MODULE, chatHistory);
        }

        loadingDiv.classList.add('hidden');
        answerDiv.innerHTML = FayiAiLegal.renderFaguiResult(data);
        FayiAiLegal.renderFollowups(data.followups, followupDiv, 'fg-followup-btn fagui-followup ai-followup-pill', doSearch);
        resultDiv.classList.remove('hidden');
        resultDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        if (window.FayiActivity) {
          var kw = data.keyword || query;
          var firstLaw = data.matched_laws && data.matched_laws[0];
          var lawTitle = firstLaw
            ? '检索《' + FayiActivity.truncate(firstLaw.law_name + (firstLaw.article ? ' ' + firstLaw.article : ''), 28) + '》'
            : '查询「' + FayiActivity.truncate(query, 20) + '」相关法规';
          var md = FayiAiLegal.faguiToMarkdown ? FayiAiLegal.faguiToMarkdown(data, query) : '';
          FayiActivity.addActivityLog({
            type: 'law_search',
            title: lawTitle,
            summary: '关键词：' + FayiActivity.truncate(kw, 60),
            userInput: query,
            markdown: md,
            content: FayiAiLegal.renderFaguiResult(data),
            status: 'completed',
            exportable: true
          });
        }
      })
      .catch(function (e) {
        loadingDiv.classList.add('hidden');
        if (window.FayiToast) FayiToast('请求失败：' + e.message, 'error');
      })
      .finally(function () {
        if (submitBtn) submitBtn.disabled = false;
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (window.FayiContextManager) {
      FayiContextManager.switchModule(MODULE);
      chatHistory = FayiContextManager.getMessages(MODULE);
    }

    if (!window.FayiAuth || !FayiAuth.getCurrentUser()) return;
    var reg = sessionStorage.getItem('fayi_regenerate_law_search');
    if (reg) {
      var inp = document.getElementById('fagui-input');
      if (inp) inp.value = reg;
      sessionStorage.removeItem('fayi_regenerate_law_search');
    }

    document.querySelectorAll('.fagui-quick').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.getElementById('fagui-input').value = btn.getAttribute('data-q');
        document.getElementById('fagui-input').focus();
      });
    });

    document.getElementById('fagui-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var q = document.getElementById('fagui-input').value.trim();
      if (!q) { if (window.FayiToast) FayiToast('请输入检索内容', 'error'); return; }
      chatHistory = [];
      if (window.FayiContextManager) FayiContextManager.clearContext(MODULE);
      doSearch(q);
    });
  });
})();

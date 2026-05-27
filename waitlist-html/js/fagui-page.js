(function () {
  var API_HEALTH = 'http://localhost:3002/health';
  var conversationId = sessionStorage.getItem('fayi_fagui_conversation_id') || ('fagui_' + Date.now());
  sessionStorage.setItem('fayi_fagui_conversation_id', conversationId);

  function checkLegalService() {
    return fetch(API_HEALTH, { method: 'GET' })
      .then(function (r) { return r.json(); })
      .then(function (j) { return !!(j && j.ok); })
      .catch(function () { return false; });
  }

  function notifyServiceDown() {
    if (window.FayiToast) {
      FayiToast('法规检索服务未启动，请先运行 server/multimodal-server.js（端口 3002）', 'error');
    }
  }

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

    FayiAiLegal.searchFagui(query, [], { conversationId: conversationId })
      .then(function (res) {
        var data = res.data || {};

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
        var msg = (e && e.message) || '未知错误';
        if (/failed to fetch|network|未启动|不可用/i.test(msg)) {
          notifyServiceDown();
        } else if (window.FayiToast) {
          FayiToast('请求失败：' + msg, 'error');
        }
      })
      .finally(function () {
        if (submitBtn) submitBtn.disabled = false;
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!window.FayiAuth || !FayiAuth.getCurrentUser()) return;

    checkLegalService().then(function (ok) {
      if (!ok) notifyServiceDown();
    });

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
      doSearch(q);
    });
  });
})();

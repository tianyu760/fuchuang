(function () {
  var lastQuestion = '';
  var lastDocData = null;
  var conversationId = sessionStorage.getItem('fayi_wenshi_conversation_id') || ('wenshi_' + Date.now());
  sessionStorage.setItem('fayi_wenshi_conversation_id', conversationId);

  function bindToolbar(data) {
    lastDocData = data;
    var wordBtn = document.getElementById('legal-btn-word');
    var pdfBtn = document.getElementById('legal-btn-pdf');
    var copyBtn = document.getElementById('legal-btn-copy');

    if (wordBtn) {
      wordBtn.onclick = function () {
        if (window.FayiLegalExport) FayiLegalExport.exportLegalDocument(lastDocData);
      };
    }
    if (pdfBtn) {
      pdfBtn.onclick = function () {
        if (window.FayiLegalExport) FayiLegalExport.exportLegalPdf(lastDocData);
      };
    }
    if (copyBtn) {
      copyBtn.onclick = function () {
        if (window.FayiLegalExport) FayiLegalExport.copyLegalContent(lastDocData);
      };
    }
  }

  function doAsk(question) {
    if (!question || !window.FayiAiLegal) return;
    lastQuestion = question;
    var submitBtn   = document.getElementById('wenshi-submit');
    var resultDiv   = document.getElementById('wenshi-result');
    var answerDiv   = document.getElementById('wenshi-answer');
    var loadingDiv  = document.getElementById('wenshi-loading');
    var followupDiv = document.getElementById('wenshi-followups');

    resultDiv.classList.add('hidden');
    followupDiv.innerHTML = '';
    loadingDiv.classList.remove('hidden');
    if (submitBtn) submitBtn.disabled = true;

    FayiAiLegal.generateWenshi(question, [], { conversationId: conversationId })
      .then(function (res) {
        var data = res.data || {};

        loadingDiv.classList.add('hidden');
        answerDiv.innerHTML = FayiAiLegal.renderWenshiResult(data);
        bindToolbar(data);
        FayiAiLegal.renderFollowups(data.followups, followupDiv, 'ws-followup-pill ai-followup-pill', doAsk);
        resultDiv.classList.remove('hidden');
        resultDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        if (window.FayiActivity) {
          var docTitle = data.title || question;
          var md = FayiAiLegal.wenshiToMarkdown ? FayiAiLegal.wenshiToMarkdown(data, question) : '';
          FayiActivity.addActivityLog({
            type: 'document',
            title: '生成《' + FayiActivity.truncate(docTitle, 24) + '》',
            summary: FayiActivity.truncate(data.summary || question, 80),
            userInput: question,
            markdown: md,
            content: FayiAiLegal.renderWenshiResult(data),
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
    if (!window.FayiAuth || !FayiAuth.getCurrentUser()) return;
    var reg = sessionStorage.getItem('fayi_regenerate_document');
    if (reg) {
      var inp = document.getElementById('wenshi-input');
      if (inp) inp.value = reg;
      sessionStorage.removeItem('fayi_regenerate_document');
    }

    document.querySelectorAll('.wenshi-quick').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.getElementById('wenshi-input').value = btn.getAttribute('data-q');
        document.getElementById('wenshi-input').focus();
      });
    });

    document.getElementById('wenshi-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var q = document.getElementById('wenshi-input').value.trim();
      if (!q) { if (window.FayiToast) FayiToast('请输入您的问题', 'error'); return; }
      doAsk(q);
    });
  });
})();

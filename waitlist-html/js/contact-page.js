/**
 * 法绎 · 联系我们 / 留言反馈
 */
(function () {
  var CONTACT_API = 'http://localhost:3001/api/contact';
  var DEFAULT_EMAIL = 'noreply@fayi-ai.com';
  var MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10MB

  function toEmailIfPossible(contact) {
    var c = String(contact || '').trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) return c;
    return DEFAULT_EMAIL;
  }

  function collectFilesText(fileInput) {
    if (!fileInput || !fileInput.files || !fileInput.files.length) return '无';
    return Array.prototype.map.call(fileInput.files, function (f) { return f.name; }).join('、');
  }

  function validateFiles(fileInput) {
    if (!fileInput || !fileInput.files || !fileInput.files.length) return null;
    var allowedExt = ['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'zip', 'txt'];
    for (var i = 0; i < fileInput.files.length; i++) {
      var f = fileInput.files[i];
      if (f.size > MAX_UPLOAD_SIZE) {
        return '附件大小不能超过10MB';
      }
      var name = String(f.name || '').toLowerCase();
      var ext = '';
      var idx = name.lastIndexOf('.');
      if (idx >= 0) ext = name.slice(idx + 1);
      if (allowedExt.indexOf(ext) === -1) {
        return '附件类型不支持，仅支持 pdf/doc/docx/png/jpg/jpeg/zip/txt';
      }
    }
    return null;
  }

  function bindFileHint() {
    var fileInput = document.getElementById('ct-files');
    var hint = document.getElementById('ct-file-hint');
    if (!fileInput || !hint) return;
    fileInput.addEventListener('change', function () {
      var text = collectFilesText(fileInput);
      hint.textContent = text === '无' ? '未选择附件' : ('已选择附件：' + text);
    });
  }

  function resetForm() {
    var form = document.getElementById('ct-form');
    var hint = document.getElementById('ct-file-hint');
    if (form) form.reset();
    if (hint) hint.textContent = '未选择附件';
  }

  function bindSubmit() {
    var submitBtn = document.getElementById('ct-submit-btn');
    var btnText = document.getElementById('ct-btn-text');
    var btnSpinner = document.getElementById('ct-btn-spinner');
    var form = document.getElementById('ct-form');
    if (!submitBtn || !form) return;

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var type = (document.getElementById('ct-type').value || '').trim();
      var contact = (document.getElementById('ct-contact').value || '').trim();
      var message = (document.getElementById('ct-message').value || '').trim();
      var fileInput = document.getElementById('ct-files');
      var filesText = collectFilesText(fileInput);

      if (!type) {
        if (window.FayiToast) FayiToast('请选择反馈类型', 'error');
        return;
      }
      if (!message) {
        if (window.FayiToast) FayiToast('请填写问题描述', 'error');
        return;
      }
      var fileErr = validateFiles(fileInput);
      if (fileErr) {
        if (window.FayiToast) FayiToast(fileErr, 'error');
        return;
      }

      submitBtn.disabled = true;
      if (btnText) btnText.textContent = '正在上传附件并提交反馈...';
      if (btnSpinner) btnSpinner.classList.remove('hidden');
      if (window.FayiToast) FayiToast('正在上传附件并提交反馈…', 'success');

      try {
        var formData = new FormData();
        formData.append('name', '平台用户反馈');
        formData.append('email', toEmailIfPossible(contact));
        formData.append('contact', contact || '');
        formData.append('identity', type);
        formData.append('message', message);
        formData.append('attachmentText', filesText);
        if (window.FayiAuth && FayiAuth.getCurrentUser) {
          var u = FayiAuth.getCurrentUser();
          if (u && u.email) formData.append('userEmail', u.email);
        }
        if (fileInput && fileInput.files && fileInput.files.length) {
          Array.prototype.forEach.call(fileInput.files, function (file) {
            formData.append('files', file);
          });
        }
        var resp = await fetch(CONTACT_API, {
          method: 'POST',
          body: formData
        });
        var data = await resp.json();
        if (data && data.success) {
          if (window.FayiToast) FayiToast('反馈已提交，附件已发送成功。', 'success');
          resetForm();
        } else {
          if (window.FayiToast) FayiToast((data && data.message) || '附件发送失败，请稍后重试。', 'error');
        }
      } catch (err) {
        if (window.FayiToast) FayiToast('附件发送失败，请稍后重试。', 'error');
      } finally {
        submitBtn.disabled = false;
        if (btnText) btnText.textContent = '提交反馈';
        if (btnSpinner) btnSpinner.classList.add('hidden');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindFileHint();
    bindSubmit();
  });
})();

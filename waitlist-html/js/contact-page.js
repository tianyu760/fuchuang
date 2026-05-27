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
    return fileInput.files[0].name || '未命名附件';
  }

  function validateFiles(fileInput) {
    if (!fileInput || !fileInput.files || !fileInput.files.length) return null;
    var allowedExt = ['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg'];
    var f = fileInput.files[0];
    if (f.size > MAX_UPLOAD_SIZE) {
      return '附件大小不能超过10MB';
    }
    var name = String(f.name || '').toLowerCase();
    var ext = '';
    var idx = name.lastIndexOf('.');
    if (idx >= 0) ext = name.slice(idx + 1);
    if (allowedExt.indexOf(ext) === -1) {
      return '附件类型不支持，仅支持 pdf/doc/docx/png/jpg/jpeg';
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
      var name = (document.getElementById('ct-name').value || '').trim();
      var email = (document.getElementById('ct-email').value || '').trim();
      var contact = (document.getElementById('ct-contact').value || '').trim();
      var message = (document.getElementById('ct-message').value || '').trim();
      var fileInput = document.getElementById('ct-files');
      var filesText = collectFilesText(fileInput);

      if (!type) {
        if (window.FayiToast) FayiToast('请选择反馈类型', 'error');
        return;
      }
      if (!name) {
        if (window.FayiToast) FayiToast('请填写姓名', 'error');
        return;
      }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        if (window.FayiToast) FayiToast('请填写有效邮箱', 'error');
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
      if (btnText) btnText.textContent = '正在发送...';
      if (btnSpinner) btnSpinner.classList.remove('hidden');
      if (window.FayiToast) FayiToast('正在发送反馈…', 'success');

      try {
        var formData = new FormData();
        formData.append('name', name);
        formData.append('email', email);
        formData.append('contact', contact || '');
        formData.append('identity', type);
        formData.append('message', message);
        formData.append('attachmentText', filesText);
        if (window.FayiAuth && FayiAuth.getCurrentUser) {
          var u = FayiAuth.getCurrentUser();
          if (u && u.email) formData.append('userEmail', u.email);
        }
        if (fileInput && fileInput.files && fileInput.files.length) {
          var uploadFile = fileInput.files[0];
          formData.append('file', uploadFile, uploadFile.name);
        }
        var resp = await fetch(CONTACT_API, {
          method: 'POST',
          body: formData
        });
        var data = await resp.json();
        if (data && data.success) {
          if (window.FayiToast) FayiToast('反馈提交成功', 'success');
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
    if (window.FayiAuth && FayiAuth.getCurrentUser) {
      var u = FayiAuth.getCurrentUser();
      if (u) {
        var nameInput = document.getElementById('ct-name');
        var emailInput = document.getElementById('ct-email');
        if (nameInput && !nameInput.value) nameInput.value = u.name || (u.email ? u.email.split('@')[0] : '');
        if (emailInput && !emailInput.value) emailInput.value = u.email || '';
      }
    }
    bindFileHint();
    bindSubmit();
  });
})();

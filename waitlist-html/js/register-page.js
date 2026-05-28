/**
 * 注册页交互：协议弹窗、表单校验、人员类型
 */
(function () {
  var USER_AGREEMENT_HTML =
    '<h3>一、平台服务说明</h3>' +
    '<p>法绎平台（以下简称「本平台」）向用户提供法律咨询辅助、文书结构参考、法规检索及普法学习等信息服务。本平台旨在帮助用户更高效地理解常见法律问题，不构成律师事务所或执业律师提供的法律服务。</p>' +
    '<h3>二、用户行为规范</h3>' +
    '<p>用户注册并使用本平台时，应保证所提供信息真实、准确，不得冒用他人身份，不得利用本平台从事违法违规活动，包括但不限于传播虚假信息、侵犯他人合法权益、干扰平台正常运行等行为。</p>' +
    '<h3>三、AI 生成内容免责声明</h3>' +
    '<p>本平台部分内容由智能系统根据用户输入生成，仅供一般性参考。该类内容可能存在不完整、滞后或不适用于具体案情的情况，不应作为诉讼、仲裁或其他法律程序中的唯一依据。重大法律事项请咨询具有执业资格的专业律师。</p>' +
    '<h3>四、账号安全责任</h3>' +
    '<p>用户应妥善保管账号及密码，对使用该账号进行的一切操作承担责任。如发现账号异常，请及时修改密码并联系平台。因用户自身原因导致的账号泄露，本平台不承担相应损失。</p>' +
    '<h3>五、法律用途限制</h3>' +
    '<p>本平台服务限于合法、正当的个人或组织内部学习、研究及事务辅助用途。禁止将平台输出内容用于欺诈、规避监管或其他违反法律法规的用途。</p>' +
    '<h3>六、数据存储说明</h3>' +
    '<p>为提供连续服务，本平台将在法律法规允许范围内保存必要的账号信息、操作记录及用户主动上传的资料。具体收集与使用规则以《隐私政策》为准。</p>';

  var PRIVACY_POLICY_HTML =
    '<h3>一、用户数据收集范围</h3>' +
    '<p>我们可能收集您在注册时提供的昵称、电子邮箱、头像选择，以及使用过程中的咨询记录、文书生成记录、上传文件元数据等，用于账号管理与服务改进。</p>' +
    '<h3>二、文件上传安全机制</h3>' +
    '<p>您上传的文件仅用于本次法律服务相关功能处理。平台采取合理的技术与管理措施，降低未授权访问、篡改或泄露的风险。请勿上传与法律服务无关的敏感信息。</p>' +
    '<h3>三、本地缓存说明</h3>' +
    '<p>为提升访问体验，部分偏好设置、登录状态等可能保存在您设备的浏览器本地存储中。您可通过清除浏览器数据或退出登录删除相关缓存。</p>' +
    '<h3>四、数据不会公开传播</h3>' +
    '<p>未经您同意或法律法规要求，我们不会向无关第三方出售、出租或公开披露您的个人信息。依法配合监管、司法机关的情形除外。</p>' +
    '<h3>五、AI 分析用途说明</h3>' +
    '<p>您提交的文字、文档等内容可能用于智能分析与结果生成，处理范围限于实现本平台功能所必需。我们不会将您的内容用于与提供服务无关的商业推广。</p>' +
    '<h3>六、用户删除权利说明</h3>' +
    '<p>您可通过个人中心修改资料，或联系平台申请注销账号。账号注销后，我们将按法律规定在合理期限内删除或匿名化处理相关个人信息，法律法规另有规定的除外。</p>';

  var activeModal = null;

  function openModal(type) {
    var overlay = document.getElementById('rg-modal-overlay');
    var titleEl = document.getElementById('rg-modal-title');
    var bodyEl = document.getElementById('rg-modal-body');
    var confirmBtn = document.getElementById('rg-modal-confirm');
    if (!overlay || !bodyEl) return;

    if (type === 'terms') {
      titleEl.textContent = '法绎平台用户协议';
      bodyEl.innerHTML = USER_AGREEMENT_HTML;
      confirmBtn.textContent = '我已阅读并同意';
      confirmBtn.dataset.agreeType = 'terms';
    } else {
      titleEl.textContent = '法绎平台隐私政策';
      bodyEl.innerHTML = PRIVACY_POLICY_HTML;
      confirmBtn.textContent = '我已阅读并同意';
      confirmBtn.dataset.agreeType = 'privacy';
    }

    activeModal = type;
    overlay.classList.add('is-open');
    /* legacy id kept for compatibility */
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    var overlay = document.getElementById('rg-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    activeModal = null;
  }

  function bindModals() {
    var overlay = document.getElementById('rg-modal-overlay');
    var btnTerms = document.getElementById('rg-open-terms');
    var btnPrivacy = document.getElementById('rg-open-privacy');
    var btnClose = document.getElementById('rg-modal-close');
    var btnConfirm = document.getElementById('rg-modal-confirm');

    if (btnTerms) {
      btnTerms.addEventListener('click', function (e) {
        e.preventDefault();
        openModal('terms');
      });
    }
    if (btnPrivacy) {
      btnPrivacy.addEventListener('click', function (e) {
        e.preventDefault();
        openModal('privacy');
      });
    }
    if (btnClose) btnClose.addEventListener('click', closeModal);
    var btnDismiss = document.getElementById('rg-modal-dismiss');
    if (btnDismiss) btnDismiss.addEventListener('click', closeModal);
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeModal();
      });
    }
    if (btnConfirm) {
      btnConfirm.addEventListener('click', function () {
        var cb = document.getElementById('rg-agree-cb');
        if (cb) cb.checked = true;
        closeModal();
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay && overlay.classList.contains('is-open')) {
        closeModal();
      }
    });
  }

  function bindTypeCards() {
    var adminWrap = document.getElementById('rg-admin-code-wrap');
    var adminInput = document.getElementById('register-admin-permission-code');

    function syncAdminField() {
      var isAdmin = document.querySelector('input[name="register-user-type"]:checked');
      var show = isAdmin && isAdmin.value === 'admin';
      if (adminWrap) {
        adminWrap.classList.toggle('is-visible', show);
        adminWrap.setAttribute('aria-hidden', show ? 'false' : 'true');
      }
      if (!show && adminInput) {
        adminInput.value = '';
        adminInput.classList.remove('error');
      }
    }

    document.querySelectorAll('input[name="register-user-type"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        document.querySelectorAll('.auth-type-card').forEach(function (card) {
          card.classList.toggle('is-active', card.getAttribute('data-type') === radio.value);
        });
        syncAdminField();
      });
    });
    syncAdminField();
  }

  function bindEye(eyeId, inputId) {
    var eye = document.getElementById(eyeId);
    var inp = document.getElementById(inputId);
    if (!eye || !inp) return;
    eye.addEventListener('click', function () {
      inp.type = inp.type === 'password' ? 'text' : 'password';
    });
  }

  function bindValidation() {
    var pwInput = document.getElementById('register-password');
    var strengthBar = document.getElementById('pw-strength-bar');
    var strengthText = document.getElementById('pw-strength-text');

    function setMsg(id, text, type) {
      var el = document.getElementById(id);
      if (!el) return;
      el.textContent = text;
      el.className = 'auth-field-msg ' + (type || '');
    }
    function setInputState(id, state) {
      var el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('error', 'ok');
      if (state) el.classList.add(state);
    }

    function checkStrength(v) {
      if (!v) {
        strengthBar.className = 'pw-strength-bar';
        strengthText.textContent = '';
        return;
      }
      var score = 0;
      if (v.length >= 8) score++;
      if (/[A-Za-z]/.test(v) && /[0-9]/.test(v)) score++;
      if (/[^A-Za-z0-9]/.test(v) || v.length >= 12) score++;
      if (score <= 1) {
        strengthBar.className = 'pw-strength-bar weak';
        strengthText.className = 'pw-strength-text weak';
        strengthText.textContent = '密码强度：弱';
      } else if (score === 2) {
        strengthBar.className = 'pw-strength-bar mid';
        strengthText.className = 'pw-strength-text mid';
        strengthText.textContent = '密码强度：中';
      } else {
        strengthBar.className = 'pw-strength-bar strong';
        strengthText.className = 'pw-strength-text strong';
        strengthText.textContent = '密码强度：强';
      }
    }

    if (pwInput) {
      pwInput.addEventListener('input', function () { checkStrength(pwInput.value); });
    }

    var emailInput = document.getElementById('register-email');
    if (emailInput) {
      emailInput.addEventListener('blur', function () {
        var v = emailInput.value.trim();
        if (!v) {
          setInputState('register-email', '');
          setMsg('msg-email', '');
          return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
          setInputState('register-email', 'error');
          setMsg('msg-email', '邮箱格式不正确', 'error');
        } else {
          setInputState('register-email', 'ok');
          setMsg('msg-email', '格式正确', 'ok');
        }
      });
    }

    var pw2Input = document.getElementById('register-password2');
    if (pw2Input && pwInput) {
      pw2Input.addEventListener('input', function () {
        var pw2 = pw2Input.value;
        if (!pw2) {
          setInputState('register-password2', '');
          setMsg('msg-pw2', '');
          return;
        }
        if (pwInput.value !== pw2) {
          setInputState('register-password2', 'error');
          setMsg('msg-pw2', '两次密码不一致', 'error');
        } else {
          setInputState('register-password2', 'ok');
          setMsg('msg-pw2', '密码一致', 'ok');
        }
      });
    }

    var form = document.getElementById('register-form');
    var errBox = document.getElementById('register-error');

    if (!form || !errBox) return;

    function showFormErr(msg) {
      errBox.textContent = msg;
      errBox.classList.remove('hidden');
      errBox.classList.add('is-show');
    }

    form.addEventListener('submit', function (e) {
      var name = (document.getElementById('register-name').value || '').trim();
      var email = (document.getElementById('register-email').value || '').trim();
      var pw1 = document.getElementById('register-password').value;
      var pw2 = document.getElementById('register-password2').value;
      var agree = document.getElementById('rg-agree-cb').checked;

      if (!name) {
        e.preventDefault();
        e.stopImmediatePropagation();
        showFormErr('请填写昵称');
        return;
      }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        showFormErr('请填写有效的邮箱地址');
        return;
      }
      if (!pw1 || pw1.length < 6) {
        e.preventDefault();
        e.stopImmediatePropagation();
        showFormErr('密码不少于 6 位');
        return;
      }
      if (pw1 !== pw2) {
        e.preventDefault();
        e.stopImmediatePropagation();
        showFormErr('两次密码不一致');
        return;
      }
      if (!agree) {
        e.preventDefault();
        e.stopImmediatePropagation();
        showFormErr('请阅读并同意用户协议与隐私政策');
        return;
      }

      var userTypeRadio = document.querySelector('input[name="register-user-type"]:checked');
      var userType = userTypeRadio ? userTypeRadio.value : 'user';
      if (userType === 'admin') {
        var codeEl = document.getElementById('register-admin-permission-code');
        var codeVal = codeEl ? codeEl.value : '';
        var perm = window.FayiAdminPermission;
        if (!perm || !perm.isValidAdminPermissionCode(codeVal)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          showFormErr('管理员权限验证码错误，无法注册管理员账号');
          if (window.FayiToast) window.FayiToast('管理员权限验证码错误，无法注册管理员账号', 'error');
          if (codeEl) {
            codeEl.classList.add('error');
            if (perm) perm.shakeEl(codeEl);
          }
          return;
        }
      }

      errBox.classList.add('hidden');
      errBox.classList.remove('is-show');
      errBox.textContent = '';
    }, true);
  }

  function bindAvatarUpload() {
    var avatarFile = document.getElementById('register-avatar-file');
    if (!avatarFile) return;
    avatarFile.addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        var presets = document.getElementById('avatar-presets');
        var existing = presets.querySelector('label.custom-upload-item');
        var label = existing || document.createElement('label');
        label.className = 'custom-upload-item';
        var radio = label.querySelector('input') || document.createElement('input');
        radio.type = 'radio';
        radio.name = 'register-avatar';
        radio.value = ev.target.result;
        radio.className = 'sr-only';
        var img = label.querySelector('img') || document.createElement('img');
        img.src = ev.target.result;
        img.alt = '自定义';
        if (!existing) {
          label.appendChild(radio);
          label.appendChild(img);
          presets.appendChild(label);
        }
        radio.checked = true;
        document.querySelectorAll('input[name="register-avatar"]').forEach(function (r) {
          if (r !== radio) r.checked = false;
        });
      };
      reader.readAsDataURL(file);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindModals();
    bindTypeCards();
    bindEye('eye-pw1', 'register-password');
    bindEye('eye-pw2', 'register-password2');
    bindValidation();
    bindAvatarUpload();
  });
})();

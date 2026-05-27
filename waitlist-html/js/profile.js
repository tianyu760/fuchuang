/**
 * 法绎 · 个人中心 v2
 */
(function () {
  var PERSONA_LABELS = {
    life_consume: '日常生活与消费维权',
    work_labor: '劳动就业与职场',
    privacy_data: '个人隐私与数据保护',
    rent_housing: '租房与房屋居住',
    traffic: '道路交通与出行',
    minor_elder: '未成年人与老年人照护',
    startup_micro: '小微主体与开店经营'
  };

  var PERSONA_SHORT_TAGS = {
    life_consume: ['消费维权', '退换货', '产品质量'],
    work_labor: ['劳动争议', '劳动合同', '工伤赔偿'],
    privacy_data: ['个人信息', '数据安全', '隐私保护'],
    rent_housing: ['房屋租赁', '押金纠纷', '租房合同'],
    traffic: ['交通事故', '违章处理', '保险理赔'],
    minor_elder: ['未成年人', '赡养抚养', '监护权'],
    startup_micro: ['开店经营', '工商登记', '合同纠纷']
  };

  var TYPE_DISPLAY = {
    consult: '法律咨询',
    case: '风险分析',
    document: '文书生成',
    upload: '资料 / OCR',
    law_search: '法规检索',
    pufa: '普法浏览',
    datav: '数据浏览'
  };

  var TYPE_ICONS = {
    consult: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    case: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    document: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
    upload: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    law_search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    pufa: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    datav: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>'
  };

  var PANEL_META = {
    home: { title: '个人中心', subtitle: '管理您的法律服务与账号信息' },
    profile: { title: '个人资料', subtitle: '编辑昵称、头像与法律偏好' },
    security: { title: '账号安全', subtitle: '密码与账号隐私设置' },
    history: { title: '使用记录', subtitle: '全部法律服务活动记录' },
    prefs: { title: '偏好设置', subtitle: '界面与推荐偏好' }
  };

  var PW_CHANGED_KEY = 'fayi_password_changed_at';
  var SYNC_KEY = 'fayi_profile_last_sync';

  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function personaLabel(key) {
    return PERSONA_LABELS[key] || PERSONA_LABELS.life_consume;
  }

  function formatRegDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  function daysSince(iso) {
    if (!iso) return null;
    var start = new Date(iso);
    if (isNaN(start.getTime())) return null;
    var diff = Date.now() - start.getTime();
    return Math.max(1, Math.floor(diff / 86400000) + 1);
  }

  function formatTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    var now = new Date();
    var isToday = d.toDateString() === now.toDateString();
    var hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    if (isToday) return '今天 ' + hm;
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hm;
  }

  function touchSync() {
    var now = new Date().toISOString();
    try { localStorage.setItem(SYNC_KEY, now); } catch (e) { /* ignore */ }
    return now;
  }

  function getSyncRelative() {
    var iso;
    try { iso = localStorage.getItem(SYNC_KEY); } catch (e) { /* ignore */ }
    if (!iso) return '刚刚';
    if (window.FayiActivity && FayiActivity.formatRelativeTime) {
      return FayiActivity.formatRelativeTime(iso);
    }
    return '刚刚';
  }

  function getUserTier(u) {
    if (!window.FayiActivity) return '普通用户';
    var stats = FayiActivity.getActivityStats();
    var week = stats.week || {};
    var consult = (week.consult || 0) + (week.case || 0);
    var docs = week.document || 0;
    if (consult >= 3 || docs >= 2 || (stats.total || 0) >= 10) return '法律咨询用户';
    return '普通用户';
  }

  function getChosenAvatar() {
    var custom = $('profile-avatar-custom');
    if (custom && custom.value) return custom.value;
    var checked = document.querySelector('input[name="profile-avatar"]:checked');
    return checked ? checked.value : (FayiAuth.DEFAULT_AVATAR || './images/avatars/1.svg');
  }

  function setAvatarPreview(url) {
    var el = $('pc-side-avatar');
    if (el) el.src = url;
    var big = $('profile-avatar-big');
    if (big) big.src = url;
  }

  function syncDarkModeUI() {
    var isDark = document.documentElement.classList.contains('dark');
    var pref = $('pref-dark-mode');
    var header = $('light-switch');
    if (pref) pref.checked = isDark;
    if (header) header.checked = isDark;
  }

  function updatePageHead(panelId) {
    var meta = PANEL_META[panelId] || PANEL_META.home;
    var title = $('pc-page-title');
    var sub = $('pc-page-subtitle');
    if (title) title.textContent = meta.title;
    if (sub) sub.textContent = meta.subtitle;
  }

  function switchPanel(panelId) {
    document.querySelectorAll('.pc-panel').forEach(function (p) {
      p.classList.toggle('active', p.id === 'panel-' + panelId);
    });
    document.querySelectorAll('.pc-nav-item, .pc-tab').forEach(function (el) {
      var on = el.getAttribute('data-panel') === panelId;
      el.classList.toggle('active', on);
      if (el.classList.contains('pc-tab')) {
        el.setAttribute('aria-selected', on ? 'true' : 'false');
      }
    });
    updatePageHead(panelId);
  }

  function buildTimelineHtml(logs, limit) {
    if (!window.FayiActivity || !logs.length) {
      return '<p class="pc-empty">暂无记录，<a href="chat.html">发起咨询</a> 或 <a href="wenshi.html">生成文书</a> 开始使用。</p>';
    }

    if (limit) logs = logs.slice(0, limit);
    var groups = FayiActivity.groupLogsByDate(logs);
    var html = '';

    groups.forEach(function (group) {
      html += '<div class="pc-timeline-group">';
      html += '<div class="pc-timeline-date">' + escapeHtml(group.label) + '</div>';
      group.items.forEach(function (log) {
        var meta = FayiActivity.getTypeMeta(log.type);
        var typeLabel = TYPE_DISPLAY[log.type] || meta.module || '服务记录';
        var desc = FayiActivity.truncate(log.summary || log.title, 80);
        var href = log.link || meta.link || '#';
        var iconPath = TYPE_ICONS[log.type] || TYPE_ICONS.consult;
        html += '<div class="pc-timeline-item">';
        html += '<a class="pc-timeline-link" href="' + escapeHtml(href) + '">';
        html += '<span class="pc-timeline-icon"><svg viewBox="0 0 24 24">' + iconPath + '</svg></span>';
        html += '<span class="pc-timeline-body">';
        html += '<div class="pc-timeline-type">' + escapeHtml(typeLabel) + '</div>';
        html += '<div class="pc-timeline-title">' + escapeHtml(desc || log.title) + '</div>';
        html += '<div class="pc-timeline-time">' + escapeHtml(formatTime(log.createdAt)) + '</div>';
        html += '</span></a></div>';
      });
      html += '</div>';
    });

    return html;
  }

  function renderTimelines() {
    var logs = window.FayiActivity ? FayiActivity.getActivityLogs({ limit: 80 }) : [];
    var home = $('home-timeline');
    var full = $('history-timeline');
    var more = $('home-timeline-more');

    if (home) {
      home.innerHTML = buildTimelineHtml(logs, 6);
    }
    if (full) {
      full.innerHTML = buildTimelineHtml(logs, 0);
    }
    if (more) {
      more.style.display = logs.length > 6 ? 'inline-block' : 'none';
    }
  }

  function renderInterestTags(u) {
    var root = $('interest-tags');
    if (!root) return;

    var tags = [];
    var persona = u.persona || FayiAuth.DEFAULT_PERSONA || 'life_consume';
    var shorts = PERSONA_SHORT_TAGS[persona] || [];
    tags.push({ text: personaLabel(persona), primary: true });

    shorts.forEach(function (t) {
      if (tags.length < 8) tags.push({ text: t, primary: false });
    });

    if (window.FayiActivity) {
      var stats = FayiActivity.getActivityStats();
      if (stats.topType && TYPE_DISPLAY[stats.topType]) {
        var extra = TYPE_DISPLAY[stats.topType];
        if (!tags.some(function (x) { return x.text === extra; })) {
          tags.push({ text: extra, primary: false });
        }
      }
    }

    root.innerHTML = tags.map(function (t) {
      return '<span class="pc-tag-pill' + (t.primary ? ' pc-tag-pill--primary' : '') + '">' +
        escapeHtml(t.text) + '</span>';
    }).join('');
  }

  function renderAccountPrivacy() {
    var pwChanged;
    try { pwChanged = localStorage.getItem(PW_CHANGED_KEY); } catch (e) { /* ignore */ }

    var pwText = pwChanged
      ? formatTime(pwChanged)
      : '尚未修改';

    var items = [
      { label: '最近密码修改', value: pwText },
      { label: '登录设备', value: '1 台（本机浏览器）' },
      { label: '安全状态', value: '良好', ok: true },
      { label: '数据同步', value: '正常', ok: true }
    ];

    var html = items.map(function (it) {
      return '<div class="pc-info-item">' +
        '<div class="pc-info-label">' + escapeHtml(it.label) + '</div>' +
        '<div class="pc-info-value' + (it.ok ? ' is-ok' : '') + '">' + escapeHtml(it.value) + '</div>' +
        '</div>';
    }).join('');

    ['account-privacy-grid', 'account-privacy-grid-security'].forEach(function (id) {
      var el = $(id);
      if (el) el.innerHTML = html;
    });
  }

  function renderSidebar(u) {
    var name = u.name || (u.email || '').split('@')[0] || '用户';
    var avatar = u.avatar || FayiAuth.DEFAULT_AVATAR;
    setAvatarPreview(avatar);

    var setText = function (id, text) {
      var el = $(id);
      if (el) el.textContent = text;
    };

    setText('pc-side-welcome', '欢迎回来');
    setText('pc-side-name', name);
    setText('pc-side-email', u.email || '—');
    setText('profile-email', u.email || '—');
    setText('profile-uid', u.id != null ? String(u.id) : '—');
    setText('profile-reg-date', formatRegDate(u.createdAt));

    var days = daysSince(u.createdAt);
    setText('pc-side-days', days
      ? '您已使用法绎 ' + days + ' 天'
      : '感谢您选择法绎');

    var badge = $('pc-user-badge');
    if (badge) badge.textContent = getUserTier(u);

    var syncTime = $('pc-sync-time');
    if (syncTime) syncTime.textContent = '最近同步：' + getSyncRelative();

    var nameInput = $('profile-name-input');
    if (nameInput) nameInput.value = name || '';

    var personaSel = $('profile-persona');
    if (personaSel) personaSel.value = u.persona || FayiAuth.DEFAULT_PERSONA || 'life_consume';

    document.querySelectorAll('input[name="profile-avatar"]').forEach(function (r) {
      r.checked = r.value === avatar;
    });
  }

  function refreshAll(u) {
    touchSync();
    renderSidebar(u);
    renderTimelines();
    renderInterestTags(u);
    renderAccountPrivacy();
    var syncTime = $('pc-sync-time');
    if (syncTime) syncTime.textContent = '最近同步：' + getSyncRelative();
  }

  function bindNav() {
    document.querySelectorAll('.pc-nav-item, .pc-tab').forEach(function (el) {
      el.addEventListener('click', function () {
        var panel = el.getAttribute('data-panel');
        if (panel) switchPanel(panel);
      });
    });

    var more = $('home-timeline-more');
    if (more) {
      more.addEventListener('click', function (e) {
        e.preventDefault();
        switchPanel('history');
      });
    }
  }

  function bindProfileForm() {
    document.querySelectorAll('input[name="profile-avatar"]').forEach(function (r) {
      r.addEventListener('change', function () {
        var custom = $('profile-avatar-custom');
        if (custom) custom.value = '';
        setAvatarPreview(r.value);
      });
    });

    var fileInput = $('profile-avatar-file');
    if (fileInput) {
      fileInput.addEventListener('change', function () {
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
          alert('图片请小于 2MB');
          fileInput.value = '';
          return;
        }
        var reader = new FileReader();
        reader.onload = function () {
          var custom = $('profile-avatar-custom');
          if (!custom) {
            custom = document.createElement('input');
            custom.type = 'hidden';
            custom.id = 'profile-avatar-custom';
            $('panel-profile').appendChild(custom);
          }
          custom.value = reader.result;
          document.querySelectorAll('input[name="profile-avatar"]').forEach(function (r) {
            r.checked = false;
          });
          setAvatarPreview(reader.result);
        };
        reader.readAsDataURL(file);
      });
    }

    var saveBtn = $('profile-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        var name = ($('profile-name-input').value || '').trim();
        if (!name) { alert('请输入昵称'); return; }
        var persona = $('profile-persona').value;
        var avatar = getChosenAvatar();
        saveBtn.disabled = true;
        FayiAuth.updateProfile({ name: name, avatar: avatar, persona: persona })
          .then(function (res) {
            if (res && res.ok) {
              refreshAll(FayiAuth.getCurrentUser());
              alert('资料已保存');
            } else {
              alert((res && res.message) || '保存失败');
            }
          })
          .catch(function () { alert('保存失败，请稍后重试'); })
          .finally(function () { saveBtn.disabled = false; });
      });
    }
  }

  function bindPassword() {
    var btn = $('pw-save');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var oldPw = ($('pw-old').value || '').trim();
      var newPw = ($('pw-new').value || '').trim();
      var newPw2 = ($('pw-new2').value || '').trim();
      var msg = $('pw-msg');
      if (!oldPw || !newPw) {
        showMsg(msg, '请填写当前密码和新密码', false);
        return;
      }
      if (newPw.length < 6) {
        showMsg(msg, '新密码至少 6 位', false);
        return;
      }
      if (newPw !== newPw2) {
        showMsg(msg, '两次输入的新密码不一致', false);
        return;
      }
      btn.disabled = true;
      FayiAuth.changePassword(oldPw, newPw)
        .then(function (res) {
          if (res && res.ok) {
            try {
              localStorage.setItem(PW_CHANGED_KEY, new Date().toISOString());
            } catch (e) { /* ignore */ }
            showMsg(msg, '密码已更新', true);
            $('pw-old').value = '';
            $('pw-new').value = '';
            $('pw-new2').value = '';
            renderAccountPrivacy();
            touchSync();
          } else {
            showMsg(msg, (res && res.message) || '修改失败', false);
          }
        })
        .catch(function () { showMsg(msg, '修改失败，请稍后重试', false); })
        .finally(function () { btn.disabled = false; });
    });
  }

  function showMsg(el, text, ok) {
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden', 'is-error', 'is-success');
    el.classList.add(ok ? 'is-success' : 'is-error');
  }

  function bindPrefs() {
    var darkPref = $('pref-dark-mode');
    var headerSwitch = $('light-switch');
    if (darkPref && headerSwitch) {
      darkPref.addEventListener('change', function () {
        headerSwitch.checked = darkPref.checked;
        headerSwitch.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
    document.addEventListener('darkMode', syncDarkModeUI);

    var smart = $('pref-smart-recommend');
    if (smart) {
      smart.checked = localStorage.getItem('fayi-smart-recommend') !== 'false';
      smart.addEventListener('change', function () {
        localStorage.setItem('fayi-smart-recommend', smart.checked ? 'true' : 'false');
      });
    }

    var resetGuide = $('reset-guide-btn');
    if (resetGuide) {
      resetGuide.addEventListener('click', function () {
        localStorage.removeItem('fayi-guide-dismissed');
        alert('已重置，下次访问将重新显示引导');
      });
    }
  }

  function bindLogout() {
    ['profile-logout', 'profile-logout-mobile'].forEach(function (id) {
      var btn = $(id);
      if (btn) btn.addEventListener('click', function () { FayiAuth.logout(); });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!window.FayiAuth || !FayiAuth.getCurrentUser) return;
    var u = FayiAuth.getCurrentUser();
    if (!u) {
      window.location.replace('login.html?next=' + encodeURIComponent('profile.html'));
      return;
    }

    syncDarkModeUI();
    refreshAll(u);
    bindNav();
    bindProfileForm();
    bindPassword();
    bindPrefs();
    bindLogout();

    window.addEventListener('fayi-activity-added', function () {
      refreshAll(FayiAuth.getCurrentUser());
    });
  });
})();

/**
 * 系统配置中心 · Platform Settings
 */
window.OpsPages = window.OpsPages || {};
OpsPages.settings = (function () {
  var activeTab = 'system';
  var saving = false;

  var state = {
    systemSettings: null,
    aiSettings: null,
    dataSettings: null,
    securitySettings: null,
    settingsLoading: false
  };

  var TAB_META = [
    { id: 'system', label: '系统配置', superOnly: true },
    { id: 'ai', label: 'AI 配置', superOnly: false },
    { id: 'data', label: '数据配置', superOnly: false },
    { id: 'security', label: '安全配置', superOnly: true }
  ];

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  function getAdminRole() {
    var info = (window.FayiAdminAuth && FayiAdminAuth.getAdminInfo) ? FayiAdminAuth.getAdminInfo() : {};
    if (info.identityCode === 'manager' || info.adminLevel === 'super' || info.role === 'super_admin') {
      return 'super';
    }
    if (info.role === 'admin' || info.userType === 'admin') return 'admin';
    return 'readonly';
  }

  function syncActiveTab(tabs) {
    if (!tabs || !tabs.length) return;
    if (!tabs.some(function (t) { return t.id === activeTab; })) {
      activeTab = tabs[0].id;
    }
  }

  function applyTabVisibility(tabs) {
    syncActiveTab(tabs);
    document.querySelectorAll('.ops-settings-tab').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-tab') === activeTab);
    });
    document.querySelectorAll('.ops-settings-panel').forEach(function (panel) {
      panel.classList.toggle('is-active', panel.getAttribute('data-panel') === activeTab);
    });
    var panels = document.getElementById('ops-settings-panels');
    if (!panels) return;
    var stale = panels.querySelector('.ops-settings-empty-panel');
    if (stale) stale.remove();
    if (!panels.querySelector('.ops-settings-panel.is-active')) {
      panels.insertAdjacentHTML('beforeend',
        '<div class="ops-settings-empty-panel">正在加载配置…</div>');
    }
  }

  function canEditTab(tabId) {
    var role = getAdminRole();
    if (role === 'readonly') return false;
    if (role === 'super') return true;
    return tabId === 'ai' || tabId === 'data';
  }

  function visibleTabs() {
    var role = getAdminRole();
    return TAB_META.filter(function (t) {
      if (role === 'super') return true;
      if (role === 'admin') return !t.superOnly;
      return !t.superOnly;
    });
  }

  function toast(msg) {
    var el = document.getElementById('ops-settings-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ops-settings-toast';
      el.className = 'ops-settings-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg || '配置已保存，业务接口将按新配置生效';
    el.classList.add('is-show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('is-show'); }, 2800);
  }

  function applyThemePreview(color) {
    if (!color) return;
    try {
      document.documentElement.style.setProperty('--ops-cyan', color);
      document.documentElement.style.setProperty('--ops-accent', color);
    } catch (e) { /* ignore */ }
  }

  function switchHtml(name, checked, disabled) {
    return '<label class="ops-switch"><input type="checkbox" data-sw="' + name + '"' +
      (checked ? ' checked' : '') + (disabled ? ' disabled' : '') + '>' +
      '<span class="ops-switch__track"></span></label>';
  }

  function mount(root) {
    try {
      mountPage(root);
    } catch (err) {
      console.error('[settings] mount failed', err);
      root.innerHTML = '<div class="ops-card"><p class="ops-empty">配置页加载失败：' + esc(err.message) + '</p></div>';
    }
  }

  function mountPage(root) {
    var role = getAdminRole();
    var tabs = visibleTabs();
    syncActiveTab(tabs);

    root.innerHTML =
      '<div class="ops-settings-page">' +
        '<div class="ops-settings-head">' +
          (window.OpsUI ? OpsUI.pageHeader('系统配置中心', '系统级 · 业务级 · 安全策略 · 实时生效') : '') +
          '<div style="margin-left:auto;display:flex;gap:8px;align-items:center">' +
            '<span class="ops-pufa-refresh-hint">权限：' +
              (role === 'super' ? '超级管理员' : role === 'admin' ? '普通管理员' : '只读') +
            '</span>' +
            (role === 'super'
              ? '<button type="button" class="ops-btn ops-btn--sm" id="ops-settings-reset-all">恢复默认</button>'
              : '') +
          '</div></div>' +
        '<nav class="ops-settings-tabs" id="ops-settings-tabs"></nav>' +
        '<div id="ops-settings-panels"></div>' +
      '</div>';

    renderTabs(tabs);
    renderPanels(tabs, role);
    applyTabVisibility(tabs);
    bindTabEvents(tabs);
    loadAll(true);

    var resetAll = document.getElementById('ops-settings-reset-all');
    if (resetAll) {
      resetAll.addEventListener('click', function () {
        if (!confirm('确认恢复全部模块为默认配置？')) return;
        FayiAdminApi.settingsReset().then(function () {
          toast('已恢复全部默认配置');
          loadAll(true);
          if (window.OpsSystemLog) {
            OpsSystemLog.update('system', '恢复全部默认配置', 'settings', 'reset all');
          }
        });
      });
    }
  }

  function renderTabs(tabs) {
    var nav = document.getElementById('ops-settings-tabs');
    if (!nav) return;
    nav.innerHTML = tabs.map(function (t) {
      return '<button type="button" class="ops-settings-tab' +
        (t.id === activeTab ? ' is-active' : '') + '" data-tab="' + t.id + '">' + esc(t.label) + '</button>';
    }).join('');
  }

  function bindTabEvents(tabs) {
    document.querySelectorAll('.ops-settings-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        activeTab = btn.getAttribute('data-tab');
        applyTabVisibility(tabs);
      });
    });
  }

  function renderPanels(tabs, role) {
    var box = document.getElementById('ops-settings-panels');
    if (!box) return;
    box.innerHTML = tabs.map(function (t) {
      return '<div class="ops-settings-panel' + (t.id === activeTab ? ' is-active' : '') +
        '" data-panel="' + t.id + '" id="ops-settings-panel-' + t.id + '"></div>';
    }).join('');

    if (tabs.some(function (t) { return t.id === 'system'; })) renderSystemPanel(role);
    if (tabs.some(function (t) { return t.id === 'ai'; })) renderAiPanel(role);
    if (tabs.some(function (t) { return t.id === 'data'; })) renderDataPanel(role);
    if (tabs.some(function (t) { return t.id === 'security'; })) renderSecurityPanel(role);
  }

  function panelEditable(tabId, role) {
    return canEditTab(tabId) ? '' : ' ops-settings-readonly';
  }

  function renderSystemPanel(role) {
    var el = document.getElementById('ops-settings-panel-system');
    if (!el) return;
    var s = state.systemSettings || {};
    var dis = !canEditTab('system');
    el.innerHTML =
      '<div class="ops-settings-grid-2' + panelEditable('system', role) + '">' +
        '<div class="ops-settings-card">' +
          '<h3>系统基础配置</h3><p class="ops-settings-card__sub">品牌、语言与时区</p>' +
          '<div class="ops-settings-form" id="ops-settings-form-system">' +
            field('platformName', '平台名称', '<input type="text" name="platformName" value="' + esc(s.platformName) + '"' + (dis ? ' disabled' : '') + ' />') +
            field('logoUrl', 'Logo URL', '<input type="url" name="logoUrl" placeholder="https://..." value="' + esc(s.logoUrl) + '"' + (dis ? ' disabled' : '') + ' />') +
            field('themeColor', '主题色', '<input type="text" name="themeColor" value="' + esc(s.themeColor || '#38bdf8') + '"' + (dis ? ' disabled' : '') + ' />', '影响管理端强调色') +
            field('defaultLanguage', '默认语言',
              '<select name="defaultLanguage"' + (dis ? ' disabled' : '') + '>' +
                opt('zh-CN', '简体中文', s.defaultLanguage) +
                opt('zh-TW', '繁体中文', s.defaultLanguage) +
                opt('en-US', 'English', s.defaultLanguage) +
              '</select>') +
            field('timezone', '时区',
              '<select name="timezone"' + (dis ? ' disabled' : '') + '>' +
                opt('Asia/Shanghai', '中国 (UTC+8)', s.timezone) +
                opt('Asia/Hong_Kong', '香港', s.timezone) +
                opt('UTC', 'UTC', s.timezone) +
              '</select>') +
          '</div>' +
          (canEditTab('system') ? actions('system') : '') +
        '</div>' +
        '<div class="ops-settings-card">' +
          '<h3>实时预览</h3><p class="ops-settings-card__sub">保存后全站生效</p>' +
          '<div class="ops-settings-preview" id="ops-settings-preview">' +
            '<div class="ops-settings-preview__brand">' +
              '<div class="ops-logo-mark ops-settings-preview__logo" id="ops-preview-logo">' +
                '<iconify-icon icon="lucide:scale" id="ops-preview-logo-icon" aria-hidden="true"></iconify-icon>' +
                '<img class="ops-settings-preview__logo-img" id="ops-preview-logo-img" alt="" hidden />' +
              '</div>' +
              '<p class="ops-settings-preview__name" id="ops-preview-name">' + esc(s.platformName || '法绎法律科技') + '</p>' +
              '<p class="ops-settings-preview__tag" id="ops-preview-tag">LEGAL OPS · 管理端品牌预览</p>' +
            '</div>' +
            '<div class="ops-settings-preview__desc">' +
              '<p class="ops-settings-preview__lead" id="ops-preview-lead">面向法务运营团队的统一控制台，聚合咨询、文书、OCR 与法规能力。</p>' +
              '<ul class="ops-settings-preview__points">' +
                '<li>平台名称将同步至侧栏品牌区与登录页标题</li>' +
                '<li>主题色作用于按钮、图表高亮与状态指示</li>' +
                '<li>填写 Logo URL 可替换默认天平图标，留空则保持系统标识</li>' +
              '</ul>' +
            '</div>' +
          '</div></div></div>';
    bindForm('system', bindSystemPreview);
    updatePreview();
  }

  function renderAiPanel(role) {
    var el = document.getElementById('ops-settings-panel-ai');
    if (!el) return;
    var a = state.aiSettings || {};
    var dis = !canEditTab('ai');
    var sens = a.riskSensitivity || 'medium';
    el.innerHTML =
      '<div class="ops-settings-card' + panelEditable('ai', role) + '">' +
        '<h3>AI 能力配置</h3><p class="ops-settings-card__sub">控制 OCR、文书、风险与法规推荐能力</p>' +
        '<div class="ops-settings-switches">' +
          swRow('ocrEnabled', 'OCR 识别', '开启后允许上传图片并执行文字识别', a.ocrEnabled !== false, dis) +
          swRow('documentAiEnabled', 'AI 文书生成', '控制智能法律文书生成功能', a.documentAiEnabled !== false, dis) +
          swRow('regulationRecommend', '法规推荐', '咨询与文书场景自动推荐相关法条', a.regulationRecommend !== false, dis) +
          swRow('autoAnalysis', '自动分析模式', '对新咨询自动触发 AI 分析', a.autoAnalysis !== false, dis) +
        '</div>' +
        '<div class="ops-settings-field" style="margin-top:16px">' +
          '<label>风险预警灵敏度</label>' +
          '<div class="ops-risk-slider" id="ops-risk-sens">' +
            riskBtn('low', '低', sens, dis) +
            riskBtn('medium', '中', sens, dis) +
            riskBtn('high', '高', sens, dis) +
          '</div></div>' +
        (canEditTab('ai') ? actions('ai') : '') +
      '</div>';
    bindAiPanel(dis);
    bindForm('ai');
  }

  function renderDataPanel(role) {
    var el = document.getElementById('ops-settings-panel-data');
    if (!el) return;
    var d = state.dataSettings || {};
    var dis = !canEditTab('data');
    el.innerHTML =
      '<div class="ops-settings-card' + panelEditable('data', role) + '">' +
        '<h3>数据与日志配置</h3><p class="ops-settings-card__sub">影响日志保留、缓存与导出策略</p>' +
        '<div class="ops-settings-form">' +
          field('logRetentionDays', '日志保存周期',
            '<select name="logRetentionDays"' + (dis ? ' disabled' : '') + '>' +
              opt('7', '7 天', String(d.logRetentionDays)) +
              opt('30', '30 天', String(d.logRetentionDays || 30)) +
              opt('90', '90 天', String(d.logRetentionDays)) +
            '</select>', '超期日志将按策略清理') +
          field('cacheTtlMinutes', '数据缓存时间',
            '<select name="cacheTtlMinutes"' + (dis ? ' disabled' : '') + '>' +
              opt('1', '1 分钟', String(d.cacheTtlMinutes)) +
              opt('5', '5 分钟', String(d.cacheTtlMinutes || 5)) +
              opt('15', '15 分钟', String(d.cacheTtlMinutes)) +
            '</select>', '管理端列表与统计接口缓存') +
        '</div>' +
        '<div class="ops-settings-switches" style="margin-top:8px">' +
          swRow('systemLogEnabled', '系统日志', '记录全平台操作行为', d.systemLogEnabled !== false, dis) +
          swRow('operationTracking', '操作追踪', '写入操作日志中心', d.operationTracking !== false, dis) +
          swRow('allowDataExport', '允许导出数据', '文书 PDF 等导出能力', d.allowDataExport !== false, dis) +
        '</div>' +
        (canEditTab('data') ? actions('data') : '') +
      '</div>';
    bindForm('data');
  }

  function renderSecurityPanel(role) {
    var el = document.getElementById('ops-settings-panel-security');
    if (!el) return;
    var sec = state.securitySettings || {};
    var dis = !canEditTab('security');
    el.innerHTML =
      '<div class="ops-settings-card' + panelEditable('security', role) + '">' +
        '<h3>安全与权限<span class="ops-settings-badge">高风险</span></h3>' +
        '<p class="ops-settings-card__sub">默认开启安全模式，请谨慎修改</p>' +
        '<div class="ops-settings-switches">' +
          swRow('loginCaptcha', '登录验证码', '管理员登录需二次验证', sec.loginCaptcha !== false, dis, true) +
          swRow('confirmSensitiveOps', '操作二次确认', '删除、封禁等操作需确认', sec.confirmSensitiveOps !== false, dis, true) +
          swRow('sensitiveOpLog', '敏感操作记录', '强制写入系统日志', sec.sensitiveOpLog !== false, dis, true) +
        '</div>' +
        '<div class="ops-settings-form" style="margin-top:12px">' +
          field('adminLevel', '管理员权限等级',
            '<select name="adminLevel"' + (dis ? ' disabled' : '') + '>' +
              opt('standard', '标准管理员', sec.adminLevel) +
              opt('strict', '严格模式（只读审计）', sec.adminLevel) +
            '</select>', '与前台账号权限体系联动') +
          field('ipWhitelist', 'IP 访问限制', '<input type="text" name="ipWhitelist" placeholder="留空不限制，多个 IP 逗号分隔" value="' + esc(sec.ipWhitelist) + '"' + (dis ? ' disabled' : '') + ' />', '仅允许白名单 IP 访问管理端', true) +
        '</div>' +
        (canEditTab('security') ? actions('security') : '') +
      '</div>';
    bindForm('security');
  }

  function field(name, label, input, hint, danger) {
    return '<div class="ops-settings-field">' +
      '<label' + (danger ? ' class="is-danger"' : '') + '>' + esc(label) + '</label>' +
      input +
      (hint ? '<span class="ops-hint">' + esc(hint) + '</span>' : '') +
    '</div>';
  }

  function opt(v, l, cur) {
    return '<option value="' + v + '"' + (String(cur) === v ? ' selected' : '') + '>' + l + '</option>';
  }

  function swRow(name, title, sub, on, dis, danger) {
    return '<div class="ops-settings-switch-row">' +
      '<div class="ops-settings-switch-row__text">' +
        '<strong' + (danger ? ' style="color:var(--ops-risk)"' : '') + '>' + esc(title) + '</strong>' +
        '<span>' + esc(sub) + '</span></div>' +
      switchHtml(name, on, dis) +
    '</div>';
  }

  function riskBtn(lv, label, cur, dis) {
    var cls = lv === 'low' ? 'low' : lv === 'high' ? 'high' : 'mid';
    return '<button type="button" class="ops-risk-opt ops-risk-opt--' + cls +
      (cur === lv ? ' is-active' : '') + '" data-sens="' + lv + '"' + (dis ? ' disabled' : '') + '>' + label + '</button>';
  }

  function actions(module) {
    return '<div class="ops-settings-actions">' +
      '<button type="button" class="ops-btn ops-btn--primary ops-btn--sm" data-save="' + module + '">保存配置</button>' +
      '<button type="button" class="ops-btn ops-btn--sm" data-reset-mod="' + module + '">恢复本模块默认</button>' +
    '</div>';
  }

  function bindForm(module, onInput) {
    var panel = document.getElementById('ops-settings-panel-' + module);
    if (!panel) return;
    panel.querySelectorAll('[data-save]').forEach(function (btn) {
      btn.addEventListener('click', function () { saveModule(module); });
    });
    panel.querySelectorAll('[data-reset-mod]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!confirm('恢复「' + module + '」模块默认配置？')) return;
        FayiAdminApi.settingsReset(module).then(function () {
          toast('已恢复默认配置');
          loadModule(module, true);
        });
      });
    });
    if (onInput) {
      panel.querySelectorAll('input, select').forEach(function (inp) {
        inp.addEventListener('input', onInput);
        inp.addEventListener('change', onInput);
      });
    }
  }

  function bindAiPanel(dis) {
    var sens = state.aiSettings && state.aiSettings.riskSensitivity || 'medium';
    document.querySelectorAll('#ops-risk-sens .ops-risk-opt').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (dis) return;
        sens = btn.getAttribute('data-sens');
        document.querySelectorAll('#ops-risk-sens .ops-risk-opt').forEach(function (b) {
          b.classList.toggle('is-active', b.getAttribute('data-sens') === sens);
        });
        if (!state.aiSettings) state.aiSettings = {};
        state.aiSettings.riskSensitivity = sens;
      });
    });
  }

  function bindSystemPreview() {
    updatePreview();
  }

  function updatePreview() {
    var s = state.systemSettings || {};
    var nameEl = document.getElementById('ops-preview-name');
    var tagEl = document.getElementById('ops-preview-tag');
    var leadEl = document.getElementById('ops-preview-lead');
    var logoMark = document.getElementById('ops-preview-logo');
    var logoIcon = document.getElementById('ops-preview-logo-icon');
    var logoImg = document.getElementById('ops-preview-logo-img');
    var form = document.getElementById('ops-settings-form-system');
    var platformName = s.platformName || '法绎法律科技';
    var themeColor = s.themeColor || '#38bdf8';
    var logoUrl = s.logoUrl || '';

    if (form) {
      var n = form.querySelector('[name="platformName"]');
      var c = form.querySelector('[name="themeColor"]');
      var u = form.querySelector('[name="logoUrl"]');
      if (n && n.value) platformName = n.value;
      if (c && c.value) themeColor = c.value;
      if (u) logoUrl = u.value || '';
      if (c) applyThemePreview(c.value);
    }

    if (nameEl) nameEl.textContent = platformName;
    if (tagEl) tagEl.textContent = 'LEGAL OPS · ' + platformName;
    if (leadEl) {
      leadEl.textContent = '「' + platformName + '」将展示于管理端侧栏、登录页与浏览器标题，作为对外品牌识别。';
    }

    if (logoMark) {
      logoMark.style.background = 'linear-gradient(145deg, ' + themeColor + ' 0%, #1e3a8a 100%)';
      logoMark.style.boxShadow = '0 0 22px ' + themeColor + '55, inset 0 1px 0 rgba(255,255,255,0.12)';
    }

    if (logoUrl && logoImg) {
      logoImg.src = logoUrl;
      logoImg.hidden = false;
      if (logoIcon) logoIcon.style.display = 'none';
    } else {
      if (logoImg) {
        logoImg.hidden = true;
        logoImg.removeAttribute('src');
      }
      if (logoIcon) logoIcon.style.display = '';
    }
  }

  function collectForm(module) {
    var panel = document.getElementById('ops-settings-panel-' + module);
    if (!panel) return {};
    var data = {};
    panel.querySelectorAll('input[name], select[name]').forEach(function (el) {
      if (el.type === 'checkbox') data[el.name] = el.checked;
      else if (el.name === 'logRetentionDays' || el.name === 'cacheTtlMinutes') {
        data[el.name] = parseInt(el.value, 10);
      } else data[el.name] = el.value;
    });
    panel.querySelectorAll('input[data-sw]').forEach(function (el) {
      data[el.getAttribute('data-sw')] = el.checked;
    });
    if (module === 'ai' && state.aiSettings) {
      data.riskSensitivity = state.aiSettings.riskSensitivity || 'medium';
    }
    return data;
  }

  function saveModule(module) {
    if (saving || !canEditTab(module)) return;
    saving = true;
    var body = collectForm(module);
    FayiAdminApi.settingsUpdate(module, body).then(function (res) {
      saving = false;
      var data = (res && res.data != null) ? res.data : res;
      state[module + 'Settings'] = data || body;
      toast((res && res.message) || '配置已更新，将实时生效');
      if (module === 'system') {
        applyThemePreview(body.themeColor);
        updatePreview();
      }
      if (window.OpsSystemLog) {
        OpsSystemLog.update('system', '更新配置 · ' + module, module, JSON.stringify(body).slice(0, 120));
      }
      if (window.OpsRuntime && OpsRuntime.invalidate) OpsRuntime.invalidate('/settings');
    }).catch(function (err) {
      saving = false;
      toast((err && err.message) || '保存失败');
    });
  }

  function loadModule(module, force) {
    if (!FayiAdminApi.settingsGet) return Promise.resolve();
    return FayiAdminApi.settingsGet(module, force ? { force: true, ttlMs: 0 } : {}).then(function (res) {
      var data = (res && res.data != null) ? res.data : res;
      state[module + 'Settings'] = data;
      return data;
    });
  }

  function loadAll(force) {
    state.settingsLoading = true;
    var role = getAdminRole();
    var tabs = visibleTabs();
    var reqs = tabs.map(function (t) { return loadModule(t.id, force); });
    return Promise.all(reqs).then(function () {
      state.settingsLoading = false;
      renderPanels(tabs, role);
      applyTabVisibility(tabs);
      bindTabEvents(tabs);
      if (state.systemSettings) applyThemePreview(state.systemSettings.themeColor);
    }).catch(function (err) {
      state.settingsLoading = false;
      console.warn('[settings] load failed', err);
      renderPanels(tabs, role);
      applyTabVisibility(tabs);
      bindTabEvents(tabs);
    });
  }

  function destroy() {}

  return { mount: mount, onData: function () {}, destroy: destroy };
})();

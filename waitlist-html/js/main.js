// 导航栏滚动效果：背景从透明→实色 + 阴影
(function initFayiNavbarScroll() {
  var header = document.querySelector('header');
  if (!header) return;
  function onScroll() {
    if ((window.scrollY || 0) > 16) {
      header.classList.add('fayi-header--scrolled');
    } else {
      header.classList.remove('fayi-header--scrolled');
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

// 视差：背景略慢于滚动，增强层次（仅存在装饰层时启用）
(function initFayiParallax() {
  var blur = document.querySelector('.fayi-parallax-bg');
  var lines = document.querySelector('.fayi-parallax-lines');
  if (!blur && !lines) return;
  function tick() {
    var y = window.scrollY || 0;
    if (blur) blur.style.transform = 'translateX(-50%) translateY(' + Math.round(y * 0.22) + 'px)';
    if (lines) lines.style.transform = 'translateX(-50%) translateY(' + Math.round(y * 0.11) + 'px)';
  }
  window.addEventListener('scroll', tick, { passive: true });
  tick();
})();

// 服务动态：订阅按钮演示反馈
document.addEventListener('DOMContentLoaded', function () {
  var sub = document.getElementById('updates-subscribe-btn');
  if (sub) {
    sub.addEventListener('click', function () {
      if (window.FayiToast) {
        FayiToast('已记录（演示）。正式上线后将向您发送确认邮件。', 'success');
      }
    });
  }
});

// ===== 新手引导弹窗（首次进入显示）=====
(function initGuideModal() {

  /* ---------- 多步引导内容配置 ----------
   * 后续扩展：往 STEPS 数组中追加对象即可，无需修改其他逻辑。
   * 每个 step 字段：title / body（HTML字符串）/ btnText
   */
  var STEPS = [
    {
      title: '欢迎使用法绎系统 👋',
      body: [
        '<p style="color:#4b5563;margin:0 0 14px">法绎是一款面向大众的智能法律服务平台，为您提供：</p>',
        '<ul style="text-align:left;padding-left:18px;color:#4b5563;line-height:2;margin:0 0 14px">',
        '  <li>📌 &nbsp;法律咨询 — 输入问题，AI 即时解答</li>',
        '  <li>📄 &nbsp;文件分析 — 上传合同 / 图片智能解读</li>',
        '  <li>🎥 &nbsp;普法推荐 — 视频 + 科普文献一站式</li>',
        '  <li>📚 &nbsp;知识库 — 保存您的法律备忘录</li>',
        '</ul>',
      ].join('')
    },
    {
      title: '如何快速上手？🚀',
      body: [
        '<ol style="text-align:left;padding-left:18px;color:#4b5563;line-height:2.2;margin:0 0 14px">',
        '  <li>点击顶部导航栏，选择功能模块</li>',
        '  <li>在聊天框输入您的法律问题</li>',
        '  <li>可上传图片，系统自动 OCR 识别文字</li>',
        '  <li>查看建议，重要决策请咨询执业律师</li>',
        '</ol>',
        '<p style="font-size:12px;color:#9ca3af;margin:0">💡 提示：帮助中心随时可查看完整使用指南</p>',
      ].join('')
    },
    {
      title: '使用前须知 ⚖️',
      body: [
        '<p style="color:#4b5563;margin:0 0 12px">为了更好地保护您的权益，请了解以下事项：</p>',
        '<ul style="text-align:left;padding-left:18px;color:#4b5563;line-height:2;margin:0 0 14px">',
        '  <li>🔒 &nbsp;您的对话数据加密存储，仅您可见</li>',
        '  <li>⚠️ &nbsp;AI 输出<strong>仅供参考</strong>，不具有法律效力</li>',
        '  <li>👨‍💼 &nbsp;重要决策请务必咨询专业律师</li>',
        '</ul>',
        '<p style="font-size:13px;color:#6366f1;font-weight:600;margin:0">点击"开始使用"即表示您已了解以上内容。</p>',
      ].join('')
    }
  ];

  /* ---------- 当前步骤索引（预留多步结构）---------- */
  var stepIndex = 0;

  /* ---------- 检查是否已见过引导 ---------- */
  if (localStorage.getItem('hasSeenGuide') === 'true') return;

  /* ---------- 注入 CSS ---------- */
  var style = document.createElement('style');
  style.textContent = [
    '@keyframes guide-fade-in{',
    '  from{opacity:0;transform:translateY(22px) scale(.97)}',
    '  to  {opacity:1;transform:translateY(0)    scale(1 )}',
    '}',
    '@keyframes guide-fade-out{',
    '  from{opacity:1;transform:translateY(0)    scale(1 )}',
    '  to  {opacity:0;transform:translateY(12px) scale(.97)}',
    '}',
    '.guide-overlay{',
    '  position:fixed;top:0;left:0;width:100%;height:100%;',
    '  background:rgba(0,0,0,.52);backdrop-filter:blur(3px);',
    '  display:flex;justify-content:center;align-items:center;',
    '  z-index:10000;',
    '}',
    '.guide-modal{',
    '  background:#fff;padding:32px 28px 24px;border-radius:16px;',
    '  width:min(440px,90vw);box-shadow:0 24px 60px rgba(0,0,0,.22);',
    '  animation:guide-fade-in .32s cubic-bezier(.22,1,.36,1) forwards;',
    '  position:relative;',
    '}',
    '.dark .guide-modal{background:#1e293b;color:#e5e7eb;}',
    '.guide-modal h2{font-size:18px;font-weight:800;color:#1e1b4b;margin:0 0 16px;text-align:center}',
    '.dark .guide-modal h2{color:#c7d2fe;}',
    '.guide-dots{display:flex;justify-content:center;gap:7px;margin:0 0 18px;}',
    '.guide-dot{',
    '  width:8px;height:8px;border-radius:50%;',
    '  background:rgba(99,102,241,.25);',
    '  transition:background .2s,transform .2s;',
    '}',
    '.guide-dot.active{background:#6366f1;transform:scale(1.3);}',
    '.guide-actions{display:flex;gap:10px;margin-top:22px;justify-content:flex-end;}',
    '.guide-btn{',
    '  padding:9px 20px;border-radius:9px;font-size:13px;font-weight:600;',
    '  border:none;cursor:pointer;transition:background .18s,transform .15s,opacity .18s;',
    '}',
    '.guide-btn:hover{transform:translateY(-2px);}',
    '.guide-btn-primary{background:#4f46e5;color:#fff;}',
    '.guide-btn-primary:hover{background:#4338ca;}',
    '.guide-btn-ghost{background:rgba(99,102,241,.1);color:#4f46e5;}',
    '.dark .guide-btn-ghost{background:rgba(99,102,241,.2);color:#a5b4fc;}',
    '.guide-btn-ghost:hover{background:rgba(99,102,241,.2);}',
    '.guide-close-x{',
    '  position:absolute;top:14px;right:14px;',
    '  width:26px;height:26px;border-radius:50%;border:none;cursor:pointer;',
    '  background:rgba(107,114,128,.12);color:#6b7280;',
    '  display:flex;align-items:center;justify-content:center;',
    '  font-size:14px;line-height:1;transition:background .15s;',
    '}',
    '.guide-close-x:hover{background:rgba(239,68,68,.15);color:#ef4444;}',
  ].join('');
  document.head.appendChild(style);

  /* ---------- 注入 HTML ---------- */
  var overlay = document.createElement('div');
  overlay.id = 'guide-overlay';
  overlay.className = 'guide-overlay';
  overlay.innerHTML = [
    '<div class="guide-modal" id="guide-modal" role="dialog" aria-modal="true" aria-labelledby="guide-title">',
    '  <button class="guide-close-x" id="guide-close-x" aria-label="关闭引导">✕</button>',
    '  <h2 id="guide-title"></h2>',
    '  <div class="guide-dots" id="guide-dots"></div>',
    '  <div id="guide-body"></div>',
    '  <div class="guide-actions" id="guide-actions"></div>',
    '</div>',
  ].join('');
  document.body.appendChild(overlay);

  var titleEl   = document.getElementById('guide-title');
  var bodyEl    = document.getElementById('guide-body');
  var dotsEl    = document.getElementById('guide-dots');
  var actionsEl = document.getElementById('guide-actions');

  /* ---------- 渲染当前步骤 ---------- */
  function renderStep(idx) {
    var step = STEPS[idx];
    titleEl.textContent = step.title;
    bodyEl.innerHTML    = step.body;

    /* 进度点 */
    dotsEl.innerHTML = '';
    STEPS.forEach(function (_, i) {
      var dot = document.createElement('div');
      dot.className = 'guide-dot' + (i === idx ? ' active' : '');
      dotsEl.appendChild(dot);
    });

    /* 操作按钮 */
    actionsEl.innerHTML = '';
    if (idx > 0) {
      var prevBtn = document.createElement('button');
      prevBtn.className   = 'guide-btn guide-btn-ghost';
      prevBtn.textContent = '← 上一步';
      prevBtn.onclick     = function () { stepIndex--; renderStep(stepIndex); };
      actionsEl.appendChild(prevBtn);
    }
    var mainBtn = document.createElement('button');
    mainBtn.className   = 'guide-btn guide-btn-primary';
    mainBtn.textContent = idx < STEPS.length - 1 ? '下一步 →' : '开始使用 ✓';
    mainBtn.onclick     = function () {
      if (stepIndex < STEPS.length - 1) {
        stepIndex++;
        renderStep(stepIndex);
      } else {
        closeGuide();
      }
    };
    actionsEl.appendChild(mainBtn);
  }

  /* ---------- 关闭弹窗 ---------- */
  function closeGuide() {
    var modal = document.getElementById('guide-modal');
    if (!modal) return;
    modal.style.animation = 'guide-fade-out .22s ease forwards';
    setTimeout(function () {
      overlay.style.display = 'none';
      localStorage.setItem('hasSeenGuide', 'true');
    }, 200);
  }

  /* ---------- 初始化交互 ---------- */
  renderStep(0);

  /* × 按钮关闭 */
  document.getElementById('guide-close-x').addEventListener('click', closeGuide);

  /* 点击遮罩关闭（点在 overlay 自身，非 modal 内部）*/
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeGuide();
  });

  /* ESC 键关闭 */
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') {
      closeGuide();
      document.removeEventListener('keydown', onEsc);
    }
  });

})();

// Light switcher
const lightSwitches = document.querySelectorAll('.light-switch');
if (lightSwitches.length > 0) {
  lightSwitches.forEach((lightSwitch, i) => {
    if (localStorage.getItem('dark-mode') === 'true') {
      // eslint-disable-next-line no-param-reassign
      lightSwitch.checked = true;
    }
    lightSwitch.addEventListener('change', () => {
      const { checked } = lightSwitch;
      lightSwitches.forEach((el, n) => {
        if (n !== i) {
          // eslint-disable-next-line no-param-reassign
          el.checked = checked;
        }
      });
      document.documentElement.classList.add('[&_*]:!transition-none');
      if (lightSwitch.checked) {
        document.documentElement.classList.add('dark');
        document.querySelector('html').style.colorScheme = 'dark';
        localStorage.setItem('dark-mode', true);
        document.dispatchEvent(new CustomEvent('darkMode', { detail: { mode: 'on' } }));
      } else {
        document.documentElement.classList.remove('dark');
        document.querySelector('html').style.colorScheme = 'light';
        localStorage.setItem('dark-mode', false);
        document.dispatchEvent(new CustomEvent('darkMode', { detail: { mode: 'off' } }));
      }
      setTimeout(() => {
        document.documentElement.classList.remove('[&_*]:!transition-none');
      }, 1);
    });
  });
}

// 数字大屏：全站操作日志与页面追踪
(function loadDashboardLibs() {
  if (window.FayiOperationLog) return;
  var base = './js/lib/';
  var queue = ['operation-log.js', 'pufa-read-stats.js', 'page-tracker.js', '../utils/activityTracker.js'];
  function next(i) {
    if (i >= queue.length) return;
    var s = document.createElement('script');
    s.src = base + queue[i];
    s.defer = true;
    s.onload = function () { next(i + 1); };
    document.head.appendChild(s);
  }
  next(0);
})();

/**
 * 法绎 · 帮助中心（Docs 架构）
 */
(function () {
  var DATA_URL = './data/faq-data.json';
  var VOTE_KEY = 'fayi_faq_votes_v2';
  var SEARCH_DELAY = 120;
  var allFaqs = [];
  var filteredFaqs = [];
  var docSections = [];
  var voteState = {};
  var faqIndex = {};
  var ioRender = null;
  var ioActive = null;
  var searchTimer = null;
  var navJumping = false;
  var activeSectionId = '';

  var els = {
    nav: null,
    sections: null,
    empty: null,
    search: null,
    hot: null,
    drawer: null,
    drawerMask: null,
    drawerToggle: null,
    contentScroll: null
  };

  var GROUP_CONFIG = [
    {
      id: 'getting-started',
      title: '新手入门',
      icon: '📘',
      defaults: ['系统介绍', '功能概览', '快速开始'],
      keys: ['新手', '入门', '开始', '首次', '基础']
    },
    {
      id: 'legal-consult',
      title: '法律咨询',
      icon: '⚖️',
      defaults: ['智能问答', '风险分析', '案件补充'],
      keys: ['咨询', '问答', '风险', '案件', '维权', '刑事', '民事']
    },
    {
      id: 'document-gen',
      title: '文书生成',
      icon: '📝',
      defaults: ['起诉状', '答辩状', '律师函'],
      keys: ['文书', '起诉状', '答辩状', '律师函', '合同', '仲裁']
    },
    {
      id: 'regulation-search',
      title: '法规检索',
      icon: '📚',
      defaults: ['检索方式', '法条筛选', '案例关联'],
      keys: ['法规', '法条', '检索', '案例', '法律依据']
    },
    {
      id: 'account-security',
      title: '账户与安全',
      icon: '🔒',
      defaults: ['登录问题', '数据隐私', '文件管理'],
      keys: ['账号', '账户', '登录', '密码', '隐私', '安全', '数据']
    },
    {
      id: 'common-faq',
      title: '常见问题',
      icon: '❓',
      defaults: ['高频问题', '排查建议', '使用限制'],
      keys: ['常见', '问题', '系统', '错误', '失败', '无响应']
    }
  ];

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function loadVoteState() {
    try { return JSON.parse(localStorage.getItem(VOTE_KEY) || '{}'); }
    catch (e) { return {}; }
  }

  function saveVoteState() {
    try { localStorage.setItem(VOTE_KEY, JSON.stringify(voteState)); } catch (e) { /* ignore */ }
  }

  function normalizeData(raw) {
    var list = raw && Array.isArray(raw.faqs) ? raw.faqs : [];
    var minHint = ' 如需进入正式法律程序，请结合原始证据和时效要求，必要时由执业律师进行复核。';
    return list.map(function (item, idx) {
      var answer = String(item.answer || '');
      if (answer.length < 120) answer += minHint;
      return {
        id: 'faq_' + idx,
        category: item.category || '其他',
        icon: item.icon || '❓',
        question: String(item.question || ''),
        answer: answer,
        tags: Array.isArray(item.tags) ? item.tags : [],
        relatedQuestions: Array.isArray(item.relatedQuestions) ? item.relatedQuestions : [],
        helpfulCount: Number(item.helpfulCount || 0)
      };
    });
  }

  function fetchFaqData() {
    return fetch(DATA_URL).then(function (r) {
      if (!r.ok) throw new Error('FAQ 数据加载失败');
      return r.json();
    });
  }

  function matchScore(faq, group) {
    var blob = [faq.category, faq.question, faq.answer].concat(faq.tags || []).join(' ').toLowerCase();
    var score = 0;
    (group.keys || []).forEach(function (k) {
      if (blob.indexOf(String(k).toLowerCase()) >= 0) score++;
    });
    return score;
  }

  function HelpSectionBuildModels(list, keyword) {
    var groups = GROUP_CONFIG.map(function (g, idx) {
      return {
        id: 'section_' + idx,
        groupId: g.id,
        title: g.title,
        icon: g.icon,
        defaults: g.defaults.slice(),
        faqs: [],
        keyword: keyword || '',
        collapsed: false
      };
    });

    list.forEach(function (faq) {
      var best = 0;
      var bestScore = -1;
      groups.forEach(function (g, idx) {
        var s = matchScore(faq, GROUP_CONFIG[idx]);
        if (s > bestScore) {
          best = idx;
          bestScore = s;
        }
      });
      groups[best].faqs.push(faq);
    });

    return groups;
  }

  function markKeyword(text, kw) {
    if (!kw) return esc(text);
    var safe = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return esc(text).replace(new RegExp('(' + safe + ')', 'ig'), '<span class="faq-mark">$1</span>');
  }

  function buildFaqIndex(list) {
    faqIndex = {};
    list.forEach(function (item) { faqIndex[item.id] = item; });
  }

  function setActiveNav(sectionId, faqId) {
    activeSectionId = sectionId || activeSectionId;
    if (!els.nav) return;
    els.nav.querySelectorAll('.docs-nav-group__header').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-target') === activeSectionId);
    });
    els.nav.querySelectorAll('.docs-nav-sub button').forEach(function (btn) {
      btn.classList.toggle('active', !!faqId && btn.getAttribute('data-faq-id') === faqId);
    });
  }

  function renderHot(list) {
    if (!els.hot) return;
    var top = list.slice().sort(function (a, b) { return b.helpfulCount - a.helpfulCount; }).slice(0, 5);
    els.hot.innerHTML = top.map(function (item) {
      return '<button type="button" data-jump="' + esc(item.id) + '">' + esc(item.question) + '</button>';
    }).join('');
  }

  function HelpSidebarRender(models) {
    if (!els.nav) return;
    els.nav.innerHTML = models.map(function (model) {
      var childButtons = model.faqs.slice(0, 7).map(function (faq) {
        return '<button type="button" data-faq-id="' + esc(faq.id) + '">' + esc(faq.question) + '</button>';
      }).join('');
      var defaults = model.defaults.map(function (label) {
        return '<button type="button" data-fallback="' + esc(label) + '">' + esc(label) + '</button>';
      }).join('');
      return '' +
        '<section class="docs-nav-group" data-section="' + model.id + '">' +
        '  <button type="button" class="docs-nav-group__header" data-target="' + model.id + '">' +
        '    <span>' + esc(model.icon) + ' ' + esc(model.title) + '</span>' +
        '    <span class="docs-nav-group__caret">⌄</span>' +
        '  </button>' +
        '  <div class="docs-nav-sub">' + (childButtons || defaults) + '</div>' +
        '</section>';
    }).join('');

    if (models[0]) setActiveNav(models[0].id, '');
  }

  function voteStats(item) {
    var vote = voteState[item.id];
    var helpful = item.helpfulCount + (vote === 'up' ? 1 : 0);
    var total = helpful + 20;
    return {
      helpful: helpful,
      rate: Math.round((helpful / total) * 100)
    };
  }

  function HelpCardFaq(item, keyword) {
    var stat = voteStats(item);
    var voted = voteState[item.id] || '';
    return '' +
      '<article class="faq-item" id="' + esc(item.id) + '" data-id="' + esc(item.id) + '">' +
      '  <button type="button" class="faq-question">' +
      '    <span>' + markKeyword(item.question, keyword) + '</span>' +
      '    <span class="arrow">⌄</span>' +
      '  </button>' +
      '  <div class="faq-answer-wrap">' +
      '    <div class="faq-answer">' +
      '      <div>' + markKeyword(item.answer, keyword) + '</div>' +
      '      <div class="faq-tags">' + (item.tags || []).map(function (t) { return '<span>#' + esc(t) + '</span>'; }).join('') + '</div>' +
      '      <div class="faq-related">' +
      '        <div class="faq-related__title">相关推荐</div>' +
      '        ' + (item.relatedQuestions || []).map(function (q) { return '<button type="button" data-related="' + esc(q) + '">' + esc(q) + '</button>'; }).join('') +
      '      </div>' +
      '      <div class="faq-feedback">' +
      '        <span>该回答是否解决了您的问题？</span>' +
      '        <button type="button" data-vote="up" class="' + (voted === 'up' ? 'active' : '') + '">👍 已解决</button>' +
      '        <button type="button" data-vote="down" class="' + (voted === 'down' ? 'active' : '') + '">👎 未解决</button>' +
      '        <span class="faq-feedback__rate">帮助率：' + stat.rate + '%（' + stat.helpful + '人认为有帮助）</span>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      '</article>';
  }

  function HelpSectionRenderShell(models) {
    if (!els.sections || !els.empty) return;
    if (!models.length) {
      els.sections.innerHTML = '';
      els.empty.classList.remove('hidden');
      return;
    }
    els.empty.classList.add('hidden');
    els.sections.innerHTML = models.map(function (model, idx) {
      return '' +
        '<section class="help-doc-section" id="' + model.id + '" data-idx="' + idx + '">' +
        '  <header class="help-doc-section__head">' +
        '    <h2>' + esc(model.title) + '</h2>' +
        '    <div class="help-doc-section__desc">' + esc(model.defaults.join(' · ')) + '</div>' +
        '  </header>' +
        '  <div class="help-doc-section__body" data-shell><div class="faq-answer" style="padding-top:12px;color:#6b7280">正在加载内容...</div></div>' +
        '</section>';
    }).join('');
  }

  function hydrateSection(sectionEl, model) {
    if (!sectionEl || !model || sectionEl.dataset.hydrated === '1') return;
    var body = sectionEl.querySelector('[data-shell]');
    if (!body) return;
    if (!model.faqs.length) {
      body.innerHTML = '<div class="faq-answer">该分类内容正在整理中，请先参考目录中的其他模块。</div>';
    } else {
      body.innerHTML = model.faqs.map(function (faq) {
        return HelpCardFaq(faq, model.keyword);
      }).join('');
    }
    sectionEl.dataset.hydrated = '1';
  }

  function setupRenderObserver(models) {
    if (!els.sections || !els.contentScroll) return;
    if (ioRender) ioRender.disconnect();
    ioRender = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var idx = Number(entry.target.getAttribute('data-idx'));
        hydrateSection(entry.target, models[idx]);
      });
    }, {
      root: els.contentScroll,
      rootMargin: '420px 0px 420px 0px',
      threshold: 0.01
    });
    els.sections.querySelectorAll('.help-doc-section').forEach(function (el) { ioRender.observe(el); });
  }

  function setupActiveObserver() {
    if (!els.sections || !els.contentScroll) return;
    if (ioActive) ioActive.disconnect();
    ioActive = new IntersectionObserver(function (entries) {
      if (navJumping) return;
      var visible = entries
        .filter(function (e) { return e.isIntersecting; })
        .sort(function (a, b) { return b.intersectionRatio - a.intersectionRatio; });
      if (!visible.length) return;
      setActiveNav(visible[0].target.id, '');
    }, {
      root: els.contentScroll,
      threshold: [0.2, 0.4, 0.6]
    });
    els.sections.querySelectorAll('.help-doc-section').forEach(function (el) { ioActive.observe(el); });
  }

  function renderAll(list, keyword) {
    buildFaqIndex(list);
    docSections = HelpSectionBuildModels(list, keyword);
    HelpSidebarRender(docSections);
    HelpSectionRenderShell(docSections);
    setupRenderObserver(docSections);
    setupActiveObserver();
    if (els.contentScroll) els.contentScroll.scrollTo({ top: 0, behavior: 'auto' });
  }

  function fuzzyFilter(keyword) {
    var kw = String(keyword || '').trim().toLowerCase();
    if (!kw) return allFaqs.slice();
    var terms = kw.split(/\s+/).filter(Boolean);
    return allFaqs.filter(function (item) {
      var blob = [item.question, item.answer, item.category].concat(item.tags || []).join(' ').toLowerCase();
      return terms.every(function (term) { return blob.indexOf(term) >= 0; });
    });
  }

  function applyKeyword(keyword) {
    filteredFaqs = fuzzyFilter(keyword);
    renderAll(filteredFaqs, String(keyword || '').trim());
  }

  function smoothScrollTo(target) {
    if (!target || !els.contentScroll) return;
    navJumping = true;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(function () { navJumping = false; }, 520);
  }

  function jumpToFaq(faqId) {
    if (!faqId) return;
    var targetSection = docSections.find(function (sec) {
      return sec.faqs.some(function (f) { return f.id === faqId; });
    });
    if (!targetSection) return;
    var sectionEl = document.getElementById(targetSection.id);
    if (!sectionEl) return;
    hydrateSection(sectionEl, targetSection);
    var faqEl = document.getElementById(faqId);
    if (!faqEl) return;
    setActiveNav(targetSection.id, faqId);
    smoothScrollTo(faqEl);
    var qBtn = faqEl.querySelector('.faq-question');
    if (qBtn && !faqEl.classList.contains('open')) qBtn.click();
  }

  function closeDrawer() {
    if (els.drawer) els.drawer.classList.remove('open');
  }

  function bindSearch() {
    if (!els.search) return;
    els.search.addEventListener('input', function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        applyKeyword(els.search.value);
      }, SEARCH_DELAY);
    });
  }

  function bindDrawer() {
    if (!els.drawerToggle || !els.drawer || !els.drawerMask) return;
    els.drawerToggle.addEventListener('click', function () { els.drawer.classList.add('open'); });
    els.drawerMask.addEventListener('click', closeDrawer);
  }

  function bindDelegation() {
    if (!els.nav || !els.sections || !els.hot) return;

    els.hot.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-jump]');
      if (!btn) return;
      jumpToFaq(btn.getAttribute('data-jump'));
    });

    els.nav.addEventListener('click', function (e) {
      var group = e.target.closest('.docs-nav-group');
      var header = e.target.closest('.docs-nav-group__header');
      if (group && header) {
        group.classList.toggle('collapsed');
        var targetId = header.getAttribute('data-target');
        var sectionEl = targetId ? document.getElementById(targetId) : null;
        if (sectionEl) {
          var idx = Number(sectionEl.getAttribute('data-idx'));
          hydrateSection(sectionEl, docSections[idx]);
          setActiveNav(targetId, '');
          smoothScrollTo(sectionEl);
          closeDrawer();
        }
        return;
      }

      var subBtn = e.target.closest('.docs-nav-sub button[data-faq-id]');
      if (subBtn) {
        jumpToFaq(subBtn.getAttribute('data-faq-id'));
        closeDrawer();
      }
    });

    els.sections.addEventListener('click', function (e) {
      var qBtn = e.target.closest('.faq-question');
      if (qBtn) {
        var item = qBtn.closest('.faq-item');
        if (!item) return;
        var wrap = item.querySelector('.faq-answer-wrap');
        if (!wrap) return;
        var open = item.classList.contains('open');
        if (open) {
          item.classList.remove('open');
          wrap.style.maxHeight = '0px';
          return;
        }
        var section = item.closest('.help-doc-section');
        if (section) {
          section.querySelectorAll('.faq-item.open').forEach(function (i) {
            i.classList.remove('open');
            var w = i.querySelector('.faq-answer-wrap');
            if (w) w.style.maxHeight = '0px';
          });
        }
        item.classList.add('open');
        wrap.style.maxHeight = wrap.scrollHeight + 'px';
        var sec = item.closest('.help-doc-section');
        if (sec) setActiveNav(sec.id, item.getAttribute('data-id'));
        return;
      }

      var rel = e.target.closest('[data-related]');
      if (rel) {
        var q = rel.getAttribute('data-related') || '';
        if (els.search) {
          els.search.value = q;
          applyKeyword(q);
        }
        return;
      }

      var voteBtn = e.target.closest('.faq-feedback [data-vote]');
      if (voteBtn) {
        var faq = voteBtn.closest('.faq-item');
        if (!faq) return;
        voteState[faq.getAttribute('data-id')] = voteBtn.getAttribute('data-vote');
        saveVoteState();
        applyKeyword(els.search ? els.search.value : '');
      }
    });
  }

  function renderError(msg) {
    if (!els.sections) return;
    els.sections.innerHTML = '<div class="faq-empty"><h3>帮助内容加载失败</h3><p>' + esc(msg) + '</p></div>';
  }

  document.addEventListener('DOMContentLoaded', function () {
    els.nav = document.getElementById('faq-category-nav');
    els.sections = document.getElementById('faq-sections');
    els.empty = document.getElementById('faq-empty');
    els.search = document.getElementById('faq-search-input');
    els.hot = document.getElementById('faq-hot-list');
    els.drawer = document.getElementById('help-drawer');
    els.drawerMask = document.getElementById('help-drawer-mask');
    els.drawerToggle = document.getElementById('help-nav-toggle');
    els.contentScroll = document.getElementById('help-content-scroll');

    voteState = loadVoteState();
    bindSearch();
    bindDrawer();
    bindDelegation();

    fetchFaqData()
      .then(function (raw) {
        allFaqs = normalizeData(raw);
        filteredFaqs = allFaqs.slice();
        renderHot(allFaqs);
        renderAll(filteredFaqs, '');
      })
      .catch(function (e) {
        renderError(e.message || '请稍后刷新重试');
      });
  });
})();


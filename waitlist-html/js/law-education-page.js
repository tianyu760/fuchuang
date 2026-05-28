/**
 * 普法宣传中心 — 对接 /api/law-education
 */
(function () {
  var API = 'http://localhost:3002/api/law-education';
  var SLOGANS = [
    '让法律知识触手可及',
    '知法守法，维权有据',
    'AI 伴您读懂身边的法律',
    '校园法治，安全成长',
    '防范诈骗，守护钱袋'
  ];
  var state = { categoryId: '', search: '', categories: [] };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function api(path, opts) {
    opts = opts || {};
    return fetch(API + path, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json; charset=utf-8' },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) { return r.json(); });
  }

  function trackVisit() {
    fetch('http://localhost:3002/api/admin/track/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json; charset=utf-8' },
      body: JSON.stringify({ page: 'law-education' })
    }).catch(function () {});
  }

  function showSkeleton(el, n) {
    el.innerHTML = '';
    for (var i = 0; i < n; i++) {
      var s = document.createElement('div');
      s.className = 'le-skeleton';
      el.appendChild(s);
    }
  }

  function catName(id) {
    var c = state.categories.find(function (x) { return x.id === id; });
    return c ? c.name : id;
  }

  function articleCard(a, delay) {
    var tags = (a.tags || []).map(function (t) {
      return '<span class="le-card__tag">' + esc(t) + '</span>';
    }).join('');
    var play = a.mediaType === 'video' && a.videoUrl
      ? '<div class="le-card__play"><svg width="48" height="48" viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="rgba(0,0,0,.5)"/><polygon points="26,20 46,32 26,44" fill="#fff"/></svg></div>'
      : '';
    return '<article class="le-card" data-id="' + esc(a.id) + '" data-type="' + esc(a.mediaType || 'article') + '" style="animation-delay:' + (delay || 0) + 'ms">' +
      '<div class="le-card__cover"><img src="' + esc(a.cover || '') + '" alt="" loading="lazy"/>' + play + '</div>' +
      '<div class="le-card__body"><div class="le-card__tags">' + tags + '</div>' +
      '<div class="le-card__title">' + esc(a.title) + '</div>' +
      '<div class="le-card__summary">' + esc(a.summary || '') + '</div>' +
      '<div class="le-card__meta"><span>' + esc(catName(a.categoryId)) + '</span>' +
      '<span>' + (a.reads || 0).toLocaleString() + ' 阅读</span>' +
      '<span>♥ ' + (a.likes || 0) + '</span></div></div></article>';
  }

  function bindArticleClicks(root) {
    root.querySelectorAll('.le-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var id = card.getAttribute('data-id');
        var type = card.getAttribute('data-type');
        api('/articles/' + id).then(function (res) {
          if (!res.success) return;
          var a = res.data;
          if (window.FayiPufaStats && FayiPufaStats.increaseReadCount) {
            FayiPufaStats.increaseReadCount({
              kind: type === 'video' ? 'video' : 'article',
              title: a.title,
              category: catName(a.categoryId),
              articleId: a.id
            });
          }
          if (type === 'video' && a.videoUrl) openVideo(a);
          else openArticleModal(a);
        });
      });
    });
  }

  function openVideo(a) {
    $('le-video-frame').src = a.videoUrl;
    $('le-video-title').textContent = a.title;
    $('le-video-overlay').style.display = 'block';
    $('le-video-modal').style.display = 'block';
  }

  function closeVideo() {
    $('le-video-overlay').style.display = 'none';
    $('le-video-modal').style.display = 'none';
    $('le-video-frame').src = '';
  }

  function openArticleModal(a) {
    $('le-modal-title').textContent = a.title;
    $('le-modal-body').innerHTML =
      '<p class="text-sm text-gray-500 mb-3">' + esc(catName(a.categoryId)) + ' · ' + (a.reads || 0) + ' 阅读</p>' +
      '<p style="line-height:1.8">' + esc(a.content || a.summary || '') + '</p>' +
      '<button type="button" id="le-like-btn" class="btn text-sm mt-4 bg-indigo-600 text-white py-2 px-4 rounded-lg">点赞</button>';
    $('le-modal-overlay').style.display = 'block';
    $('le-modal').style.display = 'block';
    var likeBtn = $('le-like-btn');
    if (likeBtn) {
      likeBtn.onclick = function () {
        api('/articles/' + a.id + '/like', { method: 'POST' }).then(function () {
          likeBtn.textContent = '已点赞';
          likeBtn.disabled = true;
        });
      };
    }
  }

  function closeModal() {
    $('le-modal-overlay').style.display = 'none';
    $('le-modal').style.display = 'none';
  }

  function renderCases(list) {
    var el = $('le-cases');
    el.innerHTML = list.map(function (c, i) {
      var laws = (c.laws || []).map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('');
      return '<div class="le-case" style="animation-delay:' + (i * 60) + 'ms">' +
        '<span class="le-case__risk le-case__risk--' + esc(c.riskLevel || '中') + '">风险 ' + esc(c.riskLevel || '中') + '</span>' +
        '<h4>' + esc(c.title) + '</h4>' +
        '<p><strong>AI 解读：</strong>' + esc(c.aiAnalysis || '') + '</p>' +
        '<p><strong>防范建议：</strong>' + esc(c.prevention || '') + '</p>' +
        '<ul style="font-size:0.75rem;color:#6366f1;margin:8px 0 0 18px">' + laws + '</ul></div>';
    }).join('');
  }

  function loadArticles() {
    var qs = '?';
    if (state.categoryId) qs += 'categoryId=' + encodeURIComponent(state.categoryId) + '&';
    if (state.search) qs += 'search=' + encodeURIComponent(state.search) + '&';
    var loadEl = $('le-articles-loading');
    showSkeleton(loadEl, 2);
    api('/articles' + qs).then(function (res) {
      loadEl.innerHTML = '';
      if (!res.success) return;
      var all = res.data || [];
      var articles = all.filter(function (a) { return a.mediaType !== 'video'; });
      var videos = all.filter(function (a) { return a.mediaType === 'video'; });
      var artEl = $('le-articles');
      var vidEl = $('le-videos');
      artEl.innerHTML = articles.length
        ? articles.map(function (a, i) { return articleCard(a, i * 40); }).join('')
        : '<p class="text-sm text-gray-500">暂无匹配文章</p>';
      vidEl.innerHTML = videos.length
        ? videos.map(function (a, i) { return articleCard(a, i * 40); }).join('')
        : '<p class="text-sm text-gray-500">暂无视频</p>';
      bindArticleClicks(artEl);
      bindArticleClicks(vidEl);
    });
  }

  function loadCases() {
    api('/cases').then(function (res) {
      if (res.success) renderCases(res.data || []);
    });
  }

  function renderChips() {
    var html = '<button type="button" class="le-chip is-active" data-cat="">全部</button>';
    state.categories.forEach(function (c) {
      html += '<button type="button" class="le-chip" data-cat="' + esc(c.id) + '">' + esc(c.name) + '</button>';
    });
    $('le-chips').innerHTML = html;
    $('le-chips').querySelectorAll('.le-chip').forEach(function (btn) {
      btn.addEventListener('click', function () {
        $('le-chips').querySelectorAll('.le-chip').forEach(function (b) { b.classList.remove('is-active'); });
        btn.classList.add('is-active');
        state.categoryId = btn.getAttribute('data-cat') || '';
        loadArticles();
      });
    });
  }

  function rotateSlogan() {
    var el = $('le-slogan');
    var i = 0;
    setInterval(function () {
      el.style.opacity = '0';
      setTimeout(function () {
        i = (i + 1) % SLOGANS.length;
        el.textContent = SLOGANS[i];
        el.style.opacity = '1';
      }, 400);
    }, 4500);
  }

  function runAi() {
    var q = $('le-ai-input').value.trim();
    if (!q) return;
    var btn = $('le-ai-btn');
    var box = $('le-ai-result');
    btn.disabled = true;
    btn.textContent = '分析中…';
    box.classList.remove('is-show');
    box.innerHTML = '<div class="le-skeleton"></div>';
    box.classList.add('is-show');
    api('/ai-assist', { method: 'POST', body: { question: q } }).then(function (res) {
      btn.disabled = false;
      btn.textContent = '开始 AI 普法分析';
      if (!res.success) {
        box.innerHTML = '<p style="color:#dc2626">' + esc(res.message || '分析失败') + '</p>';
        return;
      }
      var d = res.data;
      box.innerHTML =
        '<h4 style="font-weight:700;margin-bottom:8px">知识讲解</h4><p>' + esc(d.explanation) + '</p>' +
        '<h4 style="font-weight:700;margin:12px 0 8px">风险提醒</h4><p>' + esc(d.risk_warning) + '</p>' +
        '<h4 style="font-weight:700;margin:12px 0 8px">法条推荐</h4><ul>' + (d.laws || []).map(function (l) {
          return '<li>' + esc(l) + '</li>';
        }).join('') + '</ul>' +
        '<h4 style="font-weight:700;margin:12px 0 8px">案例推荐</h4><ul>' + (d.cases || []).map(function (l) {
          return '<li>' + esc(l) + '</li>';
        }).join('') + '</ul>';
    }).catch(function () {
      btn.disabled = false;
      btn.textContent = '开始 AI 普法分析';
      box.innerHTML = '<p style="color:#dc2626">无法连接服务，请确认 Node 服务已启动（端口 3002）。</p>';
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!window.FayiAuth || !FayiAuth.getCurrentUser()) return;
    trackVisit();
    rotateSlogan();
    $('le-search-btn').onclick = function () {
      state.search = $('le-search').value.trim();
      loadArticles();
    };
    $('le-search').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { state.search = $('le-search').value.trim(); loadArticles(); }
    });
    $('le-ai-btn').onclick = runAi;
    $('le-modal-close').onclick = closeModal;
    $('le-modal-overlay').onclick = closeModal;
    $('le-video-close').onclick = closeVideo;
    $('le-video-overlay').onclick = closeVideo;

    api('/categories').then(function (res) {
      if (res.success) {
        state.categories = res.data || [];
        renderChips();
      }
      loadArticles();
      loadCases();
    });
  });
})();

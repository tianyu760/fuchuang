/**
 * knowledge.js — 个人资料库模块（分类筛选升级版）
 * 对接：Node.js 服务 http://localhost:3002/api/knowledge
 */
(function () {

  var KB_SERVER_URL = 'http://localhost:3002';

  function kbAuthHeader() {
    var token = window.FayiAuth && FayiAuth.getToken ? FayiAuth.getToken() : null;
    return token ? { 'Authorization': 'Bearer ' + token } : {};
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function toast(msg, type) {
    if (window.FayiToast) FayiToast(msg, type);
    else console[type === 'error' ? 'error' : 'log']('[kb]', msg);
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  // ══ 文件类型配置 ══

  var FILE_TYPES = {
    word:  { color: '#2563eb', bg: '#eff6ff', label: 'Word', icon: 'W',
             extList: ['doc', 'docx'] },
    pdf:   { color: '#dc2626', bg: '#fef2f2', label: 'PDF',  icon: 'P',
             extList: ['pdf'] },
    image: { color: '#16a34a', bg: '#f0fdf4', label: '图片', icon: '🖼',
             extList: ['jpg', 'jpeg', 'png', 'gif', 'webp'] },
    text:  { color: '#64748b', bg: '#f8fafc', label: '文字', icon: '📝',
             extList: [] },
    other: { color: '#78716c', bg: '#fafaf9', label: '其他', icon: '📁',
             extList: [] }
  };

  var CAT_LIST = [
    { key: 'all',   label: '全部'   },
    { key: 'word',  label: 'Word'  },
    { key: 'pdf',   label: 'PDF'   },
    { key: 'image', label: '图片'  },
    { key: 'text',  label: '纯文字' },
    { key: 'other', label: '其他'  }
  ];

  function getFileType(it) {
    if (!it.hasFile || !it.fileName) return 'text';
    var ext = (it.fileName.split('.').pop() || '').toLowerCase();
    if (FILE_TYPES.word.extList.indexOf(ext)  > -1) return 'word';
    if (FILE_TYPES.pdf.extList.indexOf(ext)   > -1) return 'pdf';
    if (FILE_TYPES.image.extList.indexOf(ext) > -1) return 'image';
    return 'other';
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!window.FayiAuth || !FayiAuth.getCurrentUser()) return;

    var listEl        = document.getElementById('kb-list');
    var form          = document.getElementById('kb-form');
    var titleEl       = document.getElementById('kb-title');
    var contentEl     = document.getElementById('kb-content');
    var fileInput     = document.getElementById('kb-file-input');
    var fileTrigger   = document.getElementById('kb-file-trigger');
    var fileInfoEl    = document.getElementById('kb-file-info');
    var fileNameEl    = document.getElementById('kb-file-name');
    var fileStatusEl  = document.getElementById('kb-file-status');
    var fileClearBtn  = document.getElementById('kb-file-clear');
    var submitBtn     = document.getElementById('kb-submit-btn');
    var searchInput   = document.getElementById('kb-search-input');
    var tagsRow       = document.getElementById('kb-tags-row');
    var tagInput      = document.getElementById('kb-tag-input');
    var countBadge    = document.getElementById('kb-count-badge');
    var recentSection = document.getElementById('kb-recent-section');
    var recentListEl  = document.getElementById('kb-recent-list');
    var catTabsEl     = document.getElementById('kb-cat-tabs');

    if (!listEl || !form || !titleEl) return;

    var selectedFile   = null;
    var allItems       = [];
    var currentTags    = [];
    var searchKeyword  = '';
    var activeCategory = 'all';

    // ══ 文件上传按钮 ══

    if (fileTrigger && fileInput) {
      fileTrigger.addEventListener('click', function () { fileInput.click(); });
      fileInput.addEventListener('change', function () {
        handleFileSelect(fileInput.files && fileInput.files[0]);
      });
    }
    if (fileClearBtn) fileClearBtn.addEventListener('click', clearFileSelection);

    function handleFileSelect(file) {
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { toast('文件过大,最大支持 10 MB', 'error'); return; }
      var isImage = file.type.startsWith('image/');
      selectedFile = {
        name: file.name, type: file.type, rawFile: file,
        previewUrl: isImage ? URL.createObjectURL(file) : null
      };
      if (fileInfoEl)  fileInfoEl.style.display = 'flex';
      if (fileNameEl)  fileNameEl.textContent    = file.name;
      if (fileStatusEl) fileStatusEl.textContent = '';
          
      // 自动填充标题为文件名（如果标题为空）
      if (titleEl && !titleEl.value.trim()) {
        var fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
        titleEl.value = fileNameWithoutExt;
      }
          
      // 自动提交表单保存文件
      form.dispatchEvent(new Event('submit', { cancelable: true }));
    }

    function clearFileSelection() {
      if (selectedFile && selectedFile.previewUrl) URL.revokeObjectURL(selectedFile.previewUrl);
      selectedFile = null;
      if (fileInput)    fileInput.value           = '';
      if (fileInfoEl)   fileInfoEl.style.display  = 'none';
      if (fileNameEl)   fileNameEl.textContent     = '';
      if (fileStatusEl) fileStatusEl.textContent  = '';
    }

    // ══ 标签管理 ══

    function addTag(tag) {
      tag = tag.trim();
      if (!tag || currentTags.indexOf(tag) > -1 || currentTags.length >= 5) return;
      currentTags.push(tag);
      renderTagChips();
    }

    function removeTag(tag) {
      currentTags = currentTags.filter(function (t) { return t !== tag; });
      renderTagChips();
    }

    function renderTagChips() {
      tagsRow.querySelectorAll('.kb-tag-chip').forEach(function (el) { el.remove(); });
      currentTags.forEach(function (tag) {
        var span = document.createElement('span');
        span.className = 'kb-tag-chip';
        span.innerHTML = escapeHtml(tag) +
          '<button type="button" title="移除">&times;</button>';
        span.querySelector('button').addEventListener('click', function () { removeTag(tag); });
        tagsRow.insertBefore(span, tagInput);
      });
    }

    if (tagInput) {
      tagInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          addTag(tagInput.value);
          tagInput.value = '';
        }
      });
    }

    document.querySelectorAll('.kb-tag-preset').forEach(function (btn) {
      btn.addEventListener('click', function () { addTag(btn.getAttribute('data-tag')); });
    });

    // ══ 搜索 ══

    if (searchInput) {
      searchInput.addEventListener('input', function () {
        searchKeyword = searchInput.value.trim().toLowerCase();
        animatedRenderList(filterItems());
      });
    }

    function filterItems() {
      var items = allItems;
      if (activeCategory !== 'all') {
        items = items.filter(function (it) { return getFileType(it) === activeCategory; });
      }
      if (searchKeyword) {
        items = items.filter(function (it) {
          return (it.title   || '').toLowerCase().indexOf(searchKeyword) > -1 ||
                 (it.content || '').toLowerCase().indexOf(searchKeyword) > -1;
        });
      }
      return items;
    }

    // ══ 分类 Tabs ══

    function renderCatTabs(items) {
      if (!catTabsEl) return;
      var counts = { all: items.length, word: 0, pdf: 0, image: 0, text: 0, other: 0 };
      items.forEach(function (it) {
        var t = getFileType(it);
        counts[t] = (counts[t] || 0) + 1;
      });

      catTabsEl.innerHTML =
        '<div class="kb-cat-row">' +
        CAT_LIST.map(function (cat) {
          var isActive = activeCategory === cat.key;
          var cnt = cat.key === 'all' ? counts.all : (counts[cat.key] || 0);
          return (
            '<button type="button" class="kb-cat-btn' + (isActive ? ' active' : '') +
            '" data-cat="' + cat.key + '">' +
            escapeHtml(cat.label) +
            '<span class="kb-cat-count">' + cnt + '</span>' +
            '</button>'
          );
        }).join('') +
        '</div>';

      catTabsEl.querySelectorAll('.kb-cat-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          activeCategory = btn.getAttribute('data-cat');
          renderCatTabs(allItems);
          animatedRenderList(filterItems());
        });
      });
    }

    // ══ 最近使用（前3条，带类型彩点）══

    function renderRecent(items) {
      if (!recentSection || !recentListEl) return;
      var recent = items.slice(0, 3);
      if (recent.length === 0) { recentSection.style.display = 'none'; return; }
      recentSection.style.display = '';

      recentListEl.innerHTML = recent.map(function (it) {
        var tc = FILE_TYPES[getFileType(it)] || FILE_TYPES.other;
        return (
          '<span class="kb-recent-chip" title="' + escapeHtml(it.title) + '" ' +
          'data-id="' + escapeHtml(String(it.id)) + '">' +
          '<span class="kb-recent-dot" style="background:' + tc.color + '"></span>' +
          escapeHtml(it.title) + '</span>'
        );
      }).join('');

      recentListEl.querySelectorAll('.kb-recent-chip').forEach(function (chip) {
        chip.addEventListener('click', function () {
          // 如果当前分类不是全部，先切换回全部再定位
          if (activeCategory !== 'all') {
            activeCategory = 'all';
            renderCatTabs(allItems);
            renderList(allItems);
          }
          scrollToItem(chip.getAttribute('data-id'));
        });
      });
    }

    function scrollToItem(id) {
      var card = listEl.querySelector('[data-id="' + id + '"]');
      var scrollRoot = document.getElementById('kb-list-scroll');
      if (!card || !scrollRoot) return;
      var cardRect = card.getBoundingClientRect();
      var rootRect = scrollRoot.getBoundingClientRect();
      var targetTop = scrollRoot.scrollTop + (cardRect.top - rootRect.top) - (rootRect.height / 2 - cardRect.height / 2);
      scrollRoot.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
      card.style.outline = '2px solid #3b82f6';
      card.style.outlineOffset = '2px';
      setTimeout(function () { card.style.outline = ''; card.style.outlineOffset = ''; }, 1600);
    }

    // ══ 主渲染 ══

    function render(items) {
      allItems = items || [];
      if (countBadge) countBadge.textContent = allItems.length + ' 条';
      renderRecent(allItems);
      renderCatTabs(allItems);
      renderList(filterItems());
    }

    function animatedRenderList(items) {
      listEl.classList.add('kb-list-anim');
      renderList(items);
      setTimeout(function () { listEl.classList.remove('kb-list-anim'); }, 300);
    }

    function renderList(items) {
      if (!items || items.length === 0) {
        var emptyMsg = searchKeyword
          ? '没有找到匹配"' + escapeHtml(searchKeyword) + '"的资料'
          : (activeCategory !== 'all'
              ? '该分类暂无资料'
              : '暂无资料，在左侧填写后点击「保存资料」');
        listEl.innerHTML =
          '<div class="kb-empty">' +
          '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="1.5" ' +
          'style="margin:0 auto 14px;display:block">' +
          '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
          '<polyline points="14 2 14 8 20 8"/>' +
          '<line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>' +
          '<polyline points="10 9 9 9 8 9"/></svg>' +
          emptyMsg + '</div>';
        return;
      }

      listEl.innerHTML = items.map(function (it) {
        var fileType = getFileType(it);
        var tc       = FILE_TYPES[fileType] || FILE_TYPES.other;
        var summary  = escapeHtml((it.content || '').slice(0, 180).replace(/\s+/g, ' '));
        if ((it.content || '').length > 180) summary += '…';
        var dateStr = formatDate(it.createdAt);
        var fullUrl = it.fileUrl ? KB_SERVER_URL + it.fileUrl : '';

        // 左侧色条
        var typeBar =
          '<div class="kb-type-bar" style="background:' + tc.color + '"></div>';

        // 类型徽章
        var typeBadge =
          '<span class="kb-type-badge" style="color:' + tc.color +
          ';background:' + tc.bg +
          ';border-color:' + tc.color + '30">' +
          tc.label + '</span>';

        // 业务标签
        var tagsHtml = '';
        if (it.tags) {
          var tagArr = Array.isArray(it.tags) ? it.tags : String(it.tags).split(',');
          tagArr = tagArr.filter(Boolean);
          if (tagArr.length) {
            tagsHtml = '<div class="kb-tag-list" style="margin-bottom:6px">' +
              tagArr.map(function (t) {
                return '<span class="kb-tag-badge">' + escapeHtml(t.trim()) + '</span>';
              }).join('') + '</div>';
          }
        }

        // 附件元信息
        var fileMeta = '';
        if (it.hasFile && it.fileName) {
          fileMeta =
            '<span class="kb-item-meta-text" title="' + escapeHtml(it.fileName) + '">' +
            '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66' +
            'l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>' +
            escapeHtml(it.fileName.length > 22 ? it.fileName.slice(0, 20) + '…' : it.fileName) +
            '</span>';
        }

        // 操作按钮
        var sendBtn = '';
        if (it.hasFile && fullUrl) {
          sendBtn =
            '<button type="button" class="kb-action-btn kb-send-to-chat" ' +
            'data-id="' + escapeHtml(String(it.id)) + '" data-action="file">发送到对话</button>';
        } else if (it.content) {
          sendBtn =
            '<button type="button" class="kb-action-btn kb-send-to-chat" ' +
            'data-id="' + escapeHtml(String(it.id)) + '" data-action="text">引用到对话</button>';
        }

        // 查看文件信息按钮（Word、PDF、图片和纯文字）
        var viewBtn = '';
        if (it.hasFile && (fileType === 'word' || fileType === 'pdf' || fileType === 'image')) {
          viewBtn =
            '<button type="button" class="kb-action-btn view kb-view-detail" ' +
            'data-id="' + escapeHtml(String(it.id)) + '">查看信息</button>';
        } else if (!it.hasFile && it.content && fileType === 'text') {
          // 纯文字类型且有内容时也显示查看按钮
          viewBtn =
            '<button type="button" class="kb-action-btn view kb-view-detail" ' +
            'data-id="' + escapeHtml(String(it.id)) + '">查看信息</button>';
        }

        return (
          '<div class="kb-item-card" data-id="' + escapeHtml(String(it.id)) + '">' +
          typeBar +
          '<div class="kb-item-body">' +
          // 标题行：类型徽章 + 标题
          '<div style="display:flex;align-items:flex-start;gap:7px;margin-bottom:5px">' +
          typeBadge +
          '<div class="kb-item-title" style="margin-bottom:0">' + escapeHtml(it.title) + '</div>' +
          '</div>' +
          tagsHtml +
          (summary ? '<div class="kb-item-summary">' + summary + '</div>' : '') +
          '<div class="kb-item-meta">' +
          (dateStr
            ? '<span class="kb-item-meta-text">' +
              '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
              '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>' +
              '<line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>' +
              '<line x1="3" y1="10" x2="21" y2="10"/></svg>' +
              dateStr + '</span>'
            : '') +
          fileMeta +
          '<div class="kb-item-actions">' +
          viewBtn +
          sendBtn +
          '<button type="button" class="kb-action-btn del kb-del" ' +
          'data-id="' + escapeHtml(String(it.id)) + '">删除</button>' +
          '</div>' +
          '</div>' +
          '</div>' +   // kb-item-body
          '</div>'     // kb-item-card
        );
      }).join('');

      // 绑定事件
      listEl.querySelectorAll('.kb-del').forEach(function (btn) {
        btn.addEventListener('click', function () {
          showDeleteConfirm(btn.getAttribute('data-id'));
        });
      });

      listEl.querySelectorAll('.kb-send-to-chat').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id     = btn.getAttribute('data-id');
          var action = btn.getAttribute('data-action');
          var it     = allItems.filter(function (x) { return String(x.id) === String(id); })[0];
          if (!it) { toast('数据异常，请刷新页面', 'error'); return; }

          if (action === 'file') {
            var url = it.fileUrl ? KB_SERVER_URL + it.fileUrl : '';
            sessionStorage.setItem('kb_pending', JSON.stringify({
              type: 'file', fileName: it.fileName, fileUrl: url, title: it.title
            }));
          } else {
            sessionStorage.setItem('kb_pending', JSON.stringify({
              type: 'text', content: it.content || '', title: it.title
            }));
          }
          toast('即将跳转到对话页面…', 'success');
          setTimeout(function () { window.location.href = 'chat.html'; }, 600);
        });
      });

      // 绑定查看文件信息事件
      listEl.querySelectorAll('.kb-view-detail').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.getAttribute('data-id');
          var it = allItems.filter(function (x) { return String(x.id) === String(id); })[0];
          if (!it) { toast('数据异常，请刷新页面', 'error'); return; }
          showFileDetail(it);
        });
      });
    }

    // ══ 删除确认对话框 ══

    function showDeleteConfirm(id) {
      var overlay = document.createElement('div');
      overlay.className = 'kb-confirm-overlay';
      overlay.innerHTML =
        '<div class="kb-confirm-box">' +
        '<h3>确认删除</h3>' +
        '<p>该条资料将被永久删除，无法恢复。</p>' +
        '<div class="kb-confirm-actions">' +
        '<button class="kb-confirm-cancel">取消</button>' +
        '<button class="kb-confirm-ok">确认删除</button>' +
        '</div></div>';
      document.body.appendChild(overlay);

      overlay.querySelector('.kb-confirm-cancel').addEventListener('click', function () { overlay.remove(); });
      overlay.querySelector('.kb-confirm-ok').addEventListener('click', function () { overlay.remove(); doDelete(id); });
      overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    }

    // ══ 查看文件信息弹窗 ══

    function showFileDetail(item) {
      var fileType = getFileType(item);
      var tc = FILE_TYPES[fileType] || FILE_TYPES.other;
      var fullUrl = item.fileUrl ? KB_SERVER_URL + item.fileUrl : '';

      // 解析内容（优先使用parsedContent，其次content）
      var displayContent = item.parsedContent || item.content || '（无内容）';

      // 判断是否为图片类型
      var isImage = fileType === 'image';
      // 判断是否为纯文字类型
      var isText = fileType === 'text';

      var overlay = document.createElement('div');
      overlay.className = 'kb-detail-overlay';
      
      var modalContent = '<div class="kb-detail-modal">' +
        '<div class="kb-detail-header">' +
        '<h3>' + escapeHtml(item.title) + '</h3>' +
        '<button class="kb-detail-close" title="关闭">&times;</button>' +
        '</div>' +
        '<div class="kb-detail-body">';

      // 如果是图片，显示图片预览
      if (isImage && fullUrl) {
        modalContent +=
          '<div class="kb-detail-section">' +
          '<div class="kb-detail-label">图片预览</div>' +
          '<div style="text-align:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;overflow:hidden">' +
          '<img src="' + escapeHtml(fullUrl) + '" alt="' + escapeHtml(item.fileName || '') + 
          '" style="max-width:100%;max-height:500px;border-radius:4px;cursor:zoom-in" ' +
          'onclick="window.open(this.src,\'_blank\')" title="点击在新窗口查看大图" />' +
          '</div>' +
          '</div>';
      }

      // 文件基本信息
      modalContent +=
        '<div class="kb-detail-section">' +
        '<div class="kb-detail-label">' + (isText ? '资料信息' : '文件信息') + '</div>' +
        '<div class="kb-detail-meta-row">' +
        '<div class="kb-detail-meta-item">' +
        '<div class="kb-detail-label" style="font-size:11px;margin-bottom:3px">' + (isText ? '资料标题' : '文件名称') + '</div>' +
        '<div class="kb-detail-value">' + escapeHtml(item.title || '无') + '</div>' +
        '</div>' +
        '<div class="kb-detail-meta-item">' +
        '<div class="kb-detail-label" style="font-size:11px;margin-bottom:3px">资料类型</div>' +
        '<div class="kb-detail-value">' +
        '<span class="kb-type-badge" style="color:' + tc.color +
        ';background:' + tc.bg +
        ';border-color:' + tc.color + '30">' +
        tc.label + '</span>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '</div>';

      // 如果不是纯文字，显示文件名称（如果有）
      if (!isText && item.fileName) {
        modalContent +=
          '<div class="kb-detail-section">' +
          '<div class="kb-detail-label">原始文件名</div>' +
          '<div class="kb-detail-value">' + escapeHtml(item.fileName) + '</div>' +
          '</div>';
      }

      // 创建时间
      modalContent +=
        '<div class="kb-detail-section">' +
        '<div class="kb-detail-label">' + (isText ? '创建时间' : '上传时间') + '</div>' +
        '<div class="kb-detail-value">' + formatDate(item.createdAt) + '</div>' +
        '</div>';

      // 标签信息（如果有）
      if (item.tags) {
        var tagArr = Array.isArray(item.tags) ? item.tags : String(item.tags).split(',');
        tagArr = tagArr.filter(Boolean);
        if (tagArr.length) {
          modalContent +=
            '<div class="kb-detail-section">' +
            '<div class="kb-detail-label">标签</div>' +
            '<div class="kb-detail-value">' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
            tagArr.map(function (t) {
              return '<span class="kb-tag-badge">' + escapeHtml(t.trim()) + '</span>';
            }).join('') +
            '</div>' +
            '</div>' +
            '</div>';
        }
      }

      // 文件内容（非图片类型显示，或图片有OCR文本时显示）
      if (!isImage || (isImage && displayContent && displayContent !== '（无内容）')) {
        modalContent +=
          '<div class="kb-detail-section">' +
          '<div class="kb-detail-label">' + (isImage ? '识别文字' : (isText ? '资料内容' : '文件内容')) + '</div>' +
          '<div class="kb-detail-value">' +
          '<pre>' + escapeHtml(displayContent) + '</pre>' +
          '</div>' +
          '</div>';
      }

      modalContent +=
        '</div>' +
        // 底部按钮
        '<div class="kb-detail-footer">' +
        (fullUrl ? '<button class="kb-detail-btn kb-detail-btn-secondary kb-download-file" data-url="' + escapeHtml(fullUrl) + '">下载文件</button>' : '') +
        (!isImage ? '<button class="kb-detail-btn kb-detail-btn-secondary kb-copy-content">复制内容</button>' : '') +
        '<button class="kb-detail-btn kb-detail-btn-primary kb-send-chat">发送到对话</button>' +
        '</div>' +
        '</div>';

      overlay.innerHTML = modalContent;
      document.body.appendChild(overlay);

      // 关闭按钮
      overlay.querySelector('.kb-detail-close').addEventListener('click', function () { overlay.remove(); });
      overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });

      // 下载文件
      var downloadBtn = overlay.querySelector('.kb-download-file');
      if (downloadBtn) {
        downloadBtn.addEventListener('click', function () {
          var url = downloadBtn.getAttribute('data-url');
          var a = document.createElement('a');
          a.href = url;
          a.download = item.fileName || 'download';
          a.target = '_blank';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          toast('开始下载文件', 'success');
        });
      }

      // 复制内容
      overlay.querySelector('.kb-copy-content').addEventListener('click', function () {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(displayContent).then(function () {
            toast('内容已复制到剪贴板', 'success');
          }).catch(function () {
            fallbackCopy(displayContent);
          });
        } else {
          fallbackCopy(displayContent);
        }
      });

      // 发送到对话
      overlay.querySelector('.kb-send-chat').addEventListener('click', function () {
        if (item.hasFile && fullUrl) {
          sessionStorage.setItem('kb_pending', JSON.stringify({
            type: 'file', fileName: item.fileName, fileUrl: fullUrl, title: item.title
          }));
        } else {
          sessionStorage.setItem('kb_pending', JSON.stringify({
            type: 'text', content: displayContent, title: item.title
          }));
        }
        overlay.remove();
        toast('即将跳转到对话页面…', 'success');
        setTimeout(function () { window.location.href = 'chat.html'; }, 600);
      });
    }

    function fallbackCopy(text) {
      var textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        toast('内容已复制到剪贴板', 'success');
      } catch (err) {
        toast('复制失败，请手动复制', 'error');
      }
      document.body.removeChild(textarea);
    }

    function doDelete(id) {
      fetch(KB_SERVER_URL + '/api/knowledge/' + encodeURIComponent(id), {
        method: 'DELETE', headers: kbAuthHeader()
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res.ok) { loadItems(); toast('资料已删除', 'success'); }
          else toast(res.message || '删除失败', 'error');
        })
        .catch(function () { toast('网络错误，请确保后端服务已启动', 'error'); });
    }

    // ══ 加载数据 ══

    function loadItems() {
      fetch(KB_SERVER_URL + '/api/knowledge', { headers: kbAuthHeader() })
        .then(function (r) { return r.json(); })
        .then(function (res) { render(res.ok ? res.data : []); })
        .catch(function () { render([]); });
    }

    loadItems();

    // ══ 表单提交 ══

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var title   = titleEl.value.trim();
      var content = contentEl ? contentEl.value.trim() : '';

      if (!title) { toast('请填写标题', 'error'); return; }
      if (!content && !selectedFile) { toast('请填写内容或上传文件', 'error'); return; }

      var fd = new FormData();
      fd.append('title',   title);
      fd.append('content', content || '');
      if (currentTags.length) fd.append('tags', currentTags.join(','));
      if (selectedFile && selectedFile.rawFile) {
        fd.append('file', selectedFile.rawFile, selectedFile.name);
        if (fileStatusEl) fileStatusEl.innerHTML = '<span class="kb-spin"></span>';
      }

      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '保存中…'; }

      fetch(KB_SERVER_URL + '/api/knowledge', {
        method: 'POST', headers: kbAuthHeader(), body: fd
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res.ok) {
            var savedTitle = title;
            var savedFileName = selectedFile && selectedFile.name ? selectedFile.name : '';
            titleEl.value = '';
            if (contentEl) contentEl.value = '';
            currentTags = [];
            renderTagChips();
            clearFileSelection();
            // 保存后切换到全部分类以展示新条目
            activeCategory = 'all';
            loadItems();
            toast('资料已保存', 'success');
            if (window.FayiActivity) {
              FayiActivity.addActivityLog({
                type: 'upload',
                title: savedFileName ? '上传了' + savedFileName : '保存资料「' + FayiActivity.truncate(savedTitle, 24) + '」',
                description: '已添加到个人资料库',
                link: 'knowledge.html',
                module: '资料库'
              });
            }
          } else {
            toast(res.message || '保存失败', 'error');
          }
        })
        .catch(function () { toast('网络错误，请确保后端服务已启动', 'error'); })
        .finally(function () {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '保存资料'; }
          if (fileStatusEl) fileStatusEl.innerHTML = '';
        });
    });

  });
})();

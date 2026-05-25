/**
 * chat.js — 法律咨询对话模块（DeepSeek API + ChatGPT 风格 + 文件上传解析）
 */
(function () {
  // 多模态 AI 代理服务地址（Node.js，端口 3002）
  var AI_SERVER_URL = 'http://localhost:3002';
  // 文件上传 & AI 调用统一走代理服务器，无需在浏览器暴露 API Key
  var FILE_SERVER_URL = AI_SERVER_URL;
  
  var AI_AVATAR = './1775920295347.png';
  
  // 状态管理
  var state = {
    conversations: [],
    currentConversationId: null,
    isLoading: false,
    isTyping: false,
    currentMessages: [],
    typingSpeed: 25,
    abortTyping: false,
    uploadedFiles: [],  // 当前已上传的文件列表
    isUserScrolling: false,  // 用户是否主动上滑（停止自动跟随滚动）
    isGenerating: false,     // 是否正在生成（API 请求中或流式输出中）
    abortController: null    // 当前请求的 AbortController
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function logChatActivity(entry) {
    if (window.FayiActivity && FayiActivity.addActivityLog) {
      FayiActivity.addActivityLog(entry);
    }
  }

  function consultTitleFromText(text) {
    text = String(text || '');
    if (/劳动|工伤|加班|工资/.test(text)) return '您完成了一次劳动纠纷咨询';
    if (/借贷|借款|欠款/.test(text)) return '您完成了一次民间借贷咨询';
    if (/租赁|租房|押金/.test(text)) return '您完成了一次租赁纠纷咨询';
    return '您完成了一次法律咨询';
  }

  function logFileUploadActivity(fileInfo) {
    if (!fileInfo || fileInfo._activityLogged) return;
    fileInfo._activityLogged = true;
    var ext = (fileInfo.name || '').split('.').pop().toLowerCase();
    var isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].indexOf(ext) >= 0;
    logChatActivity({
      type: 'upload',
      title: isImage ? '新增一份图片证据' : '上传了' + fileInfo.name,
      description: isImage ? fileInfo.name : '证据材料已上传至咨询会话',
      link: 'chat.html',
      module: '法律咨询'
    });
  }

  function logCaseAnalysisActivity(desc) {
    logChatActivity({
      type: 'case',
      title: '系统已生成新的案件分析建议',
      description: desc || '基于上传材料完成智能分析',
      link: 'chat.html',
      module: '案件分析'
    });
  }

  // 统一时间显示格式：YYYY/M/D HH:mm（绝对时间，禁止使用相对时间）
  function formatTime(isoStr) {
    if (!isoStr) return '';
    try {
      var d = new Date(isoStr);
      if (isNaN(d.getTime())) return '';
      var yyyy = d.getFullYear();
      var mo   = d.getMonth() + 1;          // 不补零，如 4
      var dd   = d.getDate();               // 不补零，如 3
      var hh   = String(d.getHours()).padStart(2, '0');
      var mm   = String(d.getMinutes()).padStart(2, '0');
      return yyyy + '/' + mo + '/' + dd + ' ' + hh + ':' + mm;
    } catch (e) { return ''; }
  }

  function generateId() {
    return 'conv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  function loadConversationsFromStorage() {
    try {
      var user = FayiAuth.getCurrentUser();
      if (!user) return;
      var key = 'fayi_conversations_' + user.email;
      var data = localStorage.getItem(key);
      if (data) {
        state.conversations = JSON.parse(data);
      }
    } catch (e) {
      console.error('加载会话失败:', e);
      state.conversations = [];
    }
  }

  function saveConversationsToStorage() {
    try {
      var user = FayiAuth.getCurrentUser();
      if (!user) return;
      var key = 'fayi_conversations_' + user.email;
      localStorage.setItem(key, JSON.stringify(state.conversations));
    } catch (e) {
      console.error('保存会话失败:', e);
    }
  }

  function createNewConversation() {
    var newConv = {
      id: generateId(),
      title: '新对话',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    state.conversations.unshift(newConv);
    saveConversationsToStorage();
    return newConv;
  }

  function getCurrentConversation() {
    if (!state.currentConversationId) return null;
    return state.conversations.find(function(c) { return c.id === state.currentConversationId; });
  }

  function updateConversationTitle(convId) {
    var conv = state.conversations.find(function(c) { return c.id === convId; });
    if (!conv) return;
    
    var firstUserMsg = conv.messages.find(function(m) { return m.role === 'user'; });
    if (firstUserMsg) {
      var title = firstUserMsg.content;
      // 纯文件消息（无文字）时用文件名作标题
      if (!title && firstUserMsg.files && firstUserMsg.files.length > 0) {
        title = '[文件] ' + firstUserMsg.files[0].name;
      }
      title = title || '新对话';
      conv.title = title.length > 20 ? title.substring(0, 20) + '…' : title;
      conv.updatedAt = new Date().toISOString();
      saveConversationsToStorage();
    }
  }

  // ==================== 文件上传功能 ====================

  /**
   * 获取文件类型图标
   */
  function getFileIconClass(filename) {
    var ext = filename.split('.').pop().toLowerCase();
    var iconMap = {
      'pdf': 'file-icon-pdf',
      'doc': 'file-icon-word', 'docx': 'file-icon-word',
      'xls': 'file-icon-excel', 'xlsx': 'file-icon-excel', 'csv': 'file-icon-excel',
      'ppt': 'file-icon-ppt', 'pptx': 'file-icon-ppt',
      'jpg': 'file-icon-image', 'jpeg': 'file-icon-image', 'png': 'file-icon-image',
      'txt': 'file-icon-text'
    };
    return iconMap[ext] || 'file-icon-text';
  }

  /**
   * 获取文件类型名称
   */
  function getFileTypeName(filename) {
    var ext = filename.split('.').pop().toLowerCase();
    var typeMap = {
      'pdf': 'PDF', 'doc': 'Word', 'docx': 'Word',
      'xls': 'Excel', 'xlsx': 'Excel', 'csv': 'CSV',
      'ppt': 'PPT', 'pptx': 'PPT',
      'jpg': '图片', 'jpeg': '图片', 'png': '图片',
      'txt': '文本'
    };
    return typeMap[ext] || '文件';
  }

  /**
   * 获取文件图标 SVG
   */
  function getFileIconSvg(filename) {
    var ext = filename.split('.').pop().toLowerCase();
    
    // PDF 图标
    if (ext === 'pdf') {
      return '<svg class="file-tag-icon file-icon-pdf" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M9 13h6"></path><path d="M9 17h6"></path><path d="M9 9h1"></path></svg>';
    }
    // Word 图标
    if (['doc', 'docx'].includes(ext)) {
      return '<svg class="file-tag-icon file-icon-word" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M9 13l2 2 4-4"></path></svg>';
    }
    // Excel 图标
    if (['xls', 'xlsx', 'csv'].includes(ext)) {
      return '<svg class="file-tag-icon file-icon-excel" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M8 13h2"></path><path d="M8 17h2"></path><path d="M14 13h2"></path><path d="M14 17h2"></path></svg>';
    }
    // 图片图标
    if (['jpg', 'jpeg', 'png'].includes(ext)) {
      return '<svg class="file-tag-icon file-icon-image" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
    }
    // 默认文件图标
    return '<svg class="file-tag-icon file-icon-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>';
  }

  /**
   * 渲染消息气泡中的文件附件（图片预览 + 文档卡片）
   */
  function renderUserMessageFiles(files) {
    if (!files || files.length === 0) return '';

    return '<div class="msg-files-container">' +
      files.map(function(f) {
        var ext = (f.name || '').split('.').pop().toLowerCase();
        var isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
        // 优先用本地预览 URL（blob://...），fallback 服务器 URL
        var displayUrl = f.previewUrl || f.url || null;

        if (isImage && displayUrl) {
          return '<a href="' + escapeHtml(displayUrl) + '" target="_blank" class="msg-file-image">' +
            '<img src="' + escapeHtml(displayUrl) + '" alt="' + escapeHtml(f.name) + '" ' +
            'onerror="this.parentElement.style.display=\'none\'">' +
          '</a>';
        } else {
          var linkStart = f.url
            ? '<a href="' + escapeHtml(f.url) + '" target="_blank" class="msg-file-card">'
            : '<div class="msg-file-card">';
          var linkEnd = f.url ? '</a>' : '</div>';
          return linkStart +
            getFileIconSvg(f.name) +
            '<span class="msg-file-card-name">' + escapeHtml(f.name) + '</span>' +
          linkEnd;
        }
      }).join('') +
    '</div>';
  }

  /**
   * 渲染已上传文件列表
   */
  function renderUploadedFiles() {
    var container = document.getElementById('uploaded-files-container');
    var list = document.getElementById('uploaded-files-list');
    
    if (!container || !list) return;
    
    if (state.uploadedFiles.length === 0) {
      container.classList.add('hidden');
      return;
    }
    
    container.classList.remove('hidden');
    
    list.innerHTML = state.uploadedFiles.map(function(file, index) {
      var statusClass = '';
      var statusIcon = '';
      var ext = (file.name || '').split('.').pop().toLowerCase();
      var isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
      
      if (file.status === 'uploading') {
        statusClass = 'uploading';
        statusIcon = '<div class="file-progress"><div class="file-progress-bar" style="width: ' + (file.progress || 0) + '%"></div></div>';
      } else if (file.status === 'parsing') {
        statusClass = 'parsing';
        statusIcon = '<div class="parsing-spinner"></div>';
      } else if (file.status === 'error') {
        statusClass = 'error';
        statusIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
      } else {
        statusIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
      }

      // 图片显示缩略图预览标签
      if (isImage && (file.previewUrl || file.url)) {
        var imgSrc = file.previewUrl || file.url;
        return '<div class="file-tag file-tag-image ' + statusClass + '" data-file-id="' + file.id + '">' +
          '<img src="' + escapeHtml(imgSrc) + '" class="file-tag-thumb" alt="' + escapeHtml(file.name) + '">' +
          '<span class="file-tag-name" title="' + escapeHtml(file.name) + '">' + escapeHtml(file.name) + '</span>' +
          statusIcon +
          '<span class="file-tag-remove" data-index="' + index + '" title="移除">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' +
          '</span>' +
        '</div>';
      }
      
      return '<div class="file-tag ' + statusClass + '" data-file-id="' + file.id + '">' +
        getFileIconSvg(file.name) +
        '<span class="file-tag-name" title="' + escapeHtml(file.name) + '">' + escapeHtml(file.name) + '</span>' +
        statusIcon +
        '<span class="file-tag-remove" data-index="' + index + '" title="移除文件">' +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' +
        '</span>' +
      '</div>';
    }).join('');
    
    // 绑定删除事件
    list.querySelectorAll('.file-tag-remove').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var index = parseInt(this.getAttribute('data-index'));
        removeUploadedFile(index);
      });
    });

  }

  /**
   * 移除已上传文件
   */
  function removeUploadedFile(index) {
    state.uploadedFiles.splice(index, 1);
    renderUploadedFiles();
  }

  /**
   * 图片上传完成后自动调用 /api/process-case 进行分析
   */
  function autoAnalyzeImage(fileInfo) {
    if (!fileInfo || !fileInfo.base64Data) { console.warn('[autoAnalyze] fileInfo.base64Data 为空，跳过'); return; }
    var parts = fileInfo.base64Data.split(',');
    var mime  = (parts[0].match(/:(.*?);/) || ['', 'image/jpeg'])[1];
    var bStr  = atob(parts[1]);
    var u8arr = new Uint8Array(bStr.length);
    for (var i = 0; i < bStr.length; i++) u8arr[i] = bStr.charCodeAt(i);
    var blob = new Blob([u8arr], { type: mime });

    var formData = new FormData();
    formData.append('file', blob, fileInfo.name);

    // 分析开始：从已上传列表移除此图片，防止 sendMessage 重复发送
    state.uploadedFiles = state.uploadedFiles.filter(function(f) { return f.id !== fileInfo.id; });
    renderUploadedFiles();

    var conv = getCurrentConversation();
    if (!conv) {
      conv = createNewConversation();
      state.currentConversationId = conv.id;
    }
    var userMsg = {
      role: 'user',
      content: '已上传图片：' + fileInfo.name,
      files: [{ name: fileInfo.name, previewUrl: fileInfo.previewUrl || null, url: fileInfo.url || null }],
      createdAt: new Date().toISOString()
    };
    state.currentMessages.push(userMsg);
    conv.messages.push(userMsg);
    conv.updatedAt = new Date().toISOString();
    saveConversationsToStorage();
    // 使用暗放的全局渲染函数
    if (window._fayiRenderMessages) window._fayiRenderMessages();

    var _el = document.getElementById('chat-messages');
    var progressEl = createProgressMessage();
    if (_el) { _el.appendChild(progressEl); _el.scrollTop = _el.scrollHeight; }

    var processCaseFn = (window.FayiAI && FayiAI.processCase)
      ? FayiAI.processCase(formData)
      : fetch('http://localhost:3002/api/process-case', { method: 'POST', headers: (window.FayiAuth && FayiAuth.getToken ? { Authorization: 'Bearer ' + FayiAuth.getToken() } : {}), body: formData }).then(function(r) { return r.json(); });
    processCaseFn
    .then(function(r) { return r.json(); })
    .then(function(resp) {
      progressEl.remove();
      if (!resp || !resp.success) {
        // OCR 服务未开通：显示引导提示而非错误样式
        var isOcrErr = resp && resp.ocrError;
        var msgContent = isOcrErr
          ? '⚠️ OCR识别服务暂时不可用\n\n建议：将图片中的案情文字**全选复制**到输入框中直接发送，即可获得完整的法律分析。'
          : '分析失败：' + (resp && resp.error || '未知错误');
        var errMsg = { role: 'assistant', content: msgContent, createdAt: new Date().toISOString() };
        state.currentMessages.push(errMsg);
        conv.messages.push(errMsg);
      } else {
        // 卡片消息用非空 content，避免历史过滤时被误删
        var preview = (resp.content || resp.raw || '').substring(0, 60);
        var cardMsg = { role: 'assistant', content: preview || '案件分析完成', caseData: resp, isCard: true, createdAt: new Date().toISOString() };
        state.currentMessages.push(cardMsg);
        conv.messages.push(cardMsg);
        if (window.FayiRealtime && FayiRealtime.notify) FayiRealtime.notify({ type: 'ai_case' });
        logCaseAnalysisActivity('图片证据：' + fileInfo.name);
      }
      conv.updatedAt = new Date().toISOString();
      saveConversationsToStorage();
      if (window._fayiRenderMessages) window._fayiRenderMessages();
      var _el2 = document.getElementById('chat-messages');
      if (_el2) _el2.scrollTop = _el2.scrollHeight;
    })
    .catch(function(err) {
      progressEl.remove();
      var errMsg = { role: 'assistant', content: '分析请求失败：' + err.message, isError: true, createdAt: new Date().toISOString() };
      state.currentMessages.push(errMsg);
      conv.messages.push(errMsg);
      conv.updatedAt = new Date().toISOString();
      saveConversationsToStorage();
      if (window._fayiRenderMessages) window._fayiRenderMessages();
    });
  }

  /**
   * 创建步骤进度动画元素
   */
  function createProgressMessage() {
    var div = document.createElement('div');
    div.className = 'flex justify-start mb-4';
    div.innerHTML =
      '<div class="ai-bubble" style="max-width:480px">' +
        '<div class="progress-steps" style="margin:0">' +
          '<div class="progress-step active" id="ps-ocr">' +
            '<span class="progress-step-dot"></span>' +
            '<span class="progress-step-label">🔍 OCR识别中</span>' +
            '<span class="thinking-animation" id="think-ocr"><span class="think-dot"></span><span class="think-dot"></span><span class="think-dot"></span></span>' +
          '</div>' +
          '<div class="progress-connector" id="conn-1"></div>' +
          '<div class="progress-step" id="ps-ai">' +
            '<span class="progress-step-dot"></span>' +
            '<span class="progress-step-label">⚖️ AI分析中</span>' +
            '<span class="thinking-animation" id="think-ai"></span>' +
          '</div>' +
          '<div class="progress-connector" id="conn-2"></div>' +
          '<div class="progress-step" id="ps-done">' +
            '<span class="progress-step-dot"></span>' +
            '<span class="progress-step-label">✅ 生成报告</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    
    // 模拟进度动画
    setTimeout(function() {
      var ps1 = div.querySelector('#ps-ocr');
      var ps2 = div.querySelector('#ps-ai');
      var conn1 = div.querySelector('#conn-1');
      var thinkOcr = div.querySelector('#think-ocr');
      if (ps1) { 
        ps1.classList.remove('active'); 
        ps1.classList.add('done'); 
        if (thinkOcr) thinkOcr.style.display = 'none';
      }
      if (conn1) conn1.classList.add('done');
      if (ps2) ps2.classList.add('active');
      // 为AI分析步骤添加思考动画
      var thinkAi = div.querySelector('#think-ai');
      if (thinkAi) {
        thinkAi.innerHTML = '<span class="think-dot"></span><span class="think-dot"></span><span class="think-dot"></span>';
      }
    }, 1500);
    
    setTimeout(function() {
      var ps2 = div.querySelector('#ps-ai');
      var ps3 = div.querySelector('#ps-done');
      var conn2 = div.querySelector('#conn-2');
      var thinkAi = div.querySelector('#think-ai');
      if (ps2) { 
        ps2.classList.remove('active'); 
        ps2.classList.add('done'); 
        if (thinkAi) thinkAi.style.display = 'none';
      }
      if (conn2) conn2.classList.add('done');
      if (ps3) ps3.classList.add('active');
    }, 3500);
    
    return div;
  }

  /**
   * 案件分析结果卡片（纯展示，不解析业务结构）
   */
  function renderCaseCard(data) {
    var text = (data && (data.content || data.raw)) ? (data.content || data.raw) : '';
    var bodyHtml = smartFormatContent(text);
    return '<div class="case-card">' +
      '<div class="case-card-header"><span>📄 案件分析</span></div>' +
      '<div class="case-card-body"><div class="case-section ai-formatted-text">' + bodyHtml + '</div></div>' +
      '</div>';
  }
  /**
   * 上传单个文件（XMLHttpRequest 实现真实进度 + 图片转 Base64）
   */
  async function uploadFile(file) {
    var fileId = 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    var ext = file.name.split('.').pop().toLowerCase();
    var isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);

    var fileInfo = {
      id: fileId,
      name: file.name,
      size: file.size,
      type: file.type,
      status: 'uploading',
      progress: 0,
      content: null,
      previewUrl: null,    // 本地预览地址（图片）
      base64Data: null     // Base64 编码（用于 GPT-4o 多模态）
    };

    // 图片：生成预览 + 转 Base64
    if (isImage) {
      fileInfo.previewUrl = URL.createObjectURL(file);
      try {
        fileInfo.base64Data = await fileToBase64(file);
        console.log('[upload] 图片已转 Base64');
      } catch (e) {
        console.error('[upload] 图片转 Base64 失败:', e);
      }
    }

    state.uploadedFiles.push(fileInfo);
    renderUploadedFiles();

    return new Promise(function(resolve) {
      var formData = new FormData();
      formData.append('file', file);

      var xhr = new XMLHttpRequest();

      // 真实上传进度
      xhr.upload.onprogress = function(e) {
        if (e.lengthComputable) {
          fileInfo.progress = Math.round(e.loaded / e.total * 95);
          renderUploadedFiles();
        }
      };

      xhr.onload = function() {
        fileInfo.progress = 100;
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            var result = JSON.parse(xhr.responseText);
            console.log('[upload] 接口返回:', result);
            if (result.ok) {
              fileInfo.status = 'completed';
              fileInfo.url = FILE_SERVER_URL + result.data.url;
              fileInfo.content = result.data.content || '';
              fileInfo.serverFileId = result.data.fileId;
              renderUploadedFiles();
              if (window.FayiToast) FayiToast('文件上传成功: ' + fileInfo.name, 'success');
              logFileUploadActivity(fileInfo);
              // 图片保留在输入区，等用户点击发送后再统一处理
            } else {
              throw new Error(result.message || '上传失败');
            }
          } catch (e) {
            fileInfo.status = 'error';
            fileInfo.error = e.message;
            renderUploadedFiles();
            if (window.FayiToast) FayiToast('上传失败: ' + e.message, 'error');
          }
        } else {
          fileInfo.status = 'error';
          fileInfo.error = '服务器错误 ' + xhr.status;
          renderUploadedFiles();
          if (window.FayiToast) FayiToast('上传失败: ' + xhr.status, 'error');
        }
        resolve();
      };

      xhr.onerror = function() {
        fileInfo.status = 'error';
        fileInfo.error = '网络错误';
        renderUploadedFiles();
        if (window.FayiToast) FayiToast('上传失败：网络错误', 'error');
        resolve();
      };

      xhr.open('POST', FILE_SERVER_URL + '/api/upload');
      var authToken = localStorage.getItem('fayi_token') || localStorage.getItem('token');
      if (authToken) xhr.setRequestHeader('Authorization', 'Bearer ' + authToken);
      xhr.send(formData);
    });
  }

  /**
   * 轮询文件解析状态
   */
  async function pollFileParsing(localFileId, serverFileId) {
    var maxAttempts = 20;  // 最多轮询20次（40秒）
    var attempt = 0;
    var failCount = 0;     // 连续失败次数
    
    var fileInfo = state.uploadedFiles.find(function(f) { return f.id === localFileId; });
    if (!fileInfo) return;
    
    // 请求头（带 token）
    var pollHeaders = {};
    var authToken = localStorage.getItem('fayi_token') || localStorage.getItem('token');
    if (authToken) {
      pollHeaders['Authorization'] = 'Bearer ' + authToken;
    }
    
    while (attempt < maxAttempts) {
      try {
        var response = await fetch(FILE_SERVER_URL + '/api/upload/' + serverFileId + '/status', {
          headers: pollHeaders
        });
        
        if (!response.ok) {
          failCount++;
          console.warn('[poll] 请求失败 HTTP ' + response.status + '，失败次数: ' + failCount);
          // 连续失超3次则降级处理：直接标为 completed（文件已上传，只是状态追踪失败）
          if (failCount >= 3) {
            fileInfo.status = 'completed';
            fileInfo.content = fileInfo.content || '';
            fileInfo.serverFileId = serverFileId;
            renderUploadedFiles();
            if (window.FayiToast) FayiToast('文件已上传：' + fileInfo.name, 'success');
            logFileUploadActivity(fileInfo);
            return;
          }
        } else {
          failCount = 0; // 请求成功则重置失败计数
          var result = await response.json();
          console.log('[poll] 状态查询返回:', result.data && result.data.status);
          
          if (result.ok) {
            if (result.data.status === 'completed') {
              fileInfo.status = 'completed';
              fileInfo.content = result.data.content || '';
              fileInfo.serverFileId = serverFileId;
              renderUploadedFiles();
              if (window.FayiToast) FayiToast('文件解析完成: ' + fileInfo.name, 'success');
              logFileUploadActivity(fileInfo);
              return;
            } else if (result.data.status === 'error') {
              throw new Error(result.data.error || '解析失败');
            }
            // parsing 状态，继续轮询
          }
        }
        
      } catch (error) {
        failCount++;
        console.error('轮询解析状态失败:', error.message);
        if (failCount >= 3) {
          // 多次失败后降级：文件已上传成功，只是解析状态追踪异常
          fileInfo.status = 'completed';
          fileInfo.content = fileInfo.content || '';
          fileInfo.serverFileId = serverFileId;
          renderUploadedFiles();
          if (window.FayiToast) FayiToast('文件已上传：' + fileInfo.name, 'success');
          logFileUploadActivity(fileInfo);
          return;
        }
      }
      
      attempt++;
      await new Promise(function(resolve) { setTimeout(resolve, 2000); });  // 2秒间隔
    }
    
    // 超时处理：超时40秒后降级标记完成而不是错误
    fileInfo.status = 'completed';
    fileInfo.content = fileInfo.content || '';
    fileInfo.serverFileId = serverFileId;
    renderUploadedFiles();
    if (window.FayiToast) FayiToast('文件已上传：' + fileInfo.name, 'success');
    logFileUploadActivity(fileInfo);
  }

  /**
   * 处理文件选择
   */
  function handleFileSelect(files) {
    if (!files || files.length === 0) return;
    
    Array.from(files).forEach(function(file) {
      // 检查文件类型
      var allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
        'image/jpeg',
        'image/png'
      ];
      
      var allowedExts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.ppt', '.pptx', '.txt', '.jpg', '.jpeg', '.png'];
      var ext = '.' + file.name.split('.').pop().toLowerCase();
      
      if (!allowedTypes.includes(file.type) && !allowedExts.includes(ext)) {
        if (window.FayiToast) FayiToast('不支持的文件类型: ' + file.name, 'error');
        return;
      }
      
      // 检查文件大小（最大 20MB）
      if (file.size > 20 * 1024 * 1024) {
        if (window.FayiToast) FayiToast('文件过大: ' + file.name + ' (最大20MB)', 'error');
        return;
      }
      
      uploadFile(file);
    });
  }

  // ==================== AI响应体验优化 ====================

  function createThinkingMessage() {
    var div = document.createElement('div');
    div.id = 'ai-thinking';
    div.className = 'bg-white dark:bg-gray-900 thinking-message';
    div.innerHTML = 
      '<div class="max-w-3xl mx-auto px-4 py-5 flex gap-4">' +
        '<img src="' + AI_AVATAR + '" alt="" class="w-8 h-8 rounded-full object-cover ring-2 ring-gray-200 dark:ring-gray-600 shrink-0 bg-white">' +
        '<div class="flex-1">' +
          '<div class="thinking-content text-sm text-gray-600 dark:text-gray-400">' +
            '<span class="thinking-text">正在思考中</span>' +
            '<span class="thinking-dots">' +
              '<span class="dot">.</span>' +
              '<span class="dot">.</span>' +
              '<span class="dot">.</span>' +
            '</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    return div;
  }

  function smartFormatContent(content) {
    var text = content;
    if (window.FayiAIResponse && FayiAIResponse.normalizeChatOutput) {
      text = FayiAIResponse.normalizeChatOutput(content);
    } else if (window.FayiAI && FayiAI.normalizeChatOutput) {
      text = FayiAI.normalizeChatOutput(content);
    }
    if (window.FayiChatStyle && FayiChatStyle.formatAIResponse) {
      return FayiChatStyle.formatAIResponse(text, escapeHtml);
    }
    if (window.FayiChatStyle && FayiChatStyle.formatChatHtml) {
      return FayiChatStyle.formatChatHtml(text, escapeHtml);
    }
    var lines = String(text || '').split('\n');
    return lines.map(function (line) {
      return '<p class="ai-paragraph">' + escapeHtml(line) + '</p>';
    }).join('');
  }

  function enhancedTypeWriter(element, htmlContent, speed, onComplete) {
    state.isTyping = true;
    state.abortTyping = false;
    
    var tokens = [];
    var current = '';
    var inTag = false;
    
    for (var i = 0; i < htmlContent.length; i++) {
      var char = htmlContent.charAt(i);
      if (char === '<') {
        if (current) {
          tokens.push({ type: 'text', content: current });
          current = '';
        }
        inTag = true;
        current = '<';
      } else if (char === '>' && inTag) {
        current += '>';
        tokens.push({ type: 'tag', content: current });
        current = '';
        inTag = false;
      } else {
        current += char;
      }
    }
    if (current) {
      tokens.push({ type: 'text', content: current });
    }
    
    var tokenIndex = 0;
    var charIndex = 0;
    var output = '';
    var messagesEl = document.getElementById('chat-messages');
    
    function typeNext() {
      if (state.abortTyping) {
        element.innerHTML = htmlContent;
        element.classList.add('fade-in');
        state.isTyping = false;
        if (onComplete) onComplete();
        return;
      }
      
      if (tokenIndex >= tokens.length) {
        state.isTyping = false;
        element.classList.add('fade-in');
        if (onComplete) onComplete();
        return;
      }
      
      var token = tokens[tokenIndex];
      
      if (token.type === 'tag') {
        output += token.content;
        element.innerHTML = output;
        tokenIndex++;
        charIndex = 0;
        typeNext();
      } else {
        if (charIndex < token.content.length) {
          output += token.content.charAt(charIndex);
          element.innerHTML = output;
          charIndex++;
          
          // 仅当用户未主动上滑时，自动跟随到底部
          if (messagesEl && !state.isUserScrolling) {
            messagesEl.scrollTop = messagesEl.scrollHeight;
          }
          
          setTimeout(typeNext, speed);
        } else {
          tokenIndex++;
          charIndex = 0;
          typeNext();
        }
      }
    }
    
    typeNext();
  }

  // ==================== 图片转 Base64 ====================
  
  /**
   * 将图片文件转换为 Base64 Data URL
   */
  async function fileToBase64(file) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function() {
        resolve(reader.result);  // data:image/jpeg;base64,xxx
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ==================== API调用（OpenAI GPT-4o 多模态 + SSE 流式）====================

  async function callOpenAIAPI(messages, uploadedFiles, signal, onDelta) {
    var docFiles = uploadedFiles ? uploadedFiles.filter(function(f) {
      var ext = (f.name || '').split('.').pop().toLowerCase();
      return !['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
    }) : [];

    var imageFiles = uploadedFiles ? uploadedFiles.filter(function(f) {
      var ext = (f.name || '').split('.').pop().toLowerCase();
      return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) && f.base64Data;
    }) : [];

    function shouldCarryHistory(lastQuestion) {
      var q = String(lastQuestion || '').trim();
      if (!q) return false;
      return /(基于上文|基于上一条|结合上文|结合前文|继续上一次|继续分析|继续刚才|补充上条|沿用上述|按前面)/.test(q);
    }

    var latestUser = (messages || []).slice().reverse().find(function (m) {
      return m && m.role === 'user';
    });
    var latestQuestion = latestUser && latestUser.content || '';
    var carryHistory = shouldCarryHistory(latestQuestion);
    var payloadMessages = carryHistory
      ? (messages || [])
      : [{ role: 'user', content: latestQuestion }];

    var requestBody = {
      messages: payloadMessages.map(function(m) {
        return { role: m.role, content: m.content || '' };
      }),
      imageFiles: imageFiles.map(function(f) {
        return { name: f.name, base64Data: f.base64Data || null };
      }),
      docFiles: docFiles.map(function(f) {
        return { name: f.name, content: f.content || '' };
      }),
      strictWorkflow: true,
      carryHistory: carryHistory,
      conversationId: state.currentConversationId,
      sessionId: state.currentConversationId
    };

    var chatFn = (window.FayiAI && FayiAI.chat)
      ? FayiAI.chat(requestBody)
      : fetch(AI_SERVER_URL + '/api/chat', {
          method: 'POST',
          headers: (function() {
            var h = { 'Content-Type': 'application/json' };
            if (window.FayiAuth && FayiAuth.getToken) {
              var t = FayiAuth.getToken();
              if (t) h.Authorization = 'Bearer ' + t;
            }
            return h;
          })(),
          body: JSON.stringify(requestBody),
          signal: signal
        }).then(function(r) {
          if (!r.ok) throw new Error('API 请求失败');
          return r.json();
        });

    var data = await chatFn;
    console.log('后端返回:', data);

    var rawPayload = (data && data.content != null) ? data.content : data;
    var fullContent = (window.FayiAIResponse && FayiAIResponse.normalizeChatOutput)
      ? FayiAIResponse.normalizeChatOutput(rawPayload)
      : ((window.FayiAI && FayiAI.normalizeChatOutput)
        ? FayiAI.normalizeChatOutput(rawPayload)
        : ((data && data.content) ? data.content : '当前智能体未返回内容'));

    // 一次性调用 onDelta 驱动 UI 更新（空内容时也显示降级提示，不抛异常）
    if (onDelta) onDelta(fullContent, fullContent);

    if (window.FayiRealtime && FayiRealtime.notify) {
      FayiRealtime.notify({ type: 'ai_chat' });
    }

    return fullContent;
  }

  // ==================== 主程序 ====================

  document.addEventListener('DOMContentLoaded', function () {
    if (window.FayiContextManager) {
      FayiContextManager.switchModule('legal_consultation');
      FayiContextManager.clearContext('legal_document');
      FayiContextManager.clearContext('regulation_search');
      FayiContextManager.clearContext('evidence_analysis');
      FayiContextManager.clearContext('ocr_material_analysis');
    }

    if (!window.FayiAuth || !FayiAuth.getCurrentUser()) return;

    var sessionListEl = document.getElementById('chat-session-list');
    var messagesEl = document.getElementById('chat-messages');
    var form = document.getElementById('chat-form');
    var input = document.getElementById('chat-input');
    var sendBtn = document.getElementById('send-btn');
    var stopBtn = document.getElementById('stop-btn');
    var newSessionBtn = document.getElementById('chat-new-session');
    var deleteBtn = document.getElementById('chat-delete-session');
    var titleEl = document.getElementById('chat-session-title');
    
    // 文件上传相关元素
    var fileMenuBtn = document.getElementById('file-menu-btn');
    var fileMenu = document.getElementById('file-menu');
    var uploadCombinedBtn = document.getElementById('upload-combined-btn');
    var combinedInput = document.getElementById('combined-input');
    var dragOverlay = document.getElementById('drag-overlay');
    
    if (!messagesEl || !form || !input) return;

    var regConsult = sessionStorage.getItem('fayi_regenerate_consult');
    if (regConsult && input) {
      input.value = regConsult;
      sessionStorage.removeItem('fayi_regenerate_consult');
    }

    function userAvatarUrl() {
      var u = FayiAuth.getCurrentUser();
      return (u && u.avatar) || FayiAuth.DEFAULT_AVATAR;
    }

    // ==================== 文件上传事件绑定 ====================

    // 文件菜单开关
    if (fileMenuBtn && fileMenu) {
      fileMenuBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        fileMenu.classList.toggle('hidden');
      });
      
      // 点击其他地方关闭菜单
      document.addEventListener('click', function() {
        fileMenu.classList.add('hidden');
        // 关闭会话操作菜单
        if (sessionListEl) {
          sessionListEl.querySelectorAll('.session-more-menu').forEach(function(m) { m.classList.add('hidden'); });
          sessionListEl.querySelectorAll('.session-more-btn').forEach(function(b) { b.classList.remove('active'); });
        }
      });
      
      fileMenu.addEventListener('click', function(e) {
        e.stopPropagation();
      });
    }

    // 上传照片和文件（合并入口）
    if (uploadCombinedBtn && combinedInput) {
      uploadCombinedBtn.addEventListener('click', function() {
        combinedInput.click();
        fileMenu.classList.add('hidden');
      });

      combinedInput.addEventListener('change', function() {
        handleFileSelect(this.files);
        this.value = '';
      });
    }

    // 拖拽上传
    if (dragOverlay && form) {
      // 拖拽进入
      form.addEventListener('dragenter', function(e) {
        e.preventDefault();
        e.stopPropagation();
        dragOverlay.classList.remove('hidden');
      });
      
      // 拖拽悬停
      dragOverlay.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.stopPropagation();
      });
      
      // 拖拽离开
      dragOverlay.addEventListener('dragleave', function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (e.target === dragOverlay) {
          dragOverlay.classList.add('hidden');
        }
      });
      
      // 拖拽释放
      dragOverlay.addEventListener('drop', function(e) {
        e.preventDefault();
        e.stopPropagation();
        dragOverlay.classList.add('hidden');
        handleFileSelect(e.dataTransfer.files);
      });
    }

    // ==================== 原有功能 ====================

    function renderSessionList() {
      if (!sessionListEl) return;

      // 置顶的按置顶时间倒序排，未置顶的按更新时间倒序排
      var pinnedConvs = state.conversations
        .filter(function(c) { return c.isPinned; })
        .sort(function(a, b) { return new Date(b.pinnedAt) - new Date(a.pinnedAt); });
      var unpinnedConvs = state.conversations
        .filter(function(c) { return !c.isPinned; })
        .sort(function(a, b) { return new Date(b.updatedAt) - new Date(a.updatedAt); });
      var sortedConvs = pinnedConvs.concat(unpinnedConvs);

      if (sortedConvs.length === 0) {
        sessionListEl.innerHTML = '<p class="text-xs text-gray-400 dark:text-gray-500 text-center py-4 px-2">暂无对话记录</p>';
        return;
      }

      // 置顶按钒 SVG 图标
      var PIN_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>' +
        '<circle cx="12" cy="10" r="3"></circle>' +
        '</svg>';
      var PIN_FILLED_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>' +
        '<circle cx="12" cy="10" r="3" fill="white" stroke="none"></circle>' +
        '</svg>';

      sessionListEl.innerHTML = sortedConvs.map(function(conv) {
        var isActive = conv.id === state.currentConversationId;
        var isPinned = !!conv.isPinned;

        var baseCls = isActive
          ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white border-l-4 border-gray-900 dark:border-white'
          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 border-l-4 border-transparent';
        var pinnedCls = isPinned ? ' session-pinned' : '';

        var pinMenuText = isPinned ? '取消置顶' : '置顶';
        var pinIndicator = isPinned
          ? '<span class="session-pin-indicator" title="已置顶">' + PIN_FILLED_SVG + '</span>'
          : '';

        return '<div class="session-item rounded-r-lg px-3 py-2.5 cursor-pointer transition-all text-sm ' + baseCls + pinnedCls + '" ' +
          'data-conv-id="' + escapeHtml(conv.id) + '">' +
          '<div class="flex items-center justify-between gap-1">' +
            '<div class="flex-1 min-w-0">' +
              '<div class="flex items-center gap-1 leading-snug">' +
                pinIndicator +
                '<span class="session-title font-medium truncate" data-conv-id="' + escapeHtml(conv.id) + '" title="双击重命名">' + escapeHtml(conv.title || '新对话') + '</span>' +
              '</div>' +
              '<div class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">' + formatTime(conv.updatedAt) + '</div>' +
            '</div>' +
            '<div class="relative flex-shrink-0">' +
              '<button class="session-more-btn" data-conv-id="' + escapeHtml(conv.id) + '" title="更多操作">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">' +
                  '<circle cx="12" cy="5" r="1.5"></circle>' +
                  '<circle cx="12" cy="12" r="1.5"></circle>' +
                  '<circle cx="12" cy="19" r="1.5"></circle>' +
                '</svg>' +
              '</button>' +
              '<div class="session-more-menu hidden" style="position:fixed;z-index:9999;">' +
                '<div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-1 overflow-hidden" style="min-width:128px">' +
                  '<button class="session-menu-rename w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 text-left transition-colors" data-conv-id="' + escapeHtml(conv.id) + '">' +
                    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>' +
                    '重命名' +
                  '</button>' +
                  '<button class="session-menu-pin w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 text-left transition-colors" data-conv-id="' + escapeHtml(conv.id) + '">' +
                    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>' +
                    pinMenuText +
                  '</button>' +
                  '<div class="border-t border-gray-100 dark:border-gray-700 my-0.5"></div>' +
                  '<button class="session-menu-delete w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-left transition-colors" data-conv-id="' + escapeHtml(conv.id) + '">' +
                    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>' +
                    '删除' +
                  '</button>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');

      // 绑定会话点击事件（延迟 250ms 区分单击 / 双击）
      sessionListEl.querySelectorAll('.session-item').forEach(function(el) {
        var clickTimer = null;

        el.addEventListener('click', function() {
          if (clickTimer) {
            // 250ms 内第二次点击到来 → 属于双击，取消单击导航
            clearTimeout(clickTimer);
            clickTimer = null;
            return;
          }
          clickTimer = setTimeout(function() {
            clickTimer = null;
            if (state.isTyping) { state.abortTyping = true; }
            selectConversation(el.getAttribute('data-conv-id'));
          }, 250);
        });

        // 双击非标题区域时，取消待定的单击导航
        el.addEventListener('dblclick', function() {
          if (clickTimer) {
            clearTimeout(clickTimer);
            clickTimer = null;
          }
        });
      });

      // 按鈕点击：展开 / 收起 dropdown
      sessionListEl.querySelectorAll('.session-more-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var menu = this.nextElementSibling;
          var isOpen = !menu.classList.contains('hidden');
          // 关闭所有已开的菜单
          sessionListEl.querySelectorAll('.session-more-menu').forEach(function(m) { m.classList.add('hidden'); });
          sessionListEl.querySelectorAll('.session-more-btn').forEach(function(b) { b.classList.remove('active'); });
          if (!isOpen) {
            // 用 getBoundingClientRect 计算 fixed 定位坐标（不受 overflow:hidden 裁剪）
            var rect = this.getBoundingClientRect();
            var menuWidth = 140;
            var menuHeight = 128; // 估算高度
            var top  = rect.bottom + 4;
            var left = rect.right - menuWidth;
            // 防止超出屏幕右边缘
            if (left + menuWidth > window.innerWidth - 4) {
              left = window.innerWidth - menuWidth - 4;
            }
            // 防止超出屏幕底部（能装下就显在下方，裃不下就弹到上方）
            if (top + menuHeight > window.innerHeight - 4) {
              top = rect.top - menuHeight - 4;
            }
            menu.style.top  = top  + 'px';
            menu.style.left = left + 'px';
            menu.classList.remove('hidden');
            this.classList.add('active');
          }
        });
      });
      
      // 侧边栏滚动时自动关闭菜单（一次性绑定，避免重复添加）
      if (!sessionListEl._menuScrollBound) {
        var sidebarScrollEl = document.querySelector('.sidebar-scroll');
        if (sidebarScrollEl) {
          sidebarScrollEl.addEventListener('scroll', function() {
            sessionListEl.querySelectorAll('.session-more-menu').forEach(function(m) { m.classList.add('hidden'); });
            sessionListEl.querySelectorAll('.session-more-btn').forEach(function(b) { b.classList.remove('active'); });
          }, { passive: true });
        }
        sessionListEl._menuScrollBound = true;
      }
      
      // 菜单项：重命名
      sessionListEl.querySelectorAll('.session-menu-rename').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var convId = this.getAttribute('data-conv-id');
          this.closest('.session-more-menu').classList.add('hidden');
          this.closest('.relative').querySelector('.session-more-btn').classList.remove('active');
          var titleSpan = sessionListEl.querySelector('.session-title[data-conv-id="' + convId + '"]');
          if (titleSpan) startRenameSession(convId, titleSpan);
        });
      });
      
      // 菜单项：置顶 / 取消置顶
      sessionListEl.querySelectorAll('.session-menu-pin').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var convId = this.getAttribute('data-conv-id');
          this.closest('.session-more-menu').classList.add('hidden');
          this.closest('.relative').querySelector('.session-more-btn').classList.remove('active');
          togglePinConversation(convId);
        });
      });
      
      // 菜单项：删除
      sessionListEl.querySelectorAll('.session-menu-delete').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var convId = this.getAttribute('data-conv-id');
          this.closest('.session-more-menu').classList.add('hidden');
          this.closest('.relative').querySelector('.session-more-btn').classList.remove('active');
          deleteConversation(convId);
        });
      });
      
      // 绑定标题双击重命名事件
      sessionListEl.querySelectorAll('.session-title').forEach(function(span) {
        span.addEventListener('dblclick', function(e) {
          e.stopPropagation();
          startRenameSession(this.getAttribute('data-conv-id'), this);
        });
      });
    }

    /**
     * 双击会话标题 → 进入重命名模式
     * @param {string} convId 会话 ID
     * @param {HTMLElement} titleSpan 当前标题 span 元素
     */
    function startRenameSession(convId, titleSpan) {
      var conv = state.conversations.find(function(c) { return c.id === convId; });
      if (!conv) return;

      var originalTitle = conv.title || '新对话';

      // 创建输入框，替换 span
      var renameInput = document.createElement('input');
      renameInput.type = 'text';
      renameInput.value = originalTitle;
      renameInput.className = 'session-rename-input';
      titleSpan.parentNode.replaceChild(renameInput, titleSpan);
      renameInput.focus();
      renameInput.select();

      var committed = false;

      function commitRename() {
        if (committed) return;
        committed = true;
        var newTitle = renameInput.value.trim();
        if (newTitle && newTitle !== originalTitle) {
          conv.title = newTitle;
          conv.updatedAt = new Date().toISOString();
          saveConversationsToStorage();
          // 如果正在查看该会话，同步更新顶部标题栏
          if (titleEl && convId === state.currentConversationId) {
            titleEl.textContent = conv.title;
          }
        }
        renderSessionList();
      }

      function cancelRename() {
        if (committed) return;
        committed = true;
        renderSessionList();
      }

      renameInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitRename();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancelRename();
        }
      });

      // 失焦自动保存
      renameInput.addEventListener('blur', commitRename);

      // 阻止输入框点击触发会话切换
      renameInput.addEventListener('click', function(e) { e.stopPropagation(); });
      renameInput.addEventListener('mousedown', function(e) { e.stopPropagation(); });
    }

    function selectConversation(convId) {
      // 切换会话时中断当前生成
      if (state.isGenerating && state.abortController) {
        state.abortController.abort();
      }
      state.currentConversationId = convId;
      var conv = getCurrentConversation();
      if (conv) {
        state.currentMessages = conv.messages.slice();
        if (titleEl) titleEl.textContent = conv.title || '法律咨询对话';
        if (deleteBtn) deleteBtn.classList.remove('hidden');
      } else {
        state.currentMessages = [];
        if (titleEl) titleEl.textContent = '法律咨询对话';
        if (deleteBtn) deleteBtn.classList.add('hidden');
      }
      
      // 清空已上传文件
      state.uploadedFiles = [];
      renderUploadedFiles();
      
      renderMessages();
      renderSessionList();
    }

    function renderMessageItem(m, index, animate) {
      var isLast = index === state.currentMessages.length - 1;
      var shouldAnimate = animate && isLast && m.role === 'assistant' && !m.isError;
      
      var msgWrapper = document.createElement('div');
      msgWrapper.className = m.role === 'user' 
        ? 'bg-gray-50 dark:bg-gray-800/50 message-item' 
        : 'bg-white dark:bg-gray-900 message-item';
      msgWrapper.dataset.index = index;
      
      var innerHtml = '<div class="max-w-3xl mx-auto px-4 py-5 flex gap-4">';
      
      if (m.role === 'user') {
        var filesHtml = renderUserMessageFiles(m.files);
        var textHtml = m.content
          ? '<div class="user-message-bubble">' + escapeHtml(m.content).replace(/\n/g, '<br>') + '</div>'
          : '';
        innerHtml += 
          '<div class="flex-1 flex justify-end gap-4">' +
            '<div class="flex-1 flex flex-col items-end">' +
              filesHtml +
              textHtml +
            '</div>' +
            '<img src="' + userAvatarUrl() + '" alt="" class="w-8 h-8 rounded-full object-cover ring-2 ring-gray-200 dark:ring-gray-600 shrink-0">' +
          '</div>';
      } else {
        innerHtml += 
          '<img src="' + AI_AVATAR + '" alt="" class="w-8 h-8 rounded-full object-cover ring-2 ring-gray-200 dark:ring-gray-600 shrink-0 bg-white">' +
          '<div class="flex-1 ai-message-content">';
        
        if (shouldAnimate) {
          innerHtml += '<div class="ai-formatted-text typing-area"></div>';
        } else if (m.isCard && m.caseData) {
          innerHtml += renderCaseCard(m.caseData);
        } else {
          innerHtml += smartFormatContent(m.content);
        }
        
        innerHtml += '</div>';
      }
      
      innerHtml += '</div>';
      msgWrapper.innerHTML = innerHtml;
      messagesEl.appendChild(msgWrapper);
      
      if (shouldAnimate) {
        var typingArea = msgWrapper.querySelector('.typing-area');
        var formattedContent = smartFormatContent(m.content);
        
        enhancedTypeWriter(typingArea, formattedContent, state.typingSpeed, function() {
          state.isTyping = false;
          // isLoading 与 sendBtn 已在 API 返回后即时处理，此处无需重复
        });
      }
      
      return msgWrapper;
    }

    function renderMessages(animateLast) {
      messagesEl.innerHTML = '';
      
      if (state.currentMessages.length === 0) {
        renderWelcomeScreen();
        return;
      }

      state.currentMessages.forEach(function (m, index) {
        renderMessageItem(m, index, animateLast);
      });
      
      if (!animateLast) {
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    }
    // 定义完成后立即暴露，无论 messages 是否为空均可用
    window._fayiRenderMessages = renderMessages;

    function renderWelcomeScreen() {
      var welcomeDiv = document.createElement('div');
      welcomeDiv.className = 'flex justify-center items-center h-full';
      welcomeDiv.innerHTML =
        '<div class="text-center max-w-2xl px-4 w-full">' +
          '<div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:8px">' +
            '<img src="' + AI_AVATAR + '" alt="" style="width:48px;height:48px;border-radius:50%;object-fit:cover">' +
            '<h2 style="font-size:1.25rem;font-weight:700;color:#1e293b">法绎 · AI法律分析平台</h2>' +
          '</div>' +
          '<p style="color:#64748b;font-size:0.875rem;margin-bottom:24px">选择纠纷类型或直接输入案件描述，获取专业法律分析</p>' +
          '<div class="scene-cards">' +
            '<div class="scene-card" data-scene="劳动纠纷" data-text="我遇到了劳动纠纷问题，请帮我分析：">' +
              '<div class="scene-card-title">劳动纠纷</div>' +
              '<div class="scene-card-desc">劳动合同、工资欠薪、违法解除</div>' +
            '</div>' +
            '<div class="scene-card" data-scene="合同纠纷" data-text="我遇到了合同纠纷问题，请帮我分析：">' +
              '<div class="scene-card-title">合同纠纷</div>' +
              '<div class="scene-card-desc">合同违约、欺诈、解除纠纷</div>' +
            '</div>' +
            '<div class="scene-card" data-scene="租房纠纷" data-text="我遇到了租房纠纷问题，请帮我分析：">' +
              '<div class="scene-card-title">租房纠纷</div>' +
              '<div class="scene-card-desc">押金纠纷、违约退租、房屋损毁</div>' +
            '</div>' +
            '<div class="scene-card" data-scene="借贷纠纷" data-text="我遇到了民间借贷纠纷问题，请帮我分析：">' +
              '<div class="scene-card-title">借贷纠纷</div>' +
              '<div class="scene-card-desc">借款不还、利息纠纷、担保责任</div>' +
            '</div>'
          '</div>' +
          '<p style="color:#94a3b8;font-size:0.75rem;margin-top:20px">或直接在下方输入案件描述 · 支持上传图片 / PDF / Word 文件</p>' +
        '</div>';
      messagesEl.appendChild(welcomeDiv);

      welcomeDiv.querySelectorAll('.scene-card').forEach(function(card) {
        card.addEventListener('click', function() {
          input.value = this.getAttribute('data-text');
          input.focus();
        });
      });
    }

    function startNewConversation() {
      if (state.isTyping) {
        state.abortTyping = true;
      }
      // 新建会话时中断当前生成
      if (state.isGenerating && state.abortController) {
        state.abortController.abort();
      }
      state.currentConversationId = null;
      state.currentMessages = [];
      state.uploadedFiles = [];
      renderUploadedFiles();
      state.isLoading = false;
      state.isTyping = false;
      if (deleteBtn) deleteBtn.classList.add('hidden');
      if (titleEl) titleEl.textContent = '法律咨询对话';
      renderMessages();
      renderSessionList();
      input.focus();
    }

    /**
     * 切换发送/停止按钒显示状态
     */
    function updateGenerateButton(isGenerating) {
      var hintEl = document.querySelector('#chat-form .text-xs');
      if (!sendBtn || !stopBtn) return;
      if (isGenerating) {
        sendBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
        if (hintEl) {
          hintEl.textContent = '点击 █ 可停止生成';
          hintEl.classList.add('hint-generating');
        }
      } else {
        sendBtn.classList.remove('hidden');
        sendBtn.disabled = false;
        stopBtn.classList.add('hidden');
        if (hintEl) {
          hintEl.textContent = '按 Enter 发送，Shift + Enter 换行 · 拖拽文件到此处上传';
          hintEl.classList.remove('hint-generating');
        }
      }
    }
    
    /**
     * 用户主动停止生成
     */
    function stopGeneration() {
      if (state.abortController) {
        state.abortController.abort();
      }
    }
    
    /**
     * 创建流式 AI 消息容器（不经过 renderMessageItem）
     */
    function createStreamingMessageWrapper() {
      var wrapper = document.createElement('div');
      wrapper.className = 'bg-white dark:bg-gray-900 message-item';
      wrapper.innerHTML =
        '<div class="max-w-3xl mx-auto px-4 py-5 flex gap-4">' +
          '<img src="' + AI_AVATAR + '" alt="" class="w-8 h-8 rounded-full object-cover ring-2 ring-gray-200 dark:ring-gray-600 shrink-0 bg-white">' +
          '<div class="flex-1 ai-message-content">' +
            '<div class="ai-formatted-text streaming-area"></div>' +
          '</div>' +
        '</div>';
      return wrapper;
    }
    
    async function sendMessage() {
      var text = input.value.trim();
      if (!text && state.uploadedFiles.length === 0) return;
      if (state.isLoading) return;
      if (state.isTyping) { state.abortTyping = true; }
    
      var pendingFiles = state.uploadedFiles.filter(function(f) {
        return f.status === 'uploading' || f.status === 'parsing';
      });
      if (pendingFiles.length > 0) {
        if (window.FayiToast) FayiToast('请等待文件上传完成', 'warning');
        return;
      }
    
      var conv = getCurrentConversation();
      if (!conv) {
        conv = createNewConversation();
        state.currentConversationId = conv.id;
      }
    
      var messageContent = text || '';
      var completedFiles = state.uploadedFiles.filter(function(f) {
        return f.status === 'completed';
      });
    
      input.value = '';
      input.style.height = 'auto';
      state.isLoading = true;
      state.isUserScrolling = false;
    
      // 创建 AbortController
      var controller = new AbortController();
      state.abortController = controller;
      state.isGenerating = true;
      updateGenerateButton(true);
    
      // 展示用：保留全部文件（含上传失败的），并带 previewUrl 供图片渲染
      var userMessage = {
        role: 'user',
        content: messageContent,
        createdAt: new Date().toISOString(),
        files: state.uploadedFiles.map(function(f) {
          return {
            name:         f.name,
            type:         f.type,
            url:          f.url || null,
            previewUrl:   f.previewUrl || null,   // 本地 blob URL，用于图片即时预览
            serverFileId: f.serverFileId || null
          };
        })
      };
      state.currentMessages.push(userMessage);
      conv.messages.push(userMessage);
    
      if (conv.messages.filter(function(m) { return m.role === 'user'; }).length === 1) {
        updateConversationTitle(conv.id);
        if (titleEl) titleEl.textContent = conv.title;
      }
    
      conv.updatedAt = new Date().toISOString();
      saveConversationsToStorage();
      renderSessionList();
      renderMessages();
    
      state.uploadedFiles = [];
      renderUploadedFiles();
    
      // 显示“思考中”动画
      var thinkingMsg = createThinkingMessage();
      messagesEl.appendChild(thinkingMsg);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    
      // 流式输出状态
      var aiContent = '';
      var streamEl = null;
    
      var onDelta = function(delta, accumulated) {
        aiContent = accumulated;
        if (!streamEl) {
          // 收到第一个 chunk：移除思考动画，创建 AI 消息气泡
          thinkingMsg.remove();
          state.isLoading = false;
          var wrapper = createStreamingMessageWrapper();
          messagesEl.appendChild(wrapper);
          streamEl = wrapper.querySelector('.streaming-area');
        }
        // 实时格式化已累积内容
        streamEl.innerHTML = smartFormatContent(accumulated);
        if (!state.isUserScrolling) {
          messagesEl.scrollTop = messagesEl.scrollHeight;
        }
      };
    
      try {
        // 检测是否有图片附件：有则走 /api/process-case （OCR+卡片），无则走普通聊天流
        var imageFiles = completedFiles.filter(function(f) {
          var ext = (f.name || '').split('.').pop().toLowerCase();
          return ['jpg','jpeg','png','gif','webp'].includes(ext);
        });

        if (imageFiles.length > 0) {
          // ———— 图片分支：显示进度条 + 呼叫 process-case ————
          var imgFile = imageFiles[0];
          var imgBase64 = imgFile.base64Data || null;
          var imgFormData = new FormData();
          if (imgBase64) {
            var parts2 = imgBase64.split(',');
            var mime2  = (parts2[0].match(/:(.*?);/) || ['','image/png'])[1];
            var bStr2  = atob(parts2[1]);
            var u8arr2 = new Uint8Array(bStr2.length);
            for (var i2 = 0; i2 < bStr2.length; i2++) u8arr2[i2] = bStr2.charCodeAt(i2);
            imgFormData.append('file', new Blob([u8arr2], {type: mime2}), imgFile.name);
          }
          if (messageContent) imgFormData.append('text', messageContent);

          var imgToken = window.FayiAuth && FayiAuth.getToken ? FayiAuth.getToken() : null;
          var imgHeaders = imgToken ? { 'Authorization': 'Bearer ' + imgToken } : {};

          thinkingMsg.remove();
          var _msgEl = document.getElementById('chat-messages');
          var progressEl2 = createProgressMessage();
          if (_msgEl) { _msgEl.appendChild(progressEl2); _msgEl.scrollTop = _msgEl.scrollHeight; }

          (window.FayiAI && FayiAI.processCase
            ? FayiAI.processCase(imgFormData, { signal: controller.signal })
            : fetch(AI_SERVER_URL + '/api/process-case', { method: 'POST', headers: imgHeaders, body: imgFormData, signal: controller.signal }).then(function(r) { return r.json(); }))
          .then(function(resp) {
            progressEl2.remove();
            state.isLoading = false;
            var msg;
            if (!resp || !resp.success) {
              var isOcrErr2 = resp && resp.ocrError;
              msg = {
                role: 'assistant',
                content: isOcrErr2
                  ? '⚠️ OCR服务暂时不可用，请将图片中案情文字复制到输入框中发送。'
                  : '分析失败：' + (resp && resp.error || '未知错误'),
                createdAt: new Date().toISOString()
              };
            } else {
              var preview2 = (resp.content || resp.raw || '').substring(0, 60);
              msg = {
                role: 'assistant',
                content: preview2 || '案件分析完成',
                caseData: resp,
                isCard: true,
                createdAt: new Date().toISOString()
              };
            }
            state.currentMessages.push(msg);
            conv.messages.push(msg);
            conv.updatedAt = new Date().toISOString();
            if (resp && resp.success && window.FayiRealtime && FayiRealtime.notify) {
              FayiRealtime.notify({ type: 'ai_case' });
            }
            if (resp && resp.success) {
              logCaseAnalysisActivity(messageContent || ('图片：' + imgFile.name));
            }
            saveConversationsToStorage();
            if (window._fayiRenderMessages) window._fayiRenderMessages();
            var _el3 = document.getElementById('chat-messages');
            if (_el3) _el3.scrollTop = _el3.scrollHeight;
          })
          .catch(function(err2) {
            progressEl2.remove();
            state.isLoading = false;
            var errMsg2 = { role: 'assistant', content: '分析请求失败：' + err2.message, isError: true, createdAt: new Date().toISOString() };
            state.currentMessages.push(errMsg2);
            conv.messages.push(errMsg2);
            conv.updatedAt = new Date().toISOString();
            saveConversationsToStorage();
            if (window._fayiRenderMessages) window._fayiRenderMessages();
          })
          .finally(function() {
            state.isGenerating = false;
            state.abortController = null;
            updateGenerateButton(false);
          });
          return; // 图片分支处理完，跳过后面的普通流
        }

        // ———— 普通文字 / 文档分支 ————
        await callOpenAIAPI(state.currentMessages, completedFiles, controller.signal, onDelta);
    
        thinkingMsg.remove();
        state.isLoading = false;
    
        if (aiContent) {
          var aiMessage = {
            role: 'assistant',
            content: aiContent,
            createdAt: new Date().toISOString()
          };
          state.currentMessages.push(aiMessage);
          conv.messages.push(aiMessage);
          conv.updatedAt = new Date().toISOString();
          saveConversationsToStorage();
          renderSessionList();
          var qPreview = messageContent || (completedFiles[0] && completedFiles[0].name) || '';
          logChatActivity({
            type: 'consult',
            title: consultTitleFromText(qPreview),
            summary: qPreview ? FayiActivity.truncate(qPreview, 80) : 'AI 已回复您的咨询',
            userInput: qPreview,
            markdown: '## 用户咨询\n\n' + (qPreview || '（附件咨询）') + '\n\n## AI 回复\n\n' + (aiContent || ''),
            content: aiContent || '',
            status: 'completed',
            exportable: true,
            attachments: (completedFiles || []).map(function (f) {
              return { name: f.name, type: f.type || 'file', url: f.url || f.previewUrl || '' };
            }).filter(function (a) { return a.name; })
          });
        }
    
      } catch (error) {
        thinkingMsg.remove();
        state.isLoading = false;
    
        if (error.name === 'AbortError') {
          // 用户主动停止：保存已生成的部分内容
          if (aiContent) {
            var aiMessage = {
              role: 'assistant',
              content: aiContent,
              createdAt: new Date().toISOString(),
              isAborted: true
            };
            state.currentMessages.push(aiMessage);
            conv.messages.push(aiMessage);
            conv.updatedAt = new Date().toISOString();
            saveConversationsToStorage();
            renderSessionList();
          }
        } else {
          console.error('API 调用失败:', error);
          // 创建错误展示
          if (!streamEl) {
            var errWrapper = createStreamingMessageWrapper();
            messagesEl.appendChild(errWrapper);
            streamEl = errWrapper.querySelector('.streaming-area');
          }
          var errMsg = error.message || '未知错误';
          if (errMsg === 'Failed to fetch' || errMsg.includes('NetworkError') || errMsg.includes('Failed to fetch')) {
            errMsg = '无法连接后端服务（http://localhost:3002），请确保已运行 Node.js 服务。';
          }
          streamEl.innerHTML = '<p class="ai-paragraph" style="color:#ef4444">' +
            '请求失败，请稍后重试。<br>错误：' + escapeHtml(errMsg) + '</p>';
          var errorMessage = {
            role: 'assistant',
            content: '抱歉，我暂时无法回答您的问题。请检查网络连接或稍后重试。\n\n错误信息：' + error.message,
            createdAt: new Date().toISOString(),
            isError: true
          };
          state.currentMessages.push(errorMessage);
          conv.messages.push(errorMessage);
          saveConversationsToStorage();
        }
    
      } finally {
        // 无论成功、中断还是报错，均恢复 UI
        state.isGenerating = false;
        state.abortController = null;
        updateGenerateButton(false);
      }
    }

    function deleteConversation(convId) {
      if (!confirm('确定要删除这条对话记录吗？')) return;

      if (state.isTyping) { state.abortTyping = true; }
      if (state.isGenerating && state.abortController) { state.abortController.abort(); }

      state.conversations = state.conversations.filter(function(c) { return c.id !== convId; });
      saveConversationsToStorage();

      if (convId === state.currentConversationId) {
        startNewConversation();
      } else {
        renderSessionList();
      }
      if (window.FayiToast) FayiToast('会话已删除', 'success');
    }

    function deleteCurrentConversation() {
      if (!state.currentConversationId) return;
      if (!confirm('确定要删除这条对话记录吗？')) return;
      
      if (state.isTyping) {
        state.abortTyping = true;
      }
      
      state.conversations = state.conversations.filter(function(c) {
        return c.id !== state.currentConversationId;
      });
      saveConversationsToStorage();
      
      startNewConversation();
      if (window.FayiToast) FayiToast('会话已删除', 'success');
    }

    /**
     * 切换会话置顶状态
     */
    function togglePinConversation(convId) {
      var conv = state.conversations.find(function(c) { return c.id === convId; });
      if (!conv) return;

      if (conv.isPinned) {
        // 取消置顶
        conv.isPinned = false;
        conv.pinnedAt = null;
        if (window.FayiToast) FayiToast('已取消置顶', 'success');
      } else {
        // 置顶
        conv.isPinned = true;
        conv.pinnedAt = new Date().toISOString();
        if (window.FayiToast) FayiToast('已置顶该对话', 'success');
      }

      saveConversationsToStorage();
      renderSessionList();
    }

    function init() {
      loadConversationsFromStorage();
      renderSessionList();
      startNewConversation();

      // 处理个人资料库跳转过来的待处理条目
      var kbRaw = sessionStorage.getItem('kb_pending');
      if (kbRaw) {
        sessionStorage.removeItem('kb_pending');
        try {
          var kbData = JSON.parse(kbRaw);
          setTimeout(function () {
            if (kbData.type === 'text') {
              // 纯文字 → 写入输入框
              if (input) {
                input.value = kbData.content || '';
                input.dispatchEvent(new Event('input'));
                input.focus();
                if (window.FayiToast) FayiToast('"' + (kbData.title || '资料库内容') + '"已填入输入框', 'success');
              }
            } else if (kbData.type === 'file' && kbData.fileUrl) {
              // 文件/图片 → fetch 到 blob 再上传
              if (window.FayiToast) FayiToast('文件加载中…', 'success');
              fetch(kbData.fileUrl)
                .then(function (r) {
                  if (!r.ok) throw new Error('HTTP ' + r.status);
                  return r.blob();
                })
                .then(function (blob) {
                  var fileName = kbData.fileName || 'file';
                  var file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
                  return uploadFile(file);
                })
                .then(function () {
                  if (window.FayiToast) FayiToast('"' + (kbData.title || kbData.fileName) + '"已添加到对话输入区', 'success');
                })
                .catch(function (e) {
                  if (window.FayiToast) FayiToast('文件添加失败：' + e.message, 'error');
                });
            }
          }, 400); // 等待 UI 初始化完成
        } catch (e) {
          console.warn('[kb_pending] 解析失败:', e);
        }
      }
    }

    // 事件绑定
    if (newSessionBtn) {
      newSessionBtn.addEventListener('click', startNewConversation);
    }

    if (deleteBtn) {
      deleteBtn.addEventListener('click', deleteCurrentConversation);
    }

    // 停止生成按钒
    if (stopBtn) {
      stopBtn.addEventListener('click', stopGeneration);
    }

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      sendMessage();
    });

    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    input.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 128) + 'px';
    });

    messagesEl.addEventListener('click', function() {
      if (state.isTyping) {
        state.abortTyping = true;
      }
    });

    // 检测用户是否主动上滑：超过阈值则停止自动跟随，回到底部附近后恢复
    var SCROLL_THRESHOLD = 80;
    messagesEl.addEventListener('scroll', function() {
      var distFromBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight;
      state.isUserScrolling = distFromBottom > SCROLL_THRESHOLD;
    });

    init();
  });
})();

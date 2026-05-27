/**
 * pufa.js — 普法推荐模块（杂志式卡片流）
 * 法律科普文献 / 解读视频 / 热点新闻
 */
(function () {

  /* ===== 模拟数据 ===== */
  var PLAY_SVG = '<svg viewBox="0 0 64 64" fill="white"><circle cx="32" cy="32" r="30" fill="rgba(0,0,0,.45)"/><polygon points="26,18 48,32 26,46" fill="white"/></svg>';

  /* 分类封面图映射表（Unsplash 语义匹配图） */
  var COVER_MAP = {
    consumer:    'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=600&h=340&fit=crop',
    privacy:     'https://images.unsplash.com/photo-1563986768494-4dee2763ff3f?w=600&h=340&fit=crop',
    labor:       'https://images.unsplash.com/photo-1497366216548-37526070297c?w=600&h=340&fit=crop',
    finance:     'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=600&h=340&fit=crop',
    housing:     'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=600&h=340&fit=crop',
    traffic:     'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=600&h=340&fit=crop',
    family:      'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=600&h=340&fit=crop',
    ai:          'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=600&h=340&fit=crop',
    cyber:       'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600&h=340&fit=crop',
    property:    'https://images.unsplash.com/photo-1464082354059-abe2d13b5fd4?w=600&h=340&fit=crop',
    aerial:      'https://images.unsplash.com/photo-1524514587686-e2909d726e9b?w=600&h=340&fit=crop',
    inherit:     'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=600&h=340&fit=crop',
    food:        'https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=600&h=340&fit=crop',
        livestream:  'https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=600&h=340&fit=crop',
        propertymgmt:'https://images.unsplash.com/photo-1560449017-f13d49c62dc5?w=600&h=340&fit=crop',
  };

  /* B站搜索链接模板 */
  var bilibiliSearch = function (kw) {
    return 'https://search.bilibili.com/all?keyword=' + encodeURIComponent(kw) + '&from_source=webtop_search';
  };

  var items = [
    { id: 1, type: 'video', title: '3 分钟看懂：消费者退换货的法定权利边界',
      source: '法绎课堂', time: '3 天前', likes: 1280,
      category: 'consumer',
      videoUrl: 'https://player.bilibili.com/player.html?bvid=BV16p4y1X7jT&high_quality=1&danmaku=0',
      extraVideos: [
        { bvid: 'BV1GSdpYPEXk', title: '消费者权益保护法详解' },
        { bvid: 'BV1UbQ5BnEQQ', title: '七天无理由退货规则' },
        { bvid: 'BV156QzY6ETK', title: '网购维权指南' },
        { bvid: 'BV11oqpBAEzx', title: '退换货法律要点' },
        { bvid: 'BV1zy421v7X3', title: '消费者权益案例解析' },
      ],
      desc: '网购商品"七天无理由"适用范围、运费谁承担、商家拒绝退款怎么办。' },
    { id: 2, type: 'video', title: '个人信息保护法：你的数据谁做主？',
      source: '法绎课堂', time: '1 天前', likes: 856,
      category: 'privacy',
      videoUrl: 'https://player.bilibili.com/player.html?bvid=BV1nvSbYjEj3&high_quality=1&danmaku=0',
      extraVideos: [
        { bvid: 'BV1nvSbYjEj3', title: '个人信息保护法解读' },
        { bvid: 'BV1TR4y1E7Us', title: 'APP收集信息合规边界' },
        { bvid: 'BV1gF4m1N7j8', title: '用户数据权利指南' },
        { bvid: 'BV16b4y1g7Vp', title: '个人信息共享规则' },
        { bvid: 'BV1r44y1v7st', title: '知情同意与授权' },
        { bvid: 'BV1Ch4y1W7wi', title: '泄露举报与赔偿' },
      ],
      bilibiliUrl: bilibiliSearch('个人信息保护法 APP 收集 隐私'),
      desc: '多起 APP 超范围收集用户信息被处罚，合规边界在哪里。' },
    { id: 3, type: 'video', title: '劳动合同解除全攻略：经济补偿金怎么算？',
      source: '法绎课堂', time: '5 天前', likes: 2340,
      category: 'labor',
      videoUrl: 'https://player.bilibili.com/player.html?bvid=BV16j41137ke&high_quality=1&danmaku=0',
      extraVideos: [
        { bvid: 'BV16j41137ke', title: '劳动合同解除全攻略（上）' },
        { bvid: 'BV1Ny411e7Xp', title: '劳动合同解除全攻略（下）' },
        { bvid: 'BV1jN4y1w7UC', title: 'N+1经济补偿金详解' },
        { bvid: 'BV1aS4y187ff', title: '违法解除赔偿2N' },
        { bvid: 'BV1nW411a7PB', title: '劳动仲裁时效与流程' },
        { bvid: 'BV1d4iiYoEdV', title: '经济补偿金计算实例' },
      ],
      bilibiliUrl: bilibiliSearch('劳动法 经济补偿金 N+1 违法解除'),
      desc: '合法解除与违法解除的区别、N/2N 计算规则、仲裁时效。' },
    { id: 4, type: 'video', title: '民间借贷踩坑警示：年利率超过这个数不受保护',
      source: '法绎课堂', time: '2 天前', likes: 3120,
      category: 'finance',
      videoUrl: 'https://player.bilibili.com/player.html?bvid=BV11H4y1i7E9&high_quality=1&danmaku=0',
      extraVideos: [
        { bvid: 'BV11H4y1i7E9', title: '民间借贷利率红线' },
        { bvid: 'BV1rh411c7qb', title: 'LPR四倍利率详解' },
        { bvid: 'BV1hSsczNEnZ', title: '砍头息识别与维权' },
        { bvid: 'BV1D5tAzmEBb', title: '阴阳合同法律风险' },
        { bvid: 'BV1QAQUYdExK', title: '借贷凭证怎么写' },
        { bvid: 'BV1T4wJzWEi7', title: '民间借贷诉讼攻略' },
      ],
      bilibiliUrl: bilibiliSearch('民间借贷 年利率 LPR四倍 砍头息'),
      desc: 'LPR 四倍红线、砍头息、阴阳合同的法律效力。' },
    { id: 5, type: 'video', title: '直播带货翻车：消费者能主张退一赔三吗？',
      source: '法绎课堂', time: '6 小时前', likes: 5670,
            category: 'livestream',
            videoUrl: 'https://player.bilibili.com/player.html?bvid=BV19x421f7fh&high_quality=1&danmaku=0',
      extraVideos: [
        { bvid: 'BV19x421f7fh', title: '直播带货退一赔三' },
        { bvid: 'BV1fFDAYME2h', title: '虚假宣传法律定性' },
        { bvid: 'BV1MfJSzREGd', title: '主播责任划分' },
        { bvid: 'BV16r42157dC', title: '平台连带责任' },
        { bvid: 'BV1gs4y1T78L', title: '消费者维权路径' },
        { bvid: 'BV1u1421f7B9', title: '直播电商合规指南' },
      ],
      bilibiliUrl: bilibiliSearch('直播带货 虚假宣传 消费者权益 退一赔三'),
      desc: '直播带货虚假宣传的法律定性、主播与平台的责任划分。' },
    { id: 6, type: 'video', title: '婚姻家庭：婚前房产婚后加名，离婚时怎么分？',
      source: '法绎课堂', time: '4 天前', likes: 4500,
      category: 'family',
      videoUrl: 'https://player.bilibili.com/player.html?bvid=BV18kcBeQEgC&high_quality=1&danmaku=0',
      extraVideos: [
        { bvid: 'BV18kcBeQEgC', title: '婚姻法房产分割' },
        { bvid: 'BV16nDjB6Ein', title: '婚前财产认定规则' },
        { bvid: 'BV1PA411E74r', title: '按揭房离婚处理' },
        { bvid: 'BV1CEcBeMEtY', title: '子女抚养权判定' },
        { bvid: 'BV1JK4y1v7yk', title: '共同财产分割详解' },
        { bvid: 'BV1tw6jBtE3H', title: '离婚协议怎么写' },
      ],
      bilibiliUrl: bilibiliSearch('婚姻法 婚前房产 离婚财产分割 子女抚养权'),
      desc: '共同财产认定规则、按揭房分割、子女抚养权判定标准。' },
    { id: 7, type: 'video', title: '交通事故理赔速查：误工费、护理费如何举证？',
      source: '法绎课堂', time: '1 周前', likes: 1890,
      category: 'traffic',
      videoUrl: 'https://player.bilibili.com/player.html?bvid=BV17LtyeUEXj&high_quality=1&danmaku=0',
      extraVideos: [
        { bvid: 'BV17LtyeUEXj', title: '交通事故理赔全攻略' },
        { bvid: 'BV13s4y1R7k1', title: '误工费计算与举证' },
        { bvid: 'BV1hd4y127rN', title: '护理费赔偿标准' },
        { bvid: 'BV1jS4y1p7gC', title: '伤残鉴定流程' },
        { bvid: 'BV1FG4y1M7K8', title: '保险理赔顺序' },
        { bvid: 'BV1f34y187JG', title: '赔偿项目清单详解' },
      ],
      bilibiliUrl: bilibiliSearch('交通事故 赔偿标准 误工费 伤残鉴定'),
      desc: '赔偿项目清单、伤残鉴定流程、保险理赔顺序。' },
    { id: 8, type: 'video', title: 'AI 生成内容侵犯著作权第一案宣判',
      source: '法绎课堂', time: '12 小时前', likes: 9200,
      category: 'ai',
      videoUrl: 'https://player.bilibili.com/player.html?bvid=BV1da4y1d7Cf&high_quality=1&danmaku=0',
      extraVideos: [
        { bvid: 'BV1da4y1d7Cf', title: 'AI著作权第一案' },
        { bvid: 'BV1QMSjBREzr', title: 'AI作品版权归属' },
        { bvid: 'BV1yXPHzcEB1', title: '独创性判断标准' },
        { bvid: 'BV1CpAMznEa2', title: '合理使用抗辩' },
        { bvid: 'BV1Ru411s7rv', title: '生成式AI合规指南' },
        { bvid: 'BV1iL411z7qz', title: 'AI训练数据侵权' },
      ],
      bilibiliUrl: bilibiliSearch('AI 生成内容 著作权 版权 第一案'),
      desc: 'AI 绘画作品的版权归属、独创性标准、合理使用抗辩。' },
    { id: 9, type: 'video', title: '房屋租赁避坑指南：押金不退、二房东转租怎么处理？',
      source: '法绎课堂', time: '3 天前', likes: 3400,
      category: 'housing',
      videoUrl: 'https://player.bilibili.com/player.html?bvid=BV1pa4y1t71L&high_quality=1&danmaku=0',
      extraVideos: [
        { bvid: 'BV1pa4y1t71L', title: '租房押金维权' },
        { bvid: 'BV13LAqzUEHN', title: '二房东转租风险' },
        { bvid: 'BV1nG4y1v7Az', title: '租赁合同必备条款' },
        { bvid: 'BV1dShseeEP9', title: '提前解约违约金' },
        { bvid: 'BV1auC2YvEQR', title: '维修义务与维修基金' },
        { bvid: 'BV1PZhNetEBM', title: '房东违约赔偿实例' },
      ],
      bilibiliUrl: bilibiliSearch('房屋租赁合同 押金 二房东 转租 法律'),
      desc: '租赁合同必备条款、维修义务、提前解约违约金。' },
    { id: 10, type: 'video', title: '职场性骚扰如何维权？取证与赔偿全解析',
      source: '法绎课堂', time: '2 天前', likes: 2150,
      category: 'labor',
      videoUrl: 'https://player.bilibili.com/player.html?bvid=BV1VG411G7mX&high_quality=1&danmaku=0',
      extraVideos: [
        { bvid: 'BV1VG411G7mX', title: '职场性骚扰认定标准' },
        { bvid: 'BV1HmbSzvEJe', title: '证据收集技巧' },
        { bvid: 'BV1qP4y1W75P', title: '用人单位责任' },
        { bvid: 'BV153VWzgEF5', title: '投诉举报渠道' },
        { bvid: 'BV17E411P7NP', title: '心理创伤与精神赔偿' },
        { bvid: 'BV1tm421V7Mg', title: '职场反骚扰全攻略' },
      ],
      bilibiliUrl: bilibiliSearch('职场性骚扰 维权 取证 法律'),
      desc: '性骚扰认定标准、证据收集技巧、用人单位责任。' },
    { id: 11, type: 'video', title: '网络暴力侵权：被网暴了怎么办？',
      source: '法绎课堂', time: '5 天前', likes: 6780,
      category: 'cyber',
      videoUrl: 'https://player.bilibili.com/player.html?bvid=BV17r4y1f7vi&high_quality=1&danmaku=0',
      extraVideos: [
        { bvid: 'BV17r4y1f7vi', title: '网络暴力法律定性' },
        { bvid: 'BV16KtrzqEj8', title: '名誉权侵权认定' },
        { bvid: 'BV1854y1g7Jv', title: '证据固定与保全' },
        { bvid: 'BV1AMTKzoEf8', title: '起诉流程详解' },
        { bvid: 'BV1Vu411n7ee', title: '精神损害赔偿标准' },
        { bvid: 'BV1oD4y1B7QF', title: '平台连带责任' },
      ],
      bilibiliUrl: bilibiliSearch('网络暴力 侵权 名誉权 维权'),
      desc: '网暴的法律定性、证据固定、起诉流程、精神损害赔偿。' },
    { id: 12, type: 'video', title: '物业费纠纷：不交物业费会被起诉吗？',
      source: '法绎课堂', time: '1 周前', likes: 1560,
            category: 'propertymgmt',
            videoUrl: 'https://player.bilibili.com/player.html?bvid=BV1nu4y1x7t2&high_quality=1&danmaku=0',
      extraVideos: [
        { bvid: 'BV1nu4y1x7t2', title: '物业费纠纷全解析' },
        { bvid: 'BV121421r7St', title: '业主拒缴物业费后果' },
        { bvid: 'BV1yz4y1L7Ls', title: '物业服务质量争议' },
        { bvid: 'BV18f421B7pe', title: '业主委员会维权途径' },
        { bvid: 'BV14u4y1T78j', title: '物业费诉讼时效' },
        { bvid: 'BV1nm4y1B7yL', title: '物业费缴纳义务详解' },
      ],
      bilibiliUrl: bilibiliSearch('物业费 纠纷 业主 维权'),
      desc: '物业费缴纳义务、服务质量争议、业主委员会维权。' },
    { id: 13, type: 'video', title: '高空抛物谁负责？从民法典看头顶安全',
      source: '法绎课堂', time: '3 天前', likes: 3890,
      category: 'aerial',
      videoUrl: 'https://player.bilibili.com/player.html?bvid=BV1P3411T7Vq&high_quality=1&danmaku=0',
      extraVideos: [
        { bvid: 'BV1P3411T7Vq', title: '高空抛物民法典解读' },
        { bvid: 'BV1Yi4y177HK', title: '找不到侵权人怎么办' },
        { bvid: 'BV1uQyjYEE6E', title: '物业连带责任' },
        { bvid: 'BV1sx411Z7Uq', title: '建筑物悬挂物坠落责任' },
        { bvid: 'BV1nj411H734', title: '高空抛物典型案例' },
        { bvid: 'BV13P4y187ns', title: '预防与维权指南' },
      ],
      bilibiliUrl: bilibiliSearch('高空抛物 民法典 侵权责任'),
      desc: '高空抛物伤人找不到责任人怎么办、物业连带责任。' },
    { id: 14, type: 'video', title: '继承纠纷：法定继承与遗嘱继承哪个优先？',
      source: '法绎课堂', time: '6 天前', likes: 2450,
      category: 'inherit',
      videoUrl: 'https://player.bilibili.com/player.html?bvid=BV1LfDkB6EBw&high_quality=1&danmaku=0',
      extraVideos: [
        { bvid: 'BV1LfDkB6EBw', title: '继承法基础入门' },
        { bvid: 'BV1Pp4y1e7Wo', title: '法定继承顺序详解' },
        { bvid: 'BV1bpPveSEZM', title: '遗嘱效力认定标准' },
        { bvid: 'BV1Mh4y1276H', title: '代位继承与转继承' },
        { bvid: 'BV1WY411y7N9', title: '遗产分割争议解决' },
        { bvid: 'BV1nV4y1f7Sj', title: '继承纠纷诉讼实例' },
      ],
      bilibiliUrl: bilibiliSearch('继承法 遗嘱 法定继承'),
      desc: '遗嘱效力认定、代位继承、转继承的适用场景。' },
    { id: 15, type: 'video', title: '食品安全维权：买到过期食品如何索赔？',
      source: '法绎课堂', time: '2 天前', likes: 4120,
      category: 'food',
      videoUrl: 'https://player.bilibili.com/player.html?bvid=BV1cT411j7Wr&high_quality=1&danmaku=0',
      extraVideos: [
        { bvid: 'BV1cT411j7Wr', title: '食品安全法解读' },
        { bvid: 'BV17gdEB9EYT', title: '过期食品退一赔十' },
        { bvid: 'BV1jJ411V7M8', title: '证据保留技巧' },
        { bvid: 'BV1wY4y1T78e', title: '投诉举报渠道汇总' },
        { bvid: 'BV1sAutztEZV', title: '超市食品安全陷阱' },
        { bvid: 'BV1Cg411N7BL', title: '网购食品维权指南' },
      ],
      bilibiliUrl: bilibiliSearch('食品安全 过期食品 索赔 十倍赔偿'),
      desc: '退一赔十规则、证据保留技巧、投诉举报渠道。' },
  ];

  /* ===== 渲染单张卡片 ===== */
  function tagLabel(type) {
    /* 已删除标签角标 */
    return '';
  }

  function playOverlay(type) {
    return type === 'video' ? '<div class="pufa-card__play">' + PLAY_SVG + '</div>' : '';
  }

  function metaHTML(it) {
    return '<div class="pufa-card__meta">' +
      '<span>' + escapeHtml(it.source) + '</span>' +
      '<span>· ' + escapeHtml(it.time) + '</span>' +
      '<span style="margin-left:auto">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> ' +
        it.likes + '</span></div>';
  }

  function cardHTML(it) {
    var coverSrc = COVER_MAP[it.category] || COVER_MAP.consumer;
    return '<article class="pufa-card" data-id="' + it.id + '">' +
      '<div class="pufa-card__cover">' +
        '<img src="' + coverSrc + '" alt="" loading="lazy" />' +
        '<div class="pufa-card__cover-overlay"></div>' +
        playOverlay(it.type) +
      '</div>' +
      '<div class="pufa-card__body">' +
        '<div class="pufa-card__title">' + escapeHtml(it.title) + '</div>' +
        metaHTML(it) +
      '</div></article>';
  }

  /* ===== 渲染页面 ===== */
  function render() {
    var gridEl = document.getElementById('pufa-grid');
    if (!gridEl) return;

    /* 全部渲染到统一网格 */
    gridEl.innerHTML = items.map(function (it) { return cardHTML(it); }).join('');

    /* 绑定视频卡片点击 */
    document.querySelectorAll('.pufa-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var id = parseInt(card.getAttribute('data-id'), 10);
        var it = items.find(function (x) { return x.id === id; });
        if (!it) return;

        if (it.type === 'video') {
          trackPufaVisit({ action: 'video_click', id: it.id, title: it.title });
          if (it.videoUrl) {
            openVideoModal(it);
          } else if (it.bilibiliUrl) {
            window.open(it.bilibiliUrl, '_blank');
          }
        }
      });
    });
  }

  /* ===== 资源面板弹窗 ===== */
  function openResourceModal(articleId, title) {
    var modal   = document.getElementById('pufa-res-modal');
    var overlay = document.getElementById('pufa-res-overlay');
    var list    = document.getElementById('pufa-res-list');
    var subtitle = document.getElementById('pufa-res-subtitle');
    if (!modal || !list) return;

    /* 显示标题信息 */
    if (subtitle && title) {
      subtitle.textContent = title.length > 28 ? title.slice(0, 28) + '…' : title;
    }

    /* 渲染资源链接 */
    list.innerHTML = '';
    getResources(articleId, function (resources) {
      if (!resources.length) {
        list.innerHTML = '<p style="color:#64748b;font-size:13px;text-align:center;padding:10px 0">暂无相关资源</p>';
        return;
      }
      resources.forEach(function (res) {
        var a = document.createElement('a');
        a.href = res.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.className = 'pufa-res-link';
        a.innerHTML =
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>' +
          '<span>' + escapeHtml(res.name) + '</span>' +
          '<svg style="margin-left:auto;opacity:.4" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>';
        list.appendChild(a);
      });
    });

    /* 显示遮罩 + 弹窗 */
    if (overlay) {
      overlay.style.display = 'block';
      overlay.style.animation = 'pufa-res-overlay-in .18s ease forwards';
    }
    modal.style.display = 'flex';
    modal.style.animation = 'pufa-res-in .22s ease forwards';
  }

  function closeResourceModal() {
    var modal   = document.getElementById('pufa-res-modal');
    var overlay = document.getElementById('pufa-res-overlay');
    if (modal)   modal.style.display   = 'none';
    if (overlay) overlay.style.display = 'none';
  }
  function openVideoModal(it) {
    var modal   = document.getElementById('pufa-video-modal');
    var overlay = document.getElementById('pufa-modal-overlay');
    var player  = document.getElementById('pufa-video-player');
    var title   = document.getElementById('pufa-modal-title');
    var meta    = document.getElementById('pufa-modal-meta');
    if (!modal || !player) return;

    title.textContent = it.title;
    meta.textContent  = it.source + ' · ' + it.time + ' · ❤ ' + it.likes;

    /* 显示遮罩 */
    if (overlay) {
      overlay.style.display = 'block';
      overlay.style.animation = 'pufa-overlay-in .2s ease forwards';
    }

    /* 显示弹窗 + 淡入动画 */
    modal.style.display = 'flex';
    modal.style.animation = 'pufa-modal-in .2s ease forwards';

    /* 禁止页面滚动 */
    document.body.style.overflow = 'hidden';

    /* 设置视频源 */
    if (it.videoUrl) {
      player.src = it.videoUrl;
    }

    /* 渲染备用视频列表 */
    renderExtraVideos(it);
  }

  function closeVideoModal() {
    var modal   = document.getElementById('pufa-video-modal');
    var overlay = document.getElementById('pufa-modal-overlay');
    var player  = document.getElementById('pufa-video-player');
    if (!modal) return;

    /* 停止视频播放 */
    if (player) {
      player.src = '';
    }

    /* 隐藏弹窗和遮罩 */
    modal.style.display = 'none';
    if (overlay) overlay.style.display = 'none';

    /* 恢复页面滚动 */
    document.body.style.overflow = 'auto';
  }

  /* ===== 渲染备用视频列表 ===== */
  function renderExtraVideos(it) {
    var listContainer = document.getElementById('pufa-extra-list');
    var section = document.getElementById('pufa-extra-section');
    if (!listContainer) return;

    /* 清空旧按钮 */
    listContainer.innerHTML = '';

    /* 隐藏备用视频区域 */
    if (section) section.style.display = 'none';

    if (!it.extraVideos || !it.extraVideos.length) return;

    /* 有备用视频，显示区域 */
    if (section) section.style.display = 'block';

    it.extraVideos.forEach(function (v) {
      var url = 'https://player.bilibili.com/player.html?bvid=' + v.bvid + '&high_quality=1&danmaku=0';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'text-xs px-3 py-1.5 rounded-full border border-gray-600 ' +
        'bg-gray-700/50 text-gray-300 hover:bg-indigo-600 hover:border-indigo-500 ' +
        'hover:text-white transition-all cursor-pointer whitespace-nowrap';
      btn.textContent = v.title;
      btn.setAttribute('data-url', url);
      btn.setAttribute('data-title', v.title);

      btn.addEventListener('click', function () {
        var iframe = document.getElementById('pufa-video-player');
        var titleEl = document.getElementById('pufa-modal-title');
        if (iframe) iframe.src = url;
        if (titleEl) titleEl.textContent = v.title;
        listContainer.querySelectorAll('button').forEach(function (b) {
          b.classList.remove('bg-indigo-600', 'border-indigo-500', 'text-white');
          b.classList.add('bg-gray-700/50', 'border-gray-600', 'text-gray-300');
        });
        btn.classList.remove('bg-gray-700/50', 'border-gray-600', 'text-gray-300');
        btn.classList.add('bg-indigo-600', 'border-indigo-500', 'text-white');
      });

      listContainer.appendChild(btn);
    });
  }

  /* ===== 法律文案与科普文献数据 ===== */
  var articles = [
    { id: 1, title: '民法典合同篇全解：有效合同的六大要素',
      tags: ['民法典', '合同法'],
      summary: '合同法是现代商业社会的基本工具。本文详解民法典合同篇的六大核心要素：当事人、意思表示、标的、内容、形式和法律效力。帮助普通人识别合同陡阱、保护自身权益。',
      date: '2024-03-15', reads: 12800, source: '法绠法务' },
    { id: 2, title: '劳动合同必备条款清单：签前一定要看清',
      tags: ['劳动法', '合同'],
      summary: '劳动合同是保护劳动者权益的第一道屏障。工作内容、薄酒内容、工作时间、劳动报酬、合同期限、社会保险六大必备条款详解，附常见不平等条款识别方法。',
      date: '2024-04-02', reads: 9650, source: '法绠法务' },
    { id: 3, title: '个人信息保护法实务指南：八类个人信息权利详解',
      tags: ['个人信息', '隐私保护'],
      summary: '个人信息保护法赋予公民知情权、决策权、查阅复制权、转载拒绝权等八项权利。APP违规收集如何举报、数据主体如何行使权利、企业合规义务全讲解。',
      date: '2024-03-28', reads: 8420, source: '法绠科普' },
    { id: 4, title: '租赁合同模板与款项解析：盟友租房必读',
      tags: ['租赁', '合同模板'],
      summary: '一份完善的租赁合同应包括：房屋基本信息、租金与压金条款、维修责任划分、提前解约条件、迁出之同及一方违约责任等。附出常见陷阱和协议建议。',
      date: '2024-03-10', reads: 15300, source: '法绠法务' },
    { id: 5, title: '遗嘱效力与公证遗嘱：注意这五点避免无效',
      tags: ['继承法', '遗嘱'],
      summary: '中国法认可公证遗嘱、自书遗嘱、录音遗嘱等形式。各种遗嘱的法定格式要求、常见无效情形、公证处办流程及费用标准、遗嘱撤销与变更的法律要求。',
      date: '2024-04-05', reads: 6790, source: '法绠科普' },
    { id: 6, title: '交通事故赔偿标准详解：从诊断证明到理赔清单',
      tags: ['交通事故', '赔偿标准'],
      summary: '交通事故赔偿项目包括医疗费、诊断费、误工费、护理费、残疾赔偿、死亡赔偿等。本文汇总各项赔偿的计算公式、举证指南和常见争议处理方法。',
      date: '2024-02-20', reads: 11200, source: '法绠法务' },
    { id: 7, title: 'AI生成内容的着作权归属：法院判决与学界争议',
      tags: ['AI法律', '着作权'],
      summary: 'AI绘画、AI写作、AI音乐等内容的着作权归属问题已成为新型却无共识的法律难题。收集全球资深法学学者和法院判决，分析不同地区的法律立场差异。',
      date: '2024-04-10', reads: 18900, source: '法绠学术' },
    { id: 8, title: '网络讽弄处理指南：名誉权、隐私权与证据保全实务',
      tags: ['网络法', '名誉权'],
      summary: '面对网络讽弄应如何应对？本指南详分截图、录音、证人证言等证据保全方法，平台举报流程、起诉管辖法院选择标准、算算第一步该思考什么。',
      date: '2024-03-05', reads: 7340, source: '法绠科普' },
    { id: 9, title: '民间借贷匸该怎么写？聚式借贷安全备忘款',
      tags: ['借贷', '合同写作'],
      summary: '引发后靱的长期讼讣正是因为借款匸不全面。本文提供标准化借贷协议范本，包括借款主体、金额、利率、再还方式、逐期还款计划、违约责任周全备忘说明。',
      date: '2024-01-18', reads: 22100, source: '法绠法务' },
    { id: 10, title: '食品安全法实务应对：十倍赔偿的三个前提条件',
      tags: ['食品安全', '消费者权益'],
      summary: '《食品安全法》第一百陶十二条的十倍赔偿不是无条件抓取的。本文分析如实存在质量问题、主观明知故买列三个前提条件，和卸责抗辩的常见凡例分析。',
      date: '2024-04-08', reads: 16500, source: '法绠科普' },
  ];

  /* ===== 文章资源映射表 ===== */
  /* 每个条目对应两个官方权威链接 */
  var resourceMap = {
    'a1': [
      { name: '国家法律法规数据库（全国人大）', url: 'https://flk.npc.gov.cn/fl.html' },
      { name: '中国裁判文书网（合同纠纷案例）', url: 'https://wenshu.court.gov.cn/' },
    ],
    'a2': [
      { name: '人社部．劳动合同法全文', url: 'http://www.mohrss.gov.cn/SYrlzyhshbzb/zcfg/flfg/fl/201407/t20140714_135616.htm' },
      { name: '国家法律法规数据库（劳动法）', url: 'https://flk.npc.gov.cn/fl.html' },
    ],
    'a3': [
      { name: '国家互联网信息办．个人信息保护法', url: 'https://www.cac.gov.cn/2021-08/20/c_1631050880734231.htm' },
      { name: '全国人大．个人信息保护法全文', url: 'http://www.npc.gov.cn/npc/c30834/202108/a8c4e3672c74491a80b53a172bb753fe.shtml' },
    ],
    'a4': [
      { name: '中国裁判文书网（租赁纠纷案例）', url: 'https://wenshu.court.gov.cn/' },
      { name: '国家法律法规数据库（城市房屋租赁）', url: 'https://flk.npc.gov.cn/' },
    ],
    'a5': [
      { name: '中国公证协会官网', url: 'http://www.chinanotary.org/' },
      { name: '最高人民法院．继承纠纷案例', url: 'https://www.court.gov.cn/' },
    ],
    'a6': [
      { name: '公安部交通管理局官网', url: 'https://www.mps.gov.cn/n2254314/n2254409/n4904353/index.html' },
      { name: '最高法．交通事故赔偿司法解释', url: 'https://www.court.gov.cn/' },
    ],
    'a7': [
      { name: '国家版权局官网', url: 'http://www.ncac.gov.cn/' },
      { name: '中国裁判文书网（AI着作权案例）', url: 'https://wenshu.court.gov.cn/' },
    ],
    'a8': [
      { name: '国家互联网信息办官网', url: 'https://www.cac.gov.cn/' },
      { name: '网络违法举报中心 12377', url: 'http://www.12377.cn/' },
    ],
    'a9': [
      { name: '最高法．民间借贷司法解释（三）', url: 'https://www.court.gov.cn/' },
      { name: '国家法律法规数据库', url: 'https://flk.npc.gov.cn/' },
    ],
    'a10': [
      { name: '国家市场监督管理总局官网', url: 'https://www.samr.gov.cn/' },
      { name: '食品安全投诉举报 12315平台', url: 'https://www.12315.cn/' },
    ],
  };

  /*
   * 扩展预留：后端接口获取资源（目前为本地映射，后续可替换为 fetch 调用）
   *
   * async function fetchResources(articleId) {
   *   const resp = await fetch('/api/resources?articleId=' + articleId);
   *   return await resp.json();
   * }
   */
  function getResources(articleId, callback) {
    /* 当前从本地映射表取値 */
    callback(resourceMap[articleId] || []);
    /*
     * 切换为后端接口时，替换为：
     * fetch('/api/resources?articleId=' + articleId)
     *   .then(r => r.json())
     *   .then(callback)
     *   .catch(() => callback([]));
     */
  }
  /* ===== 渲染文章卡片 ===== */
  function articleCardHTML(art) {
    var tagsHtml = art.tags.map(function (t) {
      return '<span class="pufa-article-card__tag">' + escapeHtml(t) + '</span>';
    }).join('');
    return '<article class="pufa-article-card" data-article-id="a' + art.id + '">' +
      '<div class="pufa-article-card__tags">' + tagsHtml + '</div>' +
      '<div class="pufa-article-card__title">' + escapeHtml(art.title) + '</div>' +
      '<div class="pufa-article-card__summary">' + escapeHtml(art.summary) + '</div>' +
      '<div class="pufa-article-card__footer">' +
        '<span>' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>' +
            '<line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>' +
            '<line x1="3" y1="10" x2="21" y2="10"/>' +
          '</svg>' +
          escapeHtml(art.date) +
        '</span>' +
        '<span>' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>' +
            '<circle cx="12" cy="12" r="3"/>' +
          '</svg>' +
          art.reads.toLocaleString() + ' 阅读' +
        '</span>' +
        '<span style="margin-left:auto">' + escapeHtml(art.source) + '</span>' +
      '</div>' +
    '</article>';
  }

  function renderArticles() {
    var gridEl = document.getElementById('pufa-article-grid');
    if (!gridEl) return;
    gridEl.innerHTML = articles.map(articleCardHTML).join('');

    /* 绑定文章卡片点击事件 */
    gridEl.querySelectorAll('.pufa-article-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var articleId = card.getAttribute('data-article-id');
        var art = articles.find(function (a) { return 'a' + a.id === articleId; });
        trackPufaVisit({ action: 'article_click', articleId: articleId, title: art ? art.title : '' });
        openResourceModal(articleId, art ? art.title : '');
      });
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ===== DOM Ready ===== */
  /** 管理端/大屏统计（附加，不影响页面展示与数据） */
  function trackPufaVisit(extra) {
    extra = extra || {};
    try {
      fetch('http://localhost:3002/api/admin/track/visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ page: 'pufa' }, extra))
      }).catch(function () {});
    } catch (e) { /* ignore */ }

    if (window.FayiPufaStats && FayiPufaStats.increaseReadCount) {
      if (extra.action === 'article_click') {
        FayiPufaStats.increaseReadCount({
          kind: 'article',
          title: extra.title || '',
          category: extra.category || extra.title || '',
          articleId: extra.articleId || ''
        });
      } else if (extra.action === 'video_click') {
        FayiPufaStats.increaseReadCount({
          kind: 'video',
          title: extra.title || '',
          category: extra.category || extra.title || ''
        });
      } else if (!extra.action) {
        FayiPufaStats.increaseReadCount({ kind: 'page', title: '普法宣传' });
      }
    }

    if (!window.FayiActivity || !extra.action) return;
    if (extra.action === 'article_click' && extra.title) {
      FayiActivity.addActivityLog({
        type: 'pufa',
        title: '阅读《' + FayiActivity.truncate(extra.title, 28) + '》',
        description: '浏览普法文章内容',
        link: 'pufa.html'
      });
    } else if (extra.action === 'video_click' && extra.title) {
      FayiActivity.addActivityLog({
        type: 'pufa',
        title: '观看《' + FayiActivity.truncate(extra.title, 28) + '》',
        description: '观看普法视频',
        link: 'pufa.html'
      });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!window.FayiAuth || !FayiAuth.getCurrentUser()) return;
    trackPufaVisit();
    render();
    renderArticles();

    /* ===== Tab 切换逻辑 ===== */
    document.querySelectorAll('.pufa-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        /* 更新 Tab 按钮状态 */
        document.querySelectorAll('.pufa-tab').forEach(function (t) {
          t.classList.remove('active');
        });
        tab.classList.add('active');

        /* 切换内容区 */
        var type = tab.getAttribute('data-tab');
        document.querySelectorAll('.pufa-tab-content').forEach(function (c) {
          c.classList.remove('active');
        });
        var target = document.getElementById(
          type === 'video' ? 'video-content' : 'article-content'
        );
        if (target) target.classList.add('active');
      });
    });

    /* 资源面板关闭事件 */
    var resModal   = document.getElementById('pufa-res-modal');
    var resOverlay = document.getElementById('pufa-res-overlay');
    var resClose   = document.getElementById('pufa-res-close');

    if (resClose) {
      resClose.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        closeResourceModal();
      });
    }

    if (resOverlay) {
      resOverlay.addEventListener('click', closeResourceModal);
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (resModal && resModal.style.display !== 'none') {
          closeResourceModal();
        }
      }
    });

    /* 视频弹窗关闭事件 */
    var modal    = document.getElementById('pufa-video-modal');
    var closeBtn = document.getElementById('pufa-modal-close');
    var overlay  = document.getElementById('pufa-modal-overlay');

    if (closeBtn) {
      closeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        closeVideoModal();
      });
    }

    /* 点击遮罩关闭 */
    if (overlay) {
      overlay.addEventListener('click', function () {
        closeVideoModal();
      });
    }

    /* ESC 键关闭 */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal && modal.style.display !== 'none') {
        closeVideoModal();
      }
    });
  });

})();

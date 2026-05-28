/**
 * 普法运营 · 接口不可用时的客户端数据聚合
 */
window.OpsOperationFallback = (function () {
  function consultsToHotIssues(list, limit) {
    var map = {};
    (list || []).forEach(function (c) {
      var q = String(c.question || c.title || '').trim();
      if (q.length < 4) return;
      var key = q.slice(0, 80);
      if (!map[key]) {
        map[key] = {
          id: c.id || ('hot_' + key.slice(0, 8)),
          title: key.length > 48 ? key.slice(0, 48) + '…' : key,
          fullTitle: key,
          count: 0,
          riskLevel: c.riskLevel || 'mid',
          relatedRegulations: '相关法律法规'
        };
      }
      map[key].count++;
    });
    return Object.keys(map)
      .map(function (k) { return map[k]; })
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, limit || 15)
      .map(function (item, idx) {
        return Object.assign({}, item, { rank: idx + 1 });
      });
  }

  function articlesToContentStats(articles) {
    return (articles || []).map(function (a) {
      return {
        id: a.id,
        title: a.title || '未命名',
        reads: a.reads || a.viewCount || 0,
        shares: Math.round((a.likes || 0) * 0.2),
        avgDwellSec: 30 + Math.min(120, Math.round((a.reads || 0) / 50)),
        bounceRate: 28,
        path: 'law-education.html?id=' + encodeURIComponent(a.id || '')
      };
    }).sort(function (x, y) { return (y.reads || 0) - (x.reads || 0); }).slice(0, 20);
  }

  function buildFunnelFromOverview(ov) {
    ov = ov || {};
    var steps = [
      { key: 'pufa', label: '访问普法内容', count: Math.max(ov.pufaContentReads || 0, 1) },
      { key: 'consult', label: '法律咨询', count: ov.consultConversions || 0 },
      { key: 'ocr', label: 'OCR识别', count: ov.ocrUsageCount || 0 },
      { key: 'document', label: '文书生成', count: ov.documentConversions || 0 },
      { key: 'regulation', label: '法规引用', count: ov.faguiToday || 0 }
    ];
    var prev = steps[0].count || 1;
    return {
      steps: steps.map(function (s, i) {
        var rate = i === 0 ? 100 : (prev > 0 ? Math.round((s.count / prev) * 1000) / 10 : 0);
        var dropoff = i === 0 ? 0 : Math.max(0, Math.round((100 - rate) * 10) / 10);
        if (i > 0) prev = s.count || prev;
        return Object.assign({}, s, {
          conversionRate: i === 0 ? 100 : rate,
          overallRate: steps[0].count > 0 ? Math.round((s.count / steps[0].count) * 1000) / 10 : 0,
          dropoffRate: dropoff
        });
      }),
      updatedAt: new Date().toISOString(),
      source: 'client-fallback'
    };
  }

  function buildChannelsFromSnap(snap) {
    var usage = (snap && snap.moduleUsage) || [];
    if (usage.length) {
      var total = usage.reduce(function (s, u) { return s + (u.value || 0); }, 0) || 1;
      return usage.slice(0, 5).map(function (u) {
        return {
          key: u.module || u.name,
          label: u.label || u.module || '其他',
          value: u.value || 0,
          percent: Math.round(((u.value || 0) / total) * 1000) / 10
        };
      });
    }
    return [
      { key: 'web', label: 'Web端', value: 55, percent: 55 },
      { key: 'internal', label: '内部跳转', value: 30, percent: 30 },
      { key: 'search', label: '搜索引擎', value: 15, percent: 15 }
    ];
  }

  function overviewFromStats(stats, publicity) {
    stats = stats || {};
    publicity = publicity || {};
    return {
      todayVisits: stats.todayVisits || stats.pageViewsToday || 0,
      pufaContentReads: publicity.todayReadCount || publicity.todayReads || stats.pufaReadsToday || 0,
      consultConversions: stats.consultToday || 0,
      documentConversions: stats.documentToday || stats.wenshiToday || 0,
      ocrUsageCount: stats.ocrToday || 0,
      dau: stats.todayActive || stats.onlineUsers || 0,
      faguiToday: stats.faguiToday || 0,
      updatedAt: new Date().toISOString(),
      sources: { fallback: 'realtime-stats' }
    };
  }

  function topQuestionsToHot(list, limit) {
    return (list || []).slice(0, limit || 15).map(function (q, idx) {
      var text = q.question || q.name || q.keyword || '';
      return {
        id: 'tq_' + idx,
        title: text.length > 48 ? text.slice(0, 48) + '…' : text,
        fullTitle: text,
        count: q.count || 1,
        rank: idx + 1,
        riskLevel: 'mid',
        relatedRegulations: '相关法律法规'
      };
    });
  }

  function buildFromSnap(snap) {
    snap = snap || {};
    var stats = snap.stats || {};
    var overview = overviewFromStats(stats, snap.publicity);
    var consultList = (snap.consultations && snap.consultations.list) || [];
    var articles = (snap.lawEducation && snap.lawEducation.articles) || [];
    var hot = consultsToHotIssues(consultList, 15);
    if (!hot.length && snap.topQuestions && snap.topQuestions.length) {
      hot = topQuestionsToHot(snap.topQuestions, 15);
    }
    if (!hot.length && snap.keywords && snap.keywords.length) {
      hot = snap.keywords.slice(0, 10).map(function (k, idx) {
        return {
          id: 'kw_' + idx,
          title: k.name || k.keyword || '',
          fullTitle: k.name || '',
          count: k.value || 1,
          rank: idx + 1,
          riskLevel: 'mid',
          relatedRegulations: '相关法律法规'
        };
      });
    }
    return {
      overview: overview,
      funnel: buildFunnelFromOverview(overview),
      hotIssues: hot,
      contentStats: articlesToContentStats(articles),
      channelStats: buildChannelsFromSnap(snap),
      updatedAt: new Date().toISOString(),
      _fallback: true
    };
  }

  return {
    buildFromSnap: buildFromSnap,
    consultsToHotIssues: consultsToHotIssues,
    articlesToContentStats: articlesToContentStats
  };
})();

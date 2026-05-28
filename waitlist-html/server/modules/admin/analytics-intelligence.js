/**
 * 法律业务 AI 分析中台 · 关联 / 预测 / 异常 / 解读
 */
const dataDb = require('./admin-data-db');
const analytics = require('./analytics-engine');

let riskCenter = null;
try { riskCenter = require('./risk-center'); } catch (e) { /* */ }

function dayStr(d) {
  return (d || new Date()).toISOString().slice(0, 10);
}

function sumCounts(rows, key) {
  return (rows || []).reduce(function (s, r) {
    return s + (r[key] != null ? r[key] : 0);
  }, 0);
}

function linearForecast(series, futureDays) {
  futureDays = futureDays || 7;
  const pts = (series || []).filter(function (p) {
    return p && p.count != null;
  });
  const n = pts.length;
  if (n < 2) {
    const last = n ? pts[n - 1].count : 0;
    const out = [];
    for (let i = 1; i <= futureDays; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      out.push({ date: dayStr(d), count: Math.max(0, Math.round(last)), predicted: true });
    }
    return out;
  }
  let sumX = 0; let sumY = 0; let sumXY = 0; let sumX2 = 0;
  for (let i = 0; i < n; i++) {
    const x = i;
    const y = pts[i].count;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }
  const denom = n * sumX2 - sumX * sumX;
  const slope = denom ? (n * sumXY - sumX * sumY) / denom : 0;
  const intercept = (sumY - slope * sumX) / n;
  const out = [];
  for (let j = 1; j <= futureDays; j++) {
    const d = new Date();
    d.setDate(d.getDate() + j);
    const yHat = Math.max(0, Math.round(intercept + slope * (n - 1 + j)));
    out.push({ date: dayStr(d), count: yHat, predicted: true });
  }
  return out;
}

function buildCorrelation() {
  const consults = dataDb.listConsult({});
  const docs = dataDb.listDocumentGenerate({});
  const ocr = dataDb.readOcrRecords();
  const behaviors = dataDb.listBehavior({ limit: 8000 });

  let consultToDoc = 0;
  const consultByUser = {};
  consults.forEach(function (c) {
    if (!c.userId || c.userId === 'guest') return;
    if (!consultByUser[c.userId]) consultByUser[c.userId] = [];
    consultByUser[c.userId].push(new Date(c.createdAt || 0).getTime());
  });
  docs.forEach(function (d) {
    const uid = d.userId;
    if (!uid || !consultByUser[uid]) return;
    const t = new Date(d.createdAt || 0).getTime();
    const matched = consultByUser[uid].some(function (ct) {
      return t >= ct && t - ct < 7 * 24 * 60 * 60 * 1000;
    });
    if (matched) consultToDoc++;
  });

  const consultTotal = consults.length || 1;
  const docTotal = docs.length || 1;
  const consultOnly = Math.max(0, consultTotal - consultToDoc);

  let ocrToReg = 0;
  let ocrTotal = ocr.length || 1;
  const ocrUsers = {};
  ocr.forEach(function (r) {
    if (r.userId) ocrUsers[r.userId] = true;
  });
  behaviors.forEach(function (b) {
    if ((b.module === 'regulation' || b.action === 'ai_fagui') && b.userId && ocrUsers[b.userId]) {
      ocrToReg++;
    }
  });
  const ocrNoReg = Math.max(0, ocrTotal - ocrToReg);

  const riskByType = {};
  const consultCat = {};
  let risks = [];
  if (riskCenter && riskCenter.collectAllRisks) {
    risks = riskCenter.collectAllRisks();
  }
  risks.forEach(function (r) {
    const rt = r.riskType || r.type || 'consult';
    riskByType[rt] = (riskByType[rt] || 0) + 1;
    const cat = analytics.classifyCategory(r.content || r.title || '');
    consultCat[cat] = (consultCat[cat] || 0) + 1;
  });
  consults.forEach(function (c) {
    const cat = c.category || analytics.classifyCategory(c.question || '');
    consultCat[cat] = (consultCat[cat] || 0) + 1;
  });

  const sankeyNodes = [
    { name: '法律咨询' },
    { name: 'OCR识别' },
    { name: '法规检索' },
    { name: '文书生成' },
    { name: '法规引用' },
    { name: '风险处置' },
    { name: '未转化' }
  ];
  const sankeyLinks = [
    { source: '法律咨询', target: '文书生成', value: Math.max(1, consultToDoc) },
    { source: '法律咨询', target: '未转化', value: Math.max(1, consultOnly) },
    { source: 'OCR识别', target: '法规引用', value: Math.max(1, ocrToReg) },
    { source: 'OCR识别', target: '未转化', value: Math.max(1, ocrNoReg) },
    { source: '法规检索', target: '文书生成', value: Math.max(1, Math.round(docTotal * 0.35)) },
    { source: '法律咨询', target: '风险处置', value: Math.max(1, riskByType.consult || 0) }
  ];

  const graphNodes = [];
  const graphLinks = [];
  const typeLabels = {
    consult: '咨询风险',
    ocr: 'OCR风险',
    document: '文书风险',
    regulation: '法规风险',
    behavior: '行为风险'
  };
  Object.keys(riskByType).forEach(function (k, i) {
    graphNodes.push({
      id: 'risk_' + k,
      name: typeLabels[k] || k,
      category: 0,
      symbolSize: 28 + Math.min(20, riskByType[k])
    });
  });
  Object.keys(consultCat).sort(function (a, b) {
    return consultCat[b] - consultCat[a];
  }).slice(0, 6).forEach(function (cat, i) {
    graphNodes.push({
      id: 'cat_' + cat,
      name: analytics.categoryLabel(cat),
      category: 1,
      symbolSize: 24 + Math.min(16, consultCat[cat])
    });
    Object.keys(riskByType).forEach(function (rk) {
      if ((rk === 'consult' && cat !== 'other') || (rk === 'ocr' && cat === 'contract')) {
        graphLinks.push({
          source: 'risk_' + rk,
          target: 'cat_' + cat,
          value: Math.max(1, Math.round((riskByType[rk] + consultCat[cat]) / 4))
        });
      }
    });
  });

  const lawHot = {};
  consults.forEach(function (c) {
    const cat = analytics.classifyCategory(c.question || '');
    lawHot[cat] = (lawHot[cat] || 0) + 1;
  });

  return {
    metrics: {
      consultToDocumentRate: Math.round((consultToDoc / consultTotal) * 1000) / 10,
      ocrToRegulationRate: Math.round((ocrToReg / ocrTotal) * 1000) / 10,
      consultToDocCount: consultToDoc,
      ocrToRegCount: ocrToReg
    },
    sankey: { nodes: sankeyNodes, links: sankeyLinks },
    graph: { nodes: graphNodes, links: graphLinks },
    lawConsultMatch: Object.keys(lawHot).map(function (k) {
      return {
        category: analytics.categoryLabel(k),
        consultCount: lawHot[k],
        riskCount: consultCat[k] || 0
      };
    }).sort(function (a, b) { return b.consultCount - a.consultCount; }).slice(0, 8)
  };
}

function buildPrediction(dashboard) {
  const consultTrend = dashboard.consultTrend || [];
  const docTrend = buildDailyCounts(
    dataDb.listDocumentGenerate({}),
    (dashboard.consultTrend || []).map(function (x) { return x.date; })
  );
  const riskTrend = buildDailyRiskCounts(
    (dashboard.consultTrend || []).map(function (x) { return x.date; })
  );

  return {
    consultForecast: linearForecast(consultTrend, 7),
    documentForecast: linearForecast(docTrend, 7),
    riskForecast: linearForecast(riskTrend, 7),
    method: 'linear_regression',
    horizonDays: 7
  };
}

function buildDailyCounts(records, dateKeys) {
  const map = {};
  (dateKeys || []).forEach(function (d) { map[d] = 0; });
  (records || []).forEach(function (r) {
    const d = String(r.createdAt || '').slice(0, 10);
    if (map[d] != null) map[d]++;
    else map[d] = 1;
  });
  return Object.keys(map).sort().map(function (date) {
    return { date: date, count: map[date] || 0 };
  });
}

function buildDailyRiskCounts(dateKeys) {
  let list = [];
  if (riskCenter && riskCenter.collectAllRisks) {
    list = riskCenter.collectAllRisks();
  }
  const map = {};
  (dateKeys || []).forEach(function (d) { map[d] = 0; });
  list.forEach(function (r) {
    const d = String(r.createdAt || '').slice(0, 10);
    if (map[d] != null) map[d]++;
  });
  return Object.keys(map).sort().map(function (date) {
    return { date: date, count: map[date] || 0 };
  });
}

function buildAnomaly(dashboard) {
  const anomalies = [];
  const trend = dashboard.consultTrend || [];
  const n = trend.length;
  if (n >= 14) {
    const last7 = sumCounts(trend.slice(-7), 'count');
    const prev7 = sumCounts(trend.slice(-14, -7), 'count');
    if (prev7 > 0) {
      const chg = (last7 - prev7) / prev7;
      if (chg >= 0.25) {
        anomalies.push({
          type: 'consult_spike',
          description: '近7日咨询量较前一周期上升 ' + Math.round(chg * 100) + '%，可能存在热点事件或推广引流',
          severity: chg >= 0.5 ? 'high' : 'medium',
          time: trend[n - 1].date,
          module: 'consult',
          link: 'consultations.html'
        });
      } else if (chg <= -0.25) {
        anomalies.push({
          type: 'consult_drop',
          description: '近7日咨询量下降 ' + Math.round(Math.abs(chg) * 100) + '%，建议检查入口曝光与用户活跃',
          severity: 'medium',
          time: trend[n - 1].date,
          module: 'consult',
          link: 'consultations.html'
        });
      }
    }
  }

  const ocrDist = dashboard.ocrConfidenceDistribution || [];
  const lowBucket = ocrDist.find(function (x) { return x.range === '0-0.6'; });
  const totalOcr = sumCounts(ocrDist, 'value');
  if (lowBucket && totalOcr > 5) {
    const rate = lowBucket.value / totalOcr;
    if (rate >= 0.2) {
      anomalies.push({
        type: 'ocr_quality',
        description: 'OCR 低置信度（<0.6）占比 ' + Math.round(rate * 100) + '%，可能与图片清晰度或拍摄角度有关',
        severity: rate >= 0.35 ? 'high' : 'medium',
        time: dayStr(new Date()),
        module: 'ocr',
        link: 'ocr.html'
      });
    }
  }

  const risks = dashboard.riskLevelDistribution || [];
  const high = risks.find(function (x) { return x.level === 'high'; });
  const totalRisk = sumCounts(risks, 'value');
  if (high && totalRisk > 3 && high.value / totalRisk >= 0.35) {
    anomalies.push({
      type: 'risk_surge',
      description: '高风险事件占比 ' + Math.round((high.value / totalRisk) * 100) + '%，建议优先处理待办风险',
      severity: 'high',
      time: dayStr(new Date()),
      module: 'risk',
      link: 'risks.html'
    });
  }

  const docs = dataDb.listDocumentGenerate({});
  const failed = docs.filter(function (d) {
    return d.status === 'failed' || d.status === 'error';
  }).length;
  if (docs.length >= 5 && failed / docs.length >= 0.15) {
    anomalies.push({
      type: 'document_fail',
      description: '文书生成失败率 ' + Math.round((failed / docs.length) * 100) + '%，请检查 AI 服务与模板配置',
      severity: 'medium',
      time: dayStr(new Date()),
      module: 'document',
      link: 'documents.html'
    });
  }

  const peak = findPeakDay(trend);
  if (peak && peak.count >= 3) {
    anomalies.push({
      type: 'consult_peak',
      description: '咨询峰值出现在 ' + peak.date + '（' + peak.count + ' 次），可作为运营复盘点',
      severity: 'low',
      time: peak.date,
      module: 'consult',
      link: 'consultations.html?date=' + encodeURIComponent(peak.date)
    });
  }

  return anomalies.sort(function (a, b) {
    const order = { high: 0, medium: 1, low: 2 };
    return (order[a.severity] || 9) - (order[b.severity] || 9);
  });
}

function findPeakDay(trend) {
  let best = null;
  (trend || []).forEach(function (p) {
    if (!best || p.count > best.count) best = p;
  });
  return best;
}

function buildInsight(dashboard, correlation, anomaly, prediction) {
  const insights = [];
  const suggestions = [];
  const trend = dashboard.consultTrend || [];
  const ov = dashboard.overview || {};

  if (trend.length >= 14) {
    const last7 = sumCounts(trend.slice(-7), 'count');
    const prev7 = sumCounts(trend.slice(-14, -7), 'count');
    if (prev7 > 0) {
      const pct = Math.round(((last7 - prev7) / prev7) * 100);
      if (pct > 0) {
        insights.push('近7日法律咨询量较前一周期上升 ' + pct + '%，平台咨询活跃度提升。');
      } else if (pct < 0) {
        insights.push('近7日法律咨询量较前一周期下降 ' + Math.abs(pct) + '%，需关注流量来源与用户留存。');
      }
    }
  }

  const topLaw = (dashboard.lawCategoryHotspot || [])[0];
  if (topLaw && topLaw.count > 0) {
    insights.push('法规/咨询热点集中在「' + topLaw.category + '」领域（' + topLaw.count + ' 次相关记录）。');
  }

  const topDoc = (dashboard.documentTypeDistribution || [])[0];
  if (topDoc && topDoc.value > 0) {
    insights.push('文书生成以「' + topDoc.type + '」为主（' + topDoc.value + ' 份），可针对性优化模板与示例。');
  }

  if (correlation && correlation.metrics) {
    const rate = correlation.metrics.consultToDocumentRate;
    insights.push('咨询→文书转化率约 ' + rate + '%（7日内同用户关联估算）。');
    if (rate < 15) {
      suggestions.push('在咨询结果页增加「一键生成文书」引导，提升转化。');
    }
    if (correlation.metrics.ocrToRegulationRate < 20) {
      suggestions.push('OCR 识别后推荐相关法规条文，提高法规引用率。');
    }
  }

  (anomaly || []).slice(0, 4).forEach(function (a) {
    insights.push('【' + (a.severity === 'high' ? '重要' : '提示') + '】' + a.description);
  });

  const fc = (prediction && prediction.consultForecast) || [];
  if (fc.length >= 2) {
    const avg = fc.reduce(function (s, x) { return s + x.count; }, 0) / fc.length;
    suggestions.push('预测未来7日日均咨询约 ' + Math.round(avg) + ' 次，可提前安排值班与 AI 算力。');
  }

  if (!suggestions.length) {
    suggestions.push('保持现有运营节奏，持续监控风险预警与 OCR 质量指标。');
    suggestions.push('建议每周复盘咨询热点，更新普法内容与文书模板。');
  }

  const summary = insights.length
    ? insights[0] + (insights.length > 1 ? ' 另有 ' + (insights.length - 1) + ' 条洞察详见下方。' : '')
    : '当前数据平稳，未发现显著异常波动，各模块运行正常。';

  return {
    summary: summary,
    insights: insights,
    suggestions: suggestions,
    generatedAt: new Date().toISOString(),
    engine: 'rule_analytics_v1'
  };
}

function buildChartInsights(dashboard, anomaly) {
  const byChart = {};
  const trend = dashboard.consultTrend || [];
  if (trend.length >= 7) {
    const last = sumCounts(trend.slice(-7), 'count');
    const prev = sumCounts(trend.slice(-14, -7), 'count');
    const pct = prev ? Math.round(((last - prev) / prev) * 100) : 0;
    byChart.consult = '近7日咨询 ' + last + ' 次，环比' + (pct >= 0 ? '+' : '') + pct + '%。';
  }
  const doc0 = (dashboard.documentTypeDistribution || [])[0];
  if (doc0) {
    byChart.document = '主力文书类型为「' + doc0.type + '」，占比最高。';
  }
  const ocrLow = (dashboard.ocrConfidenceDistribution || []).find(function (x) {
    return x.range === '0-0.6';
  });
  if (ocrLow) {
    byChart.ocr = '低置信度 OCR 占 ' + ocrLow.value + ' 次，建议优化上传引导。';
  }
  const riskH = (dashboard.riskLevelDistribution || []).find(function (x) {
    return x.level === 'high';
  });
  if (riskH) {
    byChart.risk = '高风险事件 ' + riskH.value + ' 条，需优先跟进。';
  }
  const law0 = (dashboard.lawCategoryHotspot || [])[0];
  if (law0) {
    byChart.law = '「' + law0.category + '」类咨询/法规检索最活跃。';
  }
  const peak = findPeakDay(trend);
  byChart.markPoints = (anomaly || []).filter(function (a) {
    return a.time && a.type.indexOf('consult') >= 0;
  }).map(function (a) {
    return { date: a.time, label: '异常', severity: a.severity };
  });
  if (peak) {
    byChart.markPoints = byChart.markPoints || [];
    byChart.markPoints.push({ date: peak.date, label: '峰值', severity: 'low' });
  }
  return byChart;
}

module.exports = {
  buildCorrelation: buildCorrelation,
  buildPrediction: buildPrediction,
  buildAnomaly: buildAnomaly,
  buildInsight: buildInsight,
  buildChartInsights: buildChartInsights,
  linearForecast: linearForecast
};

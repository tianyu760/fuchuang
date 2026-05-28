/**
 * 法绎运营后台 · ECharts 商务法律主题
 */
window.OpsCharts = (function () {
  var C = {
    text: '#64748b',
    title: '#e2e8f0',
    line: 'rgba(255,255,255,0.08)',
    accent: '#2855ff',
    success: '#22c55e',
    risk: '#fb7185',
    cyan: '#38bdf8',
    gold: '#fbbf24',
    palette: ['#2855ff', '#38bdf8', '#22c55e', '#fbbf24', '#fb7185', '#64748b']
  };

  function base() {
    return {
      backgroundColor: 'transparent',
      color: C.palette,
      textStyle: { color: C.text, fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif' },
      animationDuration: 1000,
      animationEasing: 'cubicOut',
      animationDurationUpdate: 800,
      emphasis: {
        focus: 'series',
        scale: true,
        scaleSize: 6
      }
    };
  }

  function axis() {
    return {
      axisLine: { lineStyle: { color: C.line } },
      axisLabel: { color: C.text, fontSize: 11 },
      splitLine: { lineStyle: { color: C.line, type: 'dashed' } }
    };
  }

  function tip(axis) {
    return {
      trigger: axis ? 'axis' : 'item',
      backgroundColor: 'rgba(15, 23, 42, 0.96)',
      borderColor: 'rgba(255,255,255,0.1)',
      textStyle: { color: C.title, fontSize: 12 },
      extraCssText: 'border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.45);backdrop-filter:blur(8px);padding:8px 12px'
    };
  }

  function mount(el, option, registry) {
    if (!window.echarts || !el) return null;
    var ch = echarts.init(el);
    ch.setOption(Object.assign(base(), option), { notMerge: true });
    if (registry) registry.push(ch);
    window.addEventListener('resize', function () { ch.resize(); });
    return ch;
  }

  function lineGrowth(labels, values) {
    return {
      tooltip: tip(true),
      grid: { left: 48, right: 20, top: 28, bottom: 32 },
      xAxis: Object.assign({ type: 'category', data: labels, boundaryGap: false }, axis()),
      yAxis: Object.assign({ type: 'value' }, axis()),
      series: [{
        type: 'line', smooth: true, symbol: 'circle', symbolSize: 6, data: values,
        lineStyle: { width: 2.5, color: C.accent },
        itemStyle: { color: C.accent },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(40, 85, 255, 0.28)' },
              { offset: 1, color: 'rgba(40, 85, 255, 0)' }
            ]
          }
        }
      }]
    };
  }

  function multiTrend(labels, series) {
    return {
      tooltip: tip(true),
      legend: { bottom: 0, textStyle: { color: C.text, fontSize: 11 } },
      grid: { left: 48, right: 20, top: 28, bottom: 48 },
      xAxis: Object.assign({ type: 'category', data: labels }, axis()),
      yAxis: Object.assign({ type: 'value' }, axis()),
      series: (series || []).map(function (s, i) {
        return {
          name: s.name, type: 'line', smooth: true, data: s.data,
          lineStyle: { width: 2, color: C.palette[i % C.palette.length] },
          itemStyle: { color: C.palette[i % C.palette.length] }
        };
      })
    };
  }

  function donut(categories) {
    var data = (categories || []).map(function (c, i) {
      return {
        name: c.label || c.name,
        value: c.value,
        itemStyle: { color: C.palette[i % C.palette.length] }
      };
    });
    if (!data.length) data = [{ name: '暂无数据', value: 1, itemStyle: { color: '#334155' } }];
    return {
      tooltip: tip(false),
      legend: { bottom: 0, textStyle: { color: C.text, fontSize: 11 } },
      series: [{
        type: 'pie', radius: ['42%', '68%'], center: ['50%', '45%'],
        padAngle: 2,
        itemStyle: { borderRadius: 6, borderColor: 'rgba(15,23,42,0.9)', borderWidth: 2 },
        label: { show: false },
        data: data
      }]
    };
  }

  function radar(risks) {
    var list = risks || [];
    var max = Math.max(10, list.reduce(function (m, r) { return Math.max(m, r.value); }, 0));
    return {
      tooltip: tip(false),
      radar: {
        indicator: list.map(function (r) { return { name: r.label, max: max }; }),
        axisName: { color: C.text },
        splitLine: { lineStyle: { color: C.line } },
        splitArea: { areaStyle: { color: ['rgba(30,41,59,0.5)', 'rgba(15,23,42,0.3)'] } }
      },
      series: [{
        type: 'radar',
        data: [{
          value: list.map(function (r) { return r.value; }),
          areaStyle: { color: 'rgba(40, 85, 255, 0.22)' },
          lineStyle: { color: C.accent, width: 2 },
          itemStyle: { color: C.success }
        }]
      }]
    };
  }

  function heatmap24(hours) {
    var data = (hours || []).map(function (v, h) { return [h, 0, v]; });
    return {
      tooltip: { position: 'top' },
      grid: { left: 40, right: 12, top: 16, bottom: 40 },
      xAxis: {
        type: 'category',
        data: (hours || []).map(function (_, i) { return i + '时'; }),
        axisLabel: { color: C.text, interval: 2 },
        splitArea: { show: true }
      },
      yAxis: { type: 'category', data: ['活跃'], axisLabel: { color: C.text } },
      visualMap: {
        min: 0,
        max: Math.max(1, Math.max.apply(null, hours || [1])),
        orient: 'horizontal', left: 'center', bottom: 0,
        inRange: { color: ['#0f172a', '#1e3a5f', '#2855ff', '#38bdf8'] },
        textStyle: { color: C.text }
      },
      series: [{ type: 'heatmap', data: data, label: { show: false } }]
    };
  }

  function barV(items, opts) {
    opts = opts || {};
    var labels = (items || []).map(function (x) { return x.label || x.name || x.range || x.type; });
    var values = (items || []).map(function (x) { return x.value != null ? x.value : x.count; });
    return {
      tooltip: tip(true),
      grid: { left: 44, right: 16, top: 24, bottom: 28 },
      xAxis: Object.assign({ type: 'category', data: labels }, axis()),
      yAxis: Object.assign({ type: 'value', name: opts.yName || '' }, axis()),
      series: [{
        type: 'bar',
        data: values,
        barWidth: opts.barWidth || 28,
        itemStyle: {
          borderRadius: [4, 4, 0, 0],
          color: opts.color || C.cyan
        }
      }]
    };
  }

  function barH(items) {
    var labels = (items || []).map(function (x) { return x.label; }).reverse();
    var values = (items || []).map(function (x) { return x.value; }).reverse();
    return {
      tooltip: tip(true),
      grid: { left: 88, right: 20, top: 12, bottom: 20 },
      xAxis: Object.assign({ type: 'value' }, axis()),
      yAxis: Object.assign({ type: 'category', data: labels }, axis()),
      series: [{
        type: 'bar', data: values, barWidth: 14,
        itemStyle: {
          borderRadius: [0, 6, 6, 0],
          color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
            colorStops: [{ offset: 0, color: '#1e3a5f' }, { offset: 1, color: C.accent }] }
        }
      }]
    };
  }

  function areaDwell(labels, values) {
    return {
      tooltip: tip(true),
      grid: { left: 44, right: 16, top: 24, bottom: 28 },
      xAxis: Object.assign({ type: 'category', data: labels, boundaryGap: false }, axis()),
      yAxis: Object.assign({ type: 'value', name: '秒' }, axis()),
      series: [{
        type: 'line', smooth: true, data: values,
        lineStyle: { color: C.success, width: 2 },
        areaStyle: {
          color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: 'rgba(34,197,94,0.22)' }, { offset: 1, color: 'rgba(34,197,94,0)' }] }
        },
        itemStyle: { color: C.success }
      }]
    };
  }

  function wordCloud(words) {
    var data = (words || []).slice(0, 40).map(function (w) {
      return { name: String(w.name || '').trim(), value: Math.max(1, w.value || 1) };
    }).filter(function (w) { return w.name.length >= 2; });
    if (!data.length) data = [{ name: '暂无关键词', value: 1 }];
    var classes = echarts.ComponentModel && echarts.ComponentModel.getClasses && echarts.ComponentModel.getClasses();
    if (classes && classes['series.wordCloud']) {
      return {
        tooltip: tip(false),
        series: [{
          type: 'wordCloud', shape: 'circle', width: '90%', height: '88%',
          sizeRange: [12, 44], rotationRange: [-15, 15], gridSize: 8,
          textStyle: {
            fontWeight: 600,
            color: function (p) { return C.palette[(p.dataIndex || 0) % C.palette.length]; }
          },
          data: data
        }]
      };
    }
    return barH(data.map(function (d) { return { label: d.name, value: d.value }; }).slice(0, 12));
  }

  function lineGrowthMarked(labels, values, markPoints) {
    var marks = (markPoints || []).map(function (m) {
      var idx = labels.indexOf(String(m.date || '').slice(5));
      if (idx < 0) {
        idx = labels.findIndex(function (lb) { return lb === m.date; });
      }
      if (idx < 0) return null;
      return {
        name: m.label || '标记',
        coord: [labels[idx], values[idx]],
        value: values[idx],
        itemStyle: {
          color: m.severity === 'high' ? C.risk : m.severity === 'medium' ? C.gold : C.cyan
        }
      };
    }).filter(Boolean);
    var opt = lineGrowth(labels, values);
    opt.series[0].markPoint = {
      symbol: 'pin',
      symbolSize: 42,
      label: { fontSize: 10, color: '#fff' },
      data: marks
    };
    return opt;
  }

  function sankey(data) {
    data = data || {};
    return {
      tooltip: tip(false),
      series: [{
        type: 'sankey',
        layout: 'none',
        emphasis: { focus: 'adjacency' },
        data: data.nodes || [],
        links: (data.links || []).map(function (l) {
          return { source: l.source, target: l.target, value: Math.max(1, l.value || 1) };
        }),
        lineStyle: { color: 'gradient', curveness: 0.5 },
        label: { color: C.title, fontSize: 11 }
      }]
    };
  }

  function relationGraph(data) {
    data = data || {};
    var nodes = (data.nodes || []).map(function (n) {
      return {
        id: n.id,
        name: n.name,
        symbolSize: n.symbolSize || 28,
        category: n.category || 0,
        itemStyle: { color: C.palette[(n.category || 0) % C.palette.length] }
      };
    });
    var links = (data.links || []).map(function (l) {
      return {
        source: l.source,
        target: l.target,
        value: l.value || 1,
        lineStyle: { opacity: 0.6 }
      };
    });
    return {
      tooltip: tip(false),
      legend: { show: false },
      series: [{
        type: 'graph',
        layout: 'force',
        roam: true,
        draggable: true,
        force: { repulsion: 120, edgeLength: 80 },
        categories: [{ name: '风险' }, { name: '咨询' }],
        data: nodes,
        links: links,
        label: { show: true, color: C.title, fontSize: 10 },
        lineStyle: { color: 'rgba(148,163,184,0.45)' }
      }]
    };
  }

  function forecastTrend(historical, forecast, name) {
    name = name || '预测';
    var histLabels = (historical || []).map(function (x) {
      return String(x.date || '').slice(5);
    });
    var histValues = (historical || []).map(function (x) { return x.count || 0; });
    var fcLabels = (forecast || []).map(function (x) {
      return String(x.date || '').slice(5);
    });
    var fcValues = (forecast || []).map(function (x) { return x.count || 0; });
    var labels = histLabels.concat(fcLabels);
    var actual = histValues.concat(fcLabels.map(function () { return null; }));
    var pred = histValues.map(function () { return null; }).concat(fcValues);
    if (histValues.length) pred[histValues.length - 1] = histValues[histValues.length - 1];
    return multiTrend(labels, [
      { name: '历史', data: actual },
      { name: name, data: pred }
    ]);
  }

  return {
    mount: mount,
    lineGrowth: lineGrowth,
    lineGrowthMarked: lineGrowthMarked,
    sankey: sankey,
    relationGraph: relationGraph,
    forecastTrend: forecastTrend,
    multiTrend: multiTrend,
    donut: donut,
    radar: radar,
    heatmap24: heatmap24,
    barH: barH,
    barV: barV,
    areaDwell: areaDwell,
    wordCloud: wordCloud
  };
})();

/**
 * 法绎管理端 · ECharts 深色科技主题（V4）
 */
window.AdminChartsTheme = (function () {
  var C = {
    bg: 'transparent',
    text: '#8b9dc3',
    textBright: '#e8eef8',
    line: 'rgba(91, 140, 255, 0.12)',
    cyan: '#00d2ff',
    green: '#00ffa3',
    blue: '#5b8cff',
    violet: '#7c9cff',
    amber: '#fbbf24',
    red: '#f87171'
  };

  var PALETTE = [C.cyan, C.blue, C.green, C.violet, C.amber, C.red];

  var GRAD_CYAN = {
    type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
    colorStops: [
      { offset: 0, color: 'rgba(0, 210, 255, 0.5)' },
      { offset: 1, color: 'rgba(0, 210, 255, 0.02)' }
    ]
  };

  function base() {
    return {
      backgroundColor: C.bg,
      color: PALETTE,
      textStyle: {
        color: C.text,
        fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif'
      },
      animationDuration: 1000,
      animationEasing: 'cubicOut'
    };
  }

  function axis() {
    return {
      axisLine: { lineStyle: { color: C.line } },
      axisLabel: { color: C.text, fontSize: 11 },
      splitLine: { lineStyle: { color: C.line, type: 'dashed' } }
    };
  }

  function tooltip() {
    return {
      trigger: 'axis',
      backgroundColor: 'rgba(8, 16, 40, 0.94)',
      borderColor: 'rgba(0, 210, 255, 0.25)',
      textStyle: { color: C.textBright, fontSize: 12 },
      extraCssText: 'box-shadow: 0 8px 32px rgba(0,0,0,.5); border-radius: 12px; backdrop-filter: blur(8px);'
    };
  }

  function mount(dom, option, registry) {
    if (!window.echarts || !dom) return null;
    var chart = echarts.init(dom, 'dark', { renderer: 'canvas' });
    chart.setOption(Object.assign(base(), option), { notMerge: true });
    if (registry) registry.push(chart);
    var onResize = function () { chart.resize(); };
    window.addEventListener('resize', onResize);
    return chart;
  }

  function lineGrowth(labels, values, registry) {
    return {
      tooltip: tooltip(),
      grid: { left: 44, right: 20, top: 28, bottom: 28 },
      xAxis: Object.assign({ type: 'category', data: labels, boundaryGap: false }, axis()),
      yAxis: Object.assign({ type: 'value' }, axis()),
      series: [{
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        data: values,
        lineStyle: { width: 3, color: C.cyan, shadowColor: 'rgba(0, 210, 255, 0.45)', shadowBlur: 14 },
        itemStyle: { color: C.cyan, borderColor: '#fff', borderWidth: 1 },
        areaStyle: GRAD_CYAN
      }]
    };
  }

  function donut(categories, registry) {
    var data = (categories || []).map(function (c, i) {
      return {
        name: c.label || c.name,
        value: c.value,
        itemStyle: { color: PALETTE[i % PALETTE.length] }
      };
    });
    if (!data.length) data = [{ name: '暂无数据', value: 1, itemStyle: { color: '#1e3a5f' } }];
    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(8, 16, 40, 0.94)',
        borderColor: 'rgba(0, 210, 255, 0.2)',
        textStyle: { color: C.textBright }
      },
      series: [{
        type: 'pie',
        radius: ['46%', '72%'],
        center: ['50%', '52%'],
        padAngle: 2,
        itemStyle: { borderRadius: 6, borderColor: 'rgba(8, 16, 40, 0.85)', borderWidth: 2 },
        label: { color: C.textBright, fontSize: 11 },
        data: data
      }]
    };
  }

  function barH(items, registry) {
    var labels = (items || []).map(function (x) { return x.label; }).reverse();
    var values = (items || []).map(function (x) { return x.value; }).reverse();
    return {
      tooltip: tooltip(),
      grid: { left: 88, right: 24, top: 12, bottom: 20 },
      xAxis: Object.assign({ type: 'value' }, axis()),
      yAxis: Object.assign({ type: 'category', data: labels }, axis()),
      series: [{
        type: 'bar',
        data: values,
        barWidth: 14,
        itemStyle: {
          borderRadius: [0, 6, 6, 0],
          color: {
            type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
            colorStops: [
              { offset: 0, color: '#0b1739' },
              { offset: 1, color: C.cyan }
            ]
          }
        }
      }]
    };
  }

  function radar(risks) {
    var list = risks || [];
    var max = Math.max(10, list.reduce(function (m, r) { return Math.max(m, r.value); }, 0));
    return {
      tooltip: {},
      radar: {
        indicator: list.map(function (r) { return { name: r.label, max: max }; }),
        axisName: { color: C.text },
        splitLine: { lineStyle: { color: C.line } },
        splitArea: { areaStyle: { color: ['rgba(0, 210, 255, 0.06)', 'rgba(91, 140, 255, 0.03)'] } }
      },
      series: [{
        type: 'radar',
        data: [{
          value: list.map(function (r) { return r.value; }),
          areaStyle: { color: 'rgba(0, 210, 255, 0.2)' },
          lineStyle: { color: C.cyan, width: 2 },
          itemStyle: { color: C.green }
        }]
      }]
    };
  }

  function heatmap24(hours) {
    var data = [];
    (hours || []).forEach(function (v, h) {
      data.push([h, 0, v]);
    });
    return {
      tooltip: { position: 'top' },
      grid: { left: 40, right: 12, top: 20, bottom: 28 },
      xAxis: {
        type: 'category',
        data: hours.map(function (_, i) { return i + '时'; }),
        axisLabel: { color: C.text, interval: 2 },
        splitArea: { show: true }
      },
      yAxis: { type: 'category', data: ['活跃'], axisLabel: { color: C.text } },
      visualMap: {
        min: 0,
        max: Math.max(1, Math.max.apply(null, hours || [1])),
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        inRange: { color: ['#081028', '#0b1739', '#5b8cff', '#00d2ff'] },
        textStyle: { color: C.text }
      },
      series: [{
        type: 'heatmap',
        data: data,
        label: { show: false },
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,.4)' } }
      }]
    };
  }

  function areaDwell(labels, values) {
    return {
      tooltip: tooltip(),
      grid: { left: 44, right: 16, top: 24, bottom: 28 },
      xAxis: Object.assign({ type: 'category', data: labels, boundaryGap: false }, axis()),
      yAxis: Object.assign({ type: 'value', name: '秒' }, axis()),
      series: [{
        type: 'line',
        smooth: true,
        data: values,
        lineStyle: { color: C.green, width: 2 },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(0, 255, 163, 0.35)' },
              { offset: 1, color: 'rgba(0, 255, 163, 0)' }
            ]
          }
        },
        itemStyle: { color: C.green }
      }]
    };
  }

  function regionBar(items) {
    var labels = (items || []).map(function (x) { return x.label; });
    var values = (items || []).map(function (x) { return x.value; });
    return {
      tooltip: tooltip(),
      grid: { left: 48, right: 16, top: 16, bottom: 48 },
      xAxis: Object.assign({ type: 'category', data: labels, axisLabel: { rotate: 30 } }, axis()),
      yAxis: Object.assign({ type: 'value' }, axis()),
      series: [{
        type: 'bar',
        data: values,
        barWidth: 18,
        itemStyle: {
          borderRadius: [6, 6, 0, 0],
          color: {
            type: 'linear', x: 0, y: 1, x2: 0, y2: 0,
            colorStops: [
              { offset: 0, color: '#0b1739' },
              { offset: 1, color: C.blue }
            ]
          }
        }
      }]
    };
  }

  function funnel(stages) {
    return {
      tooltip: { trigger: 'item' },
      series: [{
        type: 'funnel',
        left: '12%',
        width: '76%',
        label: { color: C.textBright },
        data: (stages || []).map(function (s, i) {
          return {
            name: s.label,
            value: s.value,
            itemStyle: { color: PALETTE[i % PALETTE.length] }
          };
        })
      }]
    };
  }

  function adminTimeline(events) {
    var counts = {};
    (events || []).slice(0, 80).forEach(function (ev) {
      var t = ev.type || 'other';
      counts[t] = (counts[t] || 0) + 1;
    });
    var labels = Object.keys(counts);
    var values = labels.map(function (k) { return counts[k]; });
    if (!labels.length) {
      labels = ['暂无'];
      values = [0];
    }
    return {
      tooltip: tooltip(),
      grid: { left: 48, right: 16, top: 16, bottom: 56 },
      xAxis: Object.assign({ type: 'category', data: labels, axisLabel: { rotate: 28, fontSize: 10 } }, axis()),
      yAxis: Object.assign({ type: 'value' }, axis()),
      series: [{
        type: 'bar',
        data: values,
        barWidth: 16,
        itemStyle: {
          borderRadius: [4, 4, 0, 0],
          color: {
            type: 'linear', x: 0, y: 1, x2: 0, y2: 0,
            colorStops: [
              { offset: 0, color: '#11224d' },
              { offset: 1, color: C.green }
            ]
          }
        }
      }]
    };
  }

  function wordCloud(words) {
    var data = (words || []).slice(0, 24).map(function (w) {
      return { name: w.label || w.text, value: w.value || w.weight || 10 };
    });
    if (!data.length) data = [{ name: '暂无', value: 1 }];
    return {
      tooltip: {},
      series: [{
        type: 'pie',
        radius: ['30%', '75%'],
        roseType: 'area',
        itemStyle: { borderRadius: 4 },
        label: { color: C.textBright, fontSize: 10 },
        data: data.map(function (d, i) {
          return Object.assign({}, d, { itemStyle: { color: PALETTE[i % PALETTE.length] } });
        })
      }]
    };
  }

  return {
    C: C,
    mount: mount,
    lineGrowth: lineGrowth,
    donut: donut,
    barH: barH,
    radar: radar,
    heatmap24: heatmap24,
    areaDwell: areaDwell,
    regionBar: regionBar,
    funnel: funnel,
    wordCloud: wordCloud,
    adminTimeline: adminTimeline
  };
})();

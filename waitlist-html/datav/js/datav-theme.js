/**
 * 法绎数字大屏 · ECharts 商业主题
 */
(function (global) {
  global.FayiDatavTheme = {
    color: ['#4f9cf9', '#38bdf8', '#818cf8', '#2dd4bf', '#fbbf24', '#f472b6'],
    backgroundColor: 'transparent',
    textStyle: {
      color: '#8b9cb3',
      fontFamily: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
      fontSize: 11
    },
    title: { textStyle: { color: '#cbd5e1', fontWeight: 500 } },
    legend: { textStyle: { color: '#8b9cb3' }, itemWidth: 10, itemHeight: 10 },
    tooltip: {
      backgroundColor: 'rgba(12, 22, 42, 0.92)',
      borderColor: 'rgba(79, 156, 249, 0.35)',
      borderWidth: 1,
      textStyle: { color: '#e2e8f0', fontSize: 12 },
      extraCssText: 'backdrop-filter:blur(8px);border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,.35);'
    },
    categoryAxis: {
      axisLine: { lineStyle: { color: 'rgba(71, 85, 105, 0.5)' } },
      axisTick: { show: false },
      axisLabel: { color: '#64748b' },
      splitLine: { lineStyle: { color: 'rgba(51, 65, 85, 0.25)' } }
    },
    valueAxis: {
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#64748b' },
      splitLine: { lineStyle: { color: 'rgba(51, 65, 85, 0.2)', type: 'dashed' } }
    }
  };

  global.datavBaseGrid = function (overrides) {
    return Object.assign({ left: 48, right: 20, top: 36, bottom: 28, containLabel: true }, overrides || {});
  };
})(typeof window !== 'undefined' ? window : global);

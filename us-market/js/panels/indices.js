// panels/indices.js · 多指数宏观面板：VIX / 牛熊周期 / 长周期走势

import {
  CHART_FONT,
  AXIS_END_2028_TS,
  cssVar,
  formatNumber,
  formatPercent,
  formatCompactNumber,
  escapeHtml,
  buildRollingAnnualizedSeries,
  buildLogYoySeries,
} from '../utils.js';

import {
  registerChart,
  buildMetricCard,
  renderMetricStrip,
  getDataZoom,
  buildThresholdAreas,
  buildSingleMarkPoint,
  resolveMarkPointOverlaps,
  buildRecessionAreas,
  buildRecessionOverlaySeries,
  getLineLegendConfig,
  getHeatColor,
  buildYearEndPointMap,
  isCompleteYearPoint,
  buildAnnualizedHoldingMatrix,
  getAnnualizedMatrixNegativeOpacity,
  ensureAnnualizedMatrixTooltip,
  hideAnnualizedMatrixTooltip,
  positionAnnualizedMatrixTooltip,
  bindAnnualizedMatrixTooltip,
} from '../chart-helpers.js';

export function initPanelVix(priceData, vixData, recessionData) {
  const chart = registerChart(echarts.init(document.getElementById('chartVix')));
  const vixMap = new Map(vixData.series.map(item => [item.date, item.value]));
  const series = priceData.series
    .map(item => ({ date: item.date, close: item.close, vix: vixMap.get(item.date) ?? null }))
    .filter(item => item.vix != null);
  const highVixAreas = buildThresholdAreas(series, 30, item => item.vix);

  function getOption() {
    const lineColor = cssVar('--sp500-line') || '#1a1a1a';
    const vixColor = '#2563eb';
    const gridColor = cssVar('--chart-grid') || '#f0f0f0';
    const grayColor = cssVar('--gray') || '#999';
    const recessionSeries = buildRecessionOverlaySeries(series.map(item => [item.date, item.close]), recessionData);

    return {
      animation: false,
      grid: { left: 65, right: 65, top: 20, bottom: 60 },
      legend: getLineLegendConfig({
        data: ['标普500', 'VIX'],
      }),
      xAxis: {
        type: 'time',
        axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
        splitLine: { show: false },
      },
      yAxis: [
        {
          type: 'log',
          position: 'left',
          axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
          splitLine: { lineStyle: { color: gridColor } },
        },
        {
          type: 'value',
          position: 'right',
          axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
          splitLine: { show: false },
        },
      ],
      series: [
        ...(recessionSeries ? [recessionSeries] : []),
        {
          name: '标普500',
          type: 'line',
          yAxisIndex: 0,
          showSymbol: false,
          data: series.map(item => [item.date, item.close]),
          color: lineColor,
          itemStyle: { color: lineColor },
          lineStyle: { width: 2, color: lineColor },
          large: true,
          largeThreshold: 2000,
        },
        {
          name: 'VIX',
          type: 'line',
          yAxisIndex: 1,
          showSymbol: false,
          data: series.map(item => [item.date, item.vix]),
          color: vixColor,
          itemStyle: { color: vixColor },
          lineStyle: { width: 1.6, color: vixColor },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(37,99,235,0.28)' },
              { offset: 1, color: 'rgba(37,99,235,0.04)' },
            ]),
          },
          large: true,
          largeThreshold: 2000,
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: vixColor, type: 'dashed', width: 1 },
            data: [{ yAxis: 30, label: { formatter: 'VIX 30', fontSize: 11, color: vixColor } }],
          },
          markArea: highVixAreas.length ? {
            silent: true,
            itemStyle: { color: 'rgba(207,19,34,0.16)' },
            data: highVixAreas,
          } : undefined,
        },
      ],
      tooltip: {
        trigger: 'axis',
        backgroundColor: cssVar('--card-bg') || '#fff',
        borderColor: cssVar('--border') || '#e8e8e8',
        textStyle: {
          fontSize: 13,
          color: cssVar('--text') || '#1a1a1a',
          fontFamily: CHART_FONT,
        },
        formatter: params => {
          const point = series[params[0].dataIndex];
          return `${params[0].axisValueLabel}<br/>标普500: <b>${formatNumber(point.close, 0)}</b><br/>VIX: <b>${formatNumber(point.vix, 2)}</b>`;
        },
      },
      dataZoom: getDataZoom(grayColor),
    };
  }

  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);
}

// ══════════════════════════════════════════════════════
// 面板7：PE
// ══════════════════════════════════════════════════════

export function initLogYoyPanel(containerId, data, seriesName) {
  const dom = document.getElementById(containerId);
  if (!dom || !data?.series?.length) return;
  const chart = registerChart(echarts.init(dom));
  const series = buildLogYoySeries(data.series);
  if (!series.length) return;
  const latest = series.at(-1);
  const greenStroke = '#389e0d';
  const redStroke = '#cf1322';

  function getOption() {
    const gridColor = cssVar('--chart-grid') || '#f0f0f0';
    const grayColor = cssVar('--gray') || '#999';
    const textColor = cssVar('--text') || '#1a1a1a';

    return {
      animation: false,
      grid: { left: 65, right: 20, top: 24, bottom: 60 },
      xAxis: {
        type: 'time',
        axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          formatter: value => `${value.toFixed(0)}%`,
          fontSize: 11,
          color: grayColor,
          fontFamily: CHART_FONT,
        },
        splitLine: { lineStyle: { color: gridColor } },
      },
      series: [
        {
          name: '上涨周期',
          type: 'line',
          data: series.map(item => [item.date, item.value >= 0 ? item.value * 100 : null]),
          showSymbol: false,
          lineStyle: { width: 1.6, color: greenStroke },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(56,158,13,0.45)' },
              { offset: 1, color: 'rgba(56,158,13,0.08)' },
            ]),
          },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: grayColor, type: 'dashed', width: 1 },
            data: [{ yAxis: 0, label: { formatter: '周期分界', fontSize: 11, color: grayColor } }],
          },
          z: 3,
        },
        {
          name: '下跌周期',
          type: 'line',
          data: series.map(item => [item.date, item.value < 0 ? item.value * 100 : null]),
          showSymbol: false,
          lineStyle: { width: 1.6, color: redStroke },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(207,19,34,0.08)' },
              { offset: 1, color: 'rgba(207,19,34,0.45)' },
            ]),
          },
          z: 3,
        },
      ],
      tooltip: {
        trigger: 'axis',
        backgroundColor: cssVar('--card-bg') || '#fff',
        borderColor: cssVar('--border') || '#e8e8e8',
        textStyle: { fontSize: 13, color: textColor, fontFamily: CHART_FONT },
        formatter: params => {
          const axisLabel = params?.[0]?.axisValueLabel || '';
          // 两个 series 中总有一个是 null，另一个携带真实值
          const active = params.find(p => Array.isArray(p.value) && p.value[1] != null);
          const idx = active ? active.dataIndex : (params?.[0]?.dataIndex ?? -1);
          const point = series[idx];
          if (!point) return axisLabel;
          const tone = point.value >= 0 ? '上涨' : '下跌';
          return [
            axisLabel,
            `对数同比: <b style="color:${point.value >= 0 ? greenStroke : redStroke}">${(point.value * 100).toFixed(2)}%</b> (${tone})`,
            `当月收盘: ${formatNumber(point.now, 2)}`,
            `12个月前: ${formatNumber(point.prev, 2)}`,
          ].join('<br/>');
        },
      },
      dataZoom: getDataZoom(grayColor),
    };
  }

  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);
}

export function initLongRunIndexPanel(containerId, summaryId, data, recessionData, seriesName, toggleId) {
  const dom = document.getElementById(containerId);
  if (!dom || !data?.series?.length) {
    return;
  }

  const chart = registerChart(echarts.init(dom));
  const series = data.series.filter(item => item.value != null);
  const baseValue = series[0]?.value ?? 1;
  let currentScale = data.scale === 'logarithmic' ? 'log' : 'price';

  function getOption(scale) {
    const grayColor = cssVar('--gray') || '#999';
    const gridColor = cssVar('--chart-grid') || '#f0f0f0';
    const lineColor = cssVar('--sp500-line') || '#1a1a1a';
    const isLog = scale === 'log';
    const isPct = scale === 'pct';
    const chartSeries = isPct
      ? series.map(item => [item.date, (item.value / baseValue - 1) * 100])
      : series.map(item => [item.date, item.value]);
    const recessionSeries = buildRecessionOverlaySeries(chartSeries, recessionData);

    return {
      animation: false,
      grid: { left: 70, right: 20, top: 20, bottom: 60 },
      xAxis: {
        type: 'time',
        axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
        splitLine: { show: false },
      },
      yAxis: {
        type: isLog ? 'log' : 'value',
        axisLabel: {
          fontSize: 11,
          color: grayColor,
          fontFamily: CHART_FONT,
          formatter: value => (isPct ? `${value}%` : formatCompactNumber(value)),
        },
        splitLine: { lineStyle: { color: gridColor } },
      },
      series: [
        ...(recessionSeries ? [recessionSeries] : []),
        {
          name: seriesName,
          type: 'line',
          data: chartSeries,
          showSymbol: false,
          lineStyle: { width: 2, color: lineColor },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(0,0,0,0.05)' },
              { offset: 1, color: 'transparent' },
            ]),
          },
          z: 2,
        },
      ],
      tooltip: {
        trigger: 'axis',
        backgroundColor: cssVar('--card-bg') || '#fff',
        borderColor: cssVar('--border') || '#e8e8e8',
        textStyle: {
          fontSize: 13,
          color: cssVar('--text') || '#1a1a1a',
          fontFamily: CHART_FONT,
        },
        formatter: params => {
          const point = params.find(item => item.seriesName === seriesName);
          if (!point) {
            return '';
          }
          return `${params[0].axisValueLabel}<br/>${seriesName}: <b>${isPct ? formatPercent(point.value[1], 2) : formatNumber(point.value[1], 2)}</b>`;
        },
      },
      dataZoom: getDataZoom(grayColor),
    };
  }

  chart.setOption(getOption(currentScale));
  chart._refreshTheme = () => chart.setOption(getOption(currentScale), true);

  const toggleRoot = toggleId ? document.getElementById(toggleId) : null;
  if (toggleRoot) {
    toggleRoot.addEventListener('click', event => {
      const btn = event.target.closest('.btn');
      if (!btn || !btn.dataset.scale) {
        return;
      }
      currentScale = btn.dataset.scale;
      toggleRoot.querySelectorAll('.btn').forEach(item => item.classList.remove('active'));
      btn.classList.add('active');
      chart.setOption(getOption(currentScale), true);
    });
  }

  renderMetricStrip(summaryId, [
    buildMetricCard('起点', `${data.start?.date || '--'} · ${data.start ? formatNumber(data.start.value, 2) : '--'}`, '用起始月度点位给长周期一个基准。'),
    buildMetricCard('最新', data.latest ? formatNumber(data.latest.value, 2) : '--', data.latest ? `更新时间 ${data.latest.date}` : '等待数据'),
    buildMetricCard('复合增速', data.cagr != null ? formatPercent(data.cagr, 2) : '--', '按起点到当前月度点位计算的长期 CAGR。'),
    buildMetricCard('视角切换', '价格 / 对数 / 百分比', '价格看绝对点位，对数看复利斜率，百分比看自起点累计涨幅。'),
    buildMetricCard('衰退阴影', '已启用', '淡灰色区间基于 NBER / FRED 的 US recession 指标。'),
  ]);
}

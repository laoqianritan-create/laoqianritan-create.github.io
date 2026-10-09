// panels/ath_paths.js · 创新高之路：从恢复期高点到下一个新高（Yardeni fig12 形式）
// 数据：站内 sp500_price.json（日频价格指数）＋区间常量（推导产物）。
// 区间规则（子代理对锚点 8/8 全中）：区间起点＝≥20% 收盘熊市谷底之后的首个历史前高收盘日（恢复期高点），
// 终点＝下一轮 ≥20% 熊市的前高（牛市终点）；days＝自然日，pct＝终点/起点收盘−1。
// 8 段天数/涨幅与原图逐位一致（575/+14.9 … 503/+41.5），第 9 段自 2024-01-19 起进行中。
// 实现说明：原图的红色横段箭头简化为浅蓝带＋红框两行标签（天数/涨幅），带内为可悬停区域。

import { CHART_FONT, cssVar, formatNumber } from '../utils.js?v=20261009145221';
import { registerChart, buildMetricCard, renderMetricStrip, getDataZoom } from '../chart-helpers.js?v=20261009145221';

const INTERVALS = [
  { start: '1967-05-04', end: '1968-11-29', days: 575, pct: 0.149 },
  { start: '1972-03-06', end: '1973-01-11', days: 311, pct: 0.105 },
  { start: '1980-07-17', end: '1980-11-28', days: 134, pct: 0.157 },
  { start: '1982-11-03', end: '1987-08-25', days: 1756, pct: 1.357 },
  { start: '1989-07-26', end: '2000-03-24', days: 3894, pct: 3.518 },
  { start: '2007-05-30', end: '2007-10-09', days: 132, pct: 0.023 },
  { start: '2013-03-28', end: '2020-02-19', days: 2519, pct: 1.158 },
  { start: '2020-08-18', end: '2022-01-03', days: 503, pct: 0.415 },
  { start: '2024-01-19', end: null, days: null, pct: null },
];

export function initAthPathsPanel(priceData) {
  const dom = document.getElementById('chartAthPaths');
  const series = priceData?.series;
  if (!dom || !series?.length) return;

  const line = series.filter(p => p.date >= '1964-01-01').map(p => [p.date, p.close]);
  const lastDate = series[series.length - 1].date;
  const lastClose = series[series.length - 1].close;

  const blueColor = '#1e40af';
  const bandColor = 'rgba(147,197,253,0.35)';
  const redColor = '#ef4444';
  const grayColor = cssVar('--gray') || '#999';
  const gridColor = cssVar('--chart-grid') || '#f0f0f0';
  const textColor = cssVar('--text') || '#1a1a1a';

  const bandData = INTERVALS.map(iv => {
    const end = iv.end || lastDate;
    const label = iv.days == null
      ? '进行中\n?'
      : `${iv.days} 天\n+${(iv.pct * 100).toFixed(1)}%`;
    return [
      {
        xAxis: iv.start,
        itemStyle: { color: bandColor, borderColor: 'rgba(239,68,68,0.65)', borderWidth: 1 },
        label: {
          show: true,
          position: 'insideTop',
          distance: 2,
          fontSize: 10,
          fontFamily: CHART_FONT,
          color: redColor,
          formatter: label,
        },
      },
      { xAxis: end },
    ];
  });

  const done = INTERVALS.filter(i => i.days != null);
  const longest = [...done].sort((a, b) => b.days - a.days)[0];
  const shortest = [...done].sort((a, b) => a.days - b.days)[0];
  const ongoing = INTERVALS.find(i => i.days == null);
  const ongoingDays = Math.round((new Date(lastDate) - new Date(ongoing.start)) / 86400000);

  function getOption() {
    return {
      animation: false,
      grid: { left: 64, right: 30, top: 46, bottom: 64 },
      legend: {
        top: 0,
        left: 'center',
        icon: 'roundRect',
        itemWidth: 18,
        itemHeight: 3,
        itemGap: 16,
        textStyle: { fontSize: 12, color: cssVar('--text-secondary') || '#666', fontFamily: CHART_FONT },
        data: [
          { name: '标普500 价格指数*', itemStyle: { color: blueColor } },
          { name: '恢复期高点 → 下一个新高', itemStyle: { color: bandColor } },
        ],
      },
      xAxis: {
        type: 'time',
        min: '1964-01-01',
        max: '2030-12-31',
        axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'log',
        min: 40,
        max: 10000,
        axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
        splitLine: { lineStyle: { color: gridColor } },
      },
      series: [
        {
          name: '恢复期高点 → 下一个新高',
          type: 'line',
          data: [],
          tooltip: { show: false },
          markArea: {
            silent: true,
            data: bandData,
          },
          z: 0,
        },
        {
          name: '标普500 价格指数*',
          type: 'line',
          data: line,
          showSymbol: false,
          lineStyle: { width: 1.8, color: blueColor },
          itemStyle: { color: blueColor },
          z: 2,
        },
      ],
      tooltip: {
        trigger: 'axis',
        backgroundColor: cssVar('--card-bg') || '#fff',
        borderColor: cssVar('--border') || '#e8e8e8',
        textStyle: { fontSize: 13, color: textColor, fontFamily: CHART_FONT },
        formatter: params => {
          const pt = params.find(p => p.seriesName === '标普500 价格指数*' && Array.isArray(p.value));
          if (!pt) return '';
          const dt = pt.value[0];
          const iv = INTERVALS.find(i => dt >= i.start && dt <= (i.end || lastDate));
          let extra = '';
          if (iv) extra = `<br/>区间: ${iv.start} → ${iv.end || '进行中'}${iv.days != null ? `（${iv.days} 天，+${(iv.pct * 100).toFixed(1)}%）` : ''}`;
          return `${dt}<br/>标普500: <b>${formatNumber(pt.value[1], 2)}</b>${extra}`;
        },
      },
      dataZoom: getDataZoom(grayColor),
    };
  }

  const chart = registerChart(echarts.init(dom));
  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  renderMetricStrip('athSummary', [
    buildMetricCard('进行中', `${ongoing.start} 起 · 第 ${ongoingDays} 天`, '≥20% 熊市 2025-04-07 见底后，2024-01-19 前高之上的本轮仍在延续'),
    buildMetricCard('最长一段', `${longest.days} 天 +${(longest.pct * 100).toFixed(1)}%`, `${longest.start} → ${longest.end}`),
    buildMetricCard('最短一段', `${shortest.days} 天 +${(shortest.pct * 100).toFixed(1)}%`, `${shortest.start} → ${shortest.end}`),
    buildMetricCard('规则', '≥20% 熊市后首个新高 → 下轮熊市前高', '天数＝自然日、涨幅＝收盘比；1990/1998/2018/2025 的 −19.x% 回调不切段'),
    buildMetricCard('对拍', '8/8 锚点全中', '天数差 0、涨幅差 ≤0.05pp（vs 原图 575/+14.9 … 503/+41.5）'),
  ]);
}

// panels/ath_paths.js · Path to new highs: from post-recovery high to next new high (Yardeni fig12 form)
// Data: site sp500_price.json (daily price index) + derived interval constants.
// Interval rule (subagent matched all 8 anchors exactly): start = first all-time-high close after a ≥20% close-based
// bear trough (the post-recovery high); end = the terminal peak before the next ≥20% bear. days = calendar days,
// pct = end close / start close − 1. All 8 label pairs match the original exactly; band 9 is ongoing since 2024-01-19.
// Implementation note: the original's red arrow segments are simplified to light-blue bands with red two-line labels.

import { CHART_FONT, cssVar, formatNumber } from '../utils.js?v=20261009143214';
import { registerChart, buildMetricCard, renderMetricStrip, getDataZoom } from '../chart-helpers.js?v=20261009143214';

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

  const blueColor = '#1e40af';
  const bandColor = 'rgba(147,197,253,0.35)';
  const redColor = '#ef4444';
  const grayColor = cssVar('--gray') || '#999';
  const gridColor = cssVar('--chart-grid') || '#f0f0f0';
  const textColor = cssVar('--text') || '#1a1a1a';

  const bandData = INTERVALS.map(iv => {
    const end = iv.end || lastDate;
    const label = iv.days == null
      ? 'ongoing\n?'
      : `${iv.days} days\n+${(iv.pct * 100).toFixed(1)}%`;
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
          { name: 'S&P 500 price index*', itemStyle: { color: blueColor } },
          { name: 'Post-recovery high → next new high', itemStyle: { color: bandColor } },
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
          name: 'Post-recovery high → next new high',
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
          name: 'S&P 500 price index*',
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
          const pt = params.find(p => p.seriesName === 'S&P 500 price index*' && Array.isArray(p.value));
          if (!pt) return '';
          const dt = pt.value[0];
          const iv = INTERVALS.find(i => dt >= i.start && dt <= (i.end || lastDate));
          let extra = '';
          if (iv) extra = `<br/>Interval: ${iv.start} → ${iv.end || 'ongoing'}${iv.days != null ? ` (${iv.days} days, +${(iv.pct * 100).toFixed(1)}%)` : ''}`;
          return `${dt}<br/>S&P 500: <b>${formatNumber(pt.value[1], 2)}</b>${extra}`;
        },
      },
      dataZoom: getDataZoom(grayColor),
    };
  }

  const chart = registerChart(echarts.init(dom));
  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  renderMetricStrip('athSummary', [
    buildMetricCard('Ongoing', `${ongoing.start} → · day ${ongoingDays}`, 'After the ≥20% bear bottomed 2025-04-07, the run above the 2024-01-19 high continues'),
    buildMetricCard('Longest', `${longest.days} days +${(longest.pct * 100).toFixed(1)}%`, `${longest.start} → ${longest.end}`),
    buildMetricCard('Shortest', `${shortest.days} days +${(shortest.pct * 100).toFixed(1)}%`, `${shortest.start} → ${shortest.end}`),
    buildMetricCard('Rule', 'First new high after ≥20% bear → next bear peak', 'Calendar days, close-to-close; the −19.x% dips of 1990/1998/2018/2025 do not split bands'),
    buildMetricCard('Validation', '8/8 anchors matched', '0 days and ≤0.05pp difference vs the original labels'),
  ]);
}

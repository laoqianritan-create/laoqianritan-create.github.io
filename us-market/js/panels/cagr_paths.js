// panels/cagr_paths.js · 标普500 与 3%~11% 复合增速路径（1935-12=1 对数长图）
// 数据：data/sp500_cagr_paths.json（价格指数 + 自算总回报，逐月股息再投资）
// 形式复刻 Yardeni Research 同款图；口径与对拍见 JSON 的 caliber 字段。

import { CHART_FONT, cssVar, formatNumber } from '../utils.js?v=20261009111325';
import {
  registerChart,
  buildMetricCard,
  renderMetricStrip,
  getDataZoom,
  buildRecessionOverlaySeries,
} from '../chart-helpers.js?v=20261009111325';

const CAGR_RATES = [3, 4, 5, 6, 7, 8, 9, 10, 11];
const DAY_MS = 24 * 3600 * 1000;

export function initSp500CagrPanel(cagrData, recessionData) {
  const dom = document.getElementById('chartSp500CagrPaths');
  if (!dom || !cagrData?.series?.length) return;

  const chart = registerChart(echarts.init(dom));
  const S = cagrData.series;
  const baseDate = cagrData.base_date || S[0].date;
  const baseTs = new Date(baseDate).getTime();
  const lastDate = S[S.length - 1].date;
  const lastTs = new Date(lastDate).getTime();
  const years = (lastTs - baseTs) / (365.25 * DAY_MS);

  const priceData = S.map(p => [p.date, p.p]);
  const trData = S.map(p => [p.date, p.t]);

  const blueColor = '#2563eb';
  const redColor = cssVar('--red') || '#cf1322';
  const grayColor = cssVar('--gray') || '#999';
  const gridColor = cssVar('--chart-grid') || '#f0f0f0';
  const textColor = cssVar('--text') || '#1a1a1a';

  // 复合增速参考线：同一基点 1935-12=1，对数轴下为直线
  const cagrSeries = CAGR_RATES.map(r => ({
    name: `${r}% 路径`,
    type: 'line',
    data: [[baseDate, 1], [lastDate, Math.pow(1 + r / 100, years)]],
    showSymbol: false,
    silent: true,
    lineStyle: { color: grayColor, width: 1 },
    endLabel: {
      show: true,
      formatter: `${r}%`,
      color: grayColor,
      fontSize: 11,
      distance: 3,
      fontFamily: CHART_FONT,
    },
    tooltip: { show: false },
    z: 1,
  }));

  const recessionSeries = buildRecessionOverlaySeries(priceData, recessionData);

  function getOption() {
    return {
    animation: false,
    grid: { left: 70, right: 56, top: 40, bottom: 60 },
    legend: {
      top: 0,
      left: 'center',
      icon: 'roundRect',
      itemWidth: 18,
      itemHeight: 3,
      itemGap: 16,
      textStyle: {
        fontSize: 12,
        color: cssVar('--text-secondary') || '#666',
        fontFamily: CHART_FONT,
      },
      data: [
        { name: '总回报（含股息）', itemStyle: { color: blueColor } },
        { name: '价格指数（不含股息）', itemStyle: { color: redColor } },
        { name: '衰退区间', itemStyle: { color: 'rgba(153,153,153,0.35)' } },
      ],
    },
    xAxis: {
      type: 'time',
      axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'log',
      min: 0.5,
      max: 30000,
      axisLabel: {
        fontSize: 11,
        color: grayColor,
        fontFamily: CHART_FONT,
        formatter: value => formatNumber(value, value < 10 ? 1 : 0),
      },
      splitLine: { lineStyle: { color: gridColor } },
    },
    series: [
      ...(recessionSeries ? [recessionSeries] : []),
      ...cagrSeries,
      {
        name: '总回报（含股息）',
        type: 'line',
        data: trData,
        showSymbol: false,
        lineStyle: { width: 2, color: blueColor },
        itemStyle: { color: blueColor },
        z: 3,
      },
      {
        name: '价格指数（不含股息）',
        type: 'line',
        data: priceData,
        showSymbol: false,
        lineStyle: { width: 2, color: redColor },
        itemStyle: { color: redColor },
        z: 2,
      },
    ],
    tooltip: {
      trigger: 'axis',
      backgroundColor: cssVar('--card-bg') || '#fff',
      borderColor: cssVar('--border') || '#e8e8e8',
      textStyle: { fontSize: 13, color: textColor, fontFamily: CHART_FONT },
      formatter: params => {
        const tr = params.find(p => p.seriesName === '总回报（含股息）');
        const px = params.find(p => p.seriesName === '价格指数（不含股息）');
        let html = params[0].axisValueLabel;
        if (tr) html += `<br/>总回报: <b>${formatNumber(tr.value[1], 1)}</b>`;
        if (px) html += `<br/>价格指数: <b>${formatNumber(px.value[1], 2)}</b>`;
        return html;
      },
    },
    dataZoom: getDataZoom(grayColor),
    };
  }

  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  const latest = cagrData.latest || {};
  const cagr = cagrData.cagr || {};
  renderMetricStrip('cagrPathsSummary', [
    buildMetricCard('起点', `${String(baseDate).slice(0, 7)} = 1`, '基期归一为 1，对数刻度下恒定增速呈直线。'),
    buildMetricCard('总回报最新', latest.tr != null ? formatNumber(latest.tr, 1) : '--', `含股息逐月再投资 · ${latest.date || '--'}`),
    buildMetricCard('价格指数最新', latest.price != null ? formatNumber(latest.price, 2) : '--', `不含股息 · ${latest.date || '--'}`),
    buildMetricCard('价格年化', cagr.price != null ? `${cagr.price}%` : '--', `1935-12 起年化复合增速（${cagr.years || '--'} 年）。`),
    buildMetricCard('总回报年化', cagr.tr != null ? `${cagr.tr}%` : '--', '含股息再投资的年化复合增速。'),
    buildMetricCard('当前股息率', latest.dividend_yield != null ? `${latest.dividend_yield}%` : '--', `TTM 口径 · 数据至 ${latest.yield_asof || '--'}`),
  ]);
}

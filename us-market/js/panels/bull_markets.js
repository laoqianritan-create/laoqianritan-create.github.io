// panels/bull_markets.js · 标普500 九轮牛市对比（1966 起，起点=0%）
// 数据：data/sp500_bull_markets.json（本地日线按 Yardeni 图例九轮起止切片自算）
// 形式复刻 Yardeni Research「S&P 500 Bull Markets Since 1966」：X=距起点交易日数，灰 8 轮 + 红 1 轮进行中。

import { CHART_FONT, cssVar, formatNumber } from '../utils.js?v=20261009134529';
import {
  registerChart,
  buildMetricCard,
  renderMetricStrip,
  getDataZoom,
} from '../chart-helpers.js?v=20261009134529';

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDateCN(iso) {
  const [y, m, d] = String(iso).split('-');
  return `${+m}/${+d}/${y.slice(2)}`;
}
function fmtDateEN(iso) {
  const [y, m, d] = String(iso).split('-');
  return `${MONTHS_EN[+m - 1]} ${+d}, ${y}`;
}

export function initSp500BullMarketsPanel(bullData, lang = 'zh') {
  const dom = document.getElementById('chartSp500BullMarkets');
  if (!dom || !bullData?.bulls?.length) return;

  const chart = registerChart(echarts.init(dom));
  const isEN = lang === 'en';
  const fmt = isEN ? fmtDateEN : fmtDateCN;

  const redColor = cssVar('--red') || '#cf1322';
  const grayColor = cssVar('--gray') || '#999';
  const gridColor = cssVar('--chart-grid') || '#f0f0f0';
  const textColor = cssVar('--text') || '#1a1a1a';

  const ongoing = bullData.bulls.find(b => b.ongoing);
  const hist = bullData.bulls.filter(b => !b.ongoing);
  const longest = bullData.bulls.reduce((a, b) => (b.days > a.days ? b : a));
  const topGain = bullData.bulls.reduce((a, b) => (b.gain > a.gain ? b : a));
  const currentGain = ongoing ? ongoing.gain : null;

  function bullName(b) {
    return `${fmt(b.start)} - ${b.ongoing ? '??' : fmt(b.end)} (${formatNumber(b.gain, 1)}%)`;
  }

  // 图例顺序按涨幅降序（与原图一致）；当前牛市（红）固定高亮
  const ordered = [...bullData.bulls].sort((a, b) => b.gain - a.gain);

  const series = ordered.map(b => ({
    name: bullName(b),
    type: 'line',
    data: b.points.map(p => [p.d, p.v]),
    showSymbol: false,
    lineStyle: { width: b.ongoing ? 2.5 : 1, color: b.ongoing ? redColor : grayColor },
    itemStyle: { color: b.ongoing ? redColor : grayColor },
    emphasis: { focus: 'series', lineStyle: { width: b.ongoing ? 3 : 2 } },
    z: b.ongoing ? 3 : 2,
  }));

  function getOption() {
    return {
      animation: false,
      grid: { left: 64, right: 40, top: 72, bottom: 64 },
      legend: {
        top: 4,
        left: 'center',
        type: 'scroll',
        icon: 'roundRect',
        itemWidth: 18,
        itemHeight: 3,
        itemGap: 10,
        textStyle: {
          fontSize: 11,
          color: cssVar('--text-secondary') || '#666',
          fontFamily: CHART_FONT,
        },
        data: ordered.map(b => ({
          name: bullName(b),
          itemStyle: { color: b.ongoing ? redColor : grayColor },
        })),
      },
      xAxis: {
        type: 'value',
        min: 0,
        max: 3400,
        name: isEN ? 'Trading days' : '交易日',
        nameTextStyle: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT, align: 'right', padding: [0, 0, 0, -20] },
        axisLabel: {
          fontSize: 11,
          color: grayColor,
          fontFamily: CHART_FONT,
          formatter: value => (value === 0 ? '0' : `${value}D`),
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 600,
        interval: 50,
        axisLabel: {
          fontSize: 11,
          color: grayColor,
          fontFamily: CHART_FONT,
          formatter: value => `${value}%`,
        },
        splitLine: { lineStyle: { color: gridColor } },
      },
      series,
      tooltip: {
        trigger: 'axis',
        backgroundColor: cssVar('--card-bg') || '#fff',
        borderColor: cssVar('--border') || '#e8e8e8',
        textStyle: { fontSize: 13, color: textColor, fontFamily: CHART_FONT },
        formatter: params => {
          const d = params[0]?.value?.[0];
          const lines = [isEN ? `Day ${d}` : `第 ${d} 个交易日`];
          params
            .filter(p => p.value && p.value[1] != null)
            .sort((a, b) => b.value[1] - a.value[1])
            .forEach(p => {
              lines.push(`${p.marker}${p.seriesName}: <b>${formatNumber(p.value[1], 1)}%</b>`);
            });
          return lines.join('<br/>');
        },
      },
      dataZoom: getDataZoom(grayColor),
    };
  }

  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  const labelOngoing = isEN ? 'Current (since Oct 12, 2022)' : '当前牛市（2022-10-12 起）';
  renderMetricStrip('bullMarketsSummary', [
    buildMetricCard(isEN ? 'Bull markets since 1966' : '1966 以来牛市', '9 轮', 'Yardeni 口径 · 起点均为熊市谷底'),
    buildMetricCard(isEN ? 'Current gain' : '当前涨幅', currentGain != null ? `+${formatNumber(currentGain, 1)}%` : '--', `${labelOngoing} · 数据至 ${bullData.latest_date || '--'}`),
    buildMetricCard(isEN ? 'Longest' : '最长一轮', `${longest.days.toLocaleString()} 日`, `${fmt(longest.start)} → ${longest.ongoing ? '…' : fmt(longest.end)}`),
    buildMetricCard(isEN ? 'Biggest gain' : '最大涨幅', `+${formatNumber(topGain.gain, 1)}%`, `${fmt(topGain.start)} → ${fmt(topGain.end)}`),
    buildMetricCard(isEN ? 'X axis' : '横轴', isEN ? 'Trading days' : '交易日', isEN ? 'Weekdays incl. holidays, weekends excluded' : '含假日的营业日 · 剔除周末'),
  ]);
}

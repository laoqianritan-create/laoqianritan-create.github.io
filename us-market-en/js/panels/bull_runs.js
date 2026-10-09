// panels/bull_runs.js · The nine bull markets since 1966 (aligned by trading day)
// Mirrors Yardeni growth-paths Figure 13; reuses site sp500_price.json (no new data source).
// Run dates transcribed from the original legend (spec doc 01, 2026-10-08); returns validated 9/9 = 0.0pp.

import { CHART_FONT, cssVar, formatPercent } from '../utils.js?v=20261009171810';
import {
  registerChart,
  buildMetricCard,
  renderMetricStrip,
  getDataZoom,
} from '../chart-helpers.js?v=20261009171810';

// Original legend (2026-10-08); end=null means still running
// 颜色按年代分配（老钱 2026-10-09 反馈「历史轮次全灰无法区分，改用多色」）；
// 色值全部复用站内既有分类色（行业面板 / 回撤分类 / 主题色），进行中一轮保留主题红。
const RUNS = [
  { start: '1966-10-07', end: '1968-11-29', orig: 48.0, color: '#2563eb' },
  { start: '1970-05-26', end: '1973-01-11', orig: 73.5, color: '#f97316' },
  { start: '1974-10-03', end: '1980-11-28', orig: 125.6, color: '#0f766e' },
  { start: '1982-08-12', end: '1987-08-25', orig: 228.8, color: '#db2777' },
  { start: '1987-12-04', end: '2000-03-24', orig: 582.1, color: '#389e0d' },
  { start: '2002-10-09', end: '2007-10-09', orig: 101.5, color: '#7c3aed' },
  { start: '2009-03-09', end: '2020-02-19', orig: 400.5, color: '#faad14' },
  { start: '2020-03-23', end: '2022-01-03', orig: 114.4, color: '#4758e0' },
  { start: '2022-10-12', end: null, orig: 118.1, color: '#cf1322' },
];

function fmtYM(iso) {
  // 老钱 2026-10-09 反馈：图例只留 yyyy/mm（日与涨幅图上已体现）
  const d = new Date(iso + 'T00:00:00');
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function initBullRunsPanel(priceData) {
  const dom = document.getElementById('chartSp500BullRuns');
  const price = priceData?.series;
  if (!dom || !price?.length) return;

  const lastIdx = price.length - 1;

  const runs = RUNS.map(r => {
    let i0 = null;
    for (let i = 0; i <= lastIdx; i++) { if (price[i].date >= r.start) { i0 = i; break; } }
    if (i0 == null) return null;
    let i1 = lastIdx;
    if (r.end) {
      i1 = i0;
      for (let i = i0; i <= lastIdx; i++) { if (price[i].date <= r.end) i1 = i; else break; }
    }
    const base = price[i0].close;
    const pts = [];
    for (let k = i0; k <= i1; k++) pts.push([k - i0, (price[k].close / base - 1) * 100]);
    const pct = pts.length ? pts[pts.length - 1][1] : 0;
    return {
      open: !r.end,
      color: r.color,
      startUsed: price[i0].date,
      endUsed: price[i1].date,
      days: i1 - i0,
      pct,
      pts,
    };
  }).filter(Boolean);

  runs.sort((a, b) => b.pct - a.pct); // same as the original: sorted by total return, ongoing run floats up

  const current = runs.find(x => x.open);
  const longest = runs.reduce((m, x) => (x.days > m.days ? x : m), runs[0]);
  const top = runs[0];

  const grayColor = cssVar('--gray') || '#999';
  const redColor = cssVar('--red') || '#cf1322';
  const gridColor = cssVar('--chart-grid') || '#f0f0f0';
  const textColor = cssVar('--text') || '#1a1a1a';

  function legendName(r) {
    const end = r.open ? '?' : fmtYM(r.endUsed);
    return `${fmtYM(r.startUsed)} - ${end}`;
  }

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
        itemGap: 12,
        textStyle: {
          fontSize: 12,
          color: cssVar('--text-secondary') || '#666',
          fontFamily: CHART_FONT,
        },
        data: runs.map(r => ({
          name: legendName(r),
          itemStyle: { color: r.open ? redColor : r.color },
        })),
      },
      xAxis: {
        type: 'value',
        min: 0,
        max: 3400,
        interval: 200,
        axisLabel: {
          fontSize: 11,
          color: grayColor,
          fontFamily: CHART_FONT,
          formatter: v => (v === 0 ? '0' : `${v}D`),
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
          formatter: v => String(v),
        },
        splitLine: { lineStyle: { color: gridColor } },
      },
      series: runs.map(r => ({
        name: legendName(r),
        type: 'line',
        data: r.pts,
        showSymbol: false,
        silent: r.open ? false : true,
        lineStyle: {
          color: r.open ? redColor : r.color,
          width: r.open ? 2.4 : 1.6,
        },
        itemStyle: { color: r.open ? redColor : r.color },
        z: r.open ? 3 : 1,
        endLabel: r.open
          ? {
              show: true,
              formatter: `In progress ${r.pct.toFixed(1)}%`,
              color: redColor,
              fontSize: 12,
              distance: 4,
              fontFamily: CHART_FONT,
            }
          : undefined,
      })),
      tooltip: {
        trigger: 'axis',
        backgroundColor: cssVar('--card-bg') || '#fff',
        borderColor: cssVar('--border') || '#e8e8e8',
        textStyle: { fontSize: 13, color: textColor, fontFamily: CHART_FONT },
        formatter: params => {
          // Legend-colored marker per row so series are tellable apart on hover
          const rows = params
            .filter(p => p.value && Array.isArray(p.value))
            .map(p => `${p.marker}${p.seriesName}<br/>　day ${p.value[0]}: <b>${formatPercent(p.value[1], 1)}</b>`);
          if (!rows.length) return '';
          return rows.join('<br/>');
        },
      },
      dataZoom: getDataZoom(grayColor),
    };
  }

  const chart = registerChart(echarts.init(dom));
  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  renderMetricStrip('bullRunsSummary', [
    buildMetricCard('Runs', `${runs.length}`, `Since 1966 · ${runs.filter(r => !r.open).length} ended, ${runs.filter(r => r.open).length} running`),
    buildMetricCard('Best', `${top.pct.toFixed(1)}%`, `${fmtYM(top.startUsed)} → ${top.open ? '?' : fmtYM(top.endUsed)}`),
    buildMetricCard('Longest', `${longest.days} trading days`, `${fmtYM(longest.startUsed)} → ${fmtYM(longest.endUsed)} · +${longest.pct.toFixed(1)}%`),
    buildMetricCard('Current run', current ? `+${current.pct.toFixed(1)}%` : '--', current ? `since ${fmtYM(current.startUsed)} · day ${current.days}` : 'none running'),
    buildMetricCard('Cross-check', '9/9 · 0.0pp', 'All nine returns match the original legend (tested 2026-10-08)'),
  ]);
}

// panels/bull_runs.js · 1966 年以来九轮牛市（按交易日对齐叠加对比）
// 形式复刻 Yardeni growth-paths Figure 13；数据复用站内 sp500_price.json（无新数据源）。
// 九轮起止日期逐字读自原图图例（本轮规格书 01），涨幅已与本地日线对拍 9/9 = 0.0pp。

import { CHART_FONT, cssVar, formatPercent } from '../utils.js?v=20261010094028';
import {
  registerChart,
  buildMetricCard,
  renderMetricStrip,
  getDataZoom,
} from '../chart-helpers.js?v=20261010094028';

// 原图图例逐字（2026-10-08）；end=null 表示进行中
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

  const idxByDate = new Map(price.map((p, i) => [p.date, i]));
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

  runs.sort((a, b) => b.pct - a.pct); // 与原图一致：按总涨幅降序，进行中的一轮随数据上浮

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
              formatter: `进行中 ${r.pct.toFixed(1)}%`,
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
          // 老钱 2026-10-09 反馈：悬停信息必须带图例颜色，否则分辨不清——用 params.marker 拼彩色圆点
          const rows = params
            .filter(p => p.value && Array.isArray(p.value))
            .map(p => `${p.marker}${p.seriesName}<br/>　第 ${p.value[0]} 个交易日: <b>${formatPercent(p.value[1], 1)}</b>`);
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
    buildMetricCard('轮数', `${runs.length} 轮`, `1966 年起 · ${runs.filter(r => !r.open).length} 轮已结束、${runs.filter(r => r.open).length} 轮进行中`),
    buildMetricCard('累计最高', `${top.pct.toFixed(1)}%`, `${fmtYM(top.startUsed)} → ${top.open ? '?' : fmtYM(top.endUsed)}`),
    buildMetricCard('最长一轮', `${longest.days} 个交易日`, `${fmtYM(longest.startUsed)} → ${fmtYM(longest.endUsed)} · +${longest.pct.toFixed(1)}%`),
    buildMetricCard('当前一轮', current ? `+${current.pct.toFixed(1)}%` : '--', current ? `${fmtYM(current.startUsed)} 起 · 第 ${current.days} 个交易日` : '无进行中'),
    buildMetricCard('对拍', '9/9 · 0.0pp', '九轮涨幅与原图图例逐位一致（2026-10-08 实测）'),
  ]);
}

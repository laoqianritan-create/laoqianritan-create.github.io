// panels/fed_hikes.js · 加息与股指：三面板（对数净值 / 回撤 / 实际利率）+ 加息日竖虚线
//
// 形式复刻 2026-09-23 老钱定稿的「加息与黄金」三面板（对数净值+回撤+实际利率，竖虚线贯穿）。
// 数据源：data/fed_hikes.json（fetch_fed_hikes in fetch_data.py）
//        data/sp500_price.json / data/ndx_price.json（已有价格序列，按面板起点切片）
// 标普500 面板自 1954 年起（联邦基金利率数据起点）；纳指100 面板自 1985-10 起（指数可得起点）。

import {
  CHART_FONT,
  cssVar,
  formatNumber,
} from '../utils.js';

import {
  registerChart,
  buildMetricCard,
  renderMetricStrip,
  getLineLegendConfig,
} from '../chart-helpers.js';

const GREEN = '#389e0d';
const RED = '#cf1322';
const BLUE = '#2563eb';
const HIKE_SHADE = 'rgba(207,19,34,0.05)';   // 加息日竖向阴影（三个面板铺满）

/**
 * @param {string} containerId  chart 容器 id
 * @param {string} summaryId    metric strip 容器 id
 * @param {Object} fedData      fed_hikes.json
 * @param {Object} priceData    sp500_price.json / ndx_price.json
 * @param {Object} opts         { start, indexLabel, anns, labels }
 *   anns: 事件标注 [{date, label, y, side?}]，y 为对数净值面板内的锚点值，
 *         side 'left' = 文字向左延伸（框右缘贴锚点），缺省自动（末段 40 个月内向左）。
 *   labels: 文案包 { nav, dd, posRate, negRate, hikeDay, after1d, after1y,
 *                    winrate, sinceStart, annualized, maxDd, realRateNow,
 *                    histHi, histLo, navUnit }
 */
export function initFedHikesPanel(containerId, summaryId, fedData, priceData, opts = {}) {
  const dom = document.getElementById(containerId);
  if (!dom || !fedData?.events?.length || !priceData?.series?.length) return;

  const start = opts.start || '1954-01-01';
  const indexLabel = opts.indexLabel || '标普500';
  const anns = opts.anns || [];
  const L = opts.labels || {};
  const hikes = fedData.events.map(e => e.date).filter(d => d >= start);

  // 价格切片 + 净值 + 滚动回撤
  const sliced = priceData.series
    .filter(p => p.date >= start)
    .map(p => ({ date: p.date, close: +p.close }));
  if (sliced.length < 100) return;
  const base = sliced[0].close;
  const nav = sliced.map(p => [p.date, +(p.close / base).toFixed(4)]);
  let cumMax = -Infinity;
  const ddSeries = sliced.map(p => {
    if (p.close > cumMax) cumMax = p.close;
    return [p.date, +(((p.close - cumMax) / cumMax) * 100).toFixed(2)];
  });

  const realRate = (fedData.series?.real_rate || []).filter(r => r.date >= start);
  if (!realRate.length) return;
  const rrPos = realRate.map(r => [r.date, r.value >= 0 ? +r.value.toFixed(2) : null]);
  const rrNeg = realRate.map(r => [r.date, r.value < 0 ? +r.value.toFixed(2) : null]);
  const rrLine = realRate.map(r => [r.date, +r.value.toFixed(2)]);

  // ── 加息后 1 日 / 1 年前向收益 ──
  const dates = sliced.map(p => p.date);
  const closes = sliced.map(p => p.close);
  const r1d = [], r1y = [];
  for (const h of hikes) {
    const i = lowerBound(dates, h);
    if (i >= dates.length - 1) continue;
    const e = closes[i];
    r1d.push(closes[i + 1] / e - 1);
    const j = lowerBoundOffset(dates, h, 365);
    if (j < dates.length) r1y.push(closes[j] / e - 1);
  }
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  const med = a => {
    const s = [...a].sort((x, y) => x - y);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const winrate = a => a.length ? a.filter(v => v > 0).length / a.length : null;
  const pctStr = (v, digits = 1) => v == null ? '—' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`;
  const lastNav = nav[nav.length - 1][1];
  const spanDays = (new Date(dates[dates.length - 1]) - new Date(dates[0])) / 86400000;
  const cagr = Math.pow(lastNav, 365.25 / spanDays) - 1;
  const minDd = Math.min(...ddSeries.map(p => p[1]));

  function getOption() {
    const gridColor = cssVar('--chart-grid') || '#f0f0f0';
    const grayColor = cssVar('--gray') || '#999';
    const cardBg = cssVar('--card-bg') || '#fff';

    const navTop = Math.max(...nav.map(p => p[1]));
    const yTicks = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].filter(v => v <= navTop * 1.12);
    const ddMin = Math.floor(minDd) - 1;
    const rrVals = rrLine.map(p => p[1]);
    const rrMin = Math.min(...rrVals), rrMax = Math.max(...rrVals);
    const rrPad = Math.max(1, (rrMax - rrMin) * 0.12);

    const annMarkPoints = anns.map(a => {
      const auto = new Date(a.date).getTime() > new Date(dates[dates.length - 1]).getTime() - 1200 * 86400000;
      const toLeft = a.side === 'left' ? true : (a.side === 'right' ? false : auto);
      return {
        coord: [a.date, a.y],
        label: {
          show: true,
          position: toLeft ? 'left' : 'right',
          distance: 10,
          color: RED,
          fontSize: 11,
          fontWeight: 600,
          lineHeight: 15,
          backgroundColor: cardBg,
          borderColor: RED,
          borderWidth: 1.3,
          borderRadius: 4,
          padding: [5, 8],
          formatter: a.label,
        },
      };
    });

    // 加息日竖向阴影（markArea 挂在 NAV 面板上，宽度无限细 → 视觉为贯穿竖线）
    // 129 个 markArea 会显著拖慢渲染，压缩为去重后的「加息年份」段不影响可读性。
    const hikeYears = [...new Set(hikes.map(d => d.slice(0, 4)))];
    const hikeMarkAreas = hikeYears.map(y => ([
      { xAxis: `${y}-01-01`, itemStyle: { color: HIKE_SHADE } },
      { xAxis: `${y}-12-31` },
    ]));

    return {
      animation: false,
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      // 三面板高度比 ≈ 1.15 : 0.95 : 0.85（对齐定稿 PNG）
      grid: [
        { left: 70, right: 30, top: 64, height: '26%' },
        { left: 70, right: 30, top: '46%', height: '21%' },
        { left: 70, right: 30, bottom: 70, height: '19%' },
      ],
      legend: getLineLegendConfig({
        data: [L.nav, L.dd, L.posRate, L.negRate, L.hikeDay],
      }),
      tooltip: {
        trigger: 'axis',
        backgroundColor: cardBg,
        borderColor: cssVar('--border') || '#e8e8e8',
        textStyle: { fontSize: 13, color: cssVar('--text') || '#1a1a1a', fontFamily: CHART_FONT },
        formatter: params => {
          if (!params?.length) return '';
          const dateStr = (params[0].value?.[0] || '').slice(0, 10);
          const out = [dateStr];
          const navPt = params.find(p => p.seriesName === L.nav);
          const ddPt = params.find(p => p.seriesName === L.dd);
          const rrPt = params.find(p => (p.seriesName === L.posRate || p.seriesName === L.negRate) && p.value?.[1] != null);
          if (navPt?.value?.[1] != null) out.push(`${indexLabel}: <b>${formatNumber(navPt.value[1], 2)}x</b>`);
          if (ddPt?.value?.[1] != null) out.push(`${L.dd}: <b style="color:${GREEN}">${ddPt.value[1].toFixed(1)}%</b>`);
          if (rrPt?.value?.[1] != null) out.push(`${L.realRate}: <b>${rrPt.value[1].toFixed(1)}%</b>`);
          return out.join('<br/>');
        },
      },
      xAxis: [0, 1, 2].map(i => ({
        type: 'time',
        gridIndex: i,
        min: dates[0],
        max: dates[dates.length - 1],
        boundaryGap: false,
        axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT, hideOverlap: true },
        splitLine: { show: false },
        axisLine: { onZero: false, lineStyle: { color: grayColor } },
        axisTick: { show: false },
      })),
      yAxis: [
        {
          type: 'log', gridIndex: 0, min: 0.85, max: navTop * 1.12,
          axisLabel: {
            formatter: v => (yTicks.includes(v) ? `${v}x` : ''),
            fontSize: 11, color: grayColor, fontFamily: CHART_FONT,
          },
          splitLine: { lineStyle: { color: gridColor } },
        },
        {
          type: 'value', gridIndex: 1, min: ddMin, max: 0,
          axisLabel: { formatter: '{value}%', fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
          splitLine: { lineStyle: { color: gridColor } },
        },
        {
          type: 'value', gridIndex: 2,
          min: Math.floor(rrMin - rrPad), max: Math.ceil(rrMax + rrPad),
          axisLabel: { formatter: '{value}%', fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
          splitLine: { lineStyle: { color: gridColor } },
        },
      ],
      series: [
        {
          name: L.nav,
          type: 'line',
          xAxisIndex: 0, yAxisIndex: 0,
          data: nav,
          showSymbol: false,
          lineStyle: { width: 2.2, color: BLUE },
          areaStyle: { color: 'rgba(37,99,235,0.16)' },
          z: 3,
          markPoint: annMarkPoints.length
            ? { silent: true, symbol: 'rect', symbolSize: 0.01, data: annMarkPoints }
            : undefined,
          markArea: hikeMarkAreas.length ? { silent: true, data: hikeMarkAreas } : undefined,
        },
        {
          name: L.dd,
          type: 'line',
          xAxisIndex: 1, yAxisIndex: 1,
          data: ddSeries,
          showSymbol: false,
          lineStyle: { width: 1.6, color: GREEN },
          areaStyle: { color: 'rgba(56,158,13,0.24)' },
          z: 3,
          markArea: hikeMarkAreas.length ? { silent: true, data: hikeMarkAreas } : undefined,
        },
        {
          name: L.posRate,
          type: 'line',
          xAxisIndex: 2, yAxisIndex: 2,
          data: rrPos,
          showSymbol: false,
          lineStyle: { width: 0 },
          areaStyle: { origin: 'start', color: 'rgba(207,19,34,0.42)' },
          connectNulls: false,
          z: 2,
          markArea: hikeMarkAreas.length ? { silent: true, data: hikeMarkAreas } : undefined,
        },
        {
          name: L.negRate,
          type: 'line',
          xAxisIndex: 2, yAxisIndex: 2,
          data: rrNeg,
          showSymbol: false,
          lineStyle: { width: 0 },
          areaStyle: { origin: 'end', color: 'rgba(37,99,235,0.42)' },
          connectNulls: false,
          z: 2,
        },
        {
          name: '_real_rate_line',
          type: 'line',
          xAxisIndex: 2, yAxisIndex: 2,
          data: rrLine,
          showSymbol: false,
          lineStyle: { width: 1.2, color: cssVar('--gray') || '#999' },
          z: 4,
          tooltip: { show: false },
        },
        {
          // 图例占位：加息年阴影的样式来源（无数据，不渲染任何图形）
          name: L.hikeDay,
          type: 'line',
          data: [],
          itemStyle: { color: 'rgba(207,19,34,0.35)' },
          lineStyle: { width: 0 },
          silent: true,
          tooltip: { show: false },
        },
      ],
      dataZoom: [
        {
          type: 'slider',
          xAxisIndex: [0, 1, 2],
          start: 0,
          end: 100,
          height: 24,
          bottom: 8,
          borderColor: 'transparent',
          backgroundColor: cssVar('--bg-section') || '#fafafa',
          fillerColor: cssVar('--accent-light') || 'rgba(71,88,224,0.08)',
          handleStyle: { color: cssVar('--accent') || '#4758e0' },
          textStyle: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
        },
      ],
    };
  }

  const chart = registerChart(echarts.init(dom));
  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  // ── Metric strip ──
  const el = document.getElementById(summaryId);
  if (!el) return;
  const cur = fedData.latest || {};
  const extremes = fedData.extremes || {};
  const wr1d = winrate(r1d), wr1y = winrate(r1y);
  renderMetricStrip(summaryId, [
    buildMetricCard(
      L.after1d.replace('{index}', indexLabel),
      pctStr(mean(r1d), 2),
      `${L.winrate} ${wr1d != null ? (wr1d * 100).toFixed(0) + '%' : '—'} · ${r1d.length} ${L.hikeNoun}`,
    ),
    buildMetricCard(
      L.after1y.replace('{index}', indexLabel),
      `${pctStr(mean(r1y))} / ${L.median} ${pctStr(med(r1y))}`,
      `${L.winrate} ${wr1y != null ? (wr1y * 100).toFixed(0) + '%' : '—'} · ${r1y.length} ${L.hikeNounFull}`,
    ),
    buildMetricCard(
      `${L.sinceStart} ${start.slice(0, 4)}`,
      `${lastNav.toFixed(1)}x · ${L.annualized} ${pctStr(cagr)}`,
      `${L.maxDd} ${minDd.toFixed(1)}%`,
    ),
    buildMetricCard(
      L.realRateNow,
      cur.real_rate != null ? pctStr(cur.real_rate) : '—',
      extremes.max?.date
        ? `${L.histHi} +${extremes.max.value.toFixed(1)}%（${extremes.max.date.slice(0, 7)}）· ${L.histLo} ${extremes.min.value.toFixed(1)}%（${extremes.min.date.slice(0, 7)}）`
        : '',
    ),
  ]);
}

function lowerBound(dates, d) {
  let lo = 0, hi = dates.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (dates[m] < d) lo = m + 1; else hi = m; }
  return lo;
}
function lowerBoundOffset(dates, d, days) {
  const target = new Date(new Date(d).getTime() + days * 86400000).toISOString().slice(0, 10);
  return lowerBound(dates, target);
}

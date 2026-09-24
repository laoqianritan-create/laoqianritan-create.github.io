// panels/fed_hikes.js · 加息与股指：三面板（对数净值 / 回撤 / 实际利率）+ 加息日竖阴影
//
// 形式复刻 2026-09-23 老钱定稿的「加息与黄金」三面板。
// 数据源：data/fed_hikes.json（fetch_fed_hikes in fetch_data.py）
//        data/sp500_price.json / data/ndx_price.json（已有价格序列，按面板起点切片）
// 标普500 面板自 1954 年起（联邦基金利率数据起点）；纳指100 面板自 1985-10 起（指数可得起点）。
//
// 2026-09-24 老钱反馈（两面板同款）已修：
//   ① 模块1 标注改为「真锚点圆点 + 虚线连接 + 像素级防重叠排布」，标签与曲线节点一眼对应
//   ② 三个 grid 间距统一（gap 相等，4% 画布高）
//   ③ 模块3 增加 0% / +3% 黑色虚线参考线
//   ④ 图例颜色与图中元素一一对应（给每个 series 显式 itemStyle 配色）
//   ⑤ 模块2 回撤线宽 1.6 → 1
//   ⑥ 模块3 红/蓝语义写进 y 轴名（红＝实际利率为正·钱贵；蓝＝为负·钱便宜）

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
const BLACK = '#1a1a1a';
const REAL_POS_FILL = 'rgba(207,19,34,0.42)';
const REAL_NEG_FILL = 'rgba(37,99,235,0.42)';
const HIKE_SHADE = 'rgba(207,19,34,0.05)';      // 加息年竖向阴影
const REAL_RATE_TIGHT = 3;                      // 实际利率「钱贵」参考线

// 三面板统一间距：top/gap/bottom 与三个高度都按画布高度百分比给，保证 gap 相等（老钱②）
const GRID_TOP = 9, GRID_GAP = 4, GRID_BOTTOM = 10;
const GRID_H = [28.8, 23.2, 21];

/**
 * @param {string} containerId  chart 容器 id
 * @param {string} summaryId    metric strip 容器 id
 * @param {Object} fedData      fed_hikes.json
 * @param {Object} priceData    sp500_price.json / ndx_price.json
 * @param {Object} opts         { start, indexLabel, anns, labels }
 *   anns: 事件标注 [{date, label, y?, side?}]；label 文案，side 'left' = 标签整体贴左侧
 *         （右侧末段 40 个月内自动左置）。y 为历史手工偏好值，现由自动排布接管、可留可去。
 */
export function initFedHikesPanel(containerId, summaryId, fedData, priceData, opts = {}) {
  const dom = document.getElementById(containerId);
  if (!dom || !fedData?.events?.length || !priceData?.series?.length) return;

  const start = opts.start || '1954-01-01';
  const indexLabel = opts.indexLabel || '标普500';
  const anns = opts.anns || [];
  const L = opts.labels || {};
  const TXT = {
    tight: L.tight || '钱贵',
    easy: L.easy || '钱便宜',
    posShort: L.posRateShort || '实际利率为正',
    negShort: L.negRateShort || '实际利率为负',
  };
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
  const navTop = Math.max(...nav.map(p => p[1]));
  const navMin = 0.85;
  const navMax = navTop * 1.12;

  const realRate = (fedData.series?.real_rate || []).filter(r => r.date >= start);
  if (!realRate.length) return;
  const rrPos = realRate.map(r => [r.date, r.value >= 0 ? +r.value.toFixed(2) : null]);
  const rrNeg = realRate.map(r => [r.date, r.value < 0 ? +r.value.toFixed(2) : null]);
  const rrLine = realRate.map(r => [r.date, +r.value.toFixed(2)]);

  const dates = sliced.map(p => p.date);
  const closes = sliced.map(p => p.close);

  // ── 模块1 标注：真锚点 + 连接线 + 像素级防重叠 ──
  function navValueAt(date) {
    const i = lowerBound(dates, date);
    const j = Math.min(i, dates.length - 1);
    const k = Math.max(0, j - 1);
    return Math.abs(new Date(dates[j]) - new Date(date)) <= Math.abs(new Date(dates[k]) - new Date(date))
      ? nav[j][1] : nav[k][1];
  }

  function layoutAnnotations() {
    const H = dom.clientHeight || 800;
    const W = dom.clientWidth || 1200;
    const gTop = GRID_TOP / 100 * H;
    const gH = GRID_H[0] / 100 * H;
    const gBottom = gTop + gH;
    const logMin = Math.log(navMin), logMax = Math.log(navMax);
    const valToY = v => gBottom - (Math.log(v) - logMin) / (logMax - logMin) * gH;
    const yToVal = y => Math.exp(logMin + (gBottom - y) / gH * (logMax - logMin));
    const t0 = new Date(dates[0]).getTime();
    const t1 = new Date(dates[dates.length - 1]).getTime();
    const PAD_L = 70, PAD_R = 30;
    const dateToX = d => PAD_L + (new Date(d).getTime() - t0) / (t1 - t0) * (W - PAD_L - PAD_R);
    // 粗略估宽：ASCII 6.2px / 汉字 11.5px（字号 11）+ 内边距
    const estW = text => [...text].reduce((s, ch) => s + (/[\x00-\xff]/.test(ch) ? 6.2 : 11.5), 0) + 18;
    const EST_H = 24;

    const placed = [];
    return [...anns]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(a => {
        const anchorX = dateToX(a.date);
        const anchorY = valToY(navValueAt(a.date));
        const auto = new Date(a.date).getTime() > t1 - 1200 * 86400000;
        const toLeft = a.side === 'left' ? true : (a.side === 'right' ? false : auto);
        const w = estW(a.label);
        let rect = null;
        // 由近及远尝试垂直偏移，取第一个不与已放置标签重叠、且不出 grid 的位置
        for (const dy of [0, -30, 30, -60, 60, -92, 92, -126, 126, -160, 160, -196, 196]) {
          const cy = anchorY + dy;
          const x1 = toLeft ? anchorX - 12 - w : anchorX + 12;
          const cand = { x1, x2: x1 + w, y1: cy - EST_H / 2, y2: cy + EST_H / 2 };
          if (cand.y1 < gTop + 2 || cand.y2 > gBottom - 2) continue;
          const clash = placed.some(p =>
            !(cand.x2 < p.x1 - 6 || cand.x1 > p.x2 + 6 || cand.y2 < p.y1 - 4 || cand.y1 > p.y2 + 4));
          if (!clash) { rect = cand; break; }
        }
        if (!rect) {
          const cy = anchorY;
          const x1 = toLeft ? anchorX - 12 - w : anchorX + 12;
          rect = { x1, x2: x1 + w, y1: cy - EST_H / 2, y2: cy + EST_H / 2 };
        }
        placed.push(rect);
        return {
          date: a.date,
          label: a.label,
          toLeft,
          anchorVal: navValueAt(a.date),
          labelVal: yToVal((rect.y1 + rect.y2) / 2),
        };
      });
  }

  // ── 加息后 1 日 / 1 年前向收益 ──
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

    const laid = layoutAnnotations();
    const annPoints = laid.map(a => ([
      {
        coord: [a.date, a.anchorVal],
        symbol: 'circle', symbolSize: 6,
        itemStyle: { color: RED, borderColor: cardBg, borderWidth: 1 },
        label: { show: false },
        z: 8,
      },
      {
        coord: [a.date, a.labelVal],
        symbol: 'rect', symbolSize: 0.01,
        label: {
          show: true,
          position: a.toLeft ? 'left' : 'right',
          distance: 12,
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
      },
    ]));
    const annLeaders = laid.map(a => ([
      { coord: [a.date, a.anchorVal] },
      { coord: [a.date, a.labelVal] },
    ]));

    const hikeYears = [...new Set(hikes.map(d => d.slice(0, 4)))];
    const hikeMarkAreas = hikeYears.map(y => ([
      { xAxis: `${y}-01-01`, itemStyle: { color: HIKE_SHADE } },
      { xAxis: `${y}-12-31` },
    ]));

    const yTicks = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].filter(v => v <= navMax);
    const ddMin = Math.floor(minDd) - 1;
    const rrVals = rrLine.map(p => p[1]);
    const rrMin = Math.min(...rrVals), rrMax = Math.max(...rrVals);
    const rrPad = Math.max(1, (rrMax - rrMin) * 0.12);

    const g = i => ({
      left: 70, right: 30,
      top: `${GRID_TOP + GRID_H.slice(0, i).reduce((s, h) => s + h + GRID_GAP, 0)}%`,
      height: `${GRID_H[i]}%`,
    });

    return {
      animation: false,
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      grid: [g(0), g(1), g(2)],
      legend: getLineLegendConfig({
        data: [L.nav, L.dd, L.posRate, L.negRate, L.hikeDay],
      }),
      tooltip: {
        trigger: 'axis',
        backgroundColor: cardBg,
        borderColor: cssVar('--border') || '#e8e8e8',
        textStyle: { fontSize: 13, color: cssVar('--text') || BLACK, fontFamily: CHART_FONT },
        formatter: params => {
          if (!params?.length) return '';
          const dateStr = (params[0].value?.[0] || '').slice(0, 10);
          const out = [dateStr];
          const navPt = params.find(p => p.seriesName === L.nav);
          const ddPt = params.find(p => p.seriesName === L.dd);
          const rrPt = params.find(p => (p.seriesName === L.posRate || p.seriesName === L.negRate) && p.value?.[1] != null);
          if (navPt?.value?.[1] != null) out.push(`${indexLabel}: <b>${formatNumber(navPt.value[1], 2)}x</b>`);
          if (ddPt?.value?.[1] != null) out.push(`${L.dd}: <b style="color:${GREEN}">${ddPt.value[1].toFixed(1)}%</b>`);
          if (rrPt?.value?.[1] != null) {
            const v = rrPt.value[1];
            out.push(`${L.realRate}: <b style="color:${v >= 0 ? RED : BLUE}">${v.toFixed(1)}%</b>（${v >= 0 ? TXT.tight : TXT.easy}）`);
          }
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
          type: 'log', gridIndex: 0, min: navMin, max: navMax,
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
          name: `${L.realRate}：红＝${TXT.tight} · 蓝＝${TXT.easy}`,
          nameLocation: 'end',
          nameGap: 6,
          nameTextStyle: { fontSize: 11, color: cssVar('--text-secondary') || '#666', fontFamily: CHART_FONT, align: 'left' },
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
          itemStyle: { color: BLUE },
          areaStyle: { color: 'rgba(37,99,235,0.16)' },
          z: 3,
          markPoint: annPoints.length
            ? { silent: true, data: annPoints.flat() }
            : undefined,
          markArea: hikeMarkAreas.length ? { silent: true, data: hikeMarkAreas } : undefined,
          markLine: annLeaders.length
            ? {
              silent: true, symbol: 'none',
              lineStyle: { color: RED, width: 1, type: [4, 4], opacity: 0.5 },
              label: { show: false },
              data: annLeaders,
              z: 6,
            }
            : undefined,
        },
        {
          name: L.dd,
          type: 'line',
          xAxisIndex: 1, yAxisIndex: 1,
          data: ddSeries,
          showSymbol: false,
          lineStyle: { width: 1, color: GREEN },
          itemStyle: { color: GREEN },
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
          lineStyle: { width: 0, color: RED },
          itemStyle: { color: RED, opacity: 0.85 },
          areaStyle: { origin: 0, color: REAL_POS_FILL },
          connectNulls: false,
          z: 2,
          markArea: hikeMarkAreas.length ? { silent: true, data: hikeMarkAreas } : undefined,
          markLine: {
            silent: true, symbol: 'none',
            label: { show: true, position: 'start', fontSize: 11, fontFamily: CHART_FONT, color: BLACK, formatter: p => p.name },
            data: [
              { yAxis: 0, name: '0%', lineStyle: { color: BLACK, width: 2, type: [6, 4] } },
              { yAxis: REAL_RATE_TIGHT, name: `${REAL_RATE_TIGHT}%`, lineStyle: { color: BLACK, width: 1.2, type: [4, 4], opacity: 0.75 } },
            ],
            z: 7,
          },
        },
        {
          name: L.negRate,
          type: 'line',
          xAxisIndex: 2, yAxisIndex: 2,
          data: rrNeg,
          showSymbol: false,
          lineStyle: { width: 0, color: BLUE },
          itemStyle: { color: BLUE, opacity: 0.85 },
          areaStyle: { origin: 0, color: REAL_NEG_FILL },
          connectNulls: false,
          z: 1,
        },
        {
          name: '_real_rate_line',
          type: 'line',
          xAxisIndex: 2, yAxisIndex: 2,
          data: rrLine,
          showSymbol: false,
          lineStyle: { width: 1.2, color: grayColor },
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
      // 注意：real_rate 数值本身已是百分数（-0.08 = -0.08%），不能再 ×100
      cur.real_rate != null ? `${cur.real_rate > 0 ? '+' : ''}${cur.real_rate.toFixed(1)}%` : '—',
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

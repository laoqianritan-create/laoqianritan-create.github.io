// panels/indices.js · Macro index panels: VIX / Bull-Bear Cycles / Long-Term Trend

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

import { isMobile } from '../mobile.js';

export function initPanelVix(priceData, vixData, recessionData, opts = {}) {
  const chartId = opts.chartId || 'chartVix';
  const indexLabel = opts.indexLabel || 'S&P 500';
  const volLabel = opts.volLabel || 'VIX';
  const volThreshold = opts.volThreshold ?? 20;
  const chart = registerChart(echarts.init(document.getElementById(chartId)));
  const vixMap = new Map(vixData.series.map(item => [item.date, item.value]));
  const series = priceData.series
    .map(item => ({ date: item.date, close: item.close, vix: vixMap.get(item.date) ?? null }))
    .filter(item => item.vix != null);
  const highVixAreas = buildThresholdAreas(series, volThreshold, item => item.vix);

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
        data: [indexLabel, volLabel],
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
          name: indexLabel,
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
          name: volLabel,
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
            lineStyle: { color: '#cf1322', type: 'dashed', width: 1 },
            data: [{ yAxis: volThreshold, label: { formatter: `${volLabel} ${volThreshold}`, fontSize: 11, color: '#cf1322' } }],
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
          return `${params[0].axisValueLabel}<br/>${indexLabel}: <b>${formatNumber(point.close, 0)}</b><br/>${volLabel}: <b>${formatNumber(point.vix, 2)}</b>`;
        },
      },
      dataZoom: getDataZoom(grayColor),
    };
  }

  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  // Optional metric strip: latest VXN + sample stats
  if (opts.summaryId) {
    const node = document.getElementById(opts.summaryId);
    if (node) {
      const vals = vixData.series.map(s => s.value).filter(v => v != null);
      const latest = vixData.series[vixData.series.length - 1];
      const avg = vals.reduce((a, b) => a + b, 0) / Math.max(vals.length, 1);
      const median = [...vals].sort((a, b) => a - b)[Math.floor(vals.length / 2)];
      const maxRec = vixData.series.reduce((m, s) => (s.value > (m?.value ?? -Infinity) ? s : m), null);
      renderMetricStrip(opts.summaryId, [
        buildMetricCard('Latest', latest ? `${formatNumber(latest.value, 2)}` : '--', latest ? `as of ${latest.date}` : ''),
        buildMetricCard('Long-Term Average', formatNumber(avg, 2), `Arithmetic mean across ${vals.length.toLocaleString()} trading days`),
        buildMetricCard('Long-Term Median', formatNumber(median, 2), 'Sample median, less affected by outliers'),
        buildMetricCard('Historical Peak', maxRec ? `${formatNumber(maxRec.value, 2)}` : '--', maxRec ? `recorded on ${maxRec.date}` : ''),
      ]);
    }
  }
}

// ══════════════════════════════════════════════════════
// Panel: Bull/Bear Cycles (Callan-style, 20% threshold state machine)
// 2026-04-17 Replaced YoY/rolling-drawdown with state-machine segmentation: log price axis, per-segment shading + duration/cumulative/annualized labels
// Function name kept as initLogYoyPanel to avoid cross-file import churn (renamed in a later refactor batch)
// ══════════════════════════════════════════════════════

// 20% threshold algorithm: start in bull state; -20% triggers bear; +20% rebound back to bull
function buildBullBearSegments(rawSeries) {
  const byMonth = new Map();
  for (const item of rawSeries || []) {
    if (!item?.date || !(item.value > 0)) continue;
    byMonth.set(item.date.slice(0, 7), item);
  }
  const ordered = Array.from(byMonth.values()).sort((a, b) => a.date.localeCompare(b.date));
  if (ordered.length < 2) return { segments: [], ordered: [] };

  const BEAR_T = -0.20, BULL_T = 0.20;
  const segments = [];
  let state = 'bull';             // Initial state defaults to bull
  let anchor = ordered[0];        // Peak (bull) or trough (bear) of current state
  let segStart = ordered[0];

  for (let i = 1; i < ordered.length; i++) {
    const cur = ordered[i];
    if (state === 'bull') {
      if (cur.value > anchor.value) {
        anchor = cur;             // Refresh bull peak
      } else if ((cur.value - anchor.value) / anchor.value <= BEAR_T) {
        segments.push({ mode: 'bull', start: segStart, end: anchor });
        state = 'bear';
        segStart = anchor;         // Bear segment starts at the prior peak
        anchor = cur;
      }
    } else {
      if (cur.value < anchor.value) {
        anchor = cur;             // Refresh bear trough
      } else if ((cur.value - anchor.value) / anchor.value >= BULL_T) {
        segments.push({ mode: 'bear', start: segStart, end: anchor });
        state = 'bull';
        segStart = anchor;         // Bull segment starts at the prior trough
        anchor = cur;
      }
    }
  }
  // Unfinished final segment: use the latest data point as endpoint (cumulative return runs to present)
  const last = ordered[ordered.length - 1];
  segments.push({ mode: state, start: segStart, end: last, ongoing: true });

  // Duration / cumulative / annualized return per segment
  for (const seg of segments) {
    const ms = new Date(seg.end.date).getTime() - new Date(seg.start.date).getTime();
    const months = Math.max(1, Math.round(ms / (30.4375 * 24 * 3600 * 1000)));
    seg.duration_months = months;
    seg.total_return = (seg.end.value - seg.start.value) / seg.start.value;
    if (months >= 12) {
      const years = months / 12;
      seg.ann_return = Math.pow(1 + seg.total_return, 1 / years) - 1;
    } else {
      seg.ann_return = null;
    }
  }

  // Post-processing: fold "micro bulls" sandwiched between two bears (e.g. the 1932-08~1932-11 50% rebound)
  // into adjacent bears so historic deep bears like the Great Depression remain visually continuous.
  // Metrics use the deepest trough of the merged segment (not next.end) so the label still reflects the real -86%.
  const merged = mergeShortBulls(segments, ordered, MIN_BULL_MONTHS_TO_KEEP);
  return { segments: merged, ordered };
}

const MIN_BULL_MONTHS_TO_KEEP = 6;

function mergeShortBulls(segments, ordered, minMonths) {
  if (!segments || segments.length < 3) return segments;
  const result = segments.slice();
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 1; i < result.length - 1; i++) {
      const cur = result[i];
      if (cur.ongoing) continue;
      if (cur.mode !== 'bull' || cur.duration_months >= minMonths) continue;
      const prev = result[i - 1];
      const next = result[i + 1];
      if (prev.mode !== 'bear' || next.mode !== 'bear') continue;

      // True trough across the merged range (max drawdown after absorbing the short bull)
      const startDate = prev.start.date;
      const endDate = next.end.date;
      const inRange = ordered.filter(p => p.date >= startDate && p.date <= endDate);
      const trough = inRange.reduce((acc, p) => (p.value < acc.value ? p : acc), inRange[0]);

      const ms = new Date(trough.date).getTime() - new Date(prev.start.date).getTime();
      const months = Math.max(1, Math.round(ms / (30.4375 * 24 * 3600 * 1000)));
      const total_return = (trough.value - prev.start.value) / prev.start.value;
      const ann_return = months >= 12
        ? Math.pow(1 + total_return, 1 / (months / 12)) - 1
        : null;

      result.splice(i - 1, 3, {
        mode: 'bear',
        start: prev.start,
        end: next.end,           // Visual boundary stays continuous with the next segment
        extreme: trough,         // Label anchor + metric baseline
        duration_months: months,
        total_return,
        ann_return,
        ongoing: next.ongoing,
        merged: true,
      });
      changed = true;
      break;
    }
  }
  return result;
}

function formatSegmentLabel(seg) {
  // Prefer the year-month of `extreme` (true trough after merging); otherwise fall back to seg.end
  const refDate = (seg.extreme || seg.end).date;
  const ym = `${refDate.slice(0, 4)}.${refDate.slice(5, 7)}`;
  const dur = `${seg.duration_months}m`;
  const tr = `${seg.total_return > 0 ? '+' : ''}${(seg.total_return * 100).toFixed(0)}%`;
  if (seg.ann_return != null) {
    const ann = `${seg.ann_return > 0 ? '+' : ''}${(seg.ann_return * 100).toFixed(0)}%/yr`;
    return `${ym}\n${dur} · ${tr}\n${ann}`;
  }
  return `${ym}\n${dur} · ${tr}`;
}

function middleDate(startDate, endDate) {
  const ms = (new Date(startDate).getTime() + new Date(endDate).getTime()) / 2;
  return new Date(ms).toISOString().slice(0, 10);
}

export function initLogYoyPanel(containerId, data, seriesName, labelOverrides = {}) {
  const dom = document.getElementById(containerId);
  if (!dom || !data?.series?.length) return;
  const chart = registerChart(echarts.init(dom));
  const { segments, ordered } = buildBullBearSegments(data.series);
  if (!segments.length) return;

  // labelOverrides usage: key = segment extreme's 'YYYY-MM' (merged segments use trough, others use anchor);
  // value = { xOff, yOff, force }.
  // Overridden segments skip stagger and use manual coordinates; force=true also bypasses LABEL_MIN_* thresholds.

  const BULL_STROKE = '#389e0d';
  const BEAR_STROKE = '#cf1322';
  const BULL_FILL_TOP = 'rgba(56,158,13,0.30)';
  const BULL_FILL_BOT = 'rgba(56,158,13,0.04)';
  const BEAR_FILL_TOP = 'rgba(207,19,34,0.30)';
  const BEAR_FILL_BOT = 'rgba(207,19,34,0.04)';
  const LABEL_MIN_BULL = 18;   // Bull threshold: avoid 1930s short-bull clutter
  const LABEL_MIN_BEAR = 3;    // Bear threshold: keep short crashes like 1987 / 2020 COVID labeled
  const STAGGER_GAP_MONTHS = 60;  // ~5 years: covers close neighbors like 2020↔2022 and 1981↔1984
  const STAGGER_X_OFFSET = 50;    // Horizontal stagger pixel offset
  const LABEL_DISTANCE   = 10;    // Fixed vertical distance between label and extreme point (hard-coded, no yOff laddering)

  // Hybrid Y scale:
  //   Bull Y = ln(price/start)*100 (log compression so century-long bulls don't dominate visually)
  //   Bear Y = (price-start)/start*100 (simple percentage, naturally capped at -100%)
  function buildSeries() {
    // Pass 1: compute data and extreme point per segment (true extreme = bull max / bear min)
    const prepared = segments.map((seg, idx) => {
      const isBull = seg.mode === 'bull';
      const startVal = seg.start.value;
      const segData = ordered
        .filter(p => p.date >= seg.start.date && p.date <= seg.end.date)
        .map(p => {
          const y = isBull
            ? Math.log(p.value / startVal) * 100
            : (p.value - startVal) / startVal * 100;
          return [p.date, y];
        });
      let extremePoint = segData[segData.length - 1] || [seg.end.date, 0];
      // Merged bears anchor on seg.extreme directly; otherwise scan segData
      if (seg.extreme) {
        const exY = isBull
          ? Math.log(seg.extreme.value / startVal) * 100
          : (seg.extreme.value - startVal) / startVal * 100;
        extremePoint = [seg.extreme.date, exY];
      } else {
        for (const pt of segData) {
          if (isBull ? pt[1] > extremePoint[1] : pt[1] < extremePoint[1]) {
            extremePoint = pt;
          }
        }
      }
      return {
        seg, idx, isBull, segData,
        extremeDate: extremePoint[0],
        extremeY: extremePoint[1],
      };
    });

    // Pass 2: select labels → within same mode, stagger via "distance + flip" on both axes
    const ovKey = p => (p.seg.extreme || p.seg.end).date.slice(0, 7);
    const labeled = prepared.filter(p => {
      const ov = labelOverrides[ovKey(p)];
      if (ov?.force) return true;
      return p.seg.duration_months >= (p.isBull ? LABEL_MIN_BULL : LABEL_MIN_BEAR);
    });

    // Stagger strategy: label vertical distance is fixed (always LABEL_DISTANCE px above/below the extreme),
    // only horizontal xOff is staggered. When same-mode segments cluster within 60 months:
    //   counter 1 → +50  counter 2 → -50  counter 3 → +100  counter 4 → -100 …
    // No yOff laddering — keeps labels visually attached to their curve point.
    function stagger(list, basePosition) {
      list.sort((a, b) => a.extremeDate.localeCompare(b.extremeDate));
      let lastMs = null;
      let counter = 0;
      for (const p of list) {
        const curMs = new Date(p.extremeDate).getTime();
        let xOff = 0;
        if (lastMs != null) {
          const gapMonths = (curMs - lastMs) / (30.4375 * 24 * 3600 * 1000);
          if (gapMonths < STAGGER_GAP_MONTHS) {
            counter += 1;
            const tier = Math.ceil(counter / 2);
            xOff = (counter % 2 === 1 ? +1 : -1) * STAGGER_X_OFFSET * tier;
          } else {
            counter = 0;
          }
        }
        p.placement = { position: basePosition, xOff, yOff: 0 };
        lastMs = curMs;
      }
    }
    stagger(labeled.filter(p => p.isBull), 'top');
    stagger(labeled.filter(p => !p.isBull), 'bottom');

    // Pass 3 patch: overrides directly replace the auto-staggered placement
    // ov.position can explicitly set 'top'/'bottom' (e.g. the 1935 bear label needs to sit above the curve)
    for (const p of labeled) {
      const ov = labelOverrides[ovKey(p)];
      if (!ov) continue;
      p.placement = {
        position: ov.position || (p.isBull ? 'top' : 'bottom'),
        xOff: ov.xOff ?? 0,
        yOff: ov.yOff ?? 0,
      };
    }

    // Pass 3: build echarts series
    return prepared.map(p => {
      const { seg, idx, isBull, segData, extremeY, extremeDate, placement } = p;
      const series = {
        name: isBull ? `Bull #${idx}` : `Bear #${idx}`,
        type: 'line',
        data: segData,
        showSymbol: false,
        lineStyle: { width: 1.4, color: isBull ? BULL_STROKE : BEAR_STROKE },
        areaStyle: {
          origin: 0,
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: isBull ? BULL_FILL_TOP : BEAR_FILL_BOT },
            { offset: 1, color: isBull ? BULL_FILL_BOT : BEAR_FILL_TOP },
          ]),
        },
        z: 2,
      };
      // Mobile: hide dense bull/bear segment labels (data still available via tooltip)
      if (placement && !isMobile()) {
        series.markPoint = {
          silent: true,
          symbol: 'rect',
          symbolSize: 0.01,
          data: [{
            coord: [extremeDate, extremeY],
            label: {
              show: true,
              position: placement.position,
              distance: LABEL_DISTANCE,
              offset: [placement.xOff, placement.yOff],
              color: isBull ? BULL_STROKE : BEAR_STROKE,
              fontSize: 10,
              fontWeight: 600,
              lineHeight: 13,
              formatter: formatSegmentLabel(seg),
            },
          }],
        };
      }
      return series;
    });
  }

  function getOption() {
    const gridColor = cssVar('--chart-grid') || '#f0f0f0';
    const grayColor = cssVar('--gray') || '#999';
    const textColor = cssVar('--text') || '#1a1a1a';

    // Segment labels hidden on mobile, so no extra top/bottom padding needed
    const mobile = isMobile();
    return {
      animation: false,
      // Labels are tight against extreme points (distance=10), so no oversized top/bottom margins
      grid: mobile
        ? { left: 48, right: 14, top: 20, bottom: 60 }
        : { left: 60, right: 24, top: 60, bottom: 70 },
      xAxis: {
        type: 'time',
        axisLabel: { fontSize: mobile ? 10 : 11, color: grayColor, fontFamily: CHART_FONT, hideOverlap: true },
        splitLine: { show: false },
        axisLine: { onZero: true, lineStyle: { color: grayColor } },
      },
      yAxis: {
        type: 'value',
        min: -105,                         // Bears bottom out at -100%; leave 5% padding
        axisLabel: {
          formatter: v => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`,
          fontSize: 11,
          color: grayColor,
          fontFamily: CHART_FONT,
        },
        splitLine: { lineStyle: { color: gridColor } },
      },
      series: buildSeries(),
      tooltip: {
        trigger: 'axis',
        backgroundColor: cssVar('--card-bg') || '#fff',
        borderColor: cssVar('--border') || '#e8e8e8',
        textStyle: { fontSize: 13, color: textColor, fontFamily: CHART_FONT },
        formatter: params => {
          const axisLabel = params?.[0]?.axisValueLabel || '';
          const p = params.find(x => Array.isArray(x.value) && x.value[1] != null);
          if (!p) return axisLabel;
          const dateStr = p.value[0];
          const seg = segments.find(s => dateStr >= s.start.date && dateStr <= s.end.date);
          if (!seg) return axisLabel;
          const isBull = seg.mode === 'bull';
          const color = isBull ? BULL_STROKE : BEAR_STROKE;
          // Pull real price from raw data (better precision than inverting the log value)
          const row = ordered.find(r => r.date === dateStr) || { value: seg.start.value };
          const curPrice = row.value;
          const simpleRet = (curPrice - seg.start.value) / seg.start.value * 100;
          const lines = [
            axisLabel,
            `Level: <b>${formatNumber(curPrice, 2)}</b>`,
            `This Segment to Date: <b style="color:${color}">${simpleRet > 0 ? '+' : ''}${simpleRet.toFixed(1)}%</b>`,
            `State: <b style="color:${color}">${isBull ? 'Bull' : 'Bear'}${seg.ongoing ? ' (ongoing)' : ''}</b>`,
            `Segment: ${seg.start.date.slice(0, 7)} → ${seg.end.date.slice(0, 7)} · ${seg.duration_months} months`,
            `Segment Cumulative: <b style="color:${color}">${seg.total_return > 0 ? '+' : ''}${(seg.total_return * 100).toFixed(1)}%</b>`,
          ];
          if (seg.ann_return != null) {
            lines.push(`Annualized: ${seg.ann_return > 0 ? '+' : ''}${(seg.ann_return * 100).toFixed(1)}%`);
          }
          return lines.join('<br/>');
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
    buildMetricCard('Base Point', `${data.start?.date || '--'} | ${data.start ? formatNumber(data.start.value, 2) : '--'}`, 'Anchors the long-run series with the starting monthly level.'),
    buildMetricCard('Latest', data.latest ? formatNumber(data.latest.value, 2) : '--', data.latest ? `Updated ${data.latest.date}` : 'Awaiting data'),
    buildMetricCard('CAGR', data.cagr != null ? formatPercent(data.cagr, 2) : '--', 'Long-run CAGR from base point to the latest monthly level.'),
    buildMetricCard('View Toggle', 'Price / Log / Percent', 'Price for absolute levels, log for compound slope, percent for cumulative return from base.'),
    buildMetricCard('Recession Shading', 'Enabled', 'Light-gray bands based on NBER / FRED US recession indicator.'),
  ]);
}

// ══════════════════════════════════════════════════════
// Panel: AIAE - Aggregate Investor Allocation to Equities
// Paper: alphaarchitect.com/market-timing-using-aggregate-equity-allocation-signals
// Dual axis: left = AIAE % (black line) + right = subsequent 10y realized annualized return % (gray bars, shifted 10 years left to align)
// ══════════════════════════════════════════════════════
export function initPanelAiae(aiaeData) {
  const dom = document.getElementById('chartAiae');
  if (!dom || !aiaeData?.series?.length) return;
  const chart = registerChart(echarts.init(dom));
  const series = aiaeData.series;
  const summary = aiaeData.summary || {};

  function getOption() {
    const lineColor = cssVar('--sp500-line') || '#1a1a1a';
    const gridColor = cssVar('--chart-grid') || '#f0f0f0';
    const grayColor = cssVar('--gray') || '#999';
    const textColor = cssVar('--text') || '#1a1a1a';
    const futureColor = '#cf1322';

    // Align "subsequent 10y realized annualized" to the start date (1980 point = 1980→1990 annualized)
    const aiaeLine = series.map(p => [p.date, p.aiae * 100]);
    const subsequent = series
      .filter(p => p.subsequent_10y_ann != null)
      .map(p => [p.date, p.subsequent_10y_ann * 100]);
    const forecastLine = series
      .filter(p => p.implied_10y_forecast != null)
      .map(p => [p.date, p.implied_10y_forecast * 100]);

    return {
      animation: false,
      grid: { left: 60, right: 60, top: 50, bottom: 60 },
      legend: getLineLegendConfig({ data: ['AIAE Allocation', 'Subsequent 10Y Realized', '10Y Regression Forecast'] }),
      xAxis: {
        type: 'time',
        axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
        splitLine: { show: false },
      },
      yAxis: [
        {
          type: 'value',
          position: 'left',
          name: 'AIAE %',
          nameTextStyle: { fontSize: 10, color: grayColor, fontFamily: CHART_FONT },
          axisLabel: { formatter: v => `${v.toFixed(0)}%`, fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
          splitLine: { lineStyle: { color: gridColor } },
        },
        {
          type: 'value',
          position: 'right',
          name: '10Y Annualized %',
          nameTextStyle: { fontSize: 10, color: grayColor, fontFamily: CHART_FONT },
          axisLabel: { formatter: v => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`, fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: 'AIAE Allocation',
          type: 'line',
          yAxisIndex: 0,
          showSymbol: false,
          data: aiaeLine,
          color: lineColor,
          lineStyle: { width: 2, color: lineColor },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(26,26,26,0.20)' },
              { offset: 1, color: 'rgba(26,26,26,0.02)' },
            ]),
          },
        },
        {
          name: 'Subsequent 10Y Realized',
          type: 'line',
          yAxisIndex: 1,
          showSymbol: false,
          data: subsequent,
          color: futureColor,
          lineStyle: { width: 1.6, color: futureColor, type: 'solid' },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: grayColor, type: 'dashed', width: 1 },
            data: [{ yAxis: 0, label: { formatter: '0%', fontSize: 10, color: grayColor } }],
          },
        },
        {
          name: '10Y Regression Forecast',
          type: 'line',
          yAxisIndex: 1,
          showSymbol: false,
          data: forecastLine,
          color: '#faad14',
          lineStyle: { width: 1.2, color: '#faad14', type: 'dashed' },
        },
      ],
      tooltip: {
        trigger: 'axis',
        backgroundColor: cssVar('--card-bg') || '#fff',
        borderColor: cssVar('--border') || '#e8e8e8',
        textStyle: { fontSize: 13, color: textColor, fontFamily: CHART_FONT },
        formatter: params => {
          const date = params?.[0]?.axisValueLabel || '';
          const point = series.find(p => p.date === params[0].value[0]) ||
                        series.find(p => p.date.slice(0, 7) === date.slice(0, 7));
          if (!point) return date;
          const lines = [
            date.slice(0, 7),
            `<b>AIAE Allocation</b>: ${(point.aiae * 100).toFixed(2)}%`,
          ];
          if (point.implied_10y_forecast != null) {
            lines.push(`10Y Regression Forecast: <b style="color:#faad14">${(point.implied_10y_forecast * 100 > 0 ? '+' : '')}${(point.implied_10y_forecast * 100).toFixed(2)}%</b>`);
          }
          if (point.subsequent_10y_ann != null) {
            lines.push(`Realized Subsequent 10Y: <b style="color:${futureColor}">${(point.subsequent_10y_ann * 100 > 0 ? '+' : '')}${(point.subsequent_10y_ann * 100).toFixed(2)}%</b>`);
          } else {
            lines.push(`<span style="color:${grayColor}">Realized 10Y: not yet matured</span>`);
          }
          return lines.join('<br/>');
        },
      },
      dataZoom: getDataZoom(grayColor),
    };
  }

  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  // Metric strip
  const fmtPct = (v, digits = 2) => v == null ? '--' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`;
  const fmtBps = v => v == null ? '--' : `${v > 0 ? '+' : ''}${(v * 10000).toFixed(0)} bps`;
  const ymKey = summary.latest_date ? summary.latest_date.slice(0, 7) : '--';
  const pct = summary.historical_percentile != null ? `${(summary.historical_percentile * 100).toFixed(1)}%` : '--';

  renderMetricStrip('aiaeSummary', [
    buildMetricCard(
      'Latest AIAE',
      summary.latest_aiae != null ? `${(summary.latest_aiae * 100).toFixed(2)}%` : '--',
      `${ymKey} | Historical percentile ${pct}`
    ),
    buildMetricCard(
      'Historical Range',
      summary.historical_min != null
        ? `${(summary.historical_min * 100).toFixed(1)}% ~ ${(summary.historical_max * 100).toFixed(1)}%`
        : '--',
      `Mean ${summary.historical_mean != null ? (summary.historical_mean * 100).toFixed(2) : '--'}% | Quarterly since 1945`
    ),
    buildMetricCard(
      'Implied 10Y Forecast',
      fmtPct(summary.latest_implied_10y_forecast),
      `Full-sample OLS regression (n=${summary.regression?.n_obs || '--'}): annualized forecast, reference only`
    ),
    buildMetricCard(
      'Current 10Y Yield',
      summary.current_10y_yield != null ? `${(summary.current_10y_yield * 100).toFixed(2)}%` : '--',
      'Latest FRED DGS10 value'
    ),
    buildMetricCard(
      'Implied Risk Premium',
      fmtBps(summary.implied_equity_risk_premium),
      'Forecast equity annualized − 10Y Treasury. Negative = cash preferred'
    ),
    buildMetricCard(
      'Release Cadence',
      `Quarterly | lag ~${summary.release_lag_weeks || 10} weeks`,
      'Z.1 report released quarterly; next refresh around early July'
    ),
  ]);
}

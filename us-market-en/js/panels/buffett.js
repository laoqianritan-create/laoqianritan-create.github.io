// panels/buffett.js · Buffett Indicator panel
//
// Buffett Indicator (Modified version, GuruFocus formulation)
// Formula: Ratio = TMC / (GDP + Fed Balance Sheet)
//   - Original indicator: TMC / GDP, introduced by Buffett in 2001 and described as
//     "probably the best single measure of where valuations stand at any given moment."
//   - Modified version: adds Fed total assets to the denominator to absorb the
//     liquidity expansion of the QE era. Without this adjustment, the original
//     indicator misreads "market cap propped up by printed money" as "significantly overvalued."
//
// Five buckets (calibrated for the modified version):
//   ≤73%      Significantly Undervalued
//   73-94%    Undervalued
//   94-115%   Fair Value
//   115-136%  Overvalued
//   >136%     Significantly Overvalued
//
// Data sources: TMC from yfinance ^W5000 (1989+) + FRED NCBEILQ027S (1970-1988 spliced with cross-validation)
//               GDP from FRED GDP (quarterly, annualized)
//               Fed assets from FRED WALCL (2002.12+; earlier window falls back to the original formulation)
// Reference: https://www.gurufocus.cn/indicator/buffett-market-valuation

import {
  CHART_FONT,
  cssVar,
  formatNumber,
} from '../utils.js';

import {
  registerChart,
  buildMetricCard,
  renderMetricStrip,
  getDataZoom,
  getLineLegendConfig,
} from '../chart-helpers.js';

// Locate the bucket label for a given modified-version ratio
function bandLabelFor(ratio, bands) {
  if (ratio == null || !bands) return null;
  for (const b of bands) {
    if (b.max == null || ratio <= b.max) return b;
  }
  return bands[bands.length - 1];
}

export function initPanelBuffett(buffettData, priceData) {
  const dom = document.getElementById('chartBuffett');
  if (!dom || !buffettData?.series?.length) return;
  const chart = registerChart(echarts.init(dom));

  const series = buffettData.series;
  const bandsModified = buffettData.valuation_modified?.bands || [];
  const bandsClassic = buffettData.valuation_classic?.bands || [];
  const cur = buffettData.current || {};
  const ext = buffettData.extremes || {};

  // Downsample S&P 500 prices to month-end for date alignment with the Buffett series
  const priceMap = new Map();
  if (priceData?.series?.length) {
    for (const it of priceData.series) {
      if (!it?.date) continue;
      // month key → last observed price within that month
      priceMap.set(it.date.slice(0, 7), it.close);
    }
  }

  // Build monthly S&P 500 series sharing the Buffett-indicator time axis
  const sp500Line = series
    .map(p => {
      const close = priceMap.get(p.date.slice(0, 7));
      return close != null ? [p.date, close] : null;
    })
    .filter(Boolean);

  function getOption() {
    const lineColor = '#2563eb';            // modified-version main line (blue)
    const classicColor = '#999';            // original-version reference (gray dashed)
    const sp500Color = '#1a1a1a';            // S&P 500 in black
    const gridColor = cssVar('--chart-grid') || '#f0f0f0';
    const grayColor = cssVar('--gray') || '#999';
    const textColor = cssVar('--text') || '#1a1a1a';

    // markArea for five-bucket background (modified-version thresholds), spanning the full axis
    const xMin = series[0].date;
    const xMax = series[series.length - 1].date;
    const markAreas = [];
    let prevMax = 0;
    for (const b of bandsModified) {
      const yMin = prevMax;
      const yMax = b.max != null ? b.max : 'max';
      // alpha 16 transparency
      const colorWithAlpha = (b.color || '#cccccc') + '24';
      markAreas.push([
        { yAxis: yMin, xAxis: xMin, itemStyle: { color: colorWithAlpha } },
        { yAxis: yMax, xAxis: xMax },
      ]);
      if (b.max != null) prevMax = b.max;
    }

    const modLine = series.map(p => [p.date, p.ratio_modified]);
    const classicLine = series.map(p => [p.date, p.ratio_classic]);

    // markPoint: only modified-version historical peak / trough, numeric labels only
    // (no "peak" / "trough" text, and no current-value label)
    const markPoints = [];
    if (ext.modified_peak) {
      markPoints.push({
        name: 'peak',
        coord: [ext.modified_peak.date, ext.modified_peak.value],
        value: `${ext.modified_peak.value.toFixed(0)}%`,
        itemStyle: { color: '#cf1322' },
        symbol: 'pin',
        symbolSize: 46,
        label: { fontSize: 10, color: '#fff', fontFamily: CHART_FONT },
      });
    }
    if (ext.modified_trough) {
      markPoints.push({
        name: 'trough',
        coord: [ext.modified_trough.date, ext.modified_trough.value],
        value: `${ext.modified_trough.value.toFixed(0)}%`,
        itemStyle: { color: '#1d7e3a' },
        symbol: 'pin',
        symbolSize: 46,
        label: { fontSize: 10, color: '#fff', fontFamily: CHART_FONT },
      });
    }

    return {
      animation: false,
      grid: { left: 70, right: 65, top: 40, bottom: 60 },
      legend: getLineLegendConfig({
        data: ['S&P 500', 'Modified: TMC/(GDP+TA)', 'Original: TMC/GDP'],
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
          name: 'S&P 500',
          nameTextStyle: { fontSize: 10, color: grayColor, fontFamily: CHART_FONT },
          axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
          splitLine: { show: false },
        },
        {
          type: 'value',
          position: 'right',
          name: 'Valuation Ratio %',
          nameTextStyle: { fontSize: 10, color: grayColor, fontFamily: CHART_FONT },
          axisLabel: { formatter: v => `${v.toFixed(0)}%`, fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
          splitLine: { lineStyle: { color: gridColor } },
        },
      ],
      series: [
        {
          name: 'S&P 500',
          type: 'line',
          yAxisIndex: 0,
          showSymbol: false,
          data: sp500Line,
          color: sp500Color,
          lineStyle: { width: 1, color: sp500Color },
          z: 1,
        },
        {
          name: 'Original: TMC/GDP',
          type: 'line',
          yAxisIndex: 1,
          showSymbol: false,
          data: classicLine,
          color: classicColor,
          lineStyle: { width: 1.2, color: classicColor, type: 'dashed' },
          z: 2,
        },
        {
          name: 'Modified: TMC/(GDP+TA)',
          type: 'line',
          yAxisIndex: 1,
          showSymbol: false,
          data: modLine,
          color: lineColor,
          lineStyle: { width: 2, color: lineColor },
          z: 3,
          markArea: markAreas.length ? {
            silent: true,
            data: markAreas,
            label: { show: false },
          } : undefined,
          markPoint: markPoints.length ? {
            data: markPoints,
            label: { fontSize: 10, color: '#fff', fontFamily: CHART_FONT },
          } : undefined,
        },
      ],
      tooltip: {
        trigger: 'axis',
        backgroundColor: cssVar('--card-bg') || '#fff',
        borderColor: cssVar('--border') || '#e8e8e8',
        textStyle: { fontSize: 13, color: textColor, fontFamily: CHART_FONT },
        formatter: params => {
          if (!params?.length) return '';
          const date = params[0].axisValueLabel || '';
          const point = series.find(p => p.date === date) ||
                        series.find(p => p.date.slice(0, 7) === date.slice(0, 7));
          if (!point) return date;
          const sp = priceMap.get(point.date.slice(0, 7));
          const lines = [date.slice(0, 10)];
          if (sp != null) lines.push(`S&P 500: <b>${formatNumber(sp, 0)}</b>`);
          if (point.tmc != null) lines.push(`TMC: <b>$${(point.tmc / 1000).toFixed(2)}T</b>`);
          if (point.gdp != null) lines.push(`GDP: <b>$${(point.gdp / 1000).toFixed(2)}T</b>`);
          if (point.fed_ta != null) lines.push(`Fed assets: <b>$${(point.fed_ta / 1000).toFixed(2)}T</b>`);
          if (point.ratio_classic != null) {
            lines.push(`Original: <b style="color:${classicColor}">${point.ratio_classic.toFixed(1)}%</b>`);
          }
          if (point.ratio_modified != null) {
            const band = bandLabelFor(point.ratio_modified, bandsModified);
            const bandTxt = band ? `<span style="color:${band.color}"> · ${band.label}</span>` : '';
            lines.push(`Modified: <b>${point.ratio_modified.toFixed(1)}%</b>${bandTxt}`);
          }
          return lines.join('<br/>');
        },
      },
      dataZoom: getDataZoom(grayColor),
    };
  }

  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  // ── Metric strip ──
  const summaryId = 'chartBuffettSummary';
  if (!document.getElementById(summaryId)) return;

  const modBand = bandLabelFor(cur.ratio_modified, bandsModified);
  const classicBand = bandLabelFor(cur.ratio_classic, bandsClassic);

  const fmtT = v => v == null ? '--' : `$${(v / 1000).toFixed(2)}T`;
  const fmtPct = v => v == null ? '--' : `${v.toFixed(1)}%`;

  renderMetricStrip(summaryId, [
    buildMetricCard(
      'Modified Buffett Indicator',
      fmtPct(cur.ratio_modified),
      modBand
        ? `<span style="color:${modBand.color};font-weight:600">${modBand.label}</span> · Thresholds 73/94/115/136`
        : 'Thresholds 73/94/115/136',
    ),
    buildMetricCard(
      'Original Buffett Indicator',
      fmtPct(cur.ratio_classic),
      classicBand
        ? `<span style="color:${classicBand.color};font-weight:600">${classicBand.label}</span> · Thresholds 90/115/141/167`
        : 'Thresholds 90/115/141/167',
    ),
    buildMetricCard(
      'Total Market Cap (TMC)',
      fmtT(cur.tmc),
      `as of ${buffettData.as_of || '--'} · Wilshire 5000 splice`,
    ),
    buildMetricCard(
      'Fed Balance Sheet',
      fmtT(cur.fed_ta),
      'FRED WALCL · "Liquidity ballast" of the QE era',
    ),
  ]);
}

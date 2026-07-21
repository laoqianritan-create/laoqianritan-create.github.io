// ══════════════════════════════════════════════════════
// panels/style_etf.js · Mainstream Style ETFs (EN mirror)
// Data: data/style_etf.json (fetch_data.py → fetch_style_etf)
// View: 10Y rolling window, base = 100 (log scale) + 6-column stats table
// ══════════════════════════════════════════════════════

import { cssVar, escapeHtml, formatCompactNumber, formatPercent, CHART_FONT, AXIS_END_2028_TS } from '../utils.js';
import { registerChart, getDataZoom, buildSingleMarkPoint, resolveMarkPointOverlaps, getLineLegendConfig } from '../chart-helpers.js';

function isMobile() {
  return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
}

export function initPanelStyleEtf(data) {
  if (!data || !Array.isArray(data.tickers) || !data.tickers.length) return;
  const chart = registerChart(echarts.init(document.getElementById('chartStyleEtf')));

  function getOption() {
    const grayColor  = cssVar('--gray')  || '#999';
    const gridColor  = cssVar('--chart-grid') || '#f0f0f0';
    const mobile     = isMobile();

    const series = data.tickers.map((t, index) => {
      const seriesData = t.series.map(pt => [pt.date, pt.value]);
      const latest     = seriesData[seriesData.length - 1];
      const labelText  = `${t.symbol} ${Math.round(latest[1])}`;

      return {
        name: `${t.name_en} (${t.symbol})`,
        type: 'line',
        showSymbol: false,
        clip: false,
        data: seriesData,
        color: t.color,
        itemStyle: { color: t.color },
        lineStyle: {
          width: t.dashed ? 1.6 : 1.6,
          color: t.color,
          type: t.dashed ? 'dashed' : 'solid',
        },
        markPoint: (!mobile && latest) ? {
          data: [buildSingleMarkPoint(latest[0], latest[1], labelText, t.color, 'right')],
        } : undefined,
        z: t.dashed ? 3 : 4,
      };
    });

    return {
      animation: false,
      grid: mobile
        ? { left: 52, right: 12, top: 20, bottom: 60 }
        : { left: 68, right: 92, top: 20, bottom: 60 },
      legend: getLineLegendConfig({
        type: 'scroll',
        top: 0,
      }),
      xAxis: {
        type: 'time',
        max: AXIS_END_2028_TS,
        axisLabel: { fontSize: mobile ? 10 : 11, color: grayColor, fontFamily: CHART_FONT, hideOverlap: true },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'log',
        min: 80,
        axisLine: {
          show: true,
          lineStyle: { color: cssVar('--border') || '#d9d9d9', width: 1 },
        },
        axisLabel: {
          formatter: value => formatCompactNumber(value),
          fontSize: 11,
          color: grayColor,
          fontFamily: CHART_FONT,
        },
        splitLine: { lineStyle: { color: gridColor } },
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: cssVar('--card-bg') || '#fff',
        borderColor: cssVar('--border') || '#e8e8e8',
        textStyle: { fontSize: 13, color: cssVar('--text') || '#1a1a1a', fontFamily: CHART_FONT },
        formatter: params => {
          const first = params[0];
          if (!first) return '';
          let html = escapeHtml(first.axisValueLabel);
          const sorted = params.slice().sort((a, b) => b.value[1] - a.value[1]);
          sorted.forEach(item => {
            const val = item.value[1];
            const pct = ((val / (data.base || 100)) - 1) * 100;
            html += `<br/><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${item.color};margin-right:6px"></span>`
                 +  `${escapeHtml(item.seriesName)}: <b>${val.toFixed(1)}</b> `
                 +  `<span style="color:${cssVar('--text-secondary') || '#666'}">(${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%)</span>`;
          });
          return html;
        },
      },
      dataZoom: getDataZoom(grayColor),
      series,
    };
  }

  const overlapOpts = { yAxis: 'log', chartHeight: 420, minGapPx: 18 };
  chart.setOption(resolveMarkPointOverlaps(getOption(), overlapOpts));
  chart._refreshTheme = () => chart.setOption(resolveMarkPointOverlaps(getOption(), overlapOpts), true);

  renderStyleEtfTable(data);
  renderStyleEtfSummary(data);
}


function renderStyleEtfTable(data) {
  const tbody = document.getElementById('styleEtfTbody');
  if (!tbody) return;
  const greenColor = cssVar('--green') || '#389e0d';
  const redColor   = cssVar('--red')   || '#cf1322';

  const rows = data.tickers.slice().sort((a, b) => b.metrics.cagr_pct - a.metrics.cagr_pct);

  tbody.innerHTML = rows.map(t => {
    const m = t.metrics;
    const cagrColor = m.cagr_pct >= 0 ? greenColor : redColor;
    return `
      <tr>
        <td class="style-etf-name">
          <span class="style-etf-swatch" style="background:${t.color}${t.dashed ? ';border:1.5px dashed ' + t.color + ';background:transparent' : ''}"></span>
          <span class="style-etf-symbol">${escapeHtml(t.symbol)}</span>
          <span class="style-etf-cn">${escapeHtml(t.name_en)}</span>
        </td>
        <td style="text-align:right;color:${cagrColor};font-weight:600">${m.cagr_pct.toFixed(1)}%</td>
        <td style="text-align:right;color:${redColor}">${m.max_dd_pct.toFixed(1)}%</td>
        <td style="text-align:right">${m.vol_pct.toFixed(1)}%</td>
        <td style="text-align:right;font-weight:600">${m.sharpe != null ? m.sharpe.toFixed(2) : '—'}</td>
        <td style="text-align:right;font-weight:600">${m.calmar != null ? m.calmar.toFixed(2) : '—'}</td>
      </tr>
    `;
  }).join('');
}


function renderStyleEtfSummary(data) {
  const el = document.getElementById('styleEtfSummary');
  if (!el) return;
  const sorted = data.tickers.slice().sort((a, b) => b.metrics.cagr_pct - a.metrics.cagr_pct);
  const best  = sorted[0];
  const worst = sorted[sorted.length - 1];
  const spy   = data.tickers.find(t => t.symbol === 'SPY');
  const years = data.window_years || 10;

  const cell = (label, value, note) => `
    <div class="metric-card">
      <div class="metric-label">${escapeHtml(label)}</div>
      <div class="metric-value">${value}</div>
      <div class="metric-note">${escapeHtml(note || '')}</div>
    </div>`;

  el.innerHTML = [
    cell('Window', `${years}Y`, `${data.period_start} → ${data.period_end}`),
    cell('Strongest', `${escapeHtml(best.name_en)} ${best.metrics.cagr_pct.toFixed(1)}%`, `${best.symbol} · CAGR · Total return`),
    cell('Weakest', `${escapeHtml(worst.name_en)} ${worst.metrics.cagr_pct.toFixed(1)}%`, `${worst.symbol} · CAGR · Total return`),
    cell('Benchmark', spy ? `SPY ${spy.metrics.cagr_pct.toFixed(1)}%` : '—', spy ? `MaxDD ${spy.metrics.max_dd_pct.toFixed(1)}% · Vol ${spy.metrics.vol_pct.toFixed(1)}%` : ''),
  ].join('');
}

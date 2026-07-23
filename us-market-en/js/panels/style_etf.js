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

    const base = data.base || 100;
    const series = data.tickers.map((t, index) => {
      const seriesData = t.series.map(pt => [pt.date, pt.value]);
      const latest     = seriesData[seriesData.length - 1];
      const pct        = latest[1] - base;
      const sign       = pct >= 0 ? '+' : '';
      const labelText  = `${t.symbol} ${sign}${Math.round(pct)}%`;

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


// ══════════════════════════════════════════════════════
// Panel 2: Risk-Return Plane (scatter + iso-Sharpe rays)
// X = Annualized volatility (%) · Y = Annualized return (%) · Gray dashed = iso-Sharpe rays (slope = Sharpe)
// ══════════════════════════════════════════════════════

const ISO_SHARPE_LEVELS = [0.5, 0.75, 1.0, 1.25];

export function initPanelStyleEtfScatter(data) {
  if (!data || !Array.isArray(data.tickers) || !data.tickers.length) return;
  const chart = registerChart(echarts.init(document.getElementById('chartStyleEtfScatter')));

  const maxVol  = Math.max(...data.tickers.map(t => t.metrics.vol_pct));
  const maxCagr = Math.max(...data.tickers.map(t => t.metrics.cagr_pct));
  const xMax    = Math.ceil(maxVol * 1.15 / 5) * 5;
  const yMax    = Math.ceil(maxCagr * 1.15 / 5) * 5;

  function getOption() {
    const grayColor  = cssVar('--gray')       || '#999';
    const gridColor  = cssVar('--chart-grid') || '#f0f0f0';
    const textColor  = cssVar('--text')       || '#1a1a1a';
    const isoColor   = cssVar('--text-secondary') || '#999';

    const isoSeries = ISO_SHARPE_LEVELS.map(sharpe => {
      const xEndRaw = xMax;
      const yAtXend = xEndRaw * sharpe;
      const [xEnd, yEnd] = yAtXend <= yMax
        ? [xEndRaw, yAtXend]
        : [yMax / sharpe, yMax];
      return {
        name: `Sharpe ${sharpe.toFixed(2)}`,
        type: 'line',
        showSymbol: false,
        silent: true,
        z: 1,
        data: [[0, 0], [xEnd, yEnd]],
        lineStyle: { color: isoColor, type: 'dashed', width: 1 },
        markPoint: {
          symbol: 'rect',
          symbolSize: [64, 20],
          itemStyle: { color: 'transparent' },
          data: [{
            coord: [xEnd, yEnd],
            label: {
              formatter: `Sharpe ${sharpe.toFixed(2)}`,
              color: isoColor,
              fontSize: 11,
              fontFamily: CHART_FONT,
              backgroundColor: cssVar('--bg') || '#fff',
              padding: [3, 5],
              borderRadius: 3,
            },
          }],
        },
      };
    });

    // Per-ticker label offsets (mirror CN version) — SCHD/VTV cluster too tight
    const LABEL_OVERRIDES = {
      SMH:  { position: 'right', offset: [0,  0] },
      XLK:  { position: 'right', offset: [0,  0] },
      QQQ:  { position: 'right', offset: [0, -2] },
      SPMO: { position: 'left',  offset: [-4, 8] },
      SPY:  { position: 'top',   offset: [8, -4] },
      QUAL: { position: 'right', offset: [4,  4] },
      VTV:  { position: 'left',  offset: [-4, 0] },
      SCHD: { position: 'right', offset: [4,  0] },
      USMV: { position: 'bottom', offset: [0, 4] },
    };
    const scatterData = data.tickers.map(t => {
      const lbl = LABEL_OVERRIDES[t.symbol] || { position: 'right', offset: [0, 0] };
      return {
        value: [t.metrics.vol_pct, t.metrics.cagr_pct],
        itemStyle: { color: t.color, borderColor: '#fff', borderWidth: 2 },
        label: { position: lbl.position, offset: lbl.offset },
        meta: t,
      };
    });

    return {
      animation: false,
      grid: { left: 60, right: 40, top: 30, bottom: 60 },
      tooltip: {
        trigger: 'item',
        backgroundColor: cssVar('--card-bg') || '#fff',
        borderColor: cssVar('--border') || '#e8e8e8',
        textStyle: { fontSize: 13, color: textColor, fontFamily: CHART_FONT },
        formatter: params => {
          if (params.seriesType !== 'scatter') return '';
          const t = params.data.meta;
          const m = t.metrics;
          return [
            `<b>${escapeHtml(t.name_en)} (${escapeHtml(t.symbol)})</b>`,
            `CAGR: <b>${m.cagr_pct.toFixed(1)}%</b>`,
            `Volatility: <b>${m.vol_pct.toFixed(1)}%</b>`,
            `Sharpe: <b>${m.sharpe != null ? m.sharpe.toFixed(2) : '—'}</b>`,
            `Max DD: <b>${m.max_dd_pct.toFixed(1)}%</b>`,
            `Calmar: <b>${m.calmar != null ? m.calmar.toFixed(2) : '—'}</b>`,
          ].join('<br/>');
        },
      },
      xAxis: {
        type: 'value',
        name: 'Annualized Volatility (%)',
        nameLocation: 'middle',
        nameGap: 30,
        nameTextStyle: { color: textColor, fontSize: 12, fontFamily: CHART_FONT, fontWeight: 600 },
        min: 0,
        max: xMax,
        axisLine: { show: true, lineStyle: { color: cssVar('--border') || '#d9d9d9' } },
        axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT, formatter: v => `${v}%` },
        splitLine: { lineStyle: { color: gridColor } },
      },
      yAxis: {
        type: 'value',
        name: 'Annualized Return (%)',
        nameLocation: 'middle',
        nameGap: 42,
        nameTextStyle: { color: textColor, fontSize: 12, fontFamily: CHART_FONT, fontWeight: 600 },
        min: 0,
        max: yMax,
        axisLine: { show: true, lineStyle: { color: cssVar('--border') || '#d9d9d9' } },
        axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT, formatter: v => `${v}%` },
        splitLine: { lineStyle: { color: gridColor } },
      },
      series: [
        ...isoSeries,
        {
          name: 'ETF',
          type: 'scatter',
          symbolSize: 22,
          z: 5,
          data: scatterData,
          label: {
            show: true,
            position: 'right',
            distance: 8,
            formatter: params => {
              const t = params.data.meta;
              return `${t.symbol} ${t.metrics.cagr_pct.toFixed(1)}%`;
            },
            color: textColor,
            fontSize: 12,
            fontFamily: CHART_FONT,
            fontWeight: 600,
          },
          emphasis: {
            focus: 'self',
            scale: 1.2,
          },
        },
      ],
    };
  }

  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  renderStyleEtfScatterSummary(data);
}


function renderStyleEtfScatterSummary(data) {
  const el = document.getElementById('styleEtfScatterSummary');
  if (!el) return;

  const withSharpe = data.tickers.filter(t => t.metrics.sharpe != null);
  const bestSharpe = withSharpe.slice().sort((a, b) => b.metrics.sharpe - a.metrics.sharpe)[0];
  const worstSharpe = withSharpe.slice().sort((a, b) => a.metrics.sharpe - b.metrics.sharpe)[0];
  const highVol = data.tickers.slice().sort((a, b) => b.metrics.vol_pct - a.metrics.vol_pct)[0];
  const lowVol  = data.tickers.slice().sort((a, b) => a.metrics.vol_pct - b.metrics.vol_pct)[0];

  const cell = (label, value, note) => `
    <div class="metric-card">
      <div class="metric-label">${escapeHtml(label)}</div>
      <div class="metric-value">${value}</div>
      <div class="metric-note">${escapeHtml(note || '')}</div>
    </div>`;

  el.innerHTML = [
    cell('Highest Sharpe', `${escapeHtml(bestSharpe.name_en)} ${bestSharpe.metrics.sharpe.toFixed(2)}`, `${bestSharpe.symbol} · CAGR ${bestSharpe.metrics.cagr_pct.toFixed(1)}% / Vol ${bestSharpe.metrics.vol_pct.toFixed(1)}%`),
    cell('Lowest Sharpe', `${escapeHtml(worstSharpe.name_en)} ${worstSharpe.metrics.sharpe.toFixed(2)}`, `${worstSharpe.symbol} · CAGR ${worstSharpe.metrics.cagr_pct.toFixed(1)}% / Vol ${worstSharpe.metrics.vol_pct.toFixed(1)}%`),
    cell('Most Volatile', `${escapeHtml(highVol.name_en)} ${highVol.metrics.vol_pct.toFixed(1)}%`, `${highVol.symbol} · CAGR ${highVol.metrics.cagr_pct.toFixed(1)}%`),
    cell('Least Volatile', `${escapeHtml(lowVol.name_en)} ${lowVol.metrics.vol_pct.toFixed(1)}%`, `${lowVol.symbol} · CAGR ${lowVol.metrics.cagr_pct.toFixed(1)}%`),
  ].join('');
}

// panels/nasdaq.js · Nasdaq 100 panels: constituents / annual returns / rankings / weights

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

export function initNasdaq100CompaniesPanel(data) {
  const chart = registerChart(echarts.init(document.getElementById('chartNasdaq100Companies')));
  const weightedCompanies = data.companies
    .filter(item => item.qqqWeight != null)
    .slice()
    .sort((a, b) => (b.qqqWeight || 0) - (a.qqqWeight || 0));
  const pieTopCount = 15;
  const pieTopHoldings = weightedCompanies.slice(0, pieTopCount);
  const pieTopWeight = pieTopHoldings.reduce((sum, item) => sum + (item.qqqWeight || 0), 0);
  const remainderCount = Math.max((data.overview.count || data.companies.length) - pieTopHoldings.length, 0);
  const tbody = document.getElementById('nasdaq100CompaniesTbody');
  const searchInput = document.getElementById('nasdaq100CompaniesSearch');
  const meta = document.getElementById('nasdaq100CompaniesMeta');
  const toggle = document.getElementById('nasdaq100CompaniesToggle');
  const state = {
    query: '',
    expanded: false,
  };

  function getOption() {
    const grayColor = cssVar('--gray') || '#999';
    const piePalette = [
      '#2563eb',
      '#0f766e',
      '#dc2626',
      '#f97316',
      '#7c3aed',
      '#0891b2',
      '#65a30d',
      '#b45309',
      '#ec4899',
      '#475569',
      '#14b8a6',
      '#a855f7',
      '#ea580c',
      '#1d4ed8',
      '#be123c',
    ];
    const pieData = pieTopHoldings.map((item, index) => ({
      value: item.qqqWeight,
      name: item.ticker,
      meta: item,
      itemStyle: { color: piePalette[index % piePalette.length] },
    }));
    const remainingWeight = Math.max(0, 100 - pieTopWeight);
    if (remainingWeight > 0.01) {
      pieData.push({
        value: Number(remainingWeight.toFixed(2)),
        name: `Other ${remainderCount}`,
        meta: {
          name: 'Other Constituents',
          ticker: 'OTHERS',
          qqqWeight: Number(remainingWeight.toFixed(2)),
        },
        itemStyle: { color: 'rgba(107, 114, 128, 0.42)' },
      });
    }

    return {
      animation: false,
      legend: {
        orient: 'vertical',
        right: 6,
        top: 'center',
        textStyle: {
          color: cssVar('--text-secondary') || '#666',
          fontSize: 12,
          fontFamily: CHART_FONT,
        },
      },
      series: [{
        name: 'QQQ Weight',
        type: 'pie',
        radius: ['42%', '72%'],
        center: ['36%', '50%'],
        minAngle: 2,
        avoidLabelOverlap: true,
        itemStyle: {
          borderColor: cssVar('--bg') || '#fff',
          borderWidth: 2,
        },
        label: {
          color: grayColor,
          fontSize: 11,
          formatter: params => `${params.name}\n${formatPercent(params.value, 2)}`,
        },
        labelLine: { length: 12, length2: 8 },
        data: pieData,
      }],
      tooltip: {
        trigger: 'item',
        backgroundColor: cssVar('--card-bg') || '#fff',
        borderColor: cssVar('--border') || '#e8e8e8',
        textStyle: { fontSize: 13, color: cssVar('--text') || '#1a1a1a', fontFamily: CHART_FONT },
        formatter: params => {
          const point = params.data.meta || {};
          return [
            `<b>${escapeHtml(point.name)}</b>`,
            `Ticker: ${escapeHtml(point.ticker)}`,
            `QQQ Weight: <b>${formatPercent(point.qqqWeight || params.value, 2)}</b>`,
            point.shares ? `Shares: ${formatNumber(point.shares, 0)}` : '',
          ].filter(Boolean).join('<br/>');
        },
      },
      graphic: [{
        type: 'text',
        left: '28%',
        top: '44%',
        style: {
          text: 'Nasdaq 100\nWeight Distribution',
          textAlign: 'center',
          fill: cssVar('--text') || '#1a1a1a',
          font: `700 20px ${CHART_FONT}`,
        },
      }],
    };
  }

  function renderRows() {
    const normalizedQuery = state.query.trim().toLowerCase();
    const source = state.expanded
      ? data.companies
      : data.companies.filter(item => item.qqqWeight != null);

    const rows = source.filter(item => {
      if (!normalizedQuery) {
        return true;
      }
      const haystack = [
        item.name,
        item.ticker,
        item.industry,
        item.subsector,
      ].join(' ').toLowerCase();
      return haystack.includes(normalizedQuery);
    });

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No matching Nasdaq 100 constituents.</td></tr>';
    } else {
      tbody.innerHTML = rows.map(item => {
        const returnColor = item.return1y > 0
          ? 'var(--green)'
          : item.return1y < 0
            ? 'var(--red)'
            : 'var(--text)';
        return `
          <tr>
            <td class="company-cell"><strong>${escapeHtml(item.name)}</strong><br/><small>${escapeHtml(item.subsector || item.industry || '')}</small></td>
            <td><span class="ticker-chip">${escapeHtml(item.ticker)}</span></td>
            <td>${escapeHtml(item.industry || '--')}</td>
            <td style="text-align:right">${item.qqqWeight != null ? formatPercent(item.qqqWeight, 2) : '--'}</td>
            <td style="text-align:right">${item.price != null ? formatNumber(item.price, 2) : '--'}</td>
            <td style="text-align:right;color:${returnColor}">${item.return1y != null ? formatPercent(item.return1y, 2) : '--'}</td>
            <td style="text-align:right">${item.dividendYield != null ? formatPercent(item.dividendYield, 2) : '--'}</td>
          </tr>
        `;
      }).join('');
    }

    meta.textContent = state.expanded
      ? `Showing ${rows.length} / ${data.companies.length} constituents`
      : `Showing top ${rows.length} disclosed weighted holdings`;
    toggle.textContent = state.expanded ? 'Show Top 25 Only' : `Expand All ${data.companies.length}`;
  }

  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  renderMetricStrip('nasdaq100CompanySummary', [
    buildMetricCard('Constituents', `${data.overview.count}`, 'Cross-referenced from Wikipedia constituent list and QQQ holdings.'),
    buildMetricCard('Top 10 Weight', data.overview.top10Weight != null ? formatPercent(data.overview.top10Weight, 2) : '--', 'Disclosed QQQ holdings sourced from StockAnalysis.'),
    buildMetricCard('ETF AUM', data.overview.aum != null ? formatCompactNumber(data.overview.aum) : '--', data.overview.holdingsDate ? `Holdings as of ${data.overview.holdingsDate}` : 'ETF assets under management'),
    buildMetricCard('Latest Price', data.overview.quote?.price != null ? formatNumber(data.overview.quote.price, 2) : '--', data.overview.quote?.date || ''),
  ]);

  searchInput.addEventListener('input', event => {
    state.query = event.target.value;
    renderRows();
  });

  toggle.addEventListener('click', () => {
    state.expanded = !state.expanded;
    renderRows();
  });

  renderRows();
}

export function initNasdaq100AnnualPanel(data) {
  const chart = registerChart(echarts.init(document.getElementById('chartNasdaq100Annual')));
  const series = data.annualReturns?.series || [];

  function getOption() {
    const grayColor = cssVar('--gray') || '#999';
    const gridColor = cssVar('--chart-grid') || '#f0f0f0';
    const greenColor = cssVar('--green') || '#389e0d';
    const redColor = cssVar('--red') || '#cf1322';

    return {
      animation: false,
      grid: { left: 55, right: 20, top: 20, bottom: 50 },
      xAxis: {
        type: 'category',
        data: series.map(item => item.year),
        axisLabel: {
          color: grayColor,
          fontSize: 11,
          fontFamily: CHART_FONT,
          formatter: value => Number(value) % 5 === 0 ? value : '',
        },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          formatter: value => `${value}%`,
          color: grayColor,
          fontSize: 11,
          fontFamily: CHART_FONT,
        },
        splitLine: { lineStyle: { color: gridColor } },
      },
      series: [{
        name: 'Annual Return',
        type: 'bar',
        barMaxWidth: 10,
        data: series.map(item => ({
          value: item.value,
          itemStyle: { color: item.value >= 0 ? greenColor : redColor },
        })),
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: grayColor, type: 'dashed', width: 1 },
          data: [{ yAxis: 0 }],
        },
      }],
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: cssVar('--card-bg') || '#fff',
        borderColor: cssVar('--border') || '#e8e8e8',
        textStyle: { fontSize: 13, color: cssVar('--text') || '#1a1a1a', fontFamily: CHART_FONT },
        formatter: params => `${series[params[0].dataIndex].year}<br/>Annual Return: <b>${formatPercent(series[params[0].dataIndex].value, 2)}</b>`,
      },
    };
  }

  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  renderMetricStrip('nasdaq100AnnualSummary', [
    buildMetricCard('Positive Years', `${data.annualReturns.positiveYears}/${series.length}`, 'Hit rate first, then volatility distribution.'),
    buildMetricCard('Long-Term Average', data.annualReturns.average != null ? formatPercent(data.annualReturns.average, 2) : '--', 'Computed from the QQQ proxy series.'),
    buildMetricCard('Best Year', data.annualReturns.best ? `${data.annualReturns.best.year} | ${formatPercent(data.annualReturns.best.value, 2)}` : '--', 'Best annual return on record.'),
    buildMetricCard('Worst Year', data.annualReturns.worst ? `${data.annualReturns.worst.year} | ${formatPercent(data.annualReturns.worst.value, 2)}` : '--', 'Worst annual return on record.'),
  ]);
}

export function initNasdaqRankingPanel(domId, summaryId, companies, metricConfig) {
  const container = document.getElementById(domId);
  if (!container) return;
  const rows = companies
    .filter(item => item[metricConfig.key] != null)
    .slice()
    .sort((a, b) => (b[metricConfig.key] || 0) - (a[metricConfig.key] || 0));
  // Dynamically resize chart container to show all rows (no dataZoom slider)
  const gridTop = metricConfig.gridTop ?? 20;
  const gridBottom = metricConfig.gridBottom ?? 20;
  const rowPx = metricConfig.rowHeight ?? 10;
  const dynamicHeight = rows.length * rowPx + gridTop + gridBottom + 12;
  container.style.height = `${dynamicHeight}px`;
  container.style.minHeight = `${dynamicHeight}px`;
  const chart = registerChart(echarts.init(container));
  const minMetricValue = rows.reduce((min, item) => Math.min(min, item[metricConfig.key]), Infinity);
  const maxMetricValue = rows.reduce((max, item) => Math.max(max, item[metricConfig.key]), -Infinity);
  const xAxisMin = typeof metricConfig.xAxisMin === 'function'
    ? metricConfig.xAxisMin(minMetricValue, maxMetricValue, rows)
    : metricConfig.xAxisMin;
  const xAxisMax = typeof metricConfig.xAxisMax === 'function'
    ? metricConfig.xAxisMax(minMetricValue, maxMetricValue, rows)
    : metricConfig.xAxisMax;

  function getOption() {
    const grayColor = cssVar('--gray') || '#999';
    const gridColor = cssVar('--chart-grid') || '#f0f0f0';

    return {
      animation: false,
      grid: {
        left: metricConfig.gridLeft ?? 96,
        right: metricConfig.gridRight ?? 60,
        top: metricConfig.gridTop ?? 20,
        bottom: metricConfig.gridBottom ?? 20,
        containLabel: false,
      },
      xAxis: {
        type: 'value',
        min: xAxisMin,
        max: xAxisMax,
        splitNumber: metricConfig.xAxisSplitNumber ?? 6,
        axisLabel: {
          formatter: metricConfig.axisLabelFormatter ?? (value => `${value}%`),
          color: grayColor,
          fontSize: 11,
          fontFamily: CHART_FONT,
        },
        splitLine: { lineStyle: { color: gridColor } },
      },
      yAxis: {
        type: 'category',
        data: rows.map(item => item.ticker),
        inverse: true,
        axisLabel: { color: grayColor, fontSize: 11, fontFamily: CHART_FONT },
        axisTick: { show: false },
      },
      series: [{
        name: metricConfig.label,
        type: 'bar',
        barMaxWidth: metricConfig.barMaxWidth ?? 10,
        data: rows.map(item => ({
          value: item[metricConfig.key],
          itemStyle: { color: metricConfig.color(item[metricConfig.key]) },
        })),
      }],
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: cssVar('--card-bg') || '#fff',
        borderColor: cssVar('--border') || '#e8e8e8',
        textStyle: { fontSize: 13, color: cssVar('--text') || '#1a1a1a', fontFamily: CHART_FONT },
        formatter: params => {
          const point = rows[params[0].dataIndex];
          return [
            `<b>${escapeHtml(point.name)}</b>`,
            `Ticker: ${escapeHtml(point.ticker)}`,
            `${metricConfig.label}: <b>${formatPercent(point[metricConfig.key], 2)}</b>`,
            point.qqqWeight != null ? `QQQ Weight: ${formatPercent(point.qqqWeight, 2)}` : '',
            point.industry ? `Sector: ${escapeHtml(point.industry)}` : '',
          ].filter(Boolean).join('<br/>');
        },
      },
    };
  }

  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  const best = rows[0];
  const worst = rows.at(-1);
  const positiveCount = rows.filter(item => item[metricConfig.key] > 0).length;
  const average = rows.reduce((sum, item) => sum + item[metricConfig.key], 0) / Math.max(rows.length, 1);

  renderMetricStrip(summaryId, [
    buildMetricCard('Sample Size', `${rows.length}`, 'Number of constituents with valid data.'),
    buildMetricCard('Best', best ? `${best.ticker} | ${formatPercent(best[metricConfig.key], 2)}` : '--', best?.name || ''),
    buildMetricCard('Worst', worst ? `${worst.ticker} | ${formatPercent(worst[metricConfig.key], 2)}` : '--', worst?.name || ''),
    buildMetricCard(metricConfig.summaryLabel, formatPercent(average, 2), `Positive ${positiveCount} / ${rows.length}`),
  ]);
}

export function initNasdaq100WeightsPanel(data) {
  const chart = registerChart(echarts.init(document.getElementById('chartNasdaq100Weights')));
  const rows = data.cumulativeWeights || [];

  function getOption() {
    const grayColor = cssVar('--gray') || '#999';
    const gridColor = cssVar('--chart-grid') || '#f0f0f0';
    const lineColor = cssVar('--sp500-line') || '#1a1a1a';

    return {
      animation: false,
      grid: { left: 55, right: 55, top: 40, bottom: 65 },
      legend: getLineLegendConfig({
        data: ['Individual Weight', 'Cumulative Weight'],
      }),
      xAxis: {
        type: 'category',
        data: rows.map(item => item.ticker === 'OTHERS' ? 'OTHERS' : item.ticker),
        axisLabel: { color: grayColor, fontSize: 11, fontFamily: CHART_FONT, interval: 0, rotate: 35 },
        axisTick: { show: false },
      },
      yAxis: [
        {
          type: 'value',
          axisLabel: { formatter: value => `${value}%`, color: grayColor, fontSize: 11, fontFamily: CHART_FONT },
          splitLine: { lineStyle: { color: gridColor } },
        },
        {
          type: 'value',
          min: 0,
          max: 100,
          axisLabel: { formatter: value => `${value}%`, color: grayColor, fontSize: 11, fontFamily: CHART_FONT },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: 'Individual Weight',
          type: 'bar',
          barMaxWidth: 18,
          data: rows.map(item => ({
            value: item.weight,
            itemStyle: { color: 'rgba(26,26,26,0.22)' },
          })),
        },
        {
          name: 'Cumulative Weight',
          type: 'line',
          yAxisIndex: 1,
          showSymbol: false,
          data: rows.map(item => item.cumulativeWeight),
          lineStyle: { width: 2.5, color: lineColor },
        },
      ],
      tooltip: {
        trigger: 'axis',
        backgroundColor: cssVar('--card-bg') || '#fff',
        borderColor: cssVar('--border') || '#e8e8e8',
        textStyle: { fontSize: 13, color: cssVar('--text') || '#1a1a1a', fontFamily: CHART_FONT },
        formatter: params => {
          const point = rows[params[0].dataIndex];
          return [
            `<b>${escapeHtml(point.name)}</b>`,
            `Individual Weight: <b>${formatPercent(point.weight, 2)}</b>`,
            `Cumulative Weight: <b>${formatPercent(point.cumulativeWeight, 2)}</b>`,
          ].join('<br/>');
        },
      },
    };
  }

  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  renderMetricStrip('nasdaq100WeightSummary', [
    buildMetricCard('Top 10 Weight', data.overview.top10Weight != null ? formatPercent(data.overview.top10Weight, 2) : '--', 'Index weight is highly concentrated in mega-cap tech.'),
    buildMetricCard('Top 25 Coverage', data.overview.top25Weight != null ? formatPercent(data.overview.top25Weight, 2) : '--', 'Disclosed weight coverage from current free sources.'),
    buildMetricCard('Other Constituents', data.overview.otherWeight != null ? formatPercent(data.overview.otherWeight, 2) : '--', 'Remaining constituents aggregated into a tail bucket.'),
    buildMetricCard('Largest Holding', data.topHoldings?.[0] ? `${data.topHoldings[0].ticker} | ${formatPercent(data.topHoldings[0].weight, 2)}` : '--', data.topHoldings?.[0]?.name || ''),
  ]);
}

// ══════════════════════════════════════════════════════
// Panel: NDX Constituent Return Scatter (YTD × 1Y)
// ══════════════════════════════════════════════════════

export function initNdxScatterPanel(data) {
  const container = document.getElementById('chartNdxScatter');
  if (!container) return;
  const chart = registerChart(echarts.init(container));
  const companies = (data.companies || []).filter(
    c => c.return1y != null && c.ytdReturn != null,
  );

  // ── Sector grouping (10 → 5 buckets) ────────────────────
  const SECTOR_MAP = {
    'Technology':             'Technology',
    'Consumer Discretionary': 'Consumer Discretionary',
    'Consumer Staples':       'Consumer Staples',
    'Telecommunications':     'Telecommunications',
    'Health Care':            'Health Care',
    'Industrials':            'Industrials',
    'Utilities':              'Utilities',
    'Basic Materials':        'Basic Materials',
    'Energy':                 'Energy',
    'Real Estate':            'Real Estate',
  };
  const SECTOR_COLOR = {
    'Technology':             '#2563eb',
    'Consumer Discretionary': '#f97316',
    'Health Care':            '#0f766e',
    'Industrials':            '#7c3aed',
    'Other':                  '#999999',
  };
  function getSector(industry) {
    const mapped = SECTOR_MAP[industry] || 'Other';
    if (['Consumer Staples', 'Telecommunications'].includes(mapped)) return 'Consumer Discretionary';
    if (['Utilities', 'Basic Materials', 'Energy', 'Real Estate'].includes(mapped)) return 'Other';
    return mapped;
  }

  // ── Group by sector ─────────────────────────────────
  const groups = {};
  companies.forEach(c => {
    const sector = getSector(c.industry);
    if (!groups[sector]) groups[sector] = [];
    groups[sector].push(c);
  });

  // Tickers to label: top 7 by weight + extreme performers
  const byWeight = [...companies].sort((a, b) => (b.qqqWeight || 0) - (a.qqqWeight || 0));
  const labelSet = new Set(byWeight.slice(0, 7).map(c => c.ticker));
  const byYtd = [...companies].sort((a, b) => a.ytdReturn - b.ytdReturn);
  byYtd.slice(0, 2).forEach(c => labelSet.add(c.ticker));
  byYtd.slice(-2).forEach(c => labelSet.add(c.ticker));
  const byR1y = [...companies].sort((a, b) => a.return1y - b.return1y);
  byR1y.slice(0, 2).forEach(c => labelSet.add(c.ticker));
  byR1y.slice(-2).forEach(c => labelSet.add(c.ticker));

  // ── symlog transform: linear near zero, log-compressed at extremes ──
  const SYMLOG_C = 30; // Linear range threshold (linear within ±30%)
  function symlog(v) {
    if (Math.abs(v) <= SYMLOG_C) return v;
    return Math.sign(v) * (SYMLOG_C + SYMLOG_C * Math.log(Math.abs(v) / SYMLOG_C));
  }
  function symlogInv(v) {
    if (Math.abs(v) <= SYMLOG_C) return v;
    return Math.sign(v) * SYMLOG_C * Math.exp((Math.abs(v) - SYMLOG_C) / SYMLOG_C);
  }

  // ── Build axis ticks ────────────────────────────────
  function buildTicks(values) {
    const absMax = Math.max(...values.map(Math.abs));
    const candidates = [
      -3000, -2000, -1000, -500, -200, -100, -50, -20, 0,
      20, 50, 100, 200, 500, 1000, 2000, 3000, 5000,
    ];
    return candidates.filter(v => Math.abs(v) <= absMax * 1.2);
  }

  function getOption() {
    const grayColor  = cssVar('--gray') || '#999';
    const gridColor  = cssVar('--chart-grid') || '#f0f0f0';
    const greenColor = cssVar('--green') || '#389e0d';
    const redColor   = cssVar('--red') || '#cf1322';
    const mobile     = isMobile();

    const allYtd = companies.map(c => c.ytdReturn);
    const allR1y = companies.map(c => c.return1y);
    const xTicks = buildTicks(allYtd);
    const yTicks = buildTicks(allR1y);

    // Per-sector series
    const sectorOrder = ['Technology', 'Consumer Discretionary', 'Health Care', 'Industrials', 'Other'];
    const seriesList = sectorOrder
      .filter(s => groups[s] && groups[s].length)
      .map(sector => ({
        name: sector,
        type: 'scatter',
        data: groups[sector].map(c => {
          const w = c.qqqWeight || 0;
          const size = Math.max(8, Math.min(32, 6 + w * 3));
          return {
            value: [symlog(c.ytdReturn), symlog(c.return1y)],
            _raw: [c.ytdReturn, c.return1y],
            ticker: c.ticker,
            companyName: c.name,
            weight: w,
            symbolSize: size,
            label: labelSet.has(c.ticker) ? {
              show: true,
              formatter: c.ticker,
              fontSize: mobile ? 9 : 10,
              color: cssVar('--text') || '#1a1a1a',
              position: 'right',
              fontFamily: CHART_FONT,
              distance: 4,
            } : { show: false },
          };
        }),
        itemStyle: { color: SECTOR_COLOR[sector], opacity: 0.78 },
      }));

    return {
      animation: false,
      grid: mobile
        ? { left: 48, right: 16, top: 50, bottom: 56 }
        : { left: 64, right: 28, top: 50, bottom: 60 },
      legend: {
        top: 6,
        textStyle: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
        itemWidth: 10, itemHeight: 10, itemGap: 14,
      },
      tooltip: {
        trigger: 'item',
        backgroundColor: cssVar('--card-bg') || '#fff',
        borderColor: cssVar('--border') || '#e8e8e8',
        textStyle: { fontSize: 13, color: cssVar('--text') || '#1a1a1a', fontFamily: CHART_FONT },
        formatter: params => {
          const d = params.data;
          const [ytd, r1y] = d._raw;
          const ytdColor = ytd >= 0 ? greenColor : redColor;
          const r1yColor = r1y >= 0 ? greenColor : redColor;
          let s = `<b>${d.ticker}</b> ${escapeHtml(d.companyName)}`;
          s += `<br/>YTD: <b style="color:${ytdColor}">${formatPercent(ytd, 1)}</b>`;
          s += `<br/>1Y: <b style="color:${r1yColor}">${formatPercent(r1y, 1)}</b>`;
          if (d.weight) s += `<br/>QQQ Weight: ${formatPercent(d.weight, 2)}`;
          return s;
        },
      },
      xAxis: {
        type: 'value',
        name: 'YTD Return',
        nameLocation: 'center',
        nameGap: mobile ? 32 : 38,
        nameTextStyle: { fontSize: 12, color: grayColor, fontFamily: CHART_FONT },
        min: symlog(Math.min(...allYtd) * 1.15),
        max: symlog(Math.max(...allYtd) * 1.15),
        axisLabel: {
          fontSize: 11, color: grayColor, fontFamily: CHART_FONT,
          formatter: v => {
            const raw = symlogInv(v);
            return `${Math.round(raw)}%`;
          },
        },
        axisTick: { alignWithLabel: true, inside: true },
        splitLine: { show: false },
        axisLine: { show: true, lineStyle: { color: gridColor } },
      },
      yAxis: {
        type: 'value',
        name: '1Y Return',
        nameLocation: 'center',
        nameGap: mobile ? 36 : 48,
        nameTextStyle: { fontSize: 12, color: grayColor, fontFamily: CHART_FONT },
        min: symlog(Math.min(...allR1y) * 1.15),
        max: symlog(Math.max(...allR1y) * 1.15),
        axisLabel: {
          fontSize: 11, color: grayColor, fontFamily: CHART_FONT,
          formatter: v => {
            const raw = symlogInv(v);
            return `${Math.round(raw)}%`;
          },
        },
        axisTick: { alignWithLabel: true, inside: true },
        splitLine: { show: false },
        axisLine: { show: true, lineStyle: { color: gridColor } },
      },
      series: [
        // Crosshair markLine (X=0, Y=0)
        {
          type: 'scatter', data: [], silent: true,
          markLine: {
            silent: true, symbol: 'none',
            lineStyle: { color: gridColor, type: 'solid', width: 1 },
            data: [
              { xAxis: 0, label: { show: false } },
              { yAxis: 0, label: { show: false } },
            ],
          },
        },
        ...seriesList,
      ],
    };
  }

  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  // ── metric-strip ──────────────────────────────────────
  const ytdArr = companies.map(c => c.ytdReturn);
  const r1yArr = companies.map(c => c.return1y);
  const avgYtd = ytdArr.reduce((s, v) => s + v, 0) / ytdArr.length;
  const avgR1y = r1yArr.reduce((s, v) => s + v, 0) / r1yArr.length;
  const posYtd = ytdArr.filter(v => v > 0).length;
  const posR1y = r1yArr.filter(v => v > 0).length;
  renderMetricStrip('ndxScatterSummary', [
    buildMetricCard('YTD Average', formatPercent(avgYtd, 1), `${posYtd}/${companies.length} up`),
    buildMetricCard('1Y Average', formatPercent(avgR1y, 1), `${posR1y}/${companies.length} up`),
    buildMetricCard('YTD Range', `${formatPercent(Math.min(...ytdArr), 0)} ~ ${formatPercent(Math.max(...ytdArr), 0)}`, 'Worst ~ Best'),
    buildMetricCard('1Y Range', `${formatPercent(Math.min(...r1yArr), 0)} ~ ${formatPercent(Math.max(...r1yArr), 0)}`, 'Worst ~ Best'),
  ]);
}

// ══════════════════════════════════════════════════════
// Bootstrap
// ══════════════════════════════════════════════════════

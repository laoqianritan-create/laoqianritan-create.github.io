// panels/sp500.js · S&P 500 panels: trend / drawdown / volatility / monthly / PE / EPS / ROE / rolling / annual / composition

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
  getAnnualizedMatrixPositiveOpacity,
  ensureAnnualizedMatrixTooltip,
  hideAnnualizedMatrixTooltip,
  positionAnnualizedMatrixTooltip,
  bindAnnualizedMatrixTooltip,
} from '../chart-helpers.js';

import { isMobile } from '../mobile.js';

export function initPanelPrice(data, recessionData, centuryData, equalWeightData) {
  const chart = registerChart(echarts.init(document.getElementById('chartPrice')));
  const dailySeries = data.series;
  const dailyDates = dailySeries.map(item => item.date);
  const dailyCloses = dailySeries.map(item => item.close);
  const monthlySeries = (centuryData?.series || []).filter(item => item.value != null);
  const dailyStart = dailyDates[0];
  const monthlyFiltered = monthlySeries.filter(item => item.date < dailyStart);
  const combinedData = [
    ...monthlyFiltered.map(item => [item.date, item.value]),
    ...dailyDates.map((date, index) => [date, dailyCloses[index]]),
  ];
  const ewSeries = (equalWeightData?.series || []).filter(item => item.close != null);
  const ewData = ewSeries.map(item => [item.date, item.close]);

  let currentScale = 'log';

  function getOption(scale) {
    const isLog = scale === 'log';
    const isPct = scale === 'pct';
    const lineColor = cssVar('--sp500-line') || '#1a1a1a';
    const gridColor = cssVar('--chart-grid') || '#f0f0f0';
    const grayColor = cssVar('--gray') || '#999';

    let chartData;
    let ewChartData;
    let tooltipFmt;

    if (isPct) {
      const base = combinedData[0][1];
      chartData = combinedData.map(([date, val]) => [date, (val / base - 1) * 100]);
      const ewBase = ewData.length ? ewData[0][1] : 1;
      ewChartData = ewData.map(([date, val]) => [date, (val / ewBase - 1) * 100]);
      tooltipFmt = params => {
        const sp = params.find(p => p.seriesName === 'S&P 500');
        const ew = params.find(p => p.seriesName === 'S&P 500 Equal-Weight');
        let html = params[0].axisValueLabel;
        if (sp) html += `<br/>S&P 500 since 1928: <b>${formatPercent(sp.value[1], 1)}</b>`;
        if (ew) html += `<br/>Equal-Weight since 2003: <b>${formatPercent(ew.value[1], 1)}</b>`;
        return html;
      };
    } else {
      chartData = combinedData;
      ewChartData = ewData;
      tooltipFmt = params => {
        const sp = params.find(p => p.seriesName === 'S&P 500');
        const ew = params.find(p => p.seriesName === 'S&P 500 Equal-Weight');
        let html = params[0].axisValueLabel;
        if (sp) html += `<br/>S&P 500: <b>${formatNumber(sp.value[1], 0)}</b>`;
        if (ew) html += `<br/>Equal-Weight: <b>${formatNumber(ew.value[1], 2)}</b>`;
        return html;
      };
    }

    const yAxisConf = {
      type: isLog ? 'log' : 'value',
      axisLabel: {
        formatter: isPct ? '{value}%' : undefined,
        fontSize: 11,
        color: grayColor,
        fontFamily: CHART_FONT,
      },
      splitLine: { lineStyle: { color: gridColor } },
      position: 'left',
    };

    const ewYAxisConf = {
      type: isLog ? 'log' : 'value',
      axisLabel: {
        formatter: isPct ? '{value}%' : undefined,
        fontSize: 11,
        color: '#2563eb',
        fontFamily: CHART_FONT,
      },
      splitLine: { show: false },
      position: 'right',
    };

    const option = {
      animation: false,
      legend: {
        data: ['S&P 500', 'S&P 500 Equal-Weight'],
        top: 4,
        right: 70,
        textStyle: { fontSize: 12, fontFamily: CHART_FONT, color: grayColor },
      },
      grid: { left: 65, right: 60, top: 36, bottom: 60 },
      xAxis: {
        type: 'time',
        max: AXIS_END_2028_TS,
        axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
        splitLine: { show: false },
      },
      yAxis: [yAxisConf, ewYAxisConf],
      series: [],
      tooltip: {
        trigger: 'axis',
        backgroundColor: cssVar('--card-bg') || '#fff',
        borderColor: cssVar('--border') || '#e8e8e8',
        textStyle: { fontSize: 13, color: cssVar('--text') || '#1a1a1a', fontFamily: CHART_FONT },
        formatter: tooltipFmt,
      },
      dataZoom: getDataZoom(grayColor),
    };

    const recessionSeries = buildRecessionOverlaySeries(chartData, recessionData);
    if (recessionSeries) option.series.push(recessionSeries);

    option.series.push({
      id: 'sp500-price-line',
      name: 'S&P 500',
      type: 'line',
      data: chartData,
      showSymbol: false,
      color: lineColor,
      itemStyle: { color: lineColor },
      lineStyle: { width: 2, color: lineColor },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(0,0,0,0.04)' },
          { offset: 1, color: 'transparent' },
        ]),
      },
      large: true,
      largeThreshold: 2000,
      z: 3,
    });

    if (ewChartData.length) {
      const ewColor = '#2563eb';
      option.series.push({
        id: 'sp500-ew-line',
        name: 'S&P 500 Equal-Weight',
        type: 'line',
        data: ewChartData,
        showSymbol: false,
        color: ewColor,
        itemStyle: { color: ewColor },
        lineStyle: { width: 2, color: ewColor },
        large: true,
        largeThreshold: 2000,
        yAxisIndex: 1,
        z: 3,
      });
    }

    return option;
  }

  chart.setOption(getOption(currentScale));
  chart._refreshTheme = () => {
    chart.setOption(getOption(currentScale), true);
  };

  if (centuryData) {
    renderMetricStrip('sp500CenturySummary', [
      buildMetricCard('Data Start', `${centuryData.start?.date || '--'} | ${centuryData.start ? formatNumber(centuryData.start.value, 2) : '--'}`, 'Monthly series base point'),
      buildMetricCard('Latest Monthly Level', centuryData.latest ? formatNumber(centuryData.latest.value, 2) : '--', centuryData.latest?.date || ''),
      buildMetricCard('Long-Term CAGR', centuryData.cagr != null ? formatPercent(centuryData.cagr, 2) : '--', 'Annualized since 1928'),
      buildMetricCard('Default View', 'Log scale', 'Black: S&P 500 · Blue: Equal-Weight (RSP) · X-axis extended to 2028'),
    ]);
  }

  document.getElementById('scaleToggle').addEventListener('click', event => {
    const btn = event.target.closest('.btn');
    if (!btn || !btn.dataset.scale) return;
    document.querySelectorAll('#scaleToggle .btn').forEach(item => item.classList.remove('active'));
    btn.classList.add('active');
    currentScale = btn.dataset.scale;
    chart.setOption(getOption(currentScale), true);
  });
}

// ══════════════════════════════════════════════════════
// Panel 2: Drawdown area chart + statistics table
// ══════════════════════════════════════════════════════

export function initPanelDrawdown(priceData, drawdownData, opts = {}) {
  const chartId = opts.chartId || 'chartDrawdown';
  const tbodyId = opts.tbodyId || 'drawdownTbody';
  const tableId = opts.tableId || 'drawdownTable';
  const ddMin = opts.ddMin ?? -80;
  const hideCause = !!opts.hideCause;
  const chart = registerChart(echarts.init(document.getElementById(chartId)));
  const series = priceData.series;

  function getOption() {
    const lineColor = cssVar('--sp500-line') || '#1a1a1a';
    const gridColor = cssVar('--chart-grid') || '#f0f0f0';
    const grayColor = cssVar('--gray') || '#999';
    const redColor = cssVar('--red') || '#cf1322';
    const drawdownSeries = series.map(item => [item.date, item.drawdown * 100]);
    const priceSeries = series.map(item => [item.date, item.close]);

    return {
      animation: false,
      grid: { left: 65, right: 65, top: 20, bottom: 60 },
      xAxis: {
        type: 'time',
        axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
        splitLine: { show: false },
      },
      yAxis: [
        {
          type: 'value',
          position: 'left',
          axisLabel: {
            formatter: '{value}%',
            fontSize: 11,
            color: grayColor,
            fontFamily: CHART_FONT,
          },
          splitLine: { lineStyle: { color: gridColor } },
          max: 0,
          min: ddMin,
        },
        {
          type: 'log',
          position: 'right',
          axisLabel: {
            fontSize: 11,
            color: grayColor,
            fontFamily: CHART_FONT,
            formatter: value => formatCompactNumber(value),
          },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          type: 'line',
          yAxisIndex: 0,
          data: drawdownSeries,
          showSymbol: false,
          lineStyle: { width: 0 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(207,19,34,0.18)' },
              { offset: 1, color: 'rgba(207,19,34,0.68)' },
            ]),
          },
          large: true,
          largeThreshold: 2000,
        },
        {
          type: 'line',
          yAxisIndex: 1,
          data: priceSeries,
          showSymbol: false,
          lineStyle: { width: 1.5, color: lineColor },
          large: true,
          largeThreshold: 2000,
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
          const drawdownPoint = params.find(item => item.seriesIndex === 0);
          const pricePoint = params.find(item => item.seriesIndex === 1);
          let html = params[0].axisValueLabel;

          if (pricePoint) {
            html += `<br/>Level: <b>${formatNumber(pricePoint.value[1], 0)}</b>`;
          }
          if (drawdownPoint) {
            html += `<br/>Drawdown: <b style="color:${redColor}">${formatPercent(drawdownPoint.value[1], 1)}</b>`;
          }
          return html;
        },
      },
      dataZoom: getDataZoom(grayColor),
    };
  }

  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  const catNames = {};
  drawdownData.categories.forEach(category => {
    catNames[category.id] = category.name;
  });

  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = '';

  // Filter out small moves with |drawdown| < 10% to avoid bloating the table
  drawdownData.drawdowns
    .filter(item => Math.abs(item.decline) >= 0.10)
    .forEach(item => {
    const absDecline = Math.abs(item.decline);
    const alpha = 0.18 + Math.min(absDecline / 0.6, 1) * 0.28;
    const tr = document.createElement('tr');
    if (item.active) {
      tr.classList.add('row-active');
    }

    // recovery_days display: null = not yet recovered (still active); > 365 shows year equivalent
    let recoveryCell;
    if (item.recovery_days == null) {
      recoveryCell = '<span style="color:var(--text-secondary)">Ongoing</span>';
    } else if (item.recovery_days > 365) {
      recoveryCell = `${item.recovery_days} (${(item.recovery_days / 365).toFixed(1)}y)`;
    } else {
      recoveryCell = `${item.recovery_days}`;
    }
    // data-label provides inline labels for mobile cards; no visual impact on desktop
    const highLabel = opts.highLabel || 'S&P High';
    const lowLabel = opts.lowLabel || 'S&P Low';
    tr.innerHTML = `
      <td data-label="Period" style="white-space:nowrap">${item.period}</td>
      <td data-label="${highLabel}" style="text-align:right">${item.high}</td>
      <td data-label="${lowLabel}" style="text-align:right">${item.low}</td>
      <td data-label="Days to Trough" style="text-align:right">${item.days}</td>
      <td data-label="Decline" class="decline-cell" style="text-align:right;color:var(--red);background:rgba(207,19,34,${alpha.toFixed(2)})">${formatPercent(item.decline * 100, 1)}</td>
      <td data-label="Days to New High" style="text-align:right;white-space:nowrap">${recoveryCell}</td>
      <td data-label="Category"><span class="cat-badge cat-${item.category}">${catNames[item.category] || item.category}</span></td>
      ${hideCause ? '' : `<td data-label="Cause" class="cause-cell">${item.cause || ''}</td>`}
    `;
    tbody.appendChild(tr);
  });

  document.querySelectorAll(`#${tableId} th[data-sort]`).forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      const rows = Array.from(tbody.querySelectorAll('tr'));
      const asc = th._sortDir !== 'asc';
      th._sortDir = asc ? 'asc' : 'desc';

      rows.sort((a, b) => {
        const aValue = parseFloat(a.children[key === 'days' ? 1 : 4].textContent);
        const bValue = parseFloat(b.children[key === 'days' ? 1 : 4].textContent);
        return asc ? aValue - bValue : bValue - aValue;
      });

      rows.forEach(row => tbody.appendChild(row));
    });
  });
}

// ══════════════════════════════════════════════════════
// Panel 3: Volatility
// ══════════════════════════════════════════════════════

export function initPanelVolatility(data, opts = {}) {
  const chartId = opts.chartId || 'chartVolatility';
  const indexLabel = opts.label || 'S&P 500';
  const chart = registerChart(echarts.init(document.getElementById(chartId)));
  const series = data.series.filter(item => item.vol20 != null || item.vol60 != null);
  const highVolAreas = buildThresholdAreas(series, 0.30, item => Math.max(item.vol20 ?? 0, item.vol60 ?? 0));

  function getOption() {
    const gridColor = cssVar('--chart-grid') || '#f0f0f0';
    const grayColor = cssVar('--gray') || '#999';
    const vol20Color = '#2563eb';
    const vol60Color = cssVar('--sp500-line') || '#1a1a1a';

    return {
      animation: false,
      grid: { left: 60, right: 20, top: 20, bottom: 60 },
      legend: getLineLegendConfig({
        data: ['20-Day Volatility', '60-Day Volatility'],
      }),
      xAxis: {
        type: 'time',
        axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          formatter: value => formatPercent(value * 100, 0),
          fontSize: 11,
          color: grayColor,
          fontFamily: CHART_FONT,
        },
        splitLine: { lineStyle: { color: gridColor } },
      },
      series: [
        {
          name: '20-Day Volatility',
          type: 'line',
          showSymbol: false,
          data: series.map(item => [item.date, item.vol20]),
          color: vol20Color,
          itemStyle: { color: vol20Color },
          lineStyle: { width: 1.5, color: vol20Color },
          large: true,
          largeThreshold: 2000,
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: '#faad14', type: 'dashed', width: 1 },
            data: [{
              yAxis: 0.20,
              label: {
                formatter: '20% Long-Term Median',
                fontSize: 11,
                color: '#faad14',
                fontFamily: CHART_FONT,
                position: 'insideEndTop',
              },
            }],
          },
          markArea: highVolAreas.length ? {
            silent: true,
            itemStyle: { color: 'rgba(207,19,34,0.14)' },
            data: highVolAreas,
          } : undefined,
        },
        {
          name: '60-Day Volatility',
          type: 'line',
          showSymbol: false,
          data: series.map(item => [item.date, item.vol60]),
          color: vol60Color,
          itemStyle: { color: vol60Color },
          lineStyle: { width: 1.5, color: vol60Color },
          large: true,
          largeThreshold: 2000,
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
          let html = params[0].axisValueLabel;
          if (point?.close != null) {
            html += `<br/>${indexLabel}: <b>${formatNumber(point.close, 0)}</b>`;
          }
          params.forEach(item => {
            if (item.value[1] == null) {
              return;
            }
            html += `<br/>${item.seriesName}: <b>${formatPercent(item.value[1] * 100, 1)}</b>`;
          });
          return html;
        },
      },
      dataZoom: getDataZoom(grayColor),
    };
  }

  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);
}

// ══════════════════════════════════════════════════════
// Panel 4: Monthly return heatmap
// ══════════════════════════════════════════════════════

export function initPanelMonthly(data, opts = {}) {
  const containerId = opts.containerId || 'monthlyHeatmap';
  const container = document.getElementById(containerId);
  if (!container) return;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  let html = '<table class="heatmap-table"><thead><tr><th>Year</th>';
  months.forEach(month => {
    html += `<th>${month}</th>`;
  });
  html += '<th>Annual</th></tr></thead><tbody>';

  html += '<tr class="prob-row"><td class="year-cell">Up Probability</td>';
  for (let month = 1; month <= 12; month += 1) {
    const probability = data.probability[String(month)];
    if (probability == null) {
      html += '<td></td>';
      continue;
    }

    const cls = probability >= 0.6 ? 'prob-high' : probability < 0.5 ? 'prob-low' : '';
    html += `<td><span class="prob-val ${cls}">${formatPercent(probability * 100, 0)}</span></td>`;
  }
  html += '<td></td></tr>';

  data.years.slice().reverse().forEach(yearData => {
    html += `<tr><td class="year-cell">${yearData.year}</td>`;

    for (let month = 1; month <= 12; month += 1) {
      const value = yearData.months[String(month)];
      if (value == null) {
        html += '<td></td>';
        continue;
      }

      const color = getHeatColor(value);
      const textColor = Math.abs(value) > 0.06 ? '#fff' : '#333';
      html += `<td><span class="heatmap-cell" style="background:${color};color:${textColor}">${formatPercent(value * 100, 1)}</span></td>`;
    }

    if (yearData.annual != null) {
      const annualColor = getHeatColor(yearData.annual);
      const annualText = Math.abs(yearData.annual) > 0.06 ? '#fff' : '#333';
      html += `<td class="annual-cell"><span class="heatmap-cell" style="background:${annualColor};color:${annualText}">${formatPercent(yearData.annual * 100, 1)}</span></td>`;
    } else {
      html += '<td></td>';
    }

    html += '</tr>';
  });
  html += '</tbody></table>';

  container.innerHTML = html;
}

export function initPanelAnnualizedMatrix(centuryData, opts = {}) {
  const containerId = opts.containerId || 'sp500AnnualizedMatrix';
  const rangeId = opts.rangeId || 'sp500AnnualizedMatrixRange';
  const startYear = opts.startYear || 1980;
  const container = document.getElementById(containerId);
  const rangeNode = document.getElementById(rangeId);
  if (!container) {
    return;
  }

  const matrix = buildAnnualizedHoldingMatrix(centuryData?.series, startYear);
  if (!matrix) {
    container.innerHTML = '<div class="loading-msg">No matrix data available</div>';
    if (rangeNode) {
      rangeNode.textContent = '';
    }
    return;
  }

  if (rangeNode) {
    rangeNode.textContent = `${matrix.startYear} - ${matrix.endYear}`;
  }

  let html = '<table class="annualized-matrix-table"><tbody>';
  matrix.rows.forEach(row => {
    html += `<tr><th class="matrix-y-label">${row.year}</th>`;

    row.cells.forEach(cell => {
      if (!cell) {
        html += '<td class="matrix-blank"></td>';
        return;
      }

      const tooltipCagr = formatPercent(cell.value, 2);
      if (cell.value < 0) {
        const strongClass = cell.value <= -10 ? ' matrix-cell--strong' : '';
        html += `<td><span class="matrix-cell matrix-cell--neg${strongClass}" style="--neg-opacity:${getAnnualizedMatrixNegativeOpacity(cell.value)}" data-start-year="${cell.startYear}" data-end-year="${cell.endYear}" data-holding-years="${cell.holdingYears}" data-cagr="${tooltipCagr}">${cell.value.toFixed(1)}</span></td>`;
      } else {
        const posStrongClass = cell.value >= 10 ? ' matrix-cell--strong' : '';
        html += `<td><span class="matrix-cell matrix-cell--pos${posStrongClass}" style="--pos-opacity:${getAnnualizedMatrixPositiveOpacity(cell.value)}" data-start-year="${cell.startYear}" data-end-year="${cell.endYear}" data-holding-years="${cell.holdingYears}" data-cagr="${tooltipCagr}">${cell.value.toFixed(1)}</span></td>`;
      }
    });

    html += '</tr>';
  });

  html += '</tbody><tfoot><tr><th class="matrix-y-label"></th>';
  matrix.years.forEach(year => {
    html += `<th class="matrix-x-label"><span>${year}</span></th>`;
  });
  html += '</tr></tfoot></table>';

  container.innerHTML = html;
  bindAnnualizedMatrixTooltip(container);
}

// ══════════════════════════════════════════════════════
// Panel 5: Constituent scatter
// ══════════════════════════════════════════════════════

export function initPanelScatter(data) {
  const chart = registerChart(echarts.init(document.getElementById('chartScatter')));
  const totalMarketCap = (data.stocks || []).reduce((sum, stock) => (
    sum + (typeof stock.marketCap === 'number' && stock.marketCap > 0 ? stock.marketCap : 0)
  ), 0);
  const enrichedStocks = (data.stocks || []).map(stock => ({
    ...stock,
    weight: stock.weight ?? (
      totalMarketCap > 0 && typeof stock.marketCap === 'number' && stock.marketCap > 0
        ? stock.marketCap / totalMarketCap * 100
        : null
    ),
  }));
  const stocks = enrichedStocks.filter(stock => stock.marketCap > 0 && stock.return1y != null);
  const rankedMembers = enrichedStocks
    .slice()
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0) || (b.marketCap ?? 0) - (a.marketCap ?? 0));
  const labelTickers = new Set(['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'BRK.B', 'JPM', 'V']);

  function getOption() {
    const gridColor = cssVar('--chart-grid') || '#f0f0f0';
    const grayColor = cssVar('--gray') || '#999';
    const greenColor = cssVar('--green') || '#389e0d';
    const redColor = cssVar('--red') || '#cf1322';

    const scatterData = stocks.map(stock => {
      const marketCapBillion = stock.marketCap / 1e9;
      const returnPct = stock.return1y * 100;
      return {
        value: [marketCapBillion, returnPct],
        name: stock.name,
        ticker: stock.ticker,
        itemStyle: {
          color: stock.return1y >= 0 ? greenColor : redColor,
          opacity: 0.7,
        },
        symbolSize: Math.max(6, Math.min(20, Math.log10(marketCapBillion) * 4)),
        label: labelTickers.has(stock.ticker) ? {
          show: true,
          formatter: stock.ticker,
          fontSize: 10,
          color: cssVar('--text') || '#1a1a1a',
          position: 'right',
          fontFamily: CHART_FONT,
        } : { show: false },
      };
    });

    return {
      animation: false,
      grid: { left: 70, right: 30, top: 20, bottom: 50 },
      xAxis: {
        type: 'log',
        name: 'Market Cap ($B)',
        nameLocation: 'center',
        nameGap: 30,
        nameTextStyle: { fontSize: 12, color: grayColor, fontFamily: CHART_FONT },
        axisLabel: {
          fontSize: 11,
          color: grayColor,
          fontFamily: CHART_FONT,
          formatter: value => value >= 1000 ? `${(value / 1000).toFixed(1)}T` : value.toFixed(0),
        },
        splitLine: { lineStyle: { color: gridColor } },
      },
      yAxis: {
        type: 'value',
        name: '1-Year Return',
        nameLocation: 'center',
        nameGap: 50,
        nameTextStyle: { fontSize: 12, color: grayColor, fontFamily: CHART_FONT },
        axisLabel: {
          formatter: '{value}%',
          fontSize: 11,
          color: grayColor,
          fontFamily: CHART_FONT,
        },
        splitLine: { lineStyle: { color: gridColor } },
      },
      series: [{
        type: 'scatter',
        data: scatterData,
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: grayColor, type: 'dashed', width: 1 },
          data: [{ yAxis: 0, label: { show: false } }],
        },
      }],
      tooltip: {
        trigger: 'item',
        backgroundColor: cssVar('--card-bg') || '#fff',
        borderColor: cssVar('--border') || '#e8e8e8',
        textStyle: {
          fontSize: 13,
          color: cssVar('--text') || '#1a1a1a',
          fontFamily: CHART_FONT,
        },
        formatter: params => {
          const stock = params.data;
          const color = stock.value[1] >= 0 ? greenColor : redColor;
          return `<b>${stock.ticker}</b> ${stock.name}<br/>Market Cap: $${formatNumber(stock.value[0], 0)}B<br/>Return: <b style="color:${color}">${formatPercent(stock.value[1], 1)}</b>`;
        },
      },
    };
  }

  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  const tbody = document.getElementById('membersTbody');
  const searchInput = document.getElementById('membersSearch');
  const meta = document.getElementById('membersMeta');
  const toggleBtn = document.getElementById('membersToggle');
  const COLLAPSED_COUNT = 20;
  let expanded = false;

  function renderMembers(query = '') {
    const normalized = query.trim().toLowerCase();
    const filtered = rankedMembers.filter(stock => {
      if (!normalized) return true;
      return [stock.ticker, stock.name, stock.nameEn]
        .filter(Boolean).join(' ').toLowerCase().includes(normalized);
    });

    const rows = (normalized || expanded) ? filtered : filtered.slice(0, COLLAPSED_COUNT);

    meta.textContent = normalized
      ? `${filtered.length} matches`
      : `${enrichedStocks.length} constituents total`;

    if (toggleBtn) {
      if (normalized) {
        toggleBtn.style.display = 'none';
      } else {
        toggleBtn.style.display = '';
        toggleBtn.textContent = expanded ? 'Collapse' : `Show all ${enrichedStocks.length}`;
      }
    }

    tbody.innerHTML = rows.map(stock => `
      <tr>
        <td>${escapeHtml(stock.name || stock.nameEn || stock.ticker)}</td>
        <td><span class="ticker-chip">${escapeHtml(stock.ticker)}</span></td>
        <td style="font-variant-numeric:tabular-nums">${stock.weight != null ? formatPercent(stock.weight, 2) : '--'}</td>
        <td style="font-variant-numeric:tabular-nums" title="${escapeHtml([stock.priceSource, stock.priceNote, stock.priceAsOf ? `As of ${stock.priceAsOf}` : ''].filter(Boolean).join(' · '))}">${stock.price != null ? `${stock.priceSource ? '≈' : ''}$${formatNumber(stock.price, 2)}` : '--'}</td>
      </tr>
    `).join('');
  }

  searchInput.addEventListener('input', event => renderMembers(event.target.value));

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      expanded = !expanded;
      renderMembers(searchInput.value);
    });
  }

  renderMembers();
}

// ══════════════════════════════════════════════════════
// Panel 6: Shiller PE (CAPE) vs S&P 500
// ══════════════════════════════════════════════════════

export function initPanelPe(data, centuryData) {
  const chart = registerChart(echarts.init(document.getElementById('chartPe')));
  const capeSeries = data.cape.filter(item => item.value != null);
  const priceSeries = (centuryData?.series || []).filter(item => item.value != null);
  const latestCape = capeSeries.at(-1) ?? null;
  const capePeak = capeSeries.reduce((best, item) => (!best || item.value > best.value ? item : best), null);
  const capeTrough = capeSeries.reduce((best, item) => (!best || item.value < best.value ? item : best), null);
  const capeAverage = capeSeries.length
    ? capeSeries.reduce((sum, item) => sum + item.value, 0) / capeSeries.length
    : null;
  const maxValue = Math.max(25, ...capeSeries.map(item => item.value)) + 2;

  function getOption() {
    const gridColor = cssVar('--chart-grid') || '#f0f0f0';
    const grayColor = cssVar('--gray') || '#999';
    const capeColor = '#2563eb';
    const priceColor = cssVar('--sp500-line') || '#1a1a1a';
    const capeMarkers = [
      buildSingleMarkPoint(
        capePeak?.date,
        capePeak?.value,
        capePeak ? `All-Time High ${formatNumber(capePeak.value, 2)}` : '',
        capeColor,
        'top',
      ),
      buildSingleMarkPoint(
        capeTrough?.date,
        capeTrough?.value,
        capeTrough ? `All-Time Low ${formatNumber(capeTrough.value, 2)}` : '',
        '#0f766e',
        'bottom',
      ),
      buildSingleMarkPoint(
        latestCape?.date,
        latestCape?.value,
        latestCape ? `Latest ${formatNumber(latestCape.value, 2)}` : '',
        '#f97316',
        'right',
      ),
    ].filter(Boolean);

    return {
      animation: false,
      grid: { left: 60, right: 70, top: 20, bottom: 60 },
      legend: getLineLegendConfig({
        data: ['Shiller CAPE', 'S&P 500'],
      }),
      xAxis: {
        type: 'time',
        axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
        splitLine: { show: false },
      },
      yAxis: [
        {
          type: 'value',
          min: 0,
          max: maxValue,
          axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
          splitLine: { lineStyle: { color: gridColor } },
        },
        {
          type: 'log',
          position: 'right',
          axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: 'Shiller CAPE',
          type: 'line',
          yAxisIndex: 0,
          showSymbol: false,
          data: capeSeries.map(item => [item.date, item.value]),
          color: capeColor,
          itemStyle: { color: capeColor },
          lineStyle: { width: 2, color: capeColor },
          markPoint: {
            symbolKeepAspect: true,
            data: capeMarkers,
          },
        },
        {
          name: 'S&P 500',
          type: 'line',
          yAxisIndex: 1,
          showSymbol: false,
          data: priceSeries.map(item => [item.date, item.value]),
          color: priceColor,
          itemStyle: { color: priceColor },
          lineStyle: { width: 1.2, color: priceColor, opacity: 0.85 },
          z: 0,
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
          let html = params[0].axisValueLabel;
          params.forEach(item => {
            if (item.value[1] == null) {
              return;
            }
            html += `<br/>${item.seriesName}: <b>${formatNumber(item.value[1], 2)}</b>`;
          });
          return html;
        },
      },
      dataZoom: getDataZoom(grayColor),
    };
  }

  chart.setOption(resolveMarkPointOverlaps(getOption()));
  chart._refreshTheme = () => chart.setOption(resolveMarkPointOverlaps(getOption()), true);

  const latestPrice = priceSeries[priceSeries.length - 1];
  renderMetricStrip('peSummary', [
    buildMetricCard('Latest CAPE', latestCape ? formatNumber(latestCape.value, 2) : '--', latestCape ? `Updated ${latestCape.date}` : 'Primary source pending'),
    buildMetricCard('All-Time High', capePeak ? formatNumber(capePeak.value, 2) : '--', capePeak ? capePeak.date : 'Full-sample peak'),
    buildMetricCard('All-Time Low', capeTrough ? formatNumber(capeTrough.value, 2) : '--', capeTrough ? capeTrough.date : 'Full-sample trough'),
    buildMetricCard('Long-Term Average', capeAverage != null ? formatNumber(capeAverage, 2) : '--', 'Computed across the full available CAPE sample'),
    buildMetricCard('Methodology', '10-Year Real Earnings Average', latestPrice ? `Overlaid with S&P 500 monthly levels; latest index ${formatNumber(latestPrice.value, 0)}` : 'Uses 10-year inflation-adjusted earnings to smooth short-term cycles.'),
  ]);
}

// ══════════════════════════════════════════════════════
// Panel 8: EPS
// ══════════════════════════════════════════════════════

export function initPanelEps(data, sp500CenturyData) {
  const chart = registerChart(echarts.init(document.getElementById('chartEps')));
  // Log y-axis requires positive values (filter occasional zero/negative EPS prints)
  const epsSeries = data.series.filter(item => item.value != null && item.value > 0);
  const epsStart = epsSeries.length ? epsSeries[0].date : null;
  // Align S&P 500 monthly series to EPS start for secondary-axis comparison (log view)
  const sp500Series = (sp500CenturyData?.series || [])
    .filter(item => item.value != null && (!epsStart || item.date >= epsStart))
    .map(item => [item.date, item.value]);

  function getOption() {
    const gridColor = cssVar('--chart-grid') || '#f0f0f0';
    const grayColor = cssVar('--gray') || '#999';
    const epsColor = cssVar('--accent') || '#4758e0';
    const spColor  = cssVar('--sp500-line') || '#1a1a1a';

    return {
      animation: false,
      grid: { left: 64, right: 64, top: 36, bottom: 60 },
      legend: getLineLegendConfig({ data: ['S&P 500 EPS (TTM)', 'S&P 500 Index (Log)'] }),
      xAxis: {
        type: 'time',
        axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
        splitLine: { show: false },
      },
      yAxis: [
        {
          type: 'log',
          name: 'EPS ($)',
          position: 'left',
          nameTextStyle: { fontSize: 10, color: grayColor, fontFamily: CHART_FONT },
          axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
          splitLine: { lineStyle: { color: gridColor } },
        },
        {
          type: 'log',
          name: 'S&P 500',
          position: 'right',
          nameTextStyle: { fontSize: 10, color: grayColor, fontFamily: CHART_FONT },
          axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: 'S&P 500 EPS (TTM)',
          type: 'line',
          yAxisIndex: 0,
          showSymbol: false,
          data: epsSeries.map(item => [item.date, item.value]),
          color: epsColor,
          lineStyle: { width: 2, color: epsColor },
        },
        {
          name: 'S&P 500 Index (Log)',
          type: 'line',
          yAxisIndex: 1,
          showSymbol: false,
          data: sp500Series,
          color: spColor,
          lineStyle: { width: 1.4, color: spColor },
          large: true,
          largeThreshold: 2000,
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
          const date = params?.[0]?.axisValueLabel || '';
          const eps = params.find(p => p.seriesName.startsWith('S&P 500 EPS'));
          const sp = params.find(p => p.seriesName.startsWith('S&P 500 Index'));
          const lines = [date];
          if (eps && eps.value && eps.value[1] != null) {
            lines.push(`EPS: <b style="color:${epsColor}">${formatNumber(eps.value[1], 2)}</b>`);
          }
          if (sp && sp.value && sp.value[1] != null) {
            lines.push(`S&P 500: <b style="color:${spColor}">${formatNumber(sp.value[1], 0)}</b>`);
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

// ══════════════════════════════════════════════════════
// Panel 9: ROE
// ══════════════════════════════════════════════════════

export function initPanelRoe(data) {
  const chart = registerChart(echarts.init(document.getElementById('chartRoe')));
  const series = data.series.filter(item => item.value != null);
  const average = data.average ?? (
    series.reduce((sum, item) => sum + item.value, 0) / Math.max(series.length, 1)
  );

  function getOption() {
    const gridColor = cssVar('--chart-grid') || '#f0f0f0';
    const grayColor = cssVar('--gray') || '#999';
    const mobile = isMobile();
    // Mobile: move markLine label from outside right edge to inside left, so "Long-Term Average XX%" isn't clipped
    return {
      animation: false,
      grid: mobile ? { left: 44, right: 14, top: 20, bottom: 40 } : { left: 55, right: 20, top: 20, bottom: 40 },
      xAxis: {
        type: 'category',
        data: series.map(item => item.date.slice(0, 4)),
        axisLabel: { fontSize: mobile ? 10 : 11, color: grayColor, fontFamily: CHART_FONT, hideOverlap: true },
        axisTick: { alignWithLabel: true },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          formatter: value => formatPercent(value, 0),
          fontSize: mobile ? 10 : 11,
          color: grayColor,
          fontFamily: CHART_FONT,
        },
        splitLine: { lineStyle: { color: gridColor } },
      },
      series: [{
        name: 'ROE',
        type: 'bar',
        data: series.map(item => item.value),
        color: '#2563eb',
        itemStyle: { color: '#2563eb' },
        barMaxWidth: 24,
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#faad14', type: 'dashed', width: 1 },
          data: [{
            yAxis: average,
            label: {
              formatter: `Long-Term Avg ${formatPercent(average, 1)}`,
              fontSize: mobile ? 10 : 11,
              color: '#faad14',
              position: mobile ? 'insideStartTop' : 'end',
            },
          }],
        },
      }],
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: cssVar('--card-bg') || '#fff',
        borderColor: cssVar('--border') || '#e8e8e8',
        textStyle: {
          fontSize: 13,
          color: cssVar('--text') || '#1a1a1a',
          fontFamily: CHART_FONT,
        },
        formatter: params => {
          const point = series[params[0].dataIndex];
          return `${point.date.slice(0, 4)}<br/>ROE: <b>${formatPercent(point.value, 1)}</b>`;
        },
      },
    };
  }

  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);
}

// ══════════════════════════════════════════════════════
// Panel 10: 5-Year rolling return
// ══════════════════════════════════════════════════════

export function initPanelRolling(data, opts = {}) {
  const chartId = opts.chartId || 'chartRolling';
  const toggleId = opts.toggleId || 'rollingWindowToggle';
  // Same palette as "S&P 500 Bull/Bear Cycles" panel: BULL_STROKE=#389e0d / BEAR_STROKE=#cf1322
  const BULL_STROKE = '#389e0d';
  const BEAR_STROKE = '#cf1322';
  const chart = registerChart(echarts.init(document.getElementById(chartId)));
  // When precomputed=true, use data.series directly (already a rolling series with externally chosen window, no toggling)
  // Otherwise derive on-the-fly from monthly data.series + currentWindow, supporting 1/5/7/10/20-year toggling
  const monthlySeries = data?.series || [];
  let currentWindow = opts.precomputed ? null : (opts.defaultWindow ?? 5);
  let series = opts.precomputed
    ? monthlySeries
    : buildRollingAnnualizedSeries(monthlySeries, currentWindow).series;
  let latestRolling = series.at(-1) ?? null;

  function windowLabel(years) {
    return years === 1 ? '52W' : `${years}Y`;
  }

  function getOption() {
    const gridColor = cssVar('--chart-grid') || '#f0f0f0';
    const grayColor = cssVar('--gray') || '#999';

    const mobile = isMobile();
    // Mobile: reserve more space on the right so markPoint "Latest XX%" and markLine "Break-even" labels aren't clipped
    const latestLabel = currentWindow
      ? `Latest ${windowLabel(currentWindow)} ${formatPercent(latestRolling?.value ?? 0, 2)}`
      : `Latest ${formatPercent(latestRolling?.value ?? 0, 2)}`;
    const latestPointColor = (latestRolling?.value ?? 0) >= 0 ? BULL_STROKE : BEAR_STROKE;
    const latestMarkPoint = latestRolling
      ? buildSingleMarkPoint(
          latestRolling.date,
          latestRolling.value,
          latestLabel,
          latestPointColor,
          'right',
        )
      : null;
    if (mobile && latestMarkPoint) {
      latestMarkPoint.label = { ...(latestMarkPoint.label || {}), fontSize: 10 };
    }
    return {
      animation: false,
      grid: mobile
        ? { left: 52, right: 62, top: 20, bottom: 60 }
        : { left: 65, right: 20, top: 20, bottom: 60 },
      xAxis: {
        type: 'time',
        max: AXIS_END_2028_TS,
        axisLabel: { fontSize: mobile ? 10 : 11, color: grayColor, fontFamily: CHART_FONT, hideOverlap: true },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          formatter: value => formatPercent(value, 0),
          fontSize: mobile ? 10 : 11,
          color: grayColor,
          fontFamily: CHART_FONT,
        },
        splitLine: { lineStyle: { color: gridColor } },
      },
      series: [
        {
          name: 'Positive Range',
          type: 'line',
          data: series.map(item => [item.date, item.value >= 0 ? item.value : null]),
          showSymbol: false,
          lineStyle: { width: 0 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(56,158,13,0.42)' },
              { offset: 1, color: 'rgba(56,158,13,0.12)' },
            ]),
          },
          z: 1,
        },
        {
          name: 'Negative Range',
          type: 'line',
          data: series.map(item => [item.date, item.value < 0 ? item.value : null]),
          showSymbol: false,
          lineStyle: { width: 0 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(207,19,34,0.12)' },
              { offset: 1, color: 'rgba(207,19,34,0.42)' },
            ]),
          },
          z: 1,
        },
        {
          // Positive line segment (green): draw when value >= 0, else null
          name: 'Positive Annualized',
          type: 'line',
          connectNulls: false,
          data: series.map(item => [item.date, item.value >= 0 ? item.value : null]),
          showSymbol: false,
          lineStyle: { width: 1.8, color: BULL_STROKE },
          z: 3,
        },
        {
          // Negative line segment (red): draw when value < 0, else null
          name: 'Negative Annualized',
          type: 'line',
          connectNulls: false,
          data: series.map(item => [item.date, item.value < 0 ? item.value : null]),
          showSymbol: false,
          lineStyle: { width: 1.8, color: BEAR_STROKE },
          z: 3,
        },
        {
          // Transparent carrier layer: bridges adjacent positive/negative points with 1px when crossing zero, avoiding visual breaks
          // Also hosts markPoint and markLine rendering
          name: currentWindow ? `${windowLabel(currentWindow)} Annualized Return` : 'Rolling Annualized Return',
          type: 'line',
          clip: false,
          data: series.map(item => [item.date, item.value]),
          showSymbol: false,
          lineStyle: { width: 0, opacity: 0 },
          markPoint: latestMarkPoint ? { data: [latestMarkPoint] } : undefined,
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: grayColor, type: 'dashed', width: 1 },
            data: [{ yAxis: 0, label: { formatter: 'Break-even', fontSize: mobile ? 10 : 11, color: grayColor } }],
          },
          tooltip: { show: false },
          z: 4,
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
          return `${params[0].axisValueLabel}<br/>Annualized Return: <b>${formatPercent(point.value, 2)}</b><br/>Holding Period: ${point.startDate} → ${point.date}`;
        },
      },
      dataZoom: getDataZoom(grayColor),
    };
  }

  function applyOption() {
    chart.setOption(resolveMarkPointOverlaps(getOption()), true);
  }

  applyOption();
  chart._refreshTheme = applyOption;

  if (!opts.precomputed) {
    const toggleEl = document.getElementById(toggleId);
    if (toggleEl) {
      toggleEl.addEventListener('click', event => {
        const btn = event.target.closest('.btn');
        if (!btn || !btn.dataset.window) return;
        const next = Number(btn.dataset.window);
        if (!Number.isFinite(next) || next === currentWindow) return;
        toggleEl.querySelectorAll('.btn').forEach(item => item.classList.remove('active'));
        btn.classList.add('active');
        currentWindow = next;
        series = buildRollingAnnualizedSeries(monthlySeries, currentWindow).series;
        latestRolling = series.at(-1) ?? null;
        applyOption();
      });
    }
  }
}

/**
 * Convert monthly price series to log year-over-year: ln(P_t) - ln(P_{t-12}).
 * Uses YYYY-MM as key to look up the value 12 months prior, avoiding index drift.
 */

export function initAnnualReturnsPanel(data, opts = {}) {
  const chartId = opts.chartId || 'chartAnnual';
  const summaryId = opts.summaryId || 'annualSummary';
  const chart = registerChart(echarts.init(document.getElementById(chartId)));
  const series = data.series || [];

  function getOption() {
    const grayColor = cssVar('--gray') || '#999';
    const gridColor = cssVar('--chart-grid') || '#f0f0f0';
    const greenColor = cssVar('--green') || '#389e0d';
    const redColor = cssVar('--red') || '#cf1322';

    const mobile = isMobile();
    // Mobile: limited space, show year label every 20 years; desktop keeps every 10
    const yearStride = mobile ? 20 : 10;
    return {
      animation: false,
      grid: mobile ? { left: 44, right: 12, top: 20, bottom: 50 } : { left: 55, right: 20, top: 20, bottom: 50 },
      xAxis: {
        type: 'category',
        data: series.map(item => item.year),
        axisLabel: {
          color: grayColor,
          fontSize: mobile ? 10 : 11,
          fontFamily: CHART_FONT,
          hideOverlap: true,
          formatter: value => Number(value) % yearStride === 0 ? value : '',
        },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          formatter: value => `${value}%`,
          color: grayColor,
          fontSize: mobile ? 10 : 11,
          fontFamily: CHART_FONT,
        },
        splitLine: { lineStyle: { color: gridColor } },
      },
      series: [{
        name: 'Annual Return',
        type: 'bar',
        data: series.map(item => ({
          value: item.value,
          itemStyle: { color: item.value >= 0 ? greenColor : redColor },
        })),
        barMaxWidth: 10,
        markLine: {
          silent: true,
          symbol: 'none',
          // Hide default "0" label (the dashed line already marks the zero axis; avoids viewport overflow on mobile)
          label: { show: false },
          lineStyle: { color: grayColor, type: 'dashed', width: 1 },
          data: [{ yAxis: 0 }],
        },
      }],
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: cssVar('--card-bg') || '#fff',
        borderColor: cssVar('--border') || '#e8e8e8',
        textStyle: {
          fontSize: 13,
          color: cssVar('--text') || '#1a1a1a',
          fontFamily: CHART_FONT,
        },
        formatter: params => {
          const point = series[params[0].dataIndex];
          return `${point.year}<br/>Annual Return: <b>${formatPercent(point.value, 2)}</b>`;
        },
      },
    };
  }

  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  renderMetricStrip(summaryId, [
    buildMetricCard('Positive Years', `${data.positiveYears}/${series.length}`, 'Start with the share of winning years over the long run, then examine the fat-tail volatility.'),
    buildMetricCard('Long-Term Average', formatPercent(data.average || 0, 2), 'Mean annual return across the full sample.'),
    buildMetricCard('Best Year', data.best ? `${data.best.year} | ${formatPercent(data.best.value, 2)}` : '--', 'Historical best annual return.'),
    buildMetricCard('Worst Year', data.worst ? `${data.worst.year} | ${formatPercent(data.worst.value, 2)}` : '--', 'Historical largest annual drawdown.'),
  ]);
}

export function initReturnDetailsPanel(data, opts = {}) {
  const chartId = opts.chartId || 'chartReturnDetails';
  const summaryId = opts.summaryId || 'returnDetailsSummary';
  const indexLabel = opts.indexLabel || 'S&P 500';
  const hideBuyback = !!opts.hideBuyback;
  const chart = registerChart(echarts.init(document.getElementById(chartId)));
  const series = data?.series || [];
  if (!series.length) {
    return;
  }

  function getOption() {
    const grayColor = cssVar('--gray') || '#999';
    const gridColor = cssVar('--chart-grid') || '#f0f0f0';
    const accentColor = cssVar('--accent') || '#4758e0';
    const greenColor = cssVar('--green') || '#389e0d';
    const amberColor = '#faad14';
    const totalColor = cssVar('--sp500-line') || '#1a1a1a';
    const buildTooltipItem = (label, value, color, marker = 'bar') => {
      const markerStyle = marker === 'line'
        ? `display:inline-block;width:12px;height:2px;border-radius:999px;background:${color};margin-right:6px;vertical-align:middle;`
        : `display:inline-block;width:10px;height:10px;border-radius:2px;background:${color};margin-right:6px;vertical-align:-1px;`;

      return `<span style="white-space:nowrap;"><span style="${markerStyle}"></span>${label}: <b style="color:${color}">${formatPercent(value, 2)}</b></span>`;
    };

    return {
      animation: false,
      legend: {
        top: 0,
        right: 0,
        itemWidth: 12,
        itemHeight: 8,
        textStyle: { color: grayColor, fontSize: 11, fontFamily: CHART_FONT },
      },
      grid: { left: 58, right: 24, top: 44, bottom: 50 },
      xAxis: {
        type: 'category',
        data: series.map(item => item.year),
        axisLabel: {
          color: grayColor,
          fontSize: 11,
          fontFamily: CHART_FONT,
          formatter: value => Number(value) % 2 === 1 ? '' : value,
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
      series: [
        {
          name: 'Price Return',
          type: 'bar',
          stack: 'return',
          barMaxWidth: 12,
          itemStyle: { color: accentColor },
          data: series.map(item => item.priceReturn),
        },
        {
          name: 'Dividend Return',
          type: 'bar',
          stack: 'return',
          barMaxWidth: 12,
          itemStyle: { color: greenColor },
          data: series.map(item => item.dividendReturn),
        },
        ...(hideBuyback ? [] : [{
          name: 'Net Buyback Yield',
          type: 'bar',
          stack: 'return',
          barMaxWidth: 12,
          itemStyle: { color: amberColor },
          data: series.map(item => item.buybackYield),
        }]),
        {
          name: 'Total Return',
          type: 'line',
          showSymbol: false,
          lineStyle: { width: 2, color: totalColor },
          itemStyle: { color: totalColor },
          data: series.map(item => item.totalReturn),
          z: 3,
        },
      ],
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: cssVar('--card-bg') || '#fff',
        borderColor: cssVar('--border') || '#e8e8e8',
        textStyle: {
          fontSize: 13,
          color: cssVar('--text') || '#1a1a1a',
          fontFamily: CHART_FONT,
        },
        formatter: params => {
          const point = series[params[0].dataIndex];
          const rows = [
            `<b>${point.year}</b>`,
            buildTooltipItem('Price Return', point.priceReturn, accentColor),
            buildTooltipItem('Dividend Return', point.dividendReturn, greenColor),
          ];
          if (!hideBuyback) rows.push(buildTooltipItem('Net Buyback Yield', point.buybackYield, amberColor));
          rows.push(buildTooltipItem('Total Return', point.totalReturn, totalColor, 'line'));
          return rows.join('<br/>');
        },
      },
    };
  }

  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  const metricCards = [
    buildMetricCard('Sample Period', `${data.summary?.startYear || series[0].year}-${data.summary?.endYear || series.at(-1).year}`, data.note || 'Total return basis includes price, dividends, and net buyback yield.'),
    buildMetricCard('Avg. Price Return', data.summary?.avgPriceReturn != null ? formatPercent(data.summary.avgPriceReturn, 2) : '--', 'Annual change in the index level itself.'),
    buildMetricCard('Avg. Dividend Return', data.summary?.avgDividendReturn != null ? formatPercent(data.summary.avgDividendReturn, 2) : '--', 'Contribution from cash dividends.'),
  ];
  if (!hideBuyback) metricCards.push(buildMetricCard('Avg. Net Buyback', data.summary?.avgBuybackYield != null ? formatPercent(data.summary.avgBuybackYield, 2) : '--', 'Net buybacks approximating the share-count contraction contribution.'));
  metricCards.push(buildMetricCard('Avg. Total Return', data.summary?.avgTotalReturn != null ? formatPercent(data.summary.avgTotalReturn, 2) : '--', `Positive in ${data.summary?.positiveTotalYears || 0}/${data.summary?.years || series.length} years.`));
  metricCards.push(buildMetricCard('Best / Worst', `${data.summary?.bestYear?.year || '--'} / ${data.summary?.worstYear?.year || '--'}`, `${data.summary?.bestYear ? formatPercent(data.summary.bestYear.totalReturn, 2) : '--'} / ${data.summary?.worstYear ? formatPercent(data.summary.worstYear.totalReturn, 2) : '--'}`));
  renderMetricStrip(summaryId, metricCards);
}

// ══════════════════════════════════════════════════════
// Panel: Intrayear max drawdown vs full-year return (Charlie Bilello style)
// Data: sp500_intrayear_dd.json (1928-present)
// ══════════════════════════════════════════════════════

export function initIntrayearDdPanel(data, opts = {}) {
  const gridId = opts.gridId || 'ddGrid';
  const grid = document.getElementById(gridId);
  if (!grid || !data?.annual?.length) return;

  const fmtPct = v => `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;

  // First row = column headers
  const headerHtml = `<div class="dd-row dd-header">
    <span class="dd-year">Year</span>
    <span class="dd-dd">Intrayear Max DD</span>
    <span class="dd-tr">Full-Year Return</span>
    <span class="dd-ath">New Highs</span>
  </div>`;

  // Data rows
  const rowsHtml = data.annual.map(item => {
    const trClass = item.tr >= 0 ? 'dd-pos' : 'dd-neg';
    const ongoingMark = item.ongoing ? '<span title="Ongoing">*</span>' : '';
    return `<div class="dd-row${item.ongoing ? ' dd-row-ongoing' : ''}">
      <span class="dd-year">${item.year}${ongoingMark}</span>
      <span class="dd-dd">${fmtPct(item.dd)}</span>
      <span class="dd-tr ${trClass}">${fmtPct(item.tr)}</span>
      <span class="dd-ath">${item.ath ?? 0}</span>
    </div>`;
  }).join('');

  grid.innerHTML = headerHtml + rowsHtml;
}

// ══════════════════════════════════════════════════════
// Panel: S&P 500 annual return distribution (histogram, Charlie Bilello style)
// Data: sp500_annual_tr.json · Damodaran 1928-1988 + yfinance ^SP500TR 1989+
// ══════════════════════════════════════════════════════

export function initSp500AnnualDistPanel(data, opts = {}) {
  const wrapId = opts.wrapId || 'trDistWrap';
  const summaryId = opts.summaryId || 'trDistSummary';
  const wrap = document.getElementById(wrapId);
  if (!wrap || !data?.buckets?.length) return;

  const latestYear = data.latestYear;
  const gridHtml = data.buckets.map(b => {
    const sign = b.min < 0 ? 'neg' : 'pos';
    // Ascending years: stack bottom-up within column (column-reverse puts last array element at top)
    const years = [...b.years].sort((a, c) => a - c);
    const cells = years.map(yr => {
      const isCurrent = yr === latestYear;
      // 1948-2026 have chronicle pages: add link
      const hasChronicle = yr >= 1948 && yr <= 2026;
      const cls = `tr-dist-cell tr-${sign}${isCurrent ? ' tr-current' : ''}`;
      if (hasChronicle) {
        return `<a class="${cls}" href="chronicle/${yr}.html" target="_blank" rel="noopener" title="${yr} · View Chronicle">${yr}</a>`;
      }
      return `<div class="${cls}" title="${yr}">${yr}</div>`;
    }).join('');
    return `<div class="tr-dist-col">${cells}</div>`;
  }).join('');

  const axisHtml = data.buckets.map(b => {
    const sign = b.min < 0 ? 'neg' : 'pos';
    return `<div class="tr-dist-axis-label tr-${sign}">${b.label}</div>`;
  }).join('');

  wrap.innerHTML = `
    <div class="tr-dist-grid">${gridHtml}</div>
    <div class="tr-dist-axis">${axisHtml}</div>
  `;

  const total = data.totalYears;
  const posPct = Math.round((data.positiveYears / total) * 100);
  const withinPct = Math.round((data.withinAvgPlusMinus2 / total) * 100);
  const ytdTag = data.latestIsYtd ? ` (${latestYear} is YTD, as of ${data.latestDate})` : '';

  renderMetricStrip(summaryId, [
    buildMetricCard('Long-Term Avg. Total Return', formatPercent(data.average, 2), `${total}-year sample${ytdTag}, ${opts.returnKind || 'with dividends reinvested'}.`),
    buildMetricCard('Positive Years', `${data.positiveYears}/${total} · ${posPct}%`, 'Share of up years over the long run.'),
    buildMetricCard('Years Near Average', `${data.withinAvgPlusMinus2}/${total} · ${withinPct}%`, 'Very few years land within ±2pp of the mean — "average years" barely exist.'),
    buildMetricCard('Data Source', opts.sourceLabel || 'Damodaran + ^SP500TR', opts.sourceDesc || '1928-1988 from Damodaran (NYU Stern); 1989+ computed from yfinance ^SP500TR year-end levels.'),
  ]);
}

export function initCapitalismPanel() {
  const gridGroup   = document.getElementById('cgrGridGroup');
  const bellGroup   = document.getElementById('cgrBellGroup');
  const markerGroup = document.getElementById('cgrMarkerGroup');
  const chartWrap   = document.getElementById('cgrChartWrap');
  const detailCard  = document.getElementById('cgrDetailCard');
  const detailEmpty = document.getElementById('cgrDetailEmpty');
  const detailContent = document.getElementById('cgrDetailContent');
  if (!gridGroup) return;

  const SPEEDS = [
    {
      id: 'moore', pct: 40, color: '#0f172a', marker: 'cgrArrowBlack',
      tier: 'ceiling', tierLabel: 'Ceiling', label: '40%',
      desc: "Moore's pace of scale economics; rarely sustainable long-term",
      title: "Moore's Pace", subtitle: 'Moore-style compounding · transistor-scale economics',
      body: [
        'Moore-law level growth — <em>doubling every 18 months</em>, an annualized ~58% — but the sustainable ceiling at the industry level lands around 40%.',
        'Relies on exponential scale economics: unit cost falls geometrically with volume, and market boundaries are redrawn by hardware/algorithms.',
        'Very few companies sustain this for 10+ years. Once penetration crosses 50%, the slope drops almost immediately to the "network-effect tier."',
      ],
      examples: ['Early Intel 1970s', 'NVIDIA Data Center 2023-25', 'Early Internet 1995-99', 'Cloud IaaS 2010-15'],
    },
    {
      id: 'network', pct: 26, color: '#0f172a', marker: 'cgrArrowBlack',
      tier: 'ceiling', tierLabel: 'Ceiling', label: '26%',
      desc: 'Long-run growth ceiling for monetized network effects',
      title: 'Network-Effect Pace', subtitle: 'Network-effect monetization ceiling',
      body: [
        'Platform companies create value through connections between users — <em>nodes double, connections quadruple</em> — but monetization efficiency has a natural ceiling.',
        '~26% is the "survivor pace" only a handful of global network companies sustain over 10–15 years.',
        'Requires three things simultaneously: user-base expansion + per-user ARPU rising + gross margin not diluted by scale. Very few sustain all three long-term.',
      ],
      examples: ['Google 2004-15', 'Meta 2012-21', 'Tencent 2004-18', 'Visa / Mastercard long-term'],
    },
    {
      id: 'learning', pct: 18, color: '#0f172a', marker: 'cgrArrowBlack',
      tier: 'frontier', tierLabel: 'Frontier', label: '18%',
      desc: 'Human learning-curve pace',
      title: 'Learning-Curve Pace', subtitle: 'Human learning curve · marginal returns from experience',
      body: [
        'The classic "learning curve" — <em>every doubling of cumulative output drops unit cost 15–25%</em> — translates to roughly 18% annualized revenue growth.',
        'It does not rely on network effects but on organizational know-how, process improvement, and employee experience.',
        'The "great-company long-run pace" for manufacturing and craft-based services typically lands in this band.',
      ],
      examples: ['Toyota Production System', 'TSMC process iteration', 'Best-in-class manufacturers 10Y CAGR'],
    },
    {
      id: 'wright', pct: 15, color: '#0f172a', marker: 'cgrArrowBlack',
      tier: 'frontier', tierLabel: 'Frontier', label: '15%',
      desc: "Wright's Law pace; long-run ceiling for top physical-economy firms",
      title: "Wright's Pace", subtitle: "Wright's Law · physical-economy scale ceiling",
      body: [
        'Wright\'s Law: <em>every doubling of cumulative output cuts unit cost ~15%</em> — the "physical ceiling" of scale manufacturing.',
        'Long-term revenue CAGR of 15% already puts a physical-economy firm in the top 1% of the market — anything above usually requires category expansion or front-loaded capex.',
        'Buffett\'s "great companies" — Moutai/Coca-Cola/Costco-style consumer stalwarts — typically compound long-term at roughly this pace.',
      ],
      examples: ['Costco 20Y CAGR', 'Kweichow Moutai long-term', 'Coca-Cola 1970-95', 'Tesla Model cost curve'],
    },
    {
      id: 'sp500', pct: 10, color: '#3b82f6', marker: 'cgrArrowBlue',
      tier: 'core', tierLabel: 'Core', label: '10%',
      desc: 'Long-run growth of wealthy households\' assets and consumption; S&P 500 CAGR',
      title: 'S&P 500 Long-Term CAGR', subtitle: 'S&P 500 long-run total return · capital compounding for the wealthy',
      body: [
        '<em>The S&P 500 has returned ~10% annualized with dividends over the past 100 years</em> — the reward for "passively holding capital."',
        'It is also the long-run growth rate of wealthy-household assets and high-end consumption in developed markets — because that cohort\'s wealth is held primarily in equities.',
        'This line is the "reference frame" of the whole chart: any long-run growth above 10% needs a special explanation; assets below 10% underperform USD-denominated capital compounding.',
      ],
      examples: ['S&P 500 1928-2024', 'Half of Buffett\'s 20Y average of 20%', 'US HNW household net-worth CAGR'],
    },
    {
      id: 'ustbond', pct: 8, color: '#0f172a', marker: 'cgrArrowBlack',
      tier: 'core', tierLabel: 'Core', label: '8%',
      desc: 'US Treasury debt growth',
      title: 'US Treasury Debt Growth', subtitle: 'US Treasury debt growth rate',
      body: [
        'US federal debt has grown at roughly <em>8% nominal annualized over the past 20 years</em> — well above nominal GDP growth.',
        'This is the "fiscal backstop pace": when the private economy fails to grow at 8%, the shortfall is plugged by fiscal deficits and shows up as rapid expansion in the debt stock.',
        'It forms a critical comparison with the 10% S&P CAGR — equities only marginally outpace Treasury debt growth long-term; leverage is the real gap.',
      ],
      examples: ['US Public Debt 2005-24', 'Post-QE sovereign leverage expansion'],
    },
    {
      id: 'sp500_eps', pct: 6.5, color: '#0f172a', marker: 'cgrArrowBlack',
      tier: 'core', tierLabel: 'Core', label: '6-7%',
      desc: 'US earnings growth of the past 50 years; A-share dividend low-vol',
      title: 'US Earnings Growth / A-Share Dividends', subtitle: 'US earnings CAGR · A-share dividend low-vol',
      body: [
        'S&P 500 <em>EPS long-run CAGR is about 6-7%</em> — the true pace of corporate earnings, stripped of multiple expansion.',
        'The gap to 10% total return (dividend reinvestment + multiple expansion + buybacks) makes up the other half of "capital compounding."',
        "China's CSI Dividend Low-Volatility Index has long run in this band — one of the few A-share assets that consistently beats nominal GDP long-term.",
      ],
      examples: ['S&P 500 EPS 1974-2024', 'CSI Dividend Low-Vol Total Return', 'HK high-dividend stocks'],
    },
    {
      id: 'inflation', pct: 4, color: '#dc2626', marker: 'cgrArrowRed',
      tier: 'base', tierLabel: 'Kill-line', label: '4%',
      desc: 'True USD inflation; cost of capital; the kill-line',
      title: 'True USD Inflation · Kill-line', subtitle: 'True USD inflation · cost of capital',
      body: [
        'Official CPI typically prints 2-3%, but weighting real cost of living, asset prices, and cost of debt, <em>"true inflation" sits around 4% long-term</em>.',
        'This is the <strong style="color:#dc2626">kill-line</strong>: any asset that cannot outpace 4% long-term is being slowly diluted by the USD order.',
        'It also approximates the long-term cost of Treasury financing — any business model with ROIC below 4% is negative alpha.',
      ],
      examples: ['10Y UST yield long-term mean', 'Core PCE + asset inflation', 'Shadow Stats inflation'],
    },
    {
      id: 'wage', pct: 2, color: '#0f172a', marker: 'cgrArrowBlack',
      tier: 'base', tierLabel: 'Baseline', label: '2%',
      desc: 'Median wage growth; sustainable buyback pace',
      title: 'Wage Growth · Sustainable Buyback Pace', subtitle: 'Median wage growth · net buyback yield',
      body: [
        'Developed-market <em>median real wages grow ~2% annualized</em> — essentially matching the official inflation target; median labor purchasing power has stagnated long-term.',
        "US net buyback yield (net buybacks / market cap) has also averaged ~2%, forming a key numerator inside the 10% total return.",
        'This line shows why "saving from wages" loses to the system — it is even below the kill-line.',
      ],
      examples: ['US real wages 1973-2024', 'S&P 500 net buyback yield', 'OECD median income'],
    },
  ];

  const NS = 'http://www.w3.org/2000/svg';
  const VB = { w: 900, h: 720 };
  const M  = { top: 30, right: 30, bottom: 50, left: 70 };
  const PLOT = { x0: M.left, x1: VB.w - M.right, y0: M.top, y1: VB.h - M.bottom };
  const Y_MAX = 40;

  const yOf = pct => PLOT.y1 - (pct / Y_MAX) * (PLOT.y1 - PLOT.y0);
  // bell shifted left: 37% from left edge instead of center
  const CENTER_X = PLOT.x0 + (PLOT.x1 - PLOT.x0) * 0.37;
  // narrower bell to leave room for labels on the right
  const MAX_WIDTH = (PLOT.x1 - PLOT.x0) * 0.32;

  function bellHalfWidth(pct) {
    const k = 1 - Math.pow(pct / 40, 0.42);
    return MAX_WIDTH * Math.pow(k, 1.35) + 1;
  }

  function svgEl(tag, attrs) {
    const el = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  }

  // grid lines
  for (let v = 0; v <= Y_MAX; v++) {
    const y = yOf(v);
    const major = v % 5 === 0;
    gridGroup.appendChild(svgEl('line', {
      x1: PLOT.x0, x2: PLOT.x1, y1: y, y2: y,
      class: 'cgr-grid' + (major ? ' cgr-grid-major' : ''),
    }));
    const txt = svgEl('text', {
      x: PLOT.x0 - 8, y: y + 3,
      'text-anchor': 'end',
      class: 'cgr-axis-text' + (major ? ' cgr-axis-major' : ''),
    });
    txt.textContent = v;
    gridGroup.appendChild(txt);
  }
  // y-axis title
  const pctLabel = svgEl('text', { x: PLOT.x0 - 40, y: PLOT.y0 - 10, class: 'cgr-axis-title' });
  pctLabel.textContent = '%';
  gridGroup.appendChild(pctLabel);
  // baseline + y-axis lines
  gridGroup.appendChild(svgEl('line', { x1: PLOT.x0, x2: PLOT.x1, y1: PLOT.y1, y2: PLOT.y1, stroke: '#cbd5e1', 'stroke-width': '1' }));
  gridGroup.appendChild(svgEl('line', { x1: PLOT.x0, x2: PLOT.x0, y1: PLOT.y0, y2: PLOT.y1, stroke: '#cbd5e1', 'stroke-width': '1' }));

  // bell curve path
  const STEPS = 160;
  const leftPts = [], rightPts = [];
  for (let i = 0; i <= STEPS; i++) {
    const pct = (i / STEPS) * Y_MAX;
    const hw = bellHalfWidth(pct);
    const y  = yOf(pct);
    leftPts.push([CENTER_X - hw, y]);
    rightPts.push([CENTER_X + hw, y]);
  }
  let d = `M ${leftPts[0][0]} ${leftPts[0][1]}`;
  for (let i = 1; i < leftPts.length; i++) d += ` L ${leftPts[i][0]} ${leftPts[i][1]}`;
  for (let i = rightPts.length - 1; i >= 0; i--) d += ` L ${rightPts[i][0]} ${rightPts[i][1]}`;
  d += ' Z';
  bellGroup.appendChild(svgEl('path', { d, class: 'cgr-bell-fill' }));
  [leftPts, rightPts].forEach(pts => {
    let p = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) p += ` L ${pts[i][0]} ${pts[i][1]}`;
    bellGroup.appendChild(svgEl('path', { d: p, class: 'cgr-bell-stroke' }));
  });

  // markers
  SPEEDS.forEach(sp => {
    const y = yOf(sp.pct);
    const hw = bellHalfWidth(sp.pct);
    const arrowEndX = CENTER_X + hw + 140;
    const descX = arrowEndX + 8;
    const labelX = CENTER_X - hw - 12;

    const g = svgEl('g', { class: 'cgr-marker', 'data-id': sp.id });

    // highlight band
    const band = svgEl('rect', { x: PLOT.x0, y: y - 10, width: PLOT.x1 - PLOT.x0, height: 20, class: 'cgr-band' });
    g.appendChild(band);

    // pct label left
    const lbl = svgEl('text', { x: labelX, y: y + 4, 'text-anchor': 'end', class: 'cgr-marker-label', fill: sp.color });
    lbl.textContent = sp.label;
    g.appendChild(lbl);

    // arrow line
    const line = svgEl('line', {
      x1: CENTER_X - hw, x2: arrowEndX, y1: y, y2: y,
      stroke: sp.color, class: 'cgr-marker-line',
      'marker-end': `url(#${sp.marker})`,
    });
    g.appendChild(line);

    // description text
    const desc = svgEl('text', { x: descX, y: y + 4, class: 'cgr-marker-desc', fill: sp.color });
    desc.textContent = sp.desc;
    g.appendChild(desc);

    // hit-box
    g.appendChild(svgEl('rect', { x: PLOT.x0, y: y - 14, width: PLOT.x1 - PLOT.x0, height: 28, class: 'cgr-hitbox' }));

    markerGroup.appendChild(g);
  });

  // interactions
  const groups = Array.from(markerGroup.querySelectorAll('.cgr-marker'));
  let pinnedId = null, hoverId = null;

  function applyState() {
    const activeId = pinnedId || hoverId;
    chartWrap.classList.toggle('cgr-has-hover', !!activeId);
    detailCard.classList.toggle('pinned', !!pinnedId);
    groups.forEach(g => {
      const id = g.getAttribute('data-id');
      const isActive = id === activeId;
      g.classList.toggle('cgr-active', isActive);
      g.classList.toggle('cgr-dim', !!activeId && !isActive);
      g.querySelector('.cgr-band').classList.toggle('cgr-band-on', isActive);
    });
    if (activeId) {
      detailEmpty.style.display = 'none';
      detailContent.style.display = '';
      renderDetail(SPEEDS.find(s => s.id === activeId));
    } else {
      detailEmpty.style.display = '';
      detailContent.style.display = 'none';
    }
  }

  function renderDetail(sp) {
    const yrs = [10, 20, 30];
    const tierClass = 'cgr-tag-' + sp.tier;
    detailContent.innerHTML = `
      <div class="cgr-detail-head">
        <div class="cgr-detail-pct">${sp.label}</div>
        <div class="cgr-detail-tag ${tierClass}">${sp.tierLabel}</div>
      </div>
      <h3 class="cgr-detail-title">${sp.title}</h3>
      <div class="cgr-detail-subtitle">${sp.subtitle}</div>
      <div class="cgr-detail-body">${sp.body.map(p => `<p>${p}</p>`).join('')}</div>
      <div class="cgr-examples">
        <div class="cgr-examples-title">Examples</div>
        <div class="cgr-examples-list">${sp.examples.map(e => `<span class="cgr-chip">${e}</span>`).join('')}</div>
      </div>
      <div class="cgr-compound-box">
        <div class="cgr-compound-row header"><div>Years</div><div>Multiple</div><div>$1 →</div><div>vs 4% Kill-line</div></div>
        ${yrs.map(n => {
          const mult = Math.pow(1 + sp.pct / 100, n);
          const rel  = mult / Math.pow(1.04, n);
          const relHtml = rel >= 1
            ? `<span style="color:#059669">×${rel.toFixed(2)} beats</span>`
            : `<span style="color:#dc2626">×${rel.toFixed(2)} lags</span>`;
          return `<div class="cgr-compound-row"><div class="yrs">${n}Y</div><div class="val">${mult >= 100 ? mult.toFixed(0) : mult.toFixed(2)}×</div><div class="val">$${mult >= 100 ? mult.toFixed(0) : mult.toFixed(2)}</div><div class="val">${relHtml}</div></div>`;
        }).join('')}
      </div>`;
  }

  groups.forEach(g => {
    const id = g.getAttribute('data-id');
    g.addEventListener('mouseenter', () => { hoverId = id; applyState(); });
    g.addEventListener('mouseleave', () => { if (hoverId === id) hoverId = null; applyState(); });
    g.addEventListener('click', e => { e.stopPropagation(); pinnedId = pinnedId === id ? null : id; applyState(); });
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { pinnedId = null; applyState(); } });
  // click outside to unpin
  detailCard.closest('#panel-capitalism').addEventListener('click', e => {
    if (!e.target.closest('.cgr-marker') && !e.target.closest('.cgr-detail')) {
      pinnedId = null; applyState();
    }
  });
  applyState();
}

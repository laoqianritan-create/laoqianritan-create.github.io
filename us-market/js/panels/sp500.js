// panels/sp500.js · S&P 500 面板：走势/回撤/波动率/月度/PE/EPS/ROE/滚动收益/年回报/回报分解

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

export function initPanelPrice(data, recessionData, centuryData) {
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
  const minTrendTs = new Date(combinedData[0][0]).getTime();
  const maxTrendTs = new Date(combinedData.at(-1)[0]).getTime();
  const minTrendGapMs = 90 * 24 * 3600 * 1000;
  let currentScale = 'log';
  let trendLineState = null;

  function ensureTrendLineState() {
    if (trendLineState || !combinedData.length) {
      return;
    }
    const startValue = combinedData[0][1];
    const years = (maxTrendTs - minTrendTs) / (365.25 * 24 * 3600 * 1000);
    trendLineState = {
      startTs: minTrendTs,
      endTs: maxTrendTs,
      startValue,
      endValue: startValue * Math.pow(1.075, years),
    };
  }

  function clampTrendLineState(lastChanged) {
    ensureTrendLineState();
    trendLineState.startTs = Math.min(maxTrendTs - minTrendGapMs, Math.max(minTrendTs, trendLineState.startTs));
    trendLineState.endTs = Math.max(minTrendTs + minTrendGapMs, Math.min(maxTrendTs, trendLineState.endTs));
    if (trendLineState.endTs - trendLineState.startTs < minTrendGapMs) {
      if (lastChanged === 'start') {
        trendLineState.startTs = Math.max(minTrendTs, trendLineState.endTs - minTrendGapMs);
      } else {
        trendLineState.endTs = Math.min(maxTrendTs, trendLineState.startTs + minTrendGapMs);
      }
    }
    trendLineState.startValue = Math.max(1, trendLineState.startValue);
    trendLineState.endValue = Math.max(1, trendLineState.endValue);
  }

  function getTrendLineData() {
    ensureTrendLineState();
    clampTrendLineState();
    return [
      [trendLineState.startTs, trendLineState.startValue],
      [trendLineState.endTs, trendLineState.endValue],
    ];
  }

  function updateTrendLineSeries() {
    if (currentScale !== 'log') {
      return;
    }
    chart.setOption({
      series: [{
        id: 'trend-line',
        data: getTrendLineData(),
        lineStyle: {
          width: 2,
          color: cssVar('--accent') || '#4758e0',
          type: 'dashed',
        },
      }],
    });
  }

  function updateTrendHandles() {
    if (currentScale !== 'log') {
      chart.setOption({ graphic: [] });
      return;
    }

    const trendData = getTrendLineData();
    const startPixel = chart.convertToPixel('grid', trendData[0]);
    const endPixel = chart.convertToPixel('grid', trendData[1]);
    if (!Array.isArray(startPixel) || !Array.isArray(endPixel)) {
      return;
    }

    const trendColor = cssVar('--accent') || '#4758e0';
    chart.setOption({
      graphic: [
        {
          id: 'trend-start',
          type: 'circle',
          position: startPixel,
          shape: { r: 6 },
          style: {
            fill: cssVar('--card-bg') || '#fff',
            stroke: trendColor,
            lineWidth: 2,
          },
          draggable: true,
          cursor: 'move',
          z: 100,
          ondrag: echarts.util.curry(onTrendHandleDrag, 'start'),
        },
        {
          id: 'trend-end',
          type: 'circle',
          position: endPixel,
          shape: { r: 6 },
          style: {
            fill: cssVar('--card-bg') || '#fff',
            stroke: trendColor,
            lineWidth: 2,
          },
          draggable: true,
          cursor: 'move',
          z: 100,
          ondrag: echarts.util.curry(onTrendHandleDrag, 'end'),
        },
        {
          id: 'trend-label',
          type: 'text',
          position: [endPixel[0] + 10, endPixel[1] - 18],
          style: {
            text: '拖动蓝线',
            fill: trendColor,
            font: `600 12px ${CHART_FONT}`,
          },
          silent: true,
          z: 100,
        },
      ],
    });
  }

  function onTrendHandleDrag(which) {
    const coords = chart.convertFromPixel('grid', this.position);
    if (!Array.isArray(coords)) {
      requestAnimationFrame(updateTrendHandles);
      return;
    }
    const [rawTs, rawValue] = coords;
    if (!Number.isFinite(rawTs) || !Number.isFinite(rawValue)) {
      requestAnimationFrame(updateTrendHandles);
      return;
    }
    ensureTrendLineState();
    if (which === 'start') {
      trendLineState.startTs = rawTs;
      trendLineState.startValue = rawValue;
    } else {
      trendLineState.endTs = rawTs;
      trendLineState.endValue = rawValue;
    }
    clampTrendLineState(which);
    updateTrendLineSeries();
    requestAnimationFrame(updateTrendHandles);
  }

  function getOption(scale) {
    const isLog = scale === 'log';
    const isPct = scale === 'pct';
    const lineColor = cssVar('--sp500-line') || '#1a1a1a';
    const gridColor = cssVar('--chart-grid') || '#f0f0f0';
    const grayColor = cssVar('--gray') || '#999';

    let chartData;
    let tooltipFmt;

    if (isPct) {
      const base = combinedData[0][1];
      chartData = combinedData.map(([date, val]) => [date, (val / base - 1) * 100]);
      tooltipFmt = params => {
        const item = params.find(p => p.seriesName === 'S&P 500') || params[0];
        if (!item) return '';
        return `${params[0].axisValueLabel}<br/>自1928年起涨幅: <b>${formatPercent(item.value[1], 1)}</b>`;
      };
    } else {
      chartData = combinedData;
      tooltipFmt = params => {
        const item = params.find(p => p.seriesName === 'S&P 500') || params[0];
        if (!item) return '';
        const value = item.value[1];
        return `${params[0].axisValueLabel}<br/>点位: <b>${formatNumber(value, 0)}</b>`;
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

    const option = {
      animation: false,
      grid: { left: 65, right: 20, top: 20, bottom: 60 },
      xAxis: {
        type: 'time',
        max: AXIS_END_2028_TS,
        axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
        splitLine: { show: false },
      },
      yAxis: yAxisConf,
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

    if (isLog) {
      option.series.push({
        id: 'trend-line',
        name: '轨道趋势线',
        type: 'line',
        data: getTrendLineData(),
        showSymbol: false,
        color: cssVar('--accent') || '#4758e0',
        itemStyle: { color: cssVar('--accent') || '#4758e0' },
        lineStyle: { width: 2, color: cssVar('--accent') || '#4758e0', type: 'dashed' },
        tooltip: { show: false },
        silent: true,
        z: 4,
      });
    }

    return option;
  }

  chart.setOption(getOption(currentScale));
  chart._refreshTheme = () => {
    chart.setOption(getOption(currentScale), true);
    requestAnimationFrame(updateTrendHandles);
  };
  chart.on('dataZoom', () => requestAnimationFrame(updateTrendHandles));
  window.addEventListener('resize', () => requestAnimationFrame(updateTrendHandles));
  requestAnimationFrame(updateTrendHandles);

  if (centuryData) {
    renderMetricStrip('sp500CenturySummary', [
      buildMetricCard('数据起点', `${centuryData.start?.date || '--'} | ${centuryData.start ? formatNumber(centuryData.start.value, 2) : '--'}`, '月度数据起点'),
      buildMetricCard('最新月度点位', centuryData.latest ? formatNumber(centuryData.latest.value, 2) : '--', centuryData.latest?.date || ''),
      buildMetricCard('长期复合增速', centuryData.cagr != null ? formatPercent(centuryData.cagr, 2) : '--', '1928年至今年化'),
      buildMetricCard('默认视图', '对数模式', '蓝色趋势线支持鼠标拖动，拖动时保留当前缩放窗口；时间轴预留到 2028 年。'),
    ]);
  }

  document.getElementById('scaleToggle').addEventListener('click', event => {
    const btn = event.target.closest('.btn');
    if (!btn || !btn.dataset.scale) return;
    document.querySelectorAll('#scaleToggle .btn').forEach(item => item.classList.remove('active'));
    btn.classList.add('active');
    currentScale = btn.dataset.scale;
    chart.setOption(getOption(currentScale), true);
    requestAnimationFrame(updateTrendHandles);
  });
}

// ══════════════════════════════════════════════════════
// 面板2：回撤面积图 + 统计表格
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
            html += `<br/>点位: <b>${formatNumber(pricePoint.value[1], 0)}</b>`;
          }
          if (drawdownPoint) {
            html += `<br/>回撤: <b style="color:${redColor}">${formatPercent(drawdownPoint.value[1], 1)}</b>`;
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

  // 过滤掉 |回撤| < 10% 的小波动，避免表格过长
  drawdownData.drawdowns
    .filter(item => Math.abs(item.decline) >= 0.10)
    .forEach(item => {
    const absDecline = Math.abs(item.decline);
    const alpha = 0.18 + Math.min(absDecline / 0.6, 1) * 0.28;
    const tr = document.createElement('tr');
    if (item.active) {
      tr.classList.add('row-active');
    }

    // recovery_days 显示：null = 未恢复（active 进行中）；> 365 显示带"年"换算
    let recoveryCell;
    if (item.recovery_days == null) {
      recoveryCell = '<span style="color:var(--text-secondary)">进行中</span>';
    } else if (item.recovery_days > 365) {
      recoveryCell = `${item.recovery_days} (${(item.recovery_days / 365).toFixed(1)}年)`;
    } else {
      recoveryCell = `${item.recovery_days}`;
    }
    tr.innerHTML = `
      <td style="white-space:nowrap">${item.period}</td>
      <td style="text-align:right">${item.high}</td>
      <td style="text-align:right">${item.low}</td>
      <td style="text-align:right">${item.days}</td>
      <td class="decline-cell" style="text-align:right;color:var(--red);background:rgba(207,19,34,${alpha.toFixed(2)})">${formatPercent(item.decline * 100, 1)}</td>
      <td style="text-align:right;white-space:nowrap">${recoveryCell}</td>
      <td><span class="cat-badge cat-${item.category}">${catNames[item.category] || item.category}</span></td>
      ${hideCause ? '' : `<td class="cause-cell">${item.cause || ''}</td>`}
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
// 面板3：波动率
// ══════════════════════════════════════════════════════

export function initPanelVolatility(data, opts = {}) {
  const chartId = opts.chartId || 'chartVolatility';
  const indexLabel = opts.label || '标普500';
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
        data: ['20日波动率', '60日波动率'],
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
          name: '20日波动率',
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
                formatter: '20% 长期中位数',
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
          name: '60日波动率',
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
// 面板4：月度涨跌热力图
// ══════════════════════════════════════════════════════

export function initPanelMonthly(data, opts = {}) {
  const containerId = opts.containerId || 'monthlyHeatmap';
  const container = document.getElementById(containerId);
  if (!container) return;
  const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

  let html = '<table class="heatmap-table"><thead><tr><th>年份</th>';
  months.forEach(month => {
    html += `<th>${month}</th>`;
  });
  html += '<th>年度</th></tr></thead><tbody>';

  html += '<tr class="prob-row"><td class="year-cell">上涨概率</td>';
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
      const textColor = Math.abs(value) > 0.06 ? '#fff' : 'var(--text)';
      html += `<td><span class="heatmap-cell" style="background:${color};color:${textColor}">${formatPercent(value * 100, 1)}</span></td>`;
    }

    if (yearData.annual != null) {
      const annualColor = getHeatColor(yearData.annual);
      const annualText = Math.abs(yearData.annual) > 0.06 ? '#fff' : 'var(--text)';
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
    container.innerHTML = '<div class="loading-msg">暂无可用矩阵数据</div>';
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
        html += `<td><span class="matrix-cell matrix-cell--pos" data-start-year="${cell.startYear}" data-end-year="${cell.endYear}" data-holding-years="${cell.holdingYears}" data-cagr="${tooltipCagr}">${cell.value.toFixed(1)}</span></td>`;
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
// 面板5：成分股散点图
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
        name: '市值（十亿美元）',
        nameLocation: 'center',
        nameGap: 30,
        nameTextStyle: { fontSize: 12, color: grayColor, fontFamily: CHART_FONT },
        axisLabel: {
          fontSize: 11,
          color: grayColor,
          fontFamily: CHART_FONT,
          formatter: value => value >= 10000 ? `${(value / 10000).toFixed(0)}万` : value.toFixed(0),
        },
        splitLine: { lineStyle: { color: gridColor } },
      },
      yAxis: {
        type: 'value',
        name: '近一年收益率',
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
          return `<b>${stock.ticker}</b> ${stock.name}<br/>市值: ${formatNumber(stock.value[0], 0)}十亿美元<br/>收益率: <b style="color:${color}">${formatPercent(stock.value[1], 1)}</b>`;
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
      ? `找到 ${filtered.length} 条`
      : `共 ${enrichedStocks.length} 只成分股`;

    if (toggleBtn) {
      if (normalized) {
        toggleBtn.style.display = 'none';
      } else {
        toggleBtn.style.display = '';
        toggleBtn.textContent = expanded ? '收起' : `展开全部 ${enrichedStocks.length} 只`;
      }
    }

    tbody.innerHTML = rows.map(stock => `
      <tr>
        <td>${escapeHtml(stock.name || stock.nameEn || stock.ticker)}</td>
        <td><span class="ticker-chip">${escapeHtml(stock.ticker)}</span></td>
        <td style="font-variant-numeric:tabular-nums">${stock.weight != null ? formatPercent(stock.weight, 2) : '--'}</td>
        <td style="font-variant-numeric:tabular-nums" title="${escapeHtml([stock.priceSource, stock.priceNote, stock.priceAsOf ? `口径日期 ${stock.priceAsOf}` : ''].filter(Boolean).join(' · '))}">${stock.price != null ? `${stock.priceSource ? '≈' : ''}$${formatNumber(stock.price, 2)}` : '--'}</td>
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
// 面板6：VIX vs 标普500
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
        capePeak ? `历史高点 ${formatNumber(capePeak.value, 2)}` : '',
        capeColor,
        'top',
      ),
      buildSingleMarkPoint(
        capeTrough?.date,
        capeTrough?.value,
        capeTrough ? `历史低点 ${formatNumber(capeTrough.value, 2)}` : '',
        '#0f766e',
        'bottom',
      ),
      buildSingleMarkPoint(
        latestCape?.date,
        latestCape?.value,
        latestCape ? `最新 ${formatNumber(latestCape.value, 2)}` : '',
        '#f97316',
        'right',
      ),
    ].filter(Boolean);

    return {
      animation: false,
      grid: { left: 60, right: 70, top: 20, bottom: 60 },
      legend: getLineLegendConfig({
        data: ['席勒 CAPE', '标普500'],
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
          name: '席勒 CAPE',
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
          name: '标普500',
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
    buildMetricCard('最新 CAPE', latestCape ? formatNumber(latestCape.value, 2) : '--', latestCape ? `更新时间 ${latestCape.date}` : '主数据源待补'),
    buildMetricCard('历史高点', capePeak ? formatNumber(capePeak.value, 2) : '--', capePeak ? capePeak.date : '全样本最高'),
    buildMetricCard('历史低点', capeTrough ? formatNumber(capeTrough.value, 2) : '--', capeTrough ? capeTrough.date : '全样本最低'),
    buildMetricCard('长期均值', capeAverage != null ? formatNumber(capeAverage, 2) : '--', '基于当前可用 CAPE 全样本计算'),
    buildMetricCard('编制方法', '10 年真实盈利均值', latestPrice ? `与标普500月度点位同屏；最新指数 ${formatNumber(latestPrice.value, 0)}` : '用经通胀调整后的 10 年平均盈利平滑短期周期。'),
  ]);
}

// ══════════════════════════════════════════════════════
// 面板8：EPS
// ══════════════════════════════════════════════════════

export function initPanelEps(data, sp500CenturyData) {
  const chart = registerChart(echarts.init(document.getElementById('chartEps')));
  // 对数 y 轴需要正值（EPS 历史上偶有零或负值，需过滤）
  const epsSeries = data.series.filter(item => item.value != null && item.value > 0);
  const epsStart = epsSeries.length ? epsSeries[0].date : null;
  // 标普500 月线对齐到 EPS 起点，用于副轴对照（对数视角）
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
      legend: getLineLegendConfig({ data: ['标普500 EPS (TTM)', '标普500 指数（对数）'] }),
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
          name: '标普500',
          position: 'right',
          nameTextStyle: { fontSize: 10, color: grayColor, fontFamily: CHART_FONT },
          axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: '标普500 EPS (TTM)',
          type: 'line',
          yAxisIndex: 0,
          showSymbol: false,
          data: epsSeries.map(item => [item.date, item.value]),
          color: epsColor,
          lineStyle: { width: 2, color: epsColor },
        },
        {
          name: '标普500 指数（对数）',
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
          const eps = params.find(p => p.seriesName.startsWith('标普500 EPS'));
          const sp = params.find(p => p.seriesName.startsWith('标普500 指数'));
          const lines = [date];
          if (eps && eps.value && eps.value[1] != null) {
            lines.push(`EPS: <b style="color:${epsColor}">${formatNumber(eps.value[1], 2)}</b>`);
          }
          if (sp && sp.value && sp.value[1] != null) {
            lines.push(`标普500: <b style="color:${spColor}">${formatNumber(sp.value[1], 0)}</b>`);
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
// 面板9：ROE
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

    return {
      animation: false,
      grid: { left: 55, right: 20, top: 20, bottom: 40 },
      xAxis: {
        type: 'category',
        data: series.map(item => item.date.slice(0, 4)),
        axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
        axisTick: { alignWithLabel: true },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          formatter: value => formatPercent(value, 0),
          fontSize: 11,
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
              formatter: `长期均值 ${formatPercent(average, 1)}`,
              fontSize: 11,
              color: '#faad14',
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
// 面板10：五年滚动收益率
// ══════════════════════════════════════════════════════

export function initPanelRolling(data, opts = {}) {
  const chartId = opts.chartId || 'chartRolling';
  const lineColor = opts.lineColor || cssVar('--sp500-line') || '#1a1a1a';
  const chart = registerChart(echarts.init(document.getElementById(chartId)));
  // precomputed=true 时直接使用 data.series（已是 rolling 序列），否则用 buildRollingAnnualizedSeries 从月线推导
  const series = opts.precomputed
    ? (data?.series || [])
    : buildRollingAnnualizedSeries(data?.series || [], 5).series;
  const latestRolling = series.at(-1) ?? null;

  function getOption() {
    const gridColor = cssVar('--chart-grid') || '#f0f0f0';
    const grayColor = cssVar('--gray') || '#999';

    return {
      animation: false,
      grid: { left: 65, right: 20, top: 20, bottom: 60 },
      xAxis: {
        type: 'time',
        max: AXIS_END_2028_TS,
        axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          formatter: value => formatPercent(value, 0),
          fontSize: 11,
          color: grayColor,
          fontFamily: CHART_FONT,
        },
        splitLine: { lineStyle: { color: gridColor } },
      },
      series: [
        {
          name: '正收益区间',
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
          name: '负收益区间',
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
          name: '五年年化收益率',
          type: 'line',
          clip: false,
          data: series.map(item => [item.date, item.value]),
          showSymbol: false,
          lineStyle: { width: 1.8, color: lineColor },
          markPoint: latestRolling ? {
            data: [
              buildSingleMarkPoint(
                latestRolling.date,
                latestRolling.value,
                `最新 ${formatPercent(latestRolling.value, 2)}`,
                lineColor,
                'right',
              ),
            ],
          } : undefined,
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: grayColor, type: 'dashed', width: 1 },
            data: [{ yAxis: 0, label: { formatter: '盈亏分界', fontSize: 11, color: grayColor } }],
          },
          z: 3,
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
          return `${params[0].axisValueLabel}<br/>年化收益率: <b>${formatPercent(point.value, 2)}</b><br/>持有区间: ${point.startDate} → ${point.date}`;
        },
      },
      dataZoom: getDataZoom(grayColor),
    };
  }

  chart.setOption(resolveMarkPointOverlaps(getOption()));
  chart._refreshTheme = () => chart.setOption(resolveMarkPointOverlaps(getOption()), true);
}

/**
 * 把月度价格序列转换为对数同比 ln(P_t) - ln(P_{t-12})。
 * 以 YYYY-MM 作为 key 查找 12 个月前的值，避免 index 漂移。
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
          formatter: value => Number(value) % 10 === 0 ? value : '',
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
        name: '年度回报',
        type: 'bar',
        data: series.map(item => ({
          value: item.value,
          itemStyle: { color: item.value >= 0 ? greenColor : redColor },
        })),
        barMaxWidth: 10,
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
        textStyle: {
          fontSize: 13,
          color: cssVar('--text') || '#1a1a1a',
          fontFamily: CHART_FONT,
        },
        formatter: params => {
          const point = series[params[0].dataIndex];
          return `${point.year}<br/>年度回报: <b>${formatPercent(point.value, 2)}</b>`;
        },
      },
    };
  }

  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  renderMetricStrip(summaryId, [
    buildMetricCard('正收益年份', `${data.positiveYears}/${series.length}`, '先看长期里赚钱年份占比，再看波动的肥尾。'),
    buildMetricCard('长期均值', formatPercent(data.average || 0, 2), '全样本年度回报均值。'),
    buildMetricCard('最好一年', data.best ? `${data.best.year} | ${formatPercent(data.best.value, 2)}` : '--', '历史最佳年度涨幅。'),
    buildMetricCard('最差一年', data.worst ? `${data.worst.year} | ${formatPercent(data.worst.value, 2)}` : '--', '历史最大年度回撤。'),
  ]);
}

export function initReturnDetailsPanel(data, opts = {}) {
  const chartId = opts.chartId || 'chartReturnDetails';
  const summaryId = opts.summaryId || 'returnDetailsSummary';
  const indexLabel = opts.indexLabel || '标普500';
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
          name: '价格回报',
          type: 'bar',
          stack: 'return',
          barMaxWidth: 12,
          itemStyle: { color: accentColor },
          data: series.map(item => item.priceReturn),
        },
        {
          name: '股息回报',
          type: 'bar',
          stack: 'return',
          barMaxWidth: 12,
          itemStyle: { color: greenColor },
          data: series.map(item => item.dividendReturn),
        },
        ...(hideBuyback ? [] : [{
          name: '净回购收益率',
          type: 'bar',
          stack: 'return',
          barMaxWidth: 12,
          itemStyle: { color: amberColor },
          data: series.map(item => item.buybackYield),
        }]),
        {
          name: '总回报',
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
            buildTooltipItem('价格回报', point.priceReturn, accentColor),
            buildTooltipItem('股息回报', point.dividendReturn, greenColor),
          ];
          if (!hideBuyback) rows.push(buildTooltipItem('净回购收益率', point.buybackYield, amberColor));
          rows.push(buildTooltipItem('总回报', point.totalReturn, totalColor, 'line'));
          return rows.join('<br/>');
        },
      },
    };
  }

  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  const metricCards = [
    buildMetricCard('样本区间', `${data.summary?.startYear || series[0].year}-${data.summary?.endYear || series.at(-1).year}`, data.note || '总回报口径包含价格、股息与净回购收益率。'),
    buildMetricCard('价格回报均值', data.summary?.avgPriceReturn != null ? formatPercent(data.summary.avgPriceReturn, 2) : '--', '看指数点位本身的年度涨跌。'),
    buildMetricCard('股息回报均值', data.summary?.avgDividendReturn != null ? formatPercent(data.summary.avgDividendReturn, 2) : '--', '现金分红贡献。'),
  ];
  if (!hideBuyback) metricCards.push(buildMetricCard('净回购均值', data.summary?.avgBuybackYield != null ? formatPercent(data.summary.avgBuybackYield, 2) : '--', '用净回购近似股本收缩贡献。'));
  metricCards.push(buildMetricCard('总回报均值', data.summary?.avgTotalReturn != null ? formatPercent(data.summary.avgTotalReturn, 2) : '--', `正收益 ${data.summary?.positiveTotalYears || 0}/${data.summary?.years || series.length} 年。`));
  metricCards.push(buildMetricCard('最佳 / 最差', `${data.summary?.bestYear?.year || '--'} / ${data.summary?.worstYear?.year || '--'}`, `${data.summary?.bestYear ? formatPercent(data.summary.bestYear.totalReturn, 2) : '--'} / ${data.summary?.worstYear ? formatPercent(data.summary.worstYear.totalReturn, 2) : '--'}`));
  renderMetricStrip(summaryId, metricCards);
}

// ══════════════════════════════════════════════════════
// 面板：年内最大回撤 vs 全年涨幅（Charlie Bilello 同款）
// 数据：sp500_intrayear_dd.json (1928-至今)
// ══════════════════════════════════════════════════════

export function initIntrayearDdPanel(data, opts = {}) {
  const gridId = opts.gridId || 'ddGrid';
  const grid = document.getElementById(gridId);
  if (!grid || !data?.annual?.length) return;

  const fmtPct = v => `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;

  // 首行 = 列标题
  const headerHtml = `<div class="dd-row dd-header">
    <span class="dd-year">年份</span>
    <span class="dd-dd">年内最大回撤</span>
    <span class="dd-tr">当年涨跌幅</span>
    <span class="dd-ath">新高</span>
  </div>`;

  // 数据行
  const rowsHtml = data.annual.map(item => {
    const trClass = item.tr >= 0 ? 'dd-pos' : 'dd-neg';
    const ongoingMark = item.ongoing ? '<span title="进行中">*</span>' : '';
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
// 面板：标普500年度回报分布（histogram，Charlie Bilello 同款）
// 数据：sp500_annual_tr.json · Damodaran 1928-1988 + yfinance ^SP500TR 1989+
// ══════════════════════════════════════════════════════

export function initSp500AnnualDistPanel(data, opts = {}) {
  const wrapId = opts.wrapId || 'trDistWrap';
  const summaryId = opts.summaryId || 'trDistSummary';
  const wrap = document.getElementById(wrapId);
  if (!wrap || !data?.buckets?.length) return;

  const latestYear = data.latestYear;
  const gridHtml = data.buckets.map(b => {
    const sign = b.min < 0 ? 'neg' : 'pos';
    // 年份升序：列内自底向上堆叠（column-reverse 让数组最后一个出现在顶部）
    const years = [...b.years].sort((a, c) => a - c);
    const cells = years.map(yr => {
      const isCurrent = yr === latestYear;
      return `<div class="tr-dist-cell tr-${sign}${isCurrent ? ' tr-current' : ''}" title="${yr}">${yr}</div>`;
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
  const ytdTag = data.latestIsYtd ? `（${latestYear} 为 YTD，截至 ${data.latestDate}）` : '';

  renderMetricStrip(summaryId, [
    buildMetricCard('长期总回报均值', formatPercent(data.average, 2), `${total} 年样本${ytdTag}，${opts.returnKind || '含股息再投资'}。`),
    buildMetricCard('正收益年份', `${data.positiveYears}/${total} · ${posPct}%`, '长期视角下正年占比。'),
    buildMetricCard('接近均值的年份', `${data.withinAvgPlusMinus2}/${total} · ${withinPct}%`, `落在均值 ±2pp 区间的年份极少——说明"平均年"几乎不存在。`),
    buildMetricCard('数据来源', opts.sourceLabel || 'Damodaran + ^SP500TR', opts.sourceDesc || '1928-1988 取自 Damodaran NYU Stern；1989+ 由 yfinance ^SP500TR 年末点位计算。'),
  ]);
}

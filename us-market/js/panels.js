// ══════════════════════════════════════════════════════
// panels.js · 所有面板 init 函数 + main() 入口
// 由 site/index.html 通过 <script type="module" src="js/panels.js"> 加载
// ══════════════════════════════════════════════════════

import {
  CHART_FONT,
  AXIS_END_2028_TS,
  fetchJSON,
  cssVar,
  formatNumber,
  formatPercent,
  formatCompactNumber,
  escapeHtml,
  buildRollingAnnualizedSeries,
  buildLogYoySeries,
} from './utils.js';

import {
  chartInstances,
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
} from './chart-helpers.js';

import { initTheme } from './theme.js';
import { initNav, initPanelSnapScroll } from './nav.js';
import { initExportButtons } from './export-png.js';

function initPanelPrice(data, recessionData, centuryData) {
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
      buildMetricCard('数据起点', `${centuryData.start?.date || '--'} · ${centuryData.start ? formatNumber(centuryData.start.value, 2) : '--'}`, '月度数据起点'),
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
function initPanelDrawdown(priceData, drawdownData) {
  const chart = registerChart(echarts.init(document.getElementById('chartDrawdown')));
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
          min: -60,
        },
        {
          type: 'value',
          position: 'right',
          axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
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

  const tbody = document.getElementById('drawdownTbody');
  tbody.innerHTML = '';

  drawdownData.drawdowns.forEach(item => {
    const absDecline = Math.abs(item.decline);
    const alpha = 0.18 + Math.min(absDecline / 0.6, 1) * 0.28;
    const tr = document.createElement('tr');
    if (item.active) {
      tr.classList.add('row-active');
    }

    tr.innerHTML = `
      <td style="white-space:nowrap">${item.period}</td>
      <td style="text-align:right">${item.days}</td>
      <td style="text-align:right">${item.high}</td>
      <td style="text-align:right">${item.low}</td>
      <td class="decline-cell" style="text-align:right;color:var(--red);background:rgba(207,19,34,${alpha.toFixed(2)})">${formatPercent(item.decline * 100, 1)}</td>
      <td><span class="cat-badge cat-${item.category}">${catNames[item.category] || item.category}</span></td>
      <td class="cause-cell">${item.cause}</td>
    `;
    tbody.appendChild(tr);
  });

  document.querySelectorAll('#drawdownTable th[data-sort]').forEach(th => {
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
function initPanelVolatility(data) {
  const chart = registerChart(echarts.init(document.getElementById('chartVolatility')));
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
            html += `<br/>标普500: <b>${formatNumber(point.close, 0)}</b>`;
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
function initPanelMonthly(data) {
  const container = document.getElementById('monthlyHeatmap');
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

function initPanelAnnualizedMatrix(centuryData) {
  const container = document.getElementById('sp500AnnualizedMatrix');
  const rangeNode = document.getElementById('sp500AnnualizedMatrixRange');
  if (!container) {
    return;
  }

  const matrix = buildAnnualizedHoldingMatrix(centuryData?.series, 1980);
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
function initPanelScatter(data) {
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
function initPanelVix(priceData, vixData, recessionData) {
  const chart = registerChart(echarts.init(document.getElementById('chartVix')));
  const vixMap = new Map(vixData.series.map(item => [item.date, item.value]));
  const series = priceData.series
    .map(item => ({ date: item.date, close: item.close, vix: vixMap.get(item.date) ?? null }))
    .filter(item => item.vix != null);
  const highVixAreas = buildThresholdAreas(series, 30, item => item.vix);

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
        data: ['标普500', 'VIX'],
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
          name: '标普500',
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
          name: 'VIX',
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
            lineStyle: { color: vixColor, type: 'dashed', width: 1 },
            data: [{ yAxis: 30, label: { formatter: 'VIX 30', fontSize: 11, color: vixColor } }],
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
          return `${params[0].axisValueLabel}<br/>标普500: <b>${formatNumber(point.close, 0)}</b><br/>VIX: <b>${formatNumber(point.vix, 2)}</b>`;
        },
      },
      dataZoom: getDataZoom(grayColor),
    };
  }

  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);
}

// ══════════════════════════════════════════════════════
// 面板7：PE
// ══════════════════════════════════════════════════════
function initPanelPe(data, centuryData) {
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
function initPanelEps(data) {
  const chart = registerChart(echarts.init(document.getElementById('chartEps')));
  const series = data.series.filter(item => item.value != null);

  function getOption() {
    const gridColor = cssVar('--chart-grid') || '#f0f0f0';
    const grayColor = cssVar('--gray') || '#999';
    const accentColor = cssVar('--accent') || '#4758e0';

    return {
      animation: false,
      grid: { left: 70, right: 20, top: 20, bottom: 60 },
      xAxis: {
        type: 'time',
        axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
        splitLine: { lineStyle: { color: gridColor } },
      },
      series: [{
        name: 'EPS',
        type: 'bar',
        data: series.map(item => ({
          value: [item.date, item.value],
          itemStyle: { color: item.value >= 0 ? accentColor : (cssVar('--red') || '#cf1322') },
        })),
        barMaxWidth: 20,
      }],
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
          const prev = params[0].dataIndex > 0 ? series[params[0].dataIndex - 1] : null;
          let html = `${params[0].axisValueLabel}<br/>EPS: <b>${formatNumber(point.value, 2)}</b>`;
          if (prev && prev.value) {
            html += `<br/>相邻周期变化: <b>${formatPercent((point.value / prev.value - 1) * 100, 1)}</b>`;
          }
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
// 面板9：ROE
// ══════════════════════════════════════════════════════
function initPanelRoe(data) {
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
function initPanelRolling(data) {
  const chart = registerChart(echarts.init(document.getElementById('chartRolling')));
  const rollingData = buildRollingAnnualizedSeries(data?.series || [], 5);
  const series = rollingData.series;
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
          lineStyle: { width: 1.8, color: cssVar('--sp500-line') || '#1a1a1a' },
          markPoint: latestRolling ? {
            data: [
              buildSingleMarkPoint(
                latestRolling.date,
                latestRolling.value,
                `最新 ${formatPercent(latestRolling.value, 2)}`,
                cssVar('--sp500-line') || '#1a1a1a',
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
function initLogYoyPanel(containerId, data, seriesName) {
  const dom = document.getElementById(containerId);
  if (!dom || !data?.series?.length) return;
  const chart = registerChart(echarts.init(dom));
  const series = buildLogYoySeries(data.series);
  if (!series.length) return;
  const latest = series.at(-1);
  const greenStroke = '#389e0d';
  const redStroke = '#cf1322';

  function getOption() {
    const gridColor = cssVar('--chart-grid') || '#f0f0f0';
    const grayColor = cssVar('--gray') || '#999';
    const textColor = cssVar('--text') || '#1a1a1a';

    return {
      animation: false,
      grid: { left: 65, right: 20, top: 24, bottom: 60 },
      xAxis: {
        type: 'time',
        axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          formatter: value => `${value.toFixed(0)}%`,
          fontSize: 11,
          color: grayColor,
          fontFamily: CHART_FONT,
        },
        splitLine: { lineStyle: { color: gridColor } },
      },
      series: [
        {
          name: '上涨周期',
          type: 'line',
          data: series.map(item => [item.date, item.value >= 0 ? item.value * 100 : null]),
          showSymbol: false,
          lineStyle: { width: 1.6, color: greenStroke },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(56,158,13,0.45)' },
              { offset: 1, color: 'rgba(56,158,13,0.08)' },
            ]),
          },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: grayColor, type: 'dashed', width: 1 },
            data: [{ yAxis: 0, label: { formatter: '周期分界', fontSize: 11, color: grayColor } }],
          },
          z: 3,
        },
        {
          name: '下跌周期',
          type: 'line',
          data: series.map(item => [item.date, item.value < 0 ? item.value * 100 : null]),
          showSymbol: false,
          lineStyle: { width: 1.6, color: redStroke },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(207,19,34,0.08)' },
              { offset: 1, color: 'rgba(207,19,34,0.45)' },
            ]),
          },
          z: 3,
        },
      ],
      tooltip: {
        trigger: 'axis',
        backgroundColor: cssVar('--card-bg') || '#fff',
        borderColor: cssVar('--border') || '#e8e8e8',
        textStyle: { fontSize: 13, color: textColor, fontFamily: CHART_FONT },
        formatter: params => {
          const axisLabel = params?.[0]?.axisValueLabel || '';
          // 两个 series 中总有一个是 null，另一个携带真实值
          const active = params.find(p => Array.isArray(p.value) && p.value[1] != null);
          const idx = active ? active.dataIndex : (params?.[0]?.dataIndex ?? -1);
          const point = series[idx];
          if (!point) return axisLabel;
          const tone = point.value >= 0 ? '上涨' : '下跌';
          return [
            axisLabel,
            `对数同比: <b style="color:${point.value >= 0 ? greenStroke : redStroke}">${(point.value * 100).toFixed(2)}%</b> (${tone})`,
            `当月收盘: ${formatNumber(point.now, 2)}`,
            `12个月前: ${formatNumber(point.prev, 2)}`,
          ].join('<br/>');
        },
      },
      dataZoom: getDataZoom(grayColor),
    };
  }

  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);
}

function initLongRunIndexPanel(containerId, summaryId, data, recessionData, seriesName, toggleId) {
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
    buildMetricCard('起点', `${data.start?.date || '--'} · ${data.start ? formatNumber(data.start.value, 2) : '--'}`, '用起始月度点位给长周期一个基准。'),
    buildMetricCard('最新', data.latest ? formatNumber(data.latest.value, 2) : '--', data.latest ? `更新时间 ${data.latest.date}` : '等待数据'),
    buildMetricCard('复合增速', data.cagr != null ? formatPercent(data.cagr, 2) : '--', '按起点到当前月度点位计算的长期 CAGR。'),
    buildMetricCard('视角切换', '价格 / 对数 / 百分比', '价格看绝对点位，对数看复利斜率，百分比看自起点累计涨幅。'),
    buildMetricCard('衰退阴影', '已启用', '淡灰色区间基于 NBER / FRED 的 US recession 指标。'),
  ]);
}

function initAnnualReturnsPanel(data) {
  const chart = registerChart(echarts.init(document.getElementById('chartAnnual')));
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

  renderMetricStrip('annualSummary', [
    buildMetricCard('正收益年份', `${data.positiveYears}/${series.length}`, '先看长期里赚钱年份占比，再看波动的肥尾。'),
    buildMetricCard('长期均值', formatPercent(data.average || 0, 2), '全样本年度回报均值。'),
    buildMetricCard('最好一年', data.best ? `${data.best.year} · ${formatPercent(data.best.value, 2)}` : '--', '历史最佳年度涨幅。'),
    buildMetricCard('最差一年', data.worst ? `${data.worst.year} · ${formatPercent(data.worst.value, 2)}` : '--', '历史最大年度回撤。'),
  ]);
}

function initReturnDetailsPanel(data) {
  const chart = registerChart(echarts.init(document.getElementById('chartReturnDetails')));
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
        {
          name: '净回购收益率',
          type: 'bar',
          stack: 'return',
          barMaxWidth: 12,
          itemStyle: { color: amberColor },
          data: series.map(item => item.buybackYield),
        },
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
          return [
            `<b>${point.year}</b>`,
            buildTooltipItem('价格回报', point.priceReturn, accentColor),
            buildTooltipItem('股息回报', point.dividendReturn, greenColor),
            buildTooltipItem('净回购收益率', point.buybackYield, amberColor),
            buildTooltipItem('总回报', point.totalReturn, totalColor, 'line'),
          ].join('<br/>');
        },
      },
    };
  }

  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  renderMetricStrip('returnDetailsSummary', [
    buildMetricCard('样本区间', `${data.summary?.startYear || series[0].year}-${data.summary?.endYear || series.at(-1).year}`, data.note || '总回报口径包含价格、股息与净回购收益率。'),
    buildMetricCard('价格回报均值', data.summary?.avgPriceReturn != null ? formatPercent(data.summary.avgPriceReturn, 2) : '--', '看指数点位本身的年度涨跌。'),
    buildMetricCard('股息回报均值', data.summary?.avgDividendReturn != null ? formatPercent(data.summary.avgDividendReturn, 2) : '--', '现金分红贡献。'),
    buildMetricCard('净回购均值', data.summary?.avgBuybackYield != null ? formatPercent(data.summary.avgBuybackYield, 2) : '--', '用净回购近似股本收缩贡献。'),
    buildMetricCard('总回报均值', data.summary?.avgTotalReturn != null ? formatPercent(data.summary.avgTotalReturn, 2) : '--', `正收益 ${data.summary?.positiveTotalYears || 0}/${data.summary?.years || series.length} 年。`),
    buildMetricCard('最佳 / 最差', `${data.summary?.bestYear?.year || '--'} / ${data.summary?.worstYear?.year || '--'}`, `${data.summary?.bestYear ? formatPercent(data.summary.bestYear.totalReturn, 2) : '--'} / ${data.summary?.worstYear ? formatPercent(data.summary.worstYear.totalReturn, 2) : '--'}`),
  ]);
}

function initPanelM7(data) {
  const chart = registerChart(echarts.init(document.getElementById('chartM7')));
  const memberColors = {
    AAPL: '#2563eb',
    MSFT: '#0f766e',
    NVDA: '#dc2626',
    AMZN: '#f97316',
    GOOGL: '#7c3aed',
    META: '#0891b2',
    TSLA: '#b45309',
  };
  const indexColor = cssVar('--sp500-line') || '#1a1a1a';

  function getOption() {
    const grayColor = cssVar('--gray') || '#999';
    const gridColor = cssVar('--chart-grid') || '#f0f0f0';
    const memberSeries = data.members.map((member, index) => {
      const color = memberColors[member.ticker] || ['#2563eb', '#0f766e', '#dc2626', '#f97316', '#7c3aed', '#0891b2', '#b45309'][index % 7];
      const normalizedSeries = member.series.map(item => [item.date, (item.value / member.basePrice) * 100]);
      const latestPoint = normalizedSeries[normalizedSeries.length - 1];
      const labelName = member.name || member.ticker;

      return {
        name: member.ticker,
        type: 'line',
        showSymbol: false,
        clip: false,
        data: normalizedSeries,
        color,
        itemStyle: { color },
        lineStyle: {
          width: 1.5,
          color,
          type: 'solid',
        },
        markPoint: latestPoint ? {
          data: [(() => {
            const mp = buildSingleMarkPoint(
              latestPoint[0],
              latestPoint[1],
              `${labelName} ${formatPercent(latestPoint[1] - 100, 1)}`,
              color,
              'right',
            );
            // META 值长期贴近 GOOGL，通用防重叠算法不够用，预先把 META 标签下推
            if (mp && member.ticker === 'META') {
              mp.label = mp.label || {};
              mp.label.offset = [0, 20];
            }
            return mp;
          })()],
        } : undefined,
        z: 2,
      };
    });
    const latestIndexPoint = data.indexSeries[data.indexSeries.length - 1];

    return {
      animation: false,
      grid: { left: 60, right: 20, top: 30, bottom: 60 },
      legend: getLineLegendConfig({
        type: 'scroll',
      }),
      xAxis: {
        type: 'time',
        max: AXIS_END_2028_TS,
        axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'log',
        axisLine: {
          show: true,
          lineStyle: {
            color: cssVar('--border') || '#d9d9d9',
            width: 1,
          },
        },
        axisLabel: {
          formatter: value => formatCompactNumber(value),
          fontSize: 11,
          color: grayColor,
          fontFamily: CHART_FONT,
        },
        splitLine: { lineStyle: { color: gridColor } },
      },
      series: [
        {
          name: 'M7 指数',
          type: 'line',
          showSymbol: false,
          clip: false,
          data: data.indexSeries.map(item => [item.date, item.value]),
          color: indexColor,
          itemStyle: { color: indexColor },
          lineStyle: { width: 3, color: indexColor },
          markPoint: latestIndexPoint ? {
            data: [
              buildSingleMarkPoint(
                latestIndexPoint.date,
                latestIndexPoint.value,
                `M7 指数 ${formatPercent(latestIndexPoint.value - 100, 1)}`,
                indexColor,
                'right',
              ),
            ],
          } : undefined,
          z: 5,
        },
        ...memberSeries,
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
          params.slice(0, 8).forEach(item => {
            html += `<br/>${item.seriesName}: <b>${formatPercent(item.value[1] - 100, 2)}</b>`;
          });
          return html;
        },
      },
      dataZoom: getDataZoom(grayColor),
    };
  }

  const m7OverlapOpts = { yAxis: 'log', chartHeight: 420, minGapPx: 18 };
  chart.setOption(resolveMarkPointOverlaps(getOption(), m7OverlapOpts));
  chart._refreshTheme = () => chart.setOption(resolveMarkPointOverlaps(getOption(), m7OverlapOpts), true);

  const strongest = data.members.slice().sort((a, b) => b.returnPct - a.returnPct)[0];
  const weakest = data.members.slice().sort((a, b) => a.returnPct - b.returnPct)[0];
  document.getElementById('m7Method').innerHTML = `
    <div class="mini-kicker">编制方法</div>
    <div class="method-title">M7 等权指数</div>
    <div class="method-body">${escapeHtml(data.methodology.description)}</div>
    <ul class="method-list">
      <li>基准日：${escapeHtml(data.baseDate)} 记作 100。</li>
      <li>成分股：${escapeHtml(data.methodology.members.join(' / '))}。</li>
      <li>编制方式：按复权收盘价先各自归一化，再做等权平均，不引入额外主观权重。</li>
      <li>区间表现最强：${escapeHtml(strongest.ticker)} ${formatPercent(strongest.returnPct, 2)}；最弱：${escapeHtml(weakest.ticker)} ${formatPercent(weakest.returnPct, 2)}。</li>
    </ul>
  `;
}

// ══════════════════════════════════════════════════════
// 面板11：行业暴露
// ══════════════════════════════════════════════════════
function initPanelSectors(data) {
  const chart = registerChart(echarts.init(document.getElementById('chartSectors')));
  const sectors = data.sectors.slice().sort((a, b) => b.weight - a.weight);
  const topThree = sectors.slice(0, 3);

  function getOption() {
    const grayColor = cssVar('--gray') || '#999';

    return {
      animation: false,
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
          const sector = params.data.meta;
          return [
            `<b>${sector.name}</b> ${sector.english}`,
            `权重: <b>${formatPercent(sector.weight, 2)}</b>`,
            `代表公司: ${sector.examples.join(' / ')}`,
            sector.note,
          ].join('<br/>');
        },
      },
      legend: {
        orient: 'vertical',
        right: 10,
        top: 'center',
        textStyle: {
          fontSize: 12,
          color: cssVar('--text-secondary') || '#666',
          fontFamily: CHART_FONT,
        },
      },
      series: [{
        name: '行业权重',
        type: 'pie',
        radius: ['44%', '74%'],
        center: ['38%', '50%'],
        minAngle: 2,
        itemStyle: { borderColor: cssVar('--bg') || '#fff', borderWidth: 2 },
        label: {
          color: grayColor,
          fontSize: 12,
          formatter: params => `${params.name}\n${formatPercent(params.value, 1)}`,
        },
        labelLine: { length: 12, length2: 10 },
        data: sectors.map(sector => ({
          value: sector.weight,
          name: sector.name,
          itemStyle: { color: sector.color },
          meta: sector,
        })),
      }],
      graphic: [
        {
          type: 'text',
          left: '30%',
          top: '44%',
          style: {
            text: '标普500\n行业暴露',
            textAlign: 'center',
            fill: cssVar('--text') || '#1a1a1a',
            font: '700 20px Inter',
          },
        },
      ],
    };
  }

  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  document.getElementById('sectorSide').innerHTML = `
    <div class="mini-kicker">结构观察</div>
    <div class="mini-title">当前结构最集中的三大行业</div>
    <div class="mini-desc">数据基于官方指数 sector breakdown，更新时间 ${escapeHtml(data.updated)}。</div>
    <div class="sector-rank">
      ${topThree.map(sector => `
        <div class="sector-rank-item">
          <span class="sector-rank-color" style="background:${sector.color}"></span>
          <div class="sector-rank-name">${escapeHtml(sector.name)}</div>
          <div class="sector-rank-weight">${formatPercent(sector.weight, 2)}</div>
          <div class="sector-rank-note">${escapeHtml(sector.examples.join(' / '))} · ${escapeHtml(sector.note)}</div>
        </div>
      `).join('')}
    </div>
    <div class="mini-desc" style="margin-top:16px">
      来源：
      <a class="source-link" href="${escapeHtml(data.source.url)}" target="_blank" rel="noreferrer">${escapeHtml(data.source.name)}</a>
    </div>
  `;
}

// ══════════════════════════════════════════════════════
// 面板12：成分股变动
// ══════════════════════════════════════════════════════
function initPanelChanges(data) {
  const tbody = document.getElementById('changesTbody');
  const searchInput = document.getElementById('changesSearch');
  const sortRoot = document.getElementById('changesSort');
  const state = {
    query: '',
    order: 'desc',
  };

  function renderRows() {
    const normalizedQuery = state.query.trim().toLowerCase();
    const rows = data.changes
      .filter(change => {
        if (!normalizedQuery) {
          return true;
        }
        const haystack = [
          change.effectiveDate,
          change.type,
          change.reason,
          change.addition.ticker,
          change.addition.name,
          change.removal.ticker,
          change.removal.name,
        ].join(' ').toLowerCase();
        return haystack.includes(normalizedQuery);
      })
      .sort((a, b) => {
        return state.order === 'desc'
          ? b.effectiveDate.localeCompare(a.effectiveDate)
          : a.effectiveDate.localeCompare(b.effectiveDate);
      });

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state">没有匹配的样本变动记录。</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(change => `
      <tr>
        <td style="white-space:nowrap">${escapeHtml(change.effectiveDate)}</td>
        <td class="company-cell">
          <strong><span class="ticker-chip">${escapeHtml(change.addition.ticker)}</span>${escapeHtml(change.addition.name)}</strong><br/>
          <small>${escapeHtml(change.addition.sector)}</small>
        </td>
        <td class="company-cell">
          <strong><span class="ticker-chip">${escapeHtml(change.removal.ticker)}</span>${escapeHtml(change.removal.name)}</strong><br/>
          <small>${escapeHtml(change.removal.sector)}</small>
        </td>
        <td class="cause-cell">
          ${escapeHtml(change.reason)}<br/>
          <a class="source-link" href="${escapeHtml(change.sourceUrl)}" target="_blank" rel="noreferrer">原始公告</a>
        </td>
        <td><span class="type-badge ${change.type === '并购触发' ? 'type-merger' : 'type-rebalance'}">${escapeHtml(change.type)}</span></td>
      </tr>
    `).join('');
  }

  searchInput.addEventListener('input', event => {
    state.query = event.target.value;
    renderRows();
  });

  sortRoot.addEventListener('click', event => {
    const btn = event.target.closest('.btn');
    if (!btn || !btn.dataset.order) {
      return;
    }

    state.order = btn.dataset.order;
    sortRoot.querySelectorAll('.btn').forEach(item => item.classList.remove('active'));
    btn.classList.add('active');
    renderRows();
  });

  renderRows();
}

// ══════════════════════════════════════════════════════
// 面板13：编制规则
// ══════════════════════════════════════════════════════
function initPanelRules(data) {
  document.getElementById('rulesHighlights').innerHTML = data.highlights.map(item => `
    <div class="highlight-card">
      <div class="highlight-label">${escapeHtml(item.label)}</div>
      <div class="highlight-value">${escapeHtml(item.value)}</div>
      <div class="highlight-detail">${escapeHtml(item.detail)}</div>
    </div>
  `).join('');

  const sectionsHtml = data.sections.map(section => `
    <article class="rule-card">
      <div class="mini-kicker">规则说明</div>
      <h3 class="rule-title">${escapeHtml(section.title)}</h3>
      <p class="rule-intro">${escapeHtml(section.intro)}</p>
      <ul class="rule-list">
        ${section.bullets.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
      </ul>
    </article>
  `).join('');

  const compareHtml = `
    <article class="rule-card">
      <div class="mini-kicker">指数对比</div>
      <h3 class="rule-title">和其他核心指数的差别</h3>
      <p class="rule-intro">把标普500放在常见美股指数里看，更容易理解它为什么适合做“总盘面”的长期基准。</p>
      <div class="compare-grid">
        ${data.comparison.map(item => `
          <div class="compare-card">
            <div class="compare-name">${escapeHtml(item.name)}</div>
            <div class="compare-meta">覆盖：${escapeHtml(item.focus)}</div>
            <div class="compare-meta">权重：${escapeHtml(item.weighting)}</div>
            <div class="compare-meta">样本：${escapeHtml(item.count)}</div>
            <div class="compare-meta">${escapeHtml(item.note)}</div>
          </div>
        `).join('')}
      </div>
      <p class="mini-desc" style="margin-top:16px">
        来源：
        <a class="source-link" href="${escapeHtml(data.source.url)}" target="_blank" rel="noreferrer">${escapeHtml(data.source.name)} ${escapeHtml(data.source.version)}</a>
      </p>
    </article>
  `;

  document.getElementById('rulesSections').innerHTML = sectionsHtml + compareHtml;
}

// ══════════════════════════════════════════════════════
// Cross Panels：Nasdaq 100
// ══════════════════════════════════════════════════════
function initNasdaq100CompaniesPanel(data) {
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
        name: `其余 ${remainderCount} 只`,
        meta: {
          name: '其余成分',
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
        name: 'QQQ 权重',
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
            `代码: ${escapeHtml(point.ticker)}`,
            `QQQ 权重: <b>${formatPercent(point.qqqWeight || params.value, 2)}</b>`,
            point.shares ? `持股数: ${formatNumber(point.shares, 0)}` : '',
          ].filter(Boolean).join('<br/>');
        },
      },
      graphic: [{
        type: 'text',
        left: '28%',
        top: '44%',
        style: {
          text: '纳斯达克100\n权重分布',
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
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">没有匹配的 Nasdaq 100 成分股。</td></tr>';
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
      ? `展示 ${rows.length} / ${data.companies.length} 只成分股`
      : `展示前 ${rows.length} 只已知实际权重持仓`;
    toggle.textContent = state.expanded ? '仅看前25大权重' : `展开全部 ${data.companies.length} 只`;
  }

  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  renderMetricStrip('nasdaq100CompanySummary', [
    buildMetricCard('成分股数量', `${data.overview.count}`, 'Wikipedia 当前成分表 + QQQ 持仓信息交叉整理。'),
    buildMetricCard('前十大权重', data.overview.top10Weight != null ? formatPercent(data.overview.top10Weight, 2) : '--', '来自 StockAnalysis 的 QQQ 当前披露持仓。'),
    buildMetricCard('ETF规模', data.overview.aum != null ? formatCompactNumber(data.overview.aum) : '--', data.overview.holdingsDate ? `持仓日期 ${data.overview.holdingsDate}` : 'ETF 资产规模'),
    buildMetricCard('最新价格', data.overview.quote?.price != null ? formatNumber(data.overview.quote.price, 2) : '--', data.overview.quote?.date || ''),
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

function initNasdaq100AnnualPanel(data) {
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
        name: '年度回报',
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
        formatter: params => `${series[params[0].dataIndex].year}<br/>年度回报: <b>${formatPercent(series[params[0].dataIndex].value, 2)}</b>`,
      },
    };
  }

  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  renderMetricStrip('nasdaq100AnnualSummary', [
    buildMetricCard('正收益年份', `${data.annualReturns.positiveYears}/${series.length}`, '先看历年盈利胜率，再看波动分布。'),
    buildMetricCard('长期均值', data.annualReturns.average != null ? formatPercent(data.annualReturns.average, 2) : '--', '基于 QQQ 代理序列计算。'),
    buildMetricCard('最好一年', data.annualReturns.best ? `${data.annualReturns.best.year} · ${formatPercent(data.annualReturns.best.value, 2)}` : '--', '历史最佳年度表现。'),
    buildMetricCard('最差一年', data.annualReturns.worst ? `${data.annualReturns.worst.year} · ${formatPercent(data.annualReturns.worst.value, 2)}` : '--', '历史最差年度表现。'),
  ]);
}

function initNasdaqRankingPanel(domId, summaryId, companies, metricConfig) {
  const container = document.getElementById(domId);
  if (!container) return;
  const rows = companies
    .filter(item => item[metricConfig.key] != null)
    .slice()
    .sort((a, b) => (b[metricConfig.key] || 0) - (a[metricConfig.key] || 0));
  // 动态撑高图表容器，完整展示所有行（无 dataZoom 滑动）
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
            `代码: ${escapeHtml(point.ticker)}`,
            `${metricConfig.label}: <b>${formatPercent(point[metricConfig.key], 2)}</b>`,
            point.qqqWeight != null ? `QQQ权重: ${formatPercent(point.qqqWeight, 2)}` : '',
            point.industry ? `行业: ${escapeHtml(point.industry)}` : '',
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
    buildMetricCard('样本数量', `${rows.length}`, '当前可计算的有效成员样本数。'),
    buildMetricCard('最强', best ? `${best.ticker} · ${formatPercent(best[metricConfig.key], 2)}` : '--', best?.name || ''),
    buildMetricCard('最弱', worst ? `${worst.ticker} · ${formatPercent(worst[metricConfig.key], 2)}` : '--', worst?.name || ''),
    buildMetricCard(metricConfig.summaryLabel, formatPercent(average, 2), `正收益 ${positiveCount} / ${rows.length}`),
  ]);
}

function initNasdaq100WeightsPanel(data) {
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
        data: ['单只权重', '累计权重'],
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
          name: '单只权重',
          type: 'bar',
          barMaxWidth: 18,
          data: rows.map(item => ({
            value: item.weight,
            itemStyle: { color: 'rgba(26,26,26,0.22)' },
          })),
        },
        {
          name: '累计权重',
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
            `单只权重: <b>${formatPercent(point.weight, 2)}</b>`,
            `累计权重: <b>${formatPercent(point.cumulativeWeight, 2)}</b>`,
          ].join('<br/>');
        },
      },
    };
  }

  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  renderMetricStrip('nasdaq100WeightSummary', [
    buildMetricCard('前十大权重', data.overview.top10Weight != null ? formatPercent(data.overview.top10Weight, 2) : '--', '指数权重高度集中在头部科技龙头。'),
    buildMetricCard('前25大覆盖', data.overview.top25Weight != null ? formatPercent(data.overview.top25Weight, 2) : '--', '当前免费源能拿到的实际披露权重覆盖。'),
    buildMetricCard('其余成分', data.overview.otherWeight != null ? formatPercent(data.overview.otherWeight, 2) : '--', '剩余成分被聚合为一个尾部桶。'),
    buildMetricCard('最大持仓', data.topHoldings?.[0] ? `${data.topHoldings[0].ticker} · ${formatPercent(data.topHoldings[0].weight, 2)}` : '--', data.topHoldings?.[0]?.name || ''),
  ]);
}

// ══════════════════════════════════════════════════════
// 启动
// ══════════════════════════════════════════════════════
async function main() {
  initTheme();
  initNav();

  try {
    const [
      priceData,
      volatilityData,
      monthlyData,
      constituentsData,
      drawdownData,
      vixData,
      peData,
      epsData,
      roeData,
      recessionData,
      sp500CenturyData,
      nasdaqCompositeData,
      annualReturnsData,
      returnDetailsData,
      nasdaq100Data,
      dowCenturyData,
      m7Data,
      sectorsData,
      changesData,
      rulesData,
    ] = await Promise.all([
      fetchJSON('data/sp500_price.json'),
      fetchJSON('data/sp500_volatility.json'),
      fetchJSON('data/sp500_monthly.json'),
      fetchJSON('data/sp500_constituents.json'),
      fetchJSON('data/sp500_drawdowns.json'),
      fetchJSON('data/sp500_vix.json'),
      fetchJSON('data/sp500_pe.json'),
      fetchJSON('data/sp500_eps.json'),
      fetchJSON('data/sp500_roe.json'),
      fetchJSON('data/us_recessions.json'),
      fetchJSON('data/sp500_century.json'),
      fetchJSON('data/nasdaq_composite.json'),
      fetchJSON('data/sp500_annual_returns_long.json'),
      fetchJSON('data/sp500_return_details.json'),
      fetchJSON('data/nasdaq100_panels.json'),
      fetchJSON('data/dow_jones_century.json'),
      fetchJSON('data/m7_index.json'),
      fetchJSON('data/sp500_sectors.json'),
      fetchJSON('data/sp500_changes.json'),
      fetchJSON('data/sp500_rules.json'),
    ]);

    initPanelPrice(priceData, recessionData, sp500CenturyData);
    initLongRunIndexPanel('chartNasdaqComposite', 'nasdaqCompositeSummary', nasdaqCompositeData, recessionData, '纳斯达克综指', 'nasdaqCompositeScaleToggle');
    initLogYoyPanel('chartSp500LogYoy', sp500CenturyData, '标普500 对数同比');
    initLogYoyPanel('chartNasdaqLogYoy', nasdaqCompositeData, '纳斯达克综指 对数同比');
    initAnnualReturnsPanel(annualReturnsData);
    initPanelAnnualizedMatrix(sp500CenturyData);
    initReturnDetailsPanel(returnDetailsData);
    initPanelDrawdown(priceData, drawdownData);
    initPanelVolatility(volatilityData);
    initPanelMonthly(monthlyData);
    initPanelVix(priceData, vixData, recessionData);
    initPanelPe(peData, sp500CenturyData);
    initPanelEps(epsData);
    initPanelRoe(roeData);
    initPanelRolling(sp500CenturyData);
    initPanelM7(m7Data);
    initPanelSectors(sectorsData);
    initPanelChanges(changesData);
    initPanelRules(rulesData);
    initPanelScatter(constituentsData);
    initNasdaq100CompaniesPanel(nasdaq100Data);
    initNasdaq100AnnualPanel(nasdaq100Data);
    initNasdaqRankingPanel('chartNasdaq100MemberReturns', 'nasdaq100MemberReturnSummary', nasdaq100Data.companies, {
      key: 'return1y',
      label: '近1年收益',
      summaryLabel: '全样本均值',
      showAllByDefault: true,
      gridLeft: 132,
      gridRight: 72,
      barMaxWidth: 8,
      xAxisSplitNumber: 6,
      xAxisMin: minValue => Math.min(-200, Math.floor(minValue / 100) * 100),
      xAxisMax: (_minValue, maxValue) => Math.max(1000, Math.ceil(maxValue / 100) * 100),
      color: value => (value >= 0 ? (cssVar('--green') || '#389e0d') : (cssVar('--red') || '#cf1322')),
    });
    initNasdaqRankingPanel('chartNasdaq100Ytd', 'nasdaq100YtdSummary', nasdaq100Data.companies, {
      key: 'ytdReturn',
      label: '年内收益',
      summaryLabel: '年初至今均值',
      showAllByDefault: true,
      gridLeft: 132,
      gridRight: 72,
      barMaxWidth: 8,
      xAxisSplitNumber: 5,
      xAxisMin: minValue => Math.min(-100, Math.floor(minValue / 10) * 10),
      xAxisMax: (_minValue, maxValue) => Math.max(100, Math.ceil(maxValue / 10) * 10),
      color: value => (value >= 0 ? (cssVar('--green') || '#389e0d') : (cssVar('--red') || '#cf1322')),
    });
    initNasdaq100WeightsPanel(nasdaq100Data);
    initLongRunIndexPanel('chartDowCentury', 'dowCenturySummary', dowCenturyData, recessionData, '道琼斯指数', 'dowCenturyScaleToggle');
    initExportButtons();
  } catch (err) {
    console.error('数据加载失败:', err);
    document.getElementById('main').innerHTML = `<div class="loading-msg">数据加载失败，请确保 data/ 目录中有 JSON 文件。<br><small>${err.message}</small></div>`;
  }
}

main();

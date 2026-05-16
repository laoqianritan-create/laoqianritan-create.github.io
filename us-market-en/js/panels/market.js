// panels/market.js · Market structure panels: M7 Magnificent Seven / sectors

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

export function initPanelM7(data) {
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
    // Mobile: 8 trailing ticker labels overflow at 375px width, so hide them entirely; users can refer to legend/tooltip
    const mobile = isMobile();
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
        markPoint: (!mobile && latestPoint) ? {
          data: [(() => {
            const mp = buildSingleMarkPoint(
              latestPoint[0],
              latestPoint[1],
              `${labelName} ${formatPercent(latestPoint[1] - 100, 1)}`,
              color,
              'right',
            );
            // META values hug GOOGL over the long run; the generic overlap-resolver is not enough, so nudge META down preemptively
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
      grid: mobile ? { left: 48, right: 12, top: 30, bottom: 60 } : { left: 60, right: 20, top: 30, bottom: 60 },
      legend: getLineLegendConfig({
        type: 'scroll',
      }),
      xAxis: {
        type: 'time',
        max: AXIS_END_2028_TS,
        axisLabel: { fontSize: mobile ? 10 : 11, color: grayColor, fontFamily: CHART_FONT, hideOverlap: true },
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
          name: 'Mag 7 Index',
          type: 'line',
          showSymbol: false,
          clip: false,
          data: data.indexSeries.map(item => [item.date, item.value]),
          color: indexColor,
          itemStyle: { color: indexColor },
          lineStyle: { width: 3, color: indexColor },
          markPoint: (!mobile && latestIndexPoint) ? {
            data: [
              buildSingleMarkPoint(
                latestIndexPoint.date,
                latestIndexPoint.value,
                `Mag 7 Index ${formatPercent(latestIndexPoint.value - 100, 1)}`,
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
    <div class="mini-kicker">Methodology</div>
    <div class="method-title">Mag 7 Equal-Weight Index</div>
    <div class="method-body">${escapeHtml(data.methodology.description)}</div>
    <ul class="method-list">
      <li>Base date: ${escapeHtml(data.baseDate)} indexed to 100.</li>
      <li>Constituents: ${escapeHtml(data.methodology.members.join(' / '))}.</li>
      <li>Construction: each member is normalized on its split-adjusted close, then equal-weighted with no subjective overlay.</li>
      <li>Strongest performer: ${escapeHtml(strongest.ticker)} ${formatPercent(strongest.returnPct, 2)}; weakest: ${escapeHtml(weakest.ticker)} ${formatPercent(weakest.returnPct, 2)}.</li>
    </ul>
  `;
}

// ══════════════════════════════════════════════════════
// Panel 11: Sector exposure
// ══════════════════════════════════════════════════════

export function initPanelSectors(data) {
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
            `Weight: <b>${formatPercent(sector.weight, 2)}</b>`,
            `Representative names: ${sector.examples.join(' / ')}`,
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
        name: 'Sector Weight',
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
            text: 'S&P 500\nSector Exposure',
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
    <div class="mini-kicker">Structural View</div>
    <div class="mini-title">Top three sectors by concentration</div>
    <div class="mini-desc">Based on the official index sector breakdown. Last updated ${escapeHtml(data.updated)}.</div>
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
      Source:
      <a class="source-link" href="${escapeHtml(data.source.url)}" target="_blank" rel="noreferrer">${escapeHtml(data.source.name)}</a>
    </div>
  `;
}

// ══════════════════════════════════════════════════════
// S&P 500 Market Breadth (share at 52-week highs)
// ══════════════════════════════════════════════════════

export function initPanelBreadth(data, opts = {}) {
  if (!data || !data.current || !data.history || !data.history.length) return;

  const pieId    = opts.pieId    || 'chartBreadthPie';
  const lineId   = opts.lineId   || 'chartBreadthLine';
  const stripId  = opts.stripId  || 'breadthSummary';

  // Site-wide palette: green = --green, blue = #2563eb (matches VIX / PE / Buffett panels)
  const greenColor = cssVar('--green') || '#389e0d';
  const blueColor  = '#2563eb';

  const { current, summary, history } = data;

  // ── Left: pie chart ─────────────────────────────────────
  const pieChart = registerChart(echarts.init(document.getElementById(pieId)));
  const notAtAth = current.total - current.atAth;

  function getPieOption() {
    const muted  = cssVar('--border') || '#e0e0e0';
    const mobile = isMobile();

    return {
      animation: false,
      tooltip: {
        trigger: 'item',
        backgroundColor: cssVar('--card-bg') || '#fff',
        borderColor: cssVar('--border') || '#e8e8e8',
        textStyle: { fontSize: 13, color: cssVar('--text') || '#1a1a1a', fontFamily: CHART_FONT },
        formatter: params => `${params.name}: <b>${params.value}</b> names (${formatPercent(params.percent, 1)})`,
      },
      series: [{
        name: 'Share at 52-Week High',
        type: 'pie',
        radius: ['50%', '78%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: cssVar('--bg') || '#fff', borderWidth: 2 },
        label: {
          fontSize: mobile ? 11 : 13,
          color: cssVar('--text-secondary') || '#666',
          fontFamily: CHART_FONT,
          formatter: '{b}\n{d}%',
        },
        labelLine: { length: 10, length2: 8 },
        data: [
          { value: current.atAth, name: 'At 52-Week High', itemStyle: { color: greenColor } },
          { value: notAtAth, name: 'Below 52-Week High', itemStyle: { color: muted } },
        ],
      }],
      graphic: [{
        type: 'text',
        left: 'center',
        top: '42%',
        style: {
          text: `${formatPercent(current.pct, 1)}`,
          textAlign: 'center',
          fill: cssVar('--text') || '#1a1a1a',
          font: `700 ${mobile ? 22 : 28}px Inter`,
        },
      }, {
        type: 'text',
        left: 'center',
        top: mobile ? '54%' : '55%',
        style: {
          text: `${current.atAth} / ${current.total}`,
          textAlign: 'center',
          fill: cssVar('--text-secondary') || '#666',
          font: `400 ${mobile ? 11 : 13}px Inter`,
        },
      }],
    };
  }

  pieChart.setOption(getPieOption());
  pieChart._refreshTheme = () => pieChart.setOption(getPieOption(), true);

  // ── Right: dual-line time series (1px line width) ──────────
  const lineChart = registerChart(echarts.init(document.getElementById(lineId)));

  function getLineOption() {
    const grayColor = cssVar('--gray') || '#999';
    const gridColor = cssVar('--chart-grid') || '#f0f0f0';
    const mobile = isMobile();
    const athLineData  = history.map(d => [d.date, d.pct]);
    const pct80LineData = history.map(d => [d.date, d.pct80 ?? null]);

    return {
      animation: false,
      grid: mobile
        ? { left: 40, right: 12, top: 40, bottom: 56 }
        : { left: 50, right: 20, top: 40, bottom: 56 },
      legend: {
        top: 4,
        textStyle: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
        itemWidth: 16, itemHeight: 2, itemGap: 16,
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: cssVar('--card-bg') || '#fff',
        borderColor: cssVar('--border') || '#e8e8e8',
        textStyle: { fontSize: 13, color: cssVar('--text') || '#1a1a1a', fontFamily: CHART_FONT },
        formatter: params => {
          if (!params.length) return '';
          const dateStr = params[0].axisValueLabel;
          const item = history.find(h => h.date === params[0].value[0]);
          let s = dateStr;
          if (item) {
            s += `<br/>Share at 52-week high: <b>${formatPercent(item.pct, 1)}</b> (${item.count}/${item.total})`;
            if (item.pct80 != null) {
              s += `<br/>Share within 80th percentile: <b>${formatPercent(item.pct80, 1)}</b> (${item.count80}/${item.total})`;
            }
          }
          return s;
        },
      },
      xAxis: {
        type: 'time',
        axisLabel: { fontSize: mobile ? 10 : 11, color: grayColor, fontFamily: CHART_FONT, hideOverlap: true },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        name: '%',
        nameTextStyle: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
        min: 0,
        axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT, formatter: v => `${v}%` },
        splitLine: { lineStyle: { color: gridColor } },
      },
      series: [
        {
          name: 'Share at 52-Week High',
          type: 'line',
          showSymbol: false,
          data: athLineData,
          lineStyle: { width: 1, color: greenColor },
          itemStyle: { color: greenColor },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: greenColor + '40' },
              { offset: 1, color: greenColor + '05' },
            ]),
          },
        },
        {
          name: 'Share within 80th Percentile',
          type: 'line',
          showSymbol: false,
          data: pct80LineData,
          lineStyle: { width: 1, color: blueColor },
          itemStyle: { color: blueColor },
        },
      ],
      dataZoom: getDataZoom(grayColor),
    };
  }

  lineChart.setOption(getLineOption());
  lineChart._refreshTheme = () => lineChart.setOption(getLineOption(), true);

  // ── metric-strip ──────────────────────────────────────
  if (summary) {
    renderMetricStrip(stripId, [
      buildMetricCard('Current Share', formatPercent(current.pct, 1), `${current.date} · ${current.atAth} names at 52-week highs`),
      buildMetricCard('Historical Average', formatPercent(summary.avgPct, 1), 'Mean over the charted window'),
      buildMetricCard('Peak', formatPercent(summary.maxPct, 1), summary.maxDate),
      buildMetricCard('Trough', formatPercent(summary.minPct, 1), summary.minDate),
    ]);
  }
}

// ══════════════════════════════════════════════════════
// Panel 12: Constituent changes
// ══════════════════════════════════════════════════════

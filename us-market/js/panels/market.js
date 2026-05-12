// panels/market.js · 市场结构面板：M7 七巨头 / 板块

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
    // Mobile：8 条尾部 ticker 标签在 375px 宽度下全部溢出，整体隐藏，用户通过 legend/tooltip 查看
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
          name: 'M7 指数',
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
// 标普500牛市宽度（创新高占比）
// ══════════════════════════════════════════════════════

export function initPanelBreadth(data, opts = {}) {
  if (!data || !data.current || !data.history || !data.history.length) return;

  const pieId    = opts.pieId    || 'chartBreadthPie';
  const lineId   = opts.lineId   || 'chartBreadthLine';
  const stripId  = opts.stripId  || 'breadthSummary';

  // 项目统一配色：绿 = --green，蓝 = #2563eb（与 VIX/PE/巴菲特等面板一致）
  const greenColor = cssVar('--green') || '#389e0d';
  const blueColor  = '#2563eb';

  const { current, summary, history } = data;

  // ── 左侧：饼图 ─────────────────────────────────────
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
        formatter: params => `${params.name}: <b>${params.value}</b> 只 (${formatPercent(params.percent, 1)})`,
      },
      series: [{
        name: '创新高占比',
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
          { value: current.atAth, name: '创新高', itemStyle: { color: greenColor } },
          { value: notAtAth, name: '未创新高', itemStyle: { color: muted } },
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

  // ── 右侧：双线折线图（1px 线宽）──────────────────────
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
            s += `<br/>创新高占比: <b>${formatPercent(item.pct, 1)}</b> (${item.count}/${item.total})`;
            if (item.pct80 != null) {
              s += `<br/>80%百分位占比: <b>${formatPercent(item.pct80, 1)}</b> (${item.count80}/${item.total})`;
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
          name: '创新高占比',
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
          name: '80%百分位占比',
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
      buildMetricCard('当前占比', formatPercent(current.pct, 1), `${current.date} · ${current.atAth} 只创新高`),
      buildMetricCard('历史均值', formatPercent(summary.avgPct, 1), '出图窗口期均值'),
      buildMetricCard('峰值', formatPercent(summary.maxPct, 1), summary.maxDate),
      buildMetricCard('谷值', formatPercent(summary.minPct, 1), summary.minDate),
    ]);
  }
}

// ══════════════════════════════════════════════════════
// 面板12：成分股变动
// ══════════════════════════════════════════════════════

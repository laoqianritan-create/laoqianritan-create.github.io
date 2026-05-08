// panels/buffett.js · 巴菲特指标面板
//
// 巴菲特指标 (Modified Buffett Indicator, Gurufocus 改良版)
// 公式: 比率 = TMC / (GDP + 美联储总资产)
//   - 原版指标: TMC / GDP，巴菲特2001年提出，被誉为"评估市场估值的最佳单一指标"
//   - 改良版: 在分母加入美联储总资产，吸收 QE 时代的流动性扩张
//     原因: 美联储扩表会向市场注入流动性影响估值，原版会把"印钱推上去的市值"误判为"严重高估"
//
// 五档分档（针对改良版）:
//   ≤73%   严重低估
//   73-94% 低估
//   94-115% 合理
//   115-136% 高估
//   >136%  严重高估
//
// 数据源: TMC 来自 yfinance ^W5000 (1989+) + FRED NCBEILQ027S (1970-1988 校准拼接)
//        GDP 来自 FRED GDP 季度年化
//        美联储资产来自 FRED WALCL (2002.12+，更早段改良版退化为原版)
// 参考: https://www.gurufocus.cn/indicator/buffett-market-valuation

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

// 根据改良版比率定位档位标签
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

  // 把 SP500 价格按月末抽稀（与巴菲特序列做日期对齐时使用）
  const priceMap = new Map();
  if (priceData?.series?.length) {
    for (const it of priceData.series) {
      if (!it?.date) continue;
      // 月份键 → 该月最后出现的价格
      priceMap.set(it.date.slice(0, 7), it.close);
    }
  }

  // 构建 SP500 月度序列（与巴菲特日期同轴）
  const sp500Line = series
    .map(p => {
      const close = priceMap.get(p.date.slice(0, 7));
      return close != null ? [p.date, close] : null;
    })
    .filter(Boolean);

  function getOption() {
    const lineColor = '#2563eb';            // 改良版主线（蓝）
    const classicColor = '#999';            // 原版对照（保持灰虚线）
    const sp500Color = '#1a1a1a';            // 标普500 黑色
    const gridColor = cssVar('--chart-grid') || '#f0f0f0';
    const grayColor = cssVar('--gray') || '#999';
    const textColor = cssVar('--text') || '#1a1a1a';

    // markArea 五档背景（基于改良版阈值），覆盖整个时间轴
    const xMin = series[0].date;
    const xMax = series[series.length - 1].date;
    const markAreas = [];
    let prevMax = 0;
    for (const b of bandsModified) {
      const yMin = prevMax;
      const yMax = b.max != null ? b.max : 'max';
      // 用 alpha 16 透明度
      const colorWithAlpha = (b.color || '#cccccc') + '24';
      markAreas.push([
        { yAxis: yMin, xAxis: xMin, itemStyle: { color: colorWithAlpha } },
        { yAxis: yMax, xAxis: xMax },
      ]);
      if (b.max != null) prevMax = b.max;
    }

    const modLine = series.map(p => [p.date, p.ratio_modified]);
    const classicLine = series.map(p => [p.date, p.ratio_classic]);

    // markPoint：仅改良版历史峰谷，纯数字标签（不带「峰」「谷」字样，无当前值标签）
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
        data: ['标普500', '改良版 TMC/(GDP+TA)', '原版 TMC/GDP'],
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
          name: 'SP500',
          nameTextStyle: { fontSize: 10, color: grayColor, fontFamily: CHART_FONT },
          axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
          splitLine: { show: false },
        },
        {
          type: 'value',
          position: 'right',
          name: '估值比率 %',
          nameTextStyle: { fontSize: 10, color: grayColor, fontFamily: CHART_FONT },
          axisLabel: { formatter: v => `${v.toFixed(0)}%`, fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
          splitLine: { lineStyle: { color: gridColor } },
        },
      ],
      series: [
        {
          name: '标普500',
          type: 'line',
          yAxisIndex: 0,
          showSymbol: false,
          data: sp500Line,
          color: sp500Color,
          lineStyle: { width: 1, color: sp500Color },
          z: 1,
        },
        {
          name: '原版 TMC/GDP',
          type: 'line',
          yAxisIndex: 1,
          showSymbol: false,
          data: classicLine,
          color: classicColor,
          lineStyle: { width: 1.2, color: classicColor, type: 'dashed' },
          z: 2,
        },
        {
          name: '改良版 TMC/(GDP+TA)',
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
          if (sp != null) lines.push(`标普500: <b>${formatNumber(sp, 0)}</b>`);
          if (point.tmc != null) lines.push(`TMC: <b>$${(point.tmc / 1000).toFixed(2)}T</b>`);
          if (point.gdp != null) lines.push(`GDP: <b>$${(point.gdp / 1000).toFixed(2)}T</b>`);
          if (point.fed_ta != null) lines.push(`Fed 资产: <b>$${(point.fed_ta / 1000).toFixed(2)}T</b>`);
          if (point.ratio_classic != null) {
            lines.push(`原版: <b style="color:${classicColor}">${point.ratio_classic.toFixed(1)}%</b>`);
          }
          if (point.ratio_modified != null) {
            const band = bandLabelFor(point.ratio_modified, bandsModified);
            const bandTxt = band ? `<span style="color:${band.color}"> · ${band.label}</span>` : '';
            lines.push(`改良版: <b>${point.ratio_modified.toFixed(1)}%</b>${bandTxt}`);
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
      '改良版巴菲特指标',
      fmtPct(cur.ratio_modified),
      modBand
        ? `<span style="color:${modBand.color};font-weight:600">${modBand.label}</span> · 阈值 73/94/115/136`
        : '阈值 73/94/115/136',
    ),
    buildMetricCard(
      '原版巴菲特指标',
      fmtPct(cur.ratio_classic),
      classicBand
        ? `<span style="color:${classicBand.color};font-weight:600">${classicBand.label}</span> · 阈值 90/115/141/167`
        : '阈值 90/115/141/167',
    ),
    buildMetricCard(
      'TMC 总市值',
      fmtT(cur.tmc),
      `截至 ${buffettData.as_of || '--'} · Wilshire 5000 拼接`,
    ),
    buildMetricCard(
      '美联储总资产',
      fmtT(cur.fed_ta),
      'FRED WALCL · QE 时代的"流动性塞料"',
    ),
  ]);
}

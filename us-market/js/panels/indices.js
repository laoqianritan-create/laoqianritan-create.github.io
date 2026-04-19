// panels/indices.js · 多指数宏观面板：VIX / 牛熊周期 / 长周期走势

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

export function initPanelVix(priceData, vixData, recessionData, opts = {}) {
  const chartId = opts.chartId || 'chartVix';
  const indexLabel = opts.indexLabel || '标普500';
  const volLabel = opts.volLabel || 'VIX';
  const volThreshold = opts.volThreshold ?? 30;
  const chart = registerChart(echarts.init(document.getElementById(chartId)));
  const vixMap = new Map(vixData.series.map(item => [item.date, item.value]));
  const series = priceData.series
    .map(item => ({ date: item.date, close: item.close, vix: vixMap.get(item.date) ?? null }))
    .filter(item => item.vix != null);
  const highVixAreas = buildThresholdAreas(series, volThreshold, item => item.vix);

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
        data: [indexLabel, volLabel],
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
          name: indexLabel,
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
          name: volLabel,
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
            data: [{ yAxis: volThreshold, label: { formatter: `${volLabel} ${volThreshold}`, fontSize: 11, color: vixColor } }],
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
          return `${params[0].axisValueLabel}<br/>${indexLabel}: <b>${formatNumber(point.close, 0)}</b><br/>${volLabel}: <b>${formatNumber(point.vix, 2)}</b>`;
        },
      },
      dataZoom: getDataZoom(grayColor),
    };
  }

  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  // 可选 metric strip：最新 VXN + 样本统计
  if (opts.summaryId) {
    const node = document.getElementById(opts.summaryId);
    if (node) {
      const vals = vixData.series.map(s => s.value).filter(v => v != null);
      const latest = vixData.series[vixData.series.length - 1];
      const avg = vals.reduce((a, b) => a + b, 0) / Math.max(vals.length, 1);
      const median = [...vals].sort((a, b) => a - b)[Math.floor(vals.length / 2)];
      const maxRec = vixData.series.reduce((m, s) => (s.value > (m?.value ?? -Infinity) ? s : m), null);
      renderMetricStrip(opts.summaryId, [
        buildMetricCard('最新', latest ? `${formatNumber(latest.value, 2)}` : '--', latest ? `截至 ${latest.date}` : ''),
        buildMetricCard('长期均值', formatNumber(avg, 2), `${vals.length.toLocaleString()} 个交易日的算术均值`),
        buildMetricCard('长期中位数', formatNumber(median, 2), '样本中位数，受极端值影响较小'),
        buildMetricCard('历史峰值', maxRec ? `${formatNumber(maxRec.value, 2)}` : '--', maxRec ? `出现于 ${maxRec.date}` : ''),
      ]);
    }
  }
}

// ══════════════════════════════════════════════════════
// 面板：牛熊周期（Callan 风格 · 20% 阈值切段）
// 2026-04-17 从"同比"/"滚动回撤"彻底换成状态机切段：价格为 log 轴、每段涂色 + 标注时长/累计/年化
// 函数名保留 initLogYoyPanel 避免跨文件改导入（下一轮重构批次再统一改名）
// ══════════════════════════════════════════════════════

// 20% 阈值算法：起点默认牛市，跌 20% 进熊，反弹 20% 回牛
function buildBullBearSegments(rawSeries) {
  const byMonth = new Map();
  for (const item of rawSeries || []) {
    if (!item?.date || !(item.value > 0)) continue;
    byMonth.set(item.date.slice(0, 7), item);
  }
  const ordered = Array.from(byMonth.values()).sort((a, b) => a.date.localeCompare(b.date));
  if (ordered.length < 2) return { segments: [], ordered: [] };

  const BEAR_T = -0.20, BULL_T = 0.20;
  const segments = [];
  let state = 'bull';             // 起始默认牛市
  let anchor = ordered[0];        // 当前状态下的 peak（牛）或 trough（熊）
  let segStart = ordered[0];

  for (let i = 1; i < ordered.length; i++) {
    const cur = ordered[i];
    if (state === 'bull') {
      if (cur.value > anchor.value) {
        anchor = cur;             // 刷新牛市顶
      } else if ((cur.value - anchor.value) / anchor.value <= BEAR_T) {
        segments.push({ mode: 'bull', start: segStart, end: anchor });
        state = 'bear';
        segStart = anchor;         // 熊市起点是之前的 peak
        anchor = cur;
      }
    } else {
      if (cur.value < anchor.value) {
        anchor = cur;             // 刷新熊市底
      } else if ((cur.value - anchor.value) / anchor.value >= BULL_T) {
        segments.push({ mode: 'bear', start: segStart, end: anchor });
        state = 'bull';
        segStart = anchor;         // 牛市起点是之前的 trough
        anchor = cur;
      }
    }
  }
  // 尚未结束的最后一段：用最后一个数据点作为终点（累计收益算到当下）
  const last = ordered[ordered.length - 1];
  segments.push({ mode: state, start: segStart, end: last, ongoing: true });

  // 每段的时长 / 累计 / 年化
  for (const seg of segments) {
    const ms = new Date(seg.end.date).getTime() - new Date(seg.start.date).getTime();
    const months = Math.max(1, Math.round(ms / (30.4375 * 24 * 3600 * 1000)));
    seg.duration_months = months;
    seg.total_return = (seg.end.value - seg.start.value) / seg.start.value;
    if (months >= 12) {
      const years = months / 12;
      seg.ann_return = Math.pow(1 + seg.total_return, 1 / years) - 1;
    } else {
      seg.ann_return = null;
    }
  }

  // 后处理：把夹在两熊之间的"超短牛"（如 1932-08~1932-11 的 50% 反弹）
  // 合并进相邻熊市，让大萧条这种历史性深熊在视觉上保持连续。
  // 度量改用整段最深谷点（不是 next.end），所以即使合并后标签仍能反映真实 -86%。
  const merged = mergeShortBulls(segments, ordered, MIN_BULL_MONTHS_TO_KEEP);
  return { segments: merged, ordered };
}

const MIN_BULL_MONTHS_TO_KEEP = 6;

function mergeShortBulls(segments, ordered, minMonths) {
  if (!segments || segments.length < 3) return segments;
  const result = segments.slice();
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 1; i < result.length - 1; i++) {
      const cur = result[i];
      if (cur.ongoing) continue;
      if (cur.mode !== 'bull' || cur.duration_months >= minMonths) continue;
      const prev = result[i - 1];
      const next = result[i + 1];
      if (prev.mode !== 'bear' || next.mode !== 'bear') continue;

      // 区间内的真实最低点（考虑短牛被吞掉后，整段的最大跌幅）
      const startDate = prev.start.date;
      const endDate = next.end.date;
      const inRange = ordered.filter(p => p.date >= startDate && p.date <= endDate);
      const trough = inRange.reduce((acc, p) => (p.value < acc.value ? p : acc), inRange[0]);

      const ms = new Date(trough.date).getTime() - new Date(prev.start.date).getTime();
      const months = Math.max(1, Math.round(ms / (30.4375 * 24 * 3600 * 1000)));
      const total_return = (trough.value - prev.start.value) / prev.start.value;
      const ann_return = months >= 12
        ? Math.pow(1 + total_return, 1 / (months / 12)) - 1
        : null;

      result.splice(i - 1, 3, {
        mode: 'bear',
        start: prev.start,
        end: next.end,           // 视觉边界与下段连续
        extreme: trough,         // 标签锚点 + 度量基准
        duration_months: months,
        total_return,
        ann_return,
        ongoing: next.ongoing,
        merged: true,
      });
      changed = true;
      break;
    }
  }
  return result;
}

function formatSegmentLabel(seg) {
  // 优先用 extreme（合并后真实谷点）的年月做时间锚，否则取 seg.end
  const refDate = (seg.extreme || seg.end).date;
  const ym = `${refDate.slice(0, 4)}.${refDate.slice(5, 7)}`;
  const dur = `${seg.duration_months}m`;
  const tr = `${seg.total_return > 0 ? '+' : ''}${(seg.total_return * 100).toFixed(0)}%`;
  if (seg.ann_return != null) {
    const ann = `${seg.ann_return > 0 ? '+' : ''}${(seg.ann_return * 100).toFixed(0)}%/yr`;
    return `${ym}\n${dur} · ${tr}\n${ann}`;
  }
  return `${ym}\n${dur} · ${tr}`;
}

function middleDate(startDate, endDate) {
  const ms = (new Date(startDate).getTime() + new Date(endDate).getTime()) / 2;
  return new Date(ms).toISOString().slice(0, 10);
}

export function initLogYoyPanel(containerId, data, seriesName, labelOverrides = {}) {
  const dom = document.getElementById(containerId);
  if (!dom || !data?.series?.length) return;
  const chart = registerChart(echarts.init(dom));
  const { segments, ordered } = buildBullBearSegments(data.series);
  if (!segments.length) return;

  // labelOverrides 用法：键 = 段极值点的 'YYYY-MM'（合并段用 trough、其余用 anchor），
  // 值 = { xOff, yOff, force }。
  // 提供 override 的段会跳过 stagger 走手工坐标；force=true 还会无视 LABEL_MIN_* 阈值强制显示。

  const BULL_STROKE = '#389e0d';
  const BEAR_STROKE = '#cf1322';
  const BULL_FILL_TOP = 'rgba(56,158,13,0.30)';
  const BULL_FILL_BOT = 'rgba(56,158,13,0.04)';
  const BEAR_FILL_TOP = 'rgba(207,19,34,0.30)';
  const BEAR_FILL_BOT = 'rgba(207,19,34,0.04)';
  const LABEL_MIN_BULL = 18;   // 牛市阈值：避开 1930s 短牛扎堆
  const LABEL_MIN_BEAR = 3;    // 熊市阈值：保证 1987 / 2020 COVID 这类短暴跌有标签
  const STAGGER_GAP_MONTHS = 60;  // ~5年：覆盖 2020↔2022、1981↔1984 这类近距离同类段
  const STAGGER_X_OFFSET = 50;    // 横向错开像素量
  const LABEL_DISTANCE   = 10;    // 标签与极值点的固定垂直距离（写死，不做 yOff 阶梯）

  // 混合刻度：
  //   牛市 Y = ln(price/start)*100（对数压缩，防止百年大牛视觉独占）
  //   熊市 Y = (price-start)/start*100（简单百分比，天然卡在 -100% 内）
  function buildSeries() {
    // 第一遍：算每段的 data 和极值点（取段内真实极值 = 牛市最高 / 熊市最低）
    const prepared = segments.map((seg, idx) => {
      const isBull = seg.mode === 'bull';
      const startVal = seg.start.value;
      const segData = ordered
        .filter(p => p.date >= seg.start.date && p.date <= seg.end.date)
        .map(p => {
          const y = isBull
            ? Math.log(p.value / startVal) * 100
            : (p.value - startVal) / startVal * 100;
          return [p.date, y];
        });
      let extremePoint = segData[segData.length - 1] || [seg.end.date, 0];
      // 合并后的熊市直接用 seg.extreme 做锚，否则扫描 segData
      if (seg.extreme) {
        const exY = isBull
          ? Math.log(seg.extreme.value / startVal) * 100
          : (seg.extreme.value - startVal) / startVal * 100;
        extremePoint = [seg.extreme.date, exY];
      } else {
        for (const pt of segData) {
          if (isBull ? pt[1] > extremePoint[1] : pt[1] < extremePoint[1]) {
            extremePoint = pt;
          }
        }
      }
      return {
        seg, idx, isBull, segData,
        extremeDate: extremePoint[0],
        extremeY: extremePoint[1],
      };
    });

    // 第二遍：筛标注 → 同类内做"距离 + 翻转"双轴错开
    const ovKey = p => (p.seg.extreme || p.seg.end).date.slice(0, 7);
    const labeled = prepared.filter(p => {
      const ov = labelOverrides[ovKey(p)];
      if (ov?.force) return true;
      return p.seg.duration_months >= (p.isBull ? LABEL_MIN_BULL : LABEL_MIN_BEAR);
    });

    // stagger 策略：标签的垂直距离写死（永远紧贴极值点上/下 LABEL_DISTANCE px），
    // 只用水平 xOff 错开。同类段挤在 60 个月内时：
    //   counter 1 → +50  counter 2 → -50  counter 3 → +100  counter 4 → -100 …
    // 不再做 yOff 阶梯——避免标签飘离对应曲线点造成视觉错位。
    function stagger(list, basePosition) {
      list.sort((a, b) => a.extremeDate.localeCompare(b.extremeDate));
      let lastMs = null;
      let counter = 0;
      for (const p of list) {
        const curMs = new Date(p.extremeDate).getTime();
        let xOff = 0;
        if (lastMs != null) {
          const gapMonths = (curMs - lastMs) / (30.4375 * 24 * 3600 * 1000);
          if (gapMonths < STAGGER_GAP_MONTHS) {
            counter += 1;
            const tier = Math.ceil(counter / 2);
            xOff = (counter % 2 === 1 ? +1 : -1) * STAGGER_X_OFFSET * tier;
          } else {
            counter = 0;
          }
        }
        p.placement = { position: basePosition, xOff, yOff: 0 };
        lastMs = curMs;
      }
    }
    stagger(labeled.filter(p => p.isBull), 'top');
    stagger(labeled.filter(p => !p.isBull), 'bottom');

    // 第三遍补丁：override 直接覆盖自动 stagger 的 placement
    // ov.position 可显式指定 'top'/'bottom'，比如 1935 熊市要打到曲线上方
    for (const p of labeled) {
      const ov = labelOverrides[ovKey(p)];
      if (!ov) continue;
      p.placement = {
        position: ov.position || (p.isBull ? 'top' : 'bottom'),
        xOff: ov.xOff ?? 0,
        yOff: ov.yOff ?? 0,
      };
    }

    // 第三遍：生成 echarts series
    return prepared.map(p => {
      const { seg, idx, isBull, segData, extremeY, extremeDate, placement } = p;
      const series = {
        name: isBull ? `牛市 #${idx}` : `熊市 #${idx}`,
        type: 'line',
        data: segData,
        showSymbol: false,
        lineStyle: { width: 1.4, color: isBull ? BULL_STROKE : BEAR_STROKE },
        areaStyle: {
          origin: 0,
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: isBull ? BULL_FILL_TOP : BEAR_FILL_BOT },
            { offset: 1, color: isBull ? BULL_FILL_BOT : BEAR_FILL_TOP },
          ]),
        },
        z: 2,
      };
      if (placement) {
        series.markPoint = {
          silent: true,
          symbol: 'rect',
          symbolSize: 0.01,
          data: [{
            coord: [extremeDate, extremeY],
            label: {
              show: true,
              position: placement.position,
              distance: LABEL_DISTANCE,
              offset: [placement.xOff, placement.yOff],
              color: isBull ? BULL_STROKE : BEAR_STROKE,
              fontSize: 10,
              fontWeight: 600,
              lineHeight: 13,
              formatter: formatSegmentLabel(seg),
            },
          }],
        };
      }
      return series;
    });
  }

  function getOption() {
    const gridColor = cssVar('--chart-grid') || '#f0f0f0';
    const grayColor = cssVar('--gray') || '#999';
    const textColor = cssVar('--text') || '#1a1a1a';

    return {
      animation: false,
      // 标签紧贴极值点（distance=10），不再需要超大底/顶边距
      grid: { left: 60, right: 24, top: 60, bottom: 70 },
      xAxis: {
        type: 'time',
        axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
        splitLine: { show: false },
        axisLine: { onZero: true, lineStyle: { color: grayColor } },
      },
      yAxis: {
        type: 'value',
        min: -105,                         // 熊市天然卡在 -100%，留 5% 边距
        axisLabel: {
          formatter: v => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`,
          fontSize: 11,
          color: grayColor,
          fontFamily: CHART_FONT,
        },
        splitLine: { lineStyle: { color: gridColor } },
      },
      series: buildSeries(),
      tooltip: {
        trigger: 'axis',
        backgroundColor: cssVar('--card-bg') || '#fff',
        borderColor: cssVar('--border') || '#e8e8e8',
        textStyle: { fontSize: 13, color: textColor, fontFamily: CHART_FONT },
        formatter: params => {
          const axisLabel = params?.[0]?.axisValueLabel || '';
          const p = params.find(x => Array.isArray(x.value) && x.value[1] != null);
          if (!p) return axisLabel;
          const dateStr = p.value[0];
          const seg = segments.find(s => dateStr >= s.start.date && dateStr <= s.end.date);
          if (!seg) return axisLabel;
          const isBull = seg.mode === 'bull';
          const color = isBull ? BULL_STROKE : BEAR_STROKE;
          // 从原始数据拿真实价格（避免从 log 值反解，精度更好）
          const row = ordered.find(r => r.date === dateStr) || { value: seg.start.value };
          const curPrice = row.value;
          const simpleRet = (curPrice - seg.start.value) / seg.start.value * 100;
          const lines = [
            axisLabel,
            `点位: <b>${formatNumber(curPrice, 2)}</b>`,
            `本段至此: <b style="color:${color}">${simpleRet > 0 ? '+' : ''}${simpleRet.toFixed(1)}%</b>`,
            `状态: <b style="color:${color}">${isBull ? '牛市' : '熊市'}${seg.ongoing ? '（进行中）' : ''}</b>`,
            `本轮: ${seg.start.date.slice(0, 7)} → ${seg.end.date.slice(0, 7)} · ${seg.duration_months} 个月`,
            `本轮累计: <b style="color:${color}">${seg.total_return > 0 ? '+' : ''}${(seg.total_return * 100).toFixed(1)}%</b>`,
          ];
          if (seg.ann_return != null) {
            lines.push(`年化: ${seg.ann_return > 0 ? '+' : ''}${(seg.ann_return * 100).toFixed(1)}%`);
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

export function initLongRunIndexPanel(containerId, summaryId, data, recessionData, seriesName, toggleId) {
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
    buildMetricCard('起点', `${data.start?.date || '--'} | ${data.start ? formatNumber(data.start.value, 2) : '--'}`, '用起始月度点位给长周期一个基准。'),
    buildMetricCard('最新', data.latest ? formatNumber(data.latest.value, 2) : '--', data.latest ? `更新时间 ${data.latest.date}` : '等待数据'),
    buildMetricCard('复合增速', data.cagr != null ? formatPercent(data.cagr, 2) : '--', '按起点到当前月度点位计算的长期 CAGR。'),
    buildMetricCard('视角切换', '价格 / 对数 / 百分比', '价格看绝对点位，对数看复利斜率，百分比看自起点累计涨幅。'),
    buildMetricCard('衰退阴影', '已启用', '淡灰色区间基于 NBER / FRED 的 US recession 指标。'),
  ]);
}

// ══════════════════════════════════════════════════════
// 面板：AIAE - Aggregate Investor Allocation to Equities
// 论文：alphaarchitect.com/market-timing-using-aggregate-equity-allocation-signals
// 双轴：左 AIAE %（黑线）+ 右 后续 10y 实际年化回报 %（灰柱，往左滞后 10 年对齐）
// ══════════════════════════════════════════════════════
export function initPanelAiae(aiaeData) {
  const dom = document.getElementById('chartAiae');
  if (!dom || !aiaeData?.series?.length) return;
  const chart = registerChart(echarts.init(dom));
  const series = aiaeData.series;
  const summary = aiaeData.summary || {};

  function getOption() {
    const lineColor = cssVar('--sp500-line') || '#1a1a1a';
    const gridColor = cssVar('--chart-grid') || '#f0f0f0';
    const grayColor = cssVar('--gray') || '#999';
    const textColor = cssVar('--text') || '#1a1a1a';
    const futureColor = '#cf1322';

    // 把"后续 10y 实际年化"按时间对齐到当下显示（即 1980 的点位 = 1980→1990 的年化）
    const aiaeLine = series.map(p => [p.date, p.aiae * 100]);
    const subsequent = series
      .filter(p => p.subsequent_10y_ann != null)
      .map(p => [p.date, p.subsequent_10y_ann * 100]);
    const forecastLine = series
      .filter(p => p.implied_10y_forecast != null)
      .map(p => [p.date, p.implied_10y_forecast * 100]);

    return {
      animation: false,
      grid: { left: 60, right: 60, top: 50, bottom: 60 },
      legend: getLineLegendConfig({ data: ['AIAE 仓位', '后续 10y 实际年化', '回归预测 10y'] }),
      xAxis: {
        type: 'time',
        axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
        splitLine: { show: false },
      },
      yAxis: [
        {
          type: 'value',
          position: 'left',
          name: 'AIAE %',
          nameTextStyle: { fontSize: 10, color: grayColor, fontFamily: CHART_FONT },
          axisLabel: { formatter: v => `${v.toFixed(0)}%`, fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
          splitLine: { lineStyle: { color: gridColor } },
        },
        {
          type: 'value',
          position: 'right',
          name: '10y 年化 %',
          nameTextStyle: { fontSize: 10, color: grayColor, fontFamily: CHART_FONT },
          axisLabel: { formatter: v => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`, fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: 'AIAE 仓位',
          type: 'line',
          yAxisIndex: 0,
          showSymbol: false,
          data: aiaeLine,
          color: lineColor,
          lineStyle: { width: 2, color: lineColor },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(26,26,26,0.20)' },
              { offset: 1, color: 'rgba(26,26,26,0.02)' },
            ]),
          },
        },
        {
          name: '后续 10y 实际年化',
          type: 'line',
          yAxisIndex: 1,
          showSymbol: false,
          data: subsequent,
          color: futureColor,
          lineStyle: { width: 1.6, color: futureColor, type: 'solid' },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: grayColor, type: 'dashed', width: 1 },
            data: [{ yAxis: 0, label: { formatter: '0%', fontSize: 10, color: grayColor } }],
          },
        },
        {
          name: '回归预测 10y',
          type: 'line',
          yAxisIndex: 1,
          showSymbol: false,
          data: forecastLine,
          color: '#faad14',
          lineStyle: { width: 1.2, color: '#faad14', type: 'dashed' },
        },
      ],
      tooltip: {
        trigger: 'axis',
        backgroundColor: cssVar('--card-bg') || '#fff',
        borderColor: cssVar('--border') || '#e8e8e8',
        textStyle: { fontSize: 13, color: textColor, fontFamily: CHART_FONT },
        formatter: params => {
          const date = params?.[0]?.axisValueLabel || '';
          const point = series.find(p => p.date === params[0].value[0]) ||
                        series.find(p => p.date.slice(0, 7) === date.slice(0, 7));
          if (!point) return date;
          const lines = [
            date.slice(0, 7),
            `<b>AIAE 仓位</b>: ${(point.aiae * 100).toFixed(2)}%`,
          ];
          if (point.implied_10y_forecast != null) {
            lines.push(`回归预测 10y 年化: <b style="color:#faad14">${(point.implied_10y_forecast * 100 > 0 ? '+' : '')}${(point.implied_10y_forecast * 100).toFixed(2)}%</b>`);
          }
          if (point.subsequent_10y_ann != null) {
            lines.push(`实际后续 10y 年化: <b style="color:${futureColor}">${(point.subsequent_10y_ann * 100 > 0 ? '+' : '')}${(point.subsequent_10y_ann * 100).toFixed(2)}%</b>`);
          } else {
            lines.push(`<span style="color:${grayColor}">实际 10y 年化：尚未到期</span>`);
          }
          return lines.join('<br/>');
        },
      },
      dataZoom: getDataZoom(grayColor),
    };
  }

  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  // Metric strip
  const fmtPct = (v, digits = 2) => v == null ? '--' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`;
  const fmtBps = v => v == null ? '--' : `${v > 0 ? '+' : ''}${(v * 10000).toFixed(0)} bps`;
  const ymKey = summary.latest_date ? summary.latest_date.slice(0, 7) : '--';
  const pct = summary.historical_percentile != null ? `${(summary.historical_percentile * 100).toFixed(1)}%` : '--';

  renderMetricStrip('aiaeSummary', [
    buildMetricCard(
      '最新 AIAE',
      summary.latest_aiae != null ? `${(summary.latest_aiae * 100).toFixed(2)}%` : '--',
      `${ymKey} | 历史百分位 ${pct}`
    ),
    buildMetricCard(
      '历史区间',
      summary.historical_min != null
        ? `${(summary.historical_min * 100).toFixed(1)}% ~ ${(summary.historical_max * 100).toFixed(1)}%`
        : '--',
      `均值 ${summary.historical_mean != null ? (summary.historical_mean * 100).toFixed(2) : '--'}% | 1945+ 季频`
    ),
    buildMetricCard(
      '隐含 10y 预测',
      fmtPct(summary.latest_implied_10y_forecast),
      `全样本 OLS 回归（n=${summary.regression?.n_obs || '--'}）：年化预测，仅参考`
    ),
    buildMetricCard(
      '当前 10y 国债',
      summary.current_10y_yield != null ? `${(summary.current_10y_yield * 100).toFixed(2)}%` : '--',
      'FRED DGS10 最新值'
    ),
    buildMetricCard(
      '隐含风险溢价',
      fmtBps(summary.implied_equity_risk_premium),
      '预测股票年化 − 10y 国债。负值 = 现金更优'
    ),
    buildMetricCard(
      '更新节奏',
      `季频 | 滞后约 ${summary.release_lag_weeks || 10} 周`,
      'Z.1 报告每季度发布一次，下次刷新约 7 月初'
    ),
  ]);
}

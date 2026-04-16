// ══════════════════════════════════════════════════════
// chart-helpers.js · 所有 echarts / 图表相关的复用辅助
// 依赖 utils（cssVar, escapeHtml, CHART_FONT）和全局 echarts
// ══════════════════════════════════════════════════════

import { cssVar, escapeHtml, CHART_FONT } from './utils.js';

// 所有 chart 实例注册表，用于主题切换时重绘 / resize
export const chartInstances = [];

export function registerChart(chart) {
  chartInstances.push(chart);
  window.addEventListener('resize', () => chart.resize());
  return chart;
}

export function buildMetricCard(label, value, note) {
  return `
    <div class="metric-card">
      <div class="metric-label">${escapeHtml(label)}</div>
      <div class="metric-value">${escapeHtml(value)}</div>
      <div class="metric-note">${escapeHtml(note || '')}</div>
    </div>
  `;
}

export function renderMetricStrip(containerId, cards) {
  const container = document.getElementById(containerId);
  if (!container) {
    return;
  }
  container.innerHTML = cards.join('');
}

export function getDataZoom(grayColor) {
  return [
    { type: 'inside', start: 0, end: 100 },
    {
      type: 'slider',
      start: 0,
      end: 100,
      height: 24,
      bottom: 8,
      borderColor: 'transparent',
      backgroundColor: cssVar('--bg-section') || '#fafafa',
      fillerColor: cssVar('--accent-light') || 'rgba(71,88,224,0.08)',
      handleStyle: { color: cssVar('--accent') || '#4758e0' },
      textStyle: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
    },
  ];
}

export function buildThresholdAreas(points, threshold, accessor = point => point.value) {
  const areas = [];
  let startDate = null;
  let prevDate = null;

  points.forEach(point => {
    const value = accessor(point);
    const aboveThreshold = value != null && value > threshold;

    if (aboveThreshold && !startDate) {
      startDate = point.date;
    }

    if (!aboveThreshold && startDate && prevDate) {
      areas.push([{ xAxis: startDate }, { xAxis: prevDate }]);
      startDate = null;
    }

    prevDate = point.date;
  });

  if (startDate && prevDate) {
    areas.push([{ xAxis: startDate }, { xAxis: prevDate }]);
  }

  return areas;
}

export function buildSingleMarkPoint(date, value, labelText, color, position = 'right') {
  if (!date || !Number.isFinite(value)) {
    return null;
  }

  return {
    coord: [date, value],
    value,
    symbol: 'circle',
    symbolSize: 9,
    itemStyle: {
      color,
      borderColor: cssVar('--card-bg') || '#fff',
      borderWidth: 1.5,
    },
    label: {
      show: true,
      formatter: labelText,
      position,
      distance: 6,
      color,
      fontSize: 11,
      fontWeight: 600,
      fontFamily: CHART_FONT,
    },
  };
}

/**
 * Resolve overlapping markPoint labels by applying vertical offsets.
 * Collects all markPoint.data entries across series, sorts by Y-value,
 * and pushes labels apart when they would overlap visually.
 * @param {Object} option - ECharts option object (mutated in-place)
 * @param {Object} [opts] - Options: { yAxis: 'log', chartHeight, minGapPx }
 * @returns {Object} The same option object
 */
export function resolveMarkPointOverlaps(option, opts = {}) {
  if (!option || !Array.isArray(option.series)) return option;

  const isLog = opts.yAxis === 'log';
  const CHART_HEIGHT = opts.chartHeight ?? 600;
  const MIN_GAP_PX = opts.minGapPx ?? 16;

  const entries = [];
  for (const s of option.series) {
    if (!s.markPoint || !Array.isArray(s.markPoint.data)) continue;
    for (const mp of s.markPoint.data) {
      if (mp && mp.coord && Number.isFinite(mp.value)) {
        entries.push(mp);
      }
    }
  }

  if (entries.length < 2) return option;

  entries.sort((a, b) => {
    const va = isLog ? Math.log10(Math.max(a.value, 1e-10)) : a.value;
    const vb = isLog ? Math.log10(Math.max(b.value, 1e-10)) : b.value;
    return vb - va;
  });

  const values = entries.map(e => isLog ? Math.log10(Math.max(e.value, 1e-10)) : e.value);
  const rangeMin = Math.min(...values);
  const rangeMax = Math.max(...values);
  const totalRange = rangeMax - rangeMin;
  if (totalRange <= 0) return option;

  const pxPerUnit = CHART_HEIGHT / totalRange;

  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1];
    const curr = entries[i];

    const prevVal = isLog ? Math.log10(Math.max(prev.value, 1e-10)) : prev.value;
    const currVal = isLog ? Math.log10(Math.max(curr.value, 1e-10)) : curr.value;

    const prevOffsetY = (prev.label && prev.label.offset) ? prev.label.offset[1] : 0;
    const gapPx = (prevVal - currVal) * pxPerUnit + prevOffsetY;

    if (gapPx < MIN_GAP_PX) {
      const dy = MIN_GAP_PX - gapPx;
      if (!curr.label) curr.label = {};
      const existingDx = (curr.label.offset && curr.label.offset[0]) || 0;
      const existingDy = (curr.label.offset && curr.label.offset[1]) || 0;
      curr.label.offset = [existingDx, existingDy + dy];
    }
  }

  return option;
}

export function buildRecessionAreas(recessionData) {
  const periods = recessionData?.periods || [];
  return periods.map(period => [{ xAxis: period.start }, { xAxis: period.end }]);
}

export function buildRecessionOverlaySeries(seriesData, recessionData) {
  const areas = buildRecessionAreas(recessionData);
  if (!areas.length) {
    return null;
  }
  return {
    name: '衰退区间',
    type: 'line',
    data: seriesData,
    showSymbol: false,
    lineStyle: { opacity: 0, width: 0 },
    tooltip: { show: false },
    emphasis: { disabled: true },
    markArea: {
      silent: true,
      itemStyle: { color: 'rgba(153, 153, 153, 0.12)' },
      data: areas,
    },
    z: 0,
  };
}

export function getLineLegendConfig(extra = {}) {
  return {
    top: 0,
    left: 'center',
    icon: 'roundRect',
    itemWidth: 18,
    itemHeight: 3,
    itemGap: 16,
    textStyle: {
      fontSize: 12,
      color: cssVar('--text-secondary') || '#666',
      fontFamily: CHART_FONT,
    },
    ...extra,
  };
}

// ══════════════════════════════════════════════════════
// 年化持有矩阵 (panel-annualized-matrix 使用)
// ══════════════════════════════════════════════════════

export function getHeatColor(value) {
  const capped = Math.max(-0.15, Math.min(0.15, value));
  const ratio = capped / 0.15;

  if (ratio >= 0) {
    const t = ratio;
    const r = Math.round(255 - (255 - 56) * t);
    const g = Math.round(255 - (255 - 158) * t);
    const b = Math.round(255 - (255 - 13) * t);
    return `rgb(${r},${g},${b})`;
  }

  const t = -ratio;
  const r = Math.round(255 - (255 - 207) * t);
  const g = Math.round(255 - (255 - 19) * t);
  const b = Math.round(255 - (255 - 34) * t);
  return `rgb(${r},${g},${b})`;
}

export function buildYearEndPointMap(sourceSeries) {
  const yearEndMap = new Map();
  (sourceSeries || []).forEach(point => {
    const year = Number(point?.date?.slice(0, 4));
    const value = Number(point?.value);
    if (!Number.isFinite(year) || !Number.isFinite(value) || value <= 0) {
      return;
    }
    yearEndMap.set(year, {
      year,
      date: point.date,
      value,
    });
  });
  return yearEndMap;
}

export function isCompleteYearPoint(point) {
  if (!point?.date) {
    return false;
  }
  const month = Number(point.date.slice(5, 7));
  const day = Number(point.date.slice(8, 10));
  return month === 12 && day >= 29;
}

export function buildAnnualizedHoldingMatrix(sourceSeries, preferredStartYear = 1980) {
  const yearEndMap = buildYearEndPointMap(sourceSeries);
  const availableYears = Array.from(yearEndMap.keys()).sort((a, b) => a - b);
  if (availableYears.length < 2) {
    return null;
  }

  const earliestStartYear = availableYears[0] + 1;
  const lastCompleteYear = [...availableYears].reverse().find(year => isCompleteYearPoint(yearEndMap.get(year)));
  if (!lastCompleteYear || lastCompleteYear < earliestStartYear) {
    return null;
  }

  const startYear = Math.max(preferredStartYear, earliestStartYear);
  const years = [];
  for (let year = startYear; year <= lastCompleteYear; year += 1) {
    if (yearEndMap.has(year - 1) && yearEndMap.has(year)) {
      years.push(year);
    }
  }

  if (!years.length) {
    return null;
  }

  const rows = [];
  const cells = [];

  years.forEach(endYear => {
    const rowCells = years.map(startYearCandidate => {
      if (startYearCandidate > endYear) {
        return null;
      }

      const basePoint = yearEndMap.get(startYearCandidate - 1);
      const endPoint = yearEndMap.get(endYear);
      if (!basePoint || !endPoint) {
        return null;
      }

      const holdingYears = endYear - startYearCandidate + 1;
      const annualized = (Math.pow(endPoint.value / basePoint.value, 1 / holdingYears) - 1) * 100;
      let value = Number(annualized.toFixed(1));
      if (Object.is(value, -0)) {
        value = 0;
      }

      const cell = {
        startYear: startYearCandidate,
        endYear,
        holdingYears,
        value,
        startDate: basePoint.date,
        endDate: endPoint.date,
      };
      cells.push(cell);
      return cell;
    });

    rows.push({ year: endYear, cells: rowCells });
  });

  const sortedValues = cells.map(cell => cell.value).sort((a, b) => a - b);
  const median = sortedValues.length
    ? sortedValues[Math.floor(sortedValues.length / 2)]
    : null;

  return {
    years,
    startYear: years[0],
    endYear: years.at(-1),
    rows,
    cells,
    best: cells.reduce((best, cell) => (best == null || cell.value > best.value ? cell : best), null),
    worst: cells.reduce((worst, cell) => (worst == null || cell.value < worst.value ? cell : worst), null),
    median,
  };
}

export function getAnnualizedMatrixNegativeOpacity(value) {
  const ratio = Math.min(1, Math.abs(value) / 25);
  return (0.18 + ratio * 0.56).toFixed(3);
}

export function ensureAnnualizedMatrixTooltip() {
  let tooltip = document.getElementById('annualizedMatrixHoverTooltip');
  if (tooltip) {
    return tooltip;
  }

  tooltip = document.createElement('div');
  tooltip.id = 'annualizedMatrixHoverTooltip';
  tooltip.className = 'matrix-hover-tooltip';
  document.body.appendChild(tooltip);
  return tooltip;
}

export function hideAnnualizedMatrixTooltip(tooltip) {
  if (!tooltip) {
    return;
  }
  tooltip.classList.remove('is-visible');
}

export function positionAnnualizedMatrixTooltip(tooltip, clientX, clientY) {
  const margin = 14;
  const offset = 16;
  const rect = tooltip.getBoundingClientRect();

  let left = clientX + offset;
  let top = clientY + offset;

  if (left + rect.width > window.innerWidth - margin) {
    left = clientX - rect.width - offset;
  }
  if (top + rect.height > window.innerHeight - margin) {
    top = clientY - rect.height - offset;
  }

  tooltip.style.left = `${Math.max(margin, left)}px`;
  tooltip.style.top = `${Math.max(margin, top)}px`;
}

export function bindAnnualizedMatrixTooltip(container) {
  if (!container || container.dataset.tooltipBound === 'true') {
    return;
  }

  const tooltip = ensureAnnualizedMatrixTooltip();

  const showTooltip = (cell, clientX, clientY) => {
    const startYear = cell?.dataset?.startYear;
    const endYear = cell?.dataset?.endYear;
    const holdingYears = cell?.dataset?.holdingYears;
    const cagr = cell?.dataset?.cagr;
    if (!startYear || !endYear || !holdingYears || cagr == null) {
      hideAnnualizedMatrixTooltip(tooltip);
      return;
    }

    tooltip.innerHTML = `
      <div class="matrix-tooltip-title">${escapeHtml(startYear)} → ${escapeHtml(endYear)}（持有 ${escapeHtml(holdingYears)} 年）</div>
      <div class="matrix-tooltip-line">年化收益率：<span class="matrix-tooltip-value">${escapeHtml(cagr)}</span></div>
    `;
    tooltip.classList.add('is-visible');
    positionAnnualizedMatrixTooltip(tooltip, clientX, clientY);
  };

  container.addEventListener('mouseover', event => {
    const cell = event.target.closest('.matrix-cell');
    if (!cell || !container.contains(cell)) {
      return;
    }
    showTooltip(cell, event.clientX, event.clientY);
  });

  container.addEventListener('mousemove', event => {
    const cell = event.target.closest('.matrix-cell');
    if (!cell || !container.contains(cell)) {
      hideAnnualizedMatrixTooltip(tooltip);
      return;
    }
    showTooltip(cell, event.clientX, event.clientY);
  });

  container.addEventListener('mouseleave', () => {
    hideAnnualizedMatrixTooltip(tooltip);
  });

  container.addEventListener('scroll', () => {
    hideAnnualizedMatrixTooltip(tooltip);
  }, { passive: true });

  window.addEventListener('scroll', () => {
    hideAnnualizedMatrixTooltip(tooltip);
  }, { passive: true });

  container.dataset.tooltipBound = 'true';
}

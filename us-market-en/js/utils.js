// ══════════════════════════════════════════════════════
// utils.js · Core utilities: data fetching, formatting, HTML escaping, shared constants
// No echarts dependency
// ══════════════════════════════════════════════════════

export const CHART_FONT = '"Inter", -apple-system, "PingFang SC", sans-serif';
export const DATA_VERSION = Date.now();
export const AXIS_END_2028_TS = new Date('2028-12-31').getTime();

// X axis right edge = end of next calendar year (t+1, Dec 31). Never hard-coded:
// opened in 2026-11 → 2027-12-31; opened in 2027-01 → 2028-12-31.
export function getAxisEndNextYearTS(now = new Date()) {
  return new Date(now.getFullYear() + 1, 11, 31).getTime();
}

// Calendar-quarter ticks: every Jan/Apr/Jul/Oct 1 falling in (startTS, endTS], used for vertical guide lines.
export function buildQuarterTicks(startTS, endTS) {
  const ticks = [];
  const startYear = new Date(startTS).getFullYear();
  const endYear = new Date(endTS).getFullYear();
  for (let year = startYear; year <= endYear; year++) {
    for (let quarter = 0; quarter < 4; quarter++) {
      const ts = new Date(year, quarter * 3, 1).getTime();
      if (ts > startTS && ts <= endTS) ticks.push(ts);
    }
  }
  return ticks;
}

export function fetchJSON(url) {
  const sep = url.includes('?') ? '&' : '?';
  return fetch(`${url}${sep}v=${DATA_VERSION}`).then(response => {
    if (!response.ok) {
      throw new Error(`${url} -> HTTP ${response.status}`);
    }
    return response.json();
  });
}

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function getCurrentPageUrl() {
  const { origin, pathname } = window.location;
  if (!origin || origin === 'null') {
    return pathname || '/site/index.html';
  }
  return `${origin}${pathname}`;
}

export function formatNumber(value, digits = 0) {
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatPercent(value, digits = 1) {
  return `${value.toFixed(digits)}%`;
}

export function formatCompactNumber(value) {
  return Number(value).toLocaleString('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  });
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// 5-year rolling annualized return: no echarts dependency, reused across multiple panels
export function buildRollingAnnualizedSeries(sourceSeries, windowYears = 5) {
  const validSeries = (sourceSeries || []).filter(item => item?.value != null && item.value > 0);
  const windowSize = windowYears * 12;
  const rolling = [];

  if (validSeries.length <= windowSize) {
    return {
      updated: null,
      latest: null,
      average: null,
      negativePercent: null,
      series: rolling,
    };
  }

  for (let index = windowSize; index < validSeries.length; index += 1) {
    const start = validSeries[index - windowSize];
    const end = validSeries[index];
    if (!start?.value || !end?.value) {
      continue;
    }
    const annualized = (Math.pow(end.value / start.value, 1 / windowYears) - 1) * 100;
    rolling.push({
      date: end.date,
      value: Number(annualized.toFixed(2)),
      startDate: start.date,
      startPrice: start.value,
      endPrice: end.value,
    });
  }

  const average = rolling.reduce((sum, item) => sum + item.value, 0) / Math.max(rolling.length, 1);
  const negativePercent = rolling.filter(item => item.value < 0).length / Math.max(rolling.length, 1) * 100;

  return {
    updated: rolling.at(-1)?.date ?? null,
    latest: rolling.at(-1) ?? null,
    average: Number(average.toFixed(2)),
    negativePercent: Number(negativePercent.toFixed(1)),
    series: rolling,
  };
}

// 12-month rolling drawdown series: (P_t − max(P_{t-12..t-1})) / max(P_{t-12..t-1})
// 2026-04-17: switched from YoY to "change vs. trailing-12-month peak". YoY for V-shaped crashes
// (e.g. 2020-03) shows only -8.8% and severely understates bear-market depth; the new measure shows
// roughly -20% for 2020-03 and still ~-70% for 1932-06, matching the "Bull/Bear Cycle" framing.
// Positive = new trailing-12-month high (uptrend); negative = in drawdown (downtrend); depth reflects bear severity.
// Function name buildLogYoySeries is preserved to avoid cross-file import changes.
export function buildLogYoySeries(rawSeries) {
  const byMonth = new Map();
  for (const item of rawSeries || []) {
    if (!item?.date || !(item.value > 0)) continue;
    byMonth.set(item.date.slice(0, 7), item);
  }
  const ordered = Array.from(byMonth.values()).sort((a, b) => a.date.localeCompare(b.date));
  const result = [];
  for (const item of ordered) {
    const d = new Date(item.date);
    if (isNaN(d.getTime())) continue;
    // Scan trailing 12 months (excluding current) for the highest close
    let peak = null;
    for (let k = 1; k <= 12; k++) {
      const pd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - k, 1));
      const pym = `${pd.getUTCFullYear()}-${String(pd.getUTCMonth() + 1).padStart(2, '0')}`;
      const prev = byMonth.get(pym);
      if (prev && prev.value > 0 && (peak == null || prev.value > peak)) {
        peak = prev.value;
      }
    }
    if (peak == null) continue;
    result.push({
      date: item.date,
      value: (item.value - peak) / peak,
      now: item.value,
      prev: peak,
    });
  }
  return result;
}

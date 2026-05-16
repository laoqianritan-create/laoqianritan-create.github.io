// site/js/chronicle-year.js · Shared script for individual Chronicle year pages
// Reused across all 79 year pages: trend chart rendering + era-context fetch + theme switching.
// The year is auto-detected from the DOM (chartYear<Y> container + section[data-era]).
// Data paths auto-switch between dev (/site/chronicle/) and prod (/us-market/chronicle/).
(function () {
  const CHART_FONT = '"Inter", -apple-system, "PingFang SC", sans-serif';
  // Dev: /site-en/chronicle/YYYY.html → ../../data/chronicle
  // Deploy: /us-market-en/chronicle/YYYY.html → ../data/chronicle
  const DATA_BASE = location.pathname.includes('/site-en/chronicle/')
    ? '../../data/chronicle'
    : '../data/chronicle';

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // ── Seamless EN/CN language switch (Chronicle year-page variant) ──
  (function bindLangSwitch() {
    document.addEventListener('DOMContentLoaded', () => {
      const toggle = document.getElementById('langToggle');
      if (!toggle) return;
      toggle.querySelectorAll('.lang-opt').forEach(el => {
        el.addEventListener('click', e => {
          if (el.classList.contains('active')) { e.preventDefault(); return; }
          e.preventDefault();
          sessionStorage.setItem('langSwitchScroll', String(window.scrollY));
          document.body.style.transition = 'opacity 0.12s';
          document.body.style.opacity = '0.4';
          window.location.href = el.getAttribute('href') + (window.location.hash || '');
        });
      });
      // Restore scroll
      const saved = sessionStorage.getItem('langSwitchScroll');
      if (saved !== null) {
        requestAnimationFrame(() => {
          setTimeout(() => window.scrollTo({ top: parseInt(saved, 10), behavior: 'instant' }), 80);
        });
        sessionStorage.removeItem('langSwitchScroll');
      }
    });
  })();


  // ── Read timeline → event array ──
  function readTimelineEvents() {
    const items = document.querySelectorAll('#yearTimeline [data-chart-date]');
    return Array.from(items).map(el => {
      const cls = el.classList;
      let kind = 'info';
      if (cls.contains('timeline-item--up')) kind = 'up';
      else if (cls.contains('timeline-item--down')) kind = 'down';
      if (cls.contains('timeline-item--key')) kind = kind === 'info' ? 'key' : kind + '-key';
      return {
        date: el.dataset.chartDate,
        rangeEnd: el.dataset.chartRangeEnd || null,
        label: el.dataset.chartLabel || el.querySelector('.timeline-title')?.textContent || '',
        showLabel: el.dataset.chartShowLabel === 'true',
        kind,
        desc: el.querySelector('.timeline-desc')?.textContent || '',
      };
    });
  }

  function colorForKind(kind, theme) {
    if (kind.includes('up'))   return { dot: theme.green, ring: kind.includes('key') ? theme.accent : null };
    if (kind.includes('down')) return { dot: theme.red,   ring: kind.includes('key') ? theme.accent : null };
    if (kind === 'key')        return { dot: theme.accent, ring: theme.accent };
    return { dot: theme.cardBg, ring: null };
  }

  // ── Price-trend segmentation (zigzag, minPct=5%) ──
  function findTrendSegments(data, minPct) {
    minPct = minPct || 5;
    if (!data || data.length < 2) return [];
    const pivots = [{ idx: 0, close: data[0].close }];
    let direction = null;
    let extHigh = data[0].close, extHighIdx = 0;
    let extLow  = data[0].close, extLowIdx  = 0;
    for (let i = 1; i < data.length; i++) {
      const c = data[i].close;
      if (c > extHigh) { extHigh = c; extHighIdx = i; }
      if (c < extLow)  { extLow = c;  extLowIdx = i; }
      if (direction === null) {
        const base = data[0].close;
        if ((extHigh - base) / base * 100 >= minPct) direction = 'up';
        else if ((base - extLow) / base * 100 >= minPct) direction = 'down';
      } else if (direction === 'up') {
        if ((extHigh - c) / extHigh * 100 >= minPct) {
          pivots.push({ idx: extHighIdx, close: extHigh });
          extLow = c; extLowIdx = i; direction = 'down';
        }
      } else {
        if ((c - extLow) / extLow * 100 >= minPct) {
          pivots.push({ idx: extLowIdx, close: extLow });
          extHigh = c; extHighIdx = i; direction = 'up';
        }
      }
    }
    pivots.push({ idx: data.length - 1, close: data[data.length - 1].close });
    const segments = [];
    for (let i = 1; i < pivots.length; i++) {
      const a = pivots[i - 1], b = pivots[i];
      if (a.idx === b.idx) continue;
      const change = (b.close - a.close) / a.close * 100;
      let kind = 'side';
      if (change >=  minPct) kind = 'up';
      if (change <= -minPct) kind = 'down';
      segments.push({ startDate: data[a.idx].date, endDate: data[b.idx].date, change, kind });
    }
    return segments;
  }

  function getYearChartOption(data) {
    if (!data || !data.length) return {};
    const text = cssVar('--text') || '#1a1a1a';
    const grid = cssVar('--chart-grid') || '#f0f0f0';
    const sec = cssVar('--text-secondary') || '#666';
    const green = cssVar('--green') || '#389e0d';
    const red = cssVar('--red') || '#cf1322';
    const accent = cssVar('--accent') || '#4758e0';
    const cardBg = cssVar('--card-bg') || '#fff';
    const border = cssVar('--border') || '#e8e8e8';
    const lineColor = cssVar('--sp500-line') || '#1a1a1a';
    const theme = { green, red, accent, sec, cardBg };

    const events = readTimelineEvents();
    function findCoord(targetDate) {
      for (const d of data) if (d.date >= targetDate) return [d.date, d.close];
      return null;
    }
    function findCoordReverse(targetDate) {
      let last = null;
      for (const d of data) { if (d.date > targetDate) break; last = d; }
      return last ? [last.date, last.close] : null;
    }

    const markPoints = events.map(ev => {
      const coord = findCoord(ev.date);
      if (!coord) return null;
      const c = colorForKind(ev.kind, theme);
      const isInfo = ev.kind === 'info';
      return {
        coord, name: ev.label, symbol: 'circle',
        symbolSize: ev.kind.includes('key') ? 12 : 9,
        itemStyle: {
          color: c.dot,
          borderColor: isInfo ? sec : (c.ring || cardBg),
          borderWidth: ev.kind.includes('key') ? 3 : 2,
          shadowBlur: ev.kind.includes('key') ? 6 : 0,
          shadowColor: ev.kind.includes('key') ? 'rgba(71,88,224,0.45)' : 'transparent',
        },
        label: {
          show: ev.showLabel, position: 'top', distance: 14,
          fontSize: 11, fontFamily: CHART_FONT,
          color: ev.kind.includes('down') ? red : ev.kind.includes('up') ? green : ev.kind === 'key' ? accent : sec,
          fontWeight: 600, backgroundColor: cardBg,
          padding: [2, 6], borderRadius: 3, borderColor: border, borderWidth: 1,
          formatter: ev.label,
        },
      };
    }).filter(Boolean);

    const markAreas = findTrendSegments(data, 5)
      .filter(seg => seg.kind !== 'side')
      .map(seg => {
        const bg = seg.kind === 'up' ? 'rgba(56,158,13,0.10)' : 'rgba(207,19,34,0.10)';
        return [{ xAxis: seg.startDate, itemStyle: { color: bg } }, { xAxis: seg.endDate }];
      });

    const eventByDate = new Map(events.map(ev => [ev.date, ev]));
    return {
      grid: { left: 50, right: 30, top: 64, bottom: 36 },
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: border } },
        axisLabel: {
          color: sec, fontFamily: CHART_FONT,
          formatter: function (value) {
            var d = new Date(value);
            return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
          },
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value', scale: true, name: 'S&P 500',
        nameTextStyle: { color: sec, fontFamily: CHART_FONT, fontSize: 11 },
        axisLine: { show: false },
        axisLabel: { color: sec, fontFamily: CHART_FONT },
        splitLine: { lineStyle: { color: grid } },
      },
      tooltip: {
        trigger: 'axis', backgroundColor: cardBg, borderColor: border,
        textStyle: { color: text, fontFamily: CHART_FONT },
        formatter: function (params) {
          const p = params[0];
          const date = p.value[0];
          const dateStr = typeof date === 'string' ? date : new Date(date).toISOString().slice(0, 10);
          let html = `${dateStr}<br/>S&P 500: <b>${p.value[1].toFixed(2)}</b>`;
          const ev = eventByDate.get(dateStr);
          if (ev) html += `<br/><span style="color:${sec};">Event: ${ev.label}</span>`;
          return html;
        },
      },
      series: [{
        name: 'S&P 500 Daily', type: 'line', smooth: false, showSymbol: false, sampling: 'lttb',
        data: data.map(d => [d.date, d.close]),
        lineStyle: { color: lineColor, width: 1.5 },
        itemStyle: { color: lineColor },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(26,26,26,0.10)' },
              { offset: 1, color: 'rgba(26,26,26,0)' },
            ],
          },
        },
        markPoint: { data: markPoints, silent: false },
        markArea: { silent: true, data: markAreas },
      }],
    };
  }

  // Exposed for theme-switch callbacks
  window.getYearChartOption = getYearChartOption;

  // ── Initialize the trend chart ──
  (function initChart() {
    const el = document.querySelector('[id^="chartYear"]');
    if (!el || !window.echarts) return;
    const year = el.id.replace('chartYear', '');
    const chart = echarts.init(el);
    window._yearChart = chart;
    window.addEventListener('resize', () => chart.resize());

    fetch(`${DATA_BASE}/year_data/${year}.json?v=${Date.now()}`)
      .then(r => r.json())
      .then(payload => {
        const series = (payload.series || []).filter(d => d && d.date && d.close != null);
        if (!series.length) return;
        window._yearData = series;
        chart.setOption(getYearChartOption(series));
      })
      .catch(err => console.warn('year chart load failed', err));
  })();

  // ── Render era context ──
  function escapeHTML(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function renderEra(era) {
    const titleEl = document.getElementById('eraTitle');
    const tagEl = document.getElementById('eraTagline');
    const contentEl = document.getElementById('eraContent');
    if (titleEl && era.title) titleEl.textContent = 'Era Context · ' + era.title;
    if (tagEl && era.tagline) tagEl.textContent = era.tagline;
    if (!contentEl) return;

    const parts = [];
    (era.sections || []).forEach(sec => {
      parts.push(`<h3>${escapeHTML(sec.heading)}</h3>`);
      if (sec.type === 'paragraphs') {
        (sec.body || []).forEach(p => parts.push(`<p>${p}</p>`));
      } else if (sec.type === 'list') {
        // Detect historical-facts section by heading
        const isHist = sec.heading && /key historical facts/i.test(sec.heading);
        if (isHist) {
          const items = (sec.items || []).map(it => {
            const date = it.date || it.strong || '';
            const title = it.title || '';
            const body = it.body || '';
            return `<li><div class="era-history-date">${date}</div><div class="era-history-content"><div class="era-history-title">${title}</div><div class="era-history-body">${body}</div></div></li>`;
          }).join('');
          parts.push(`<ul class="era-history-list">${items}</ul>`);
        } else {
          const items = (sec.items || []).map(it => {
            const lead = it.strong ? `<strong>${it.strong}</strong>: ` : '';
            return `<li>${lead}${it.body || ''}</li>`;
          }).join('');
          parts.push(`<ul>${items}</ul>`);
        }
      }
    });
    contentEl.innerHTML = parts.join('');
  }

  (function loadEra() {
    const section = document.querySelector('[data-era]');
    if (!section) return;
    const eraId = section.dataset.era;
    fetch(`${DATA_BASE}/era_data/${eraId}.json?v=${Date.now()}`)
      .then(r => r.json())
      .then(renderEra)
      .catch(err => {
        console.warn('era load failed', err);
        const el = document.getElementById('eraContent');
        if (el) el.innerHTML = '<p style="color:var(--text-secondary);">Era context failed to load</p>';
      });
  })();
})();

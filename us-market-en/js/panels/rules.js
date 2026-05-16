// panels/rules.js · Index methodology / constituent-change panels

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

export function initPanelChanges(data) {
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
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No matching constituent changes.</td></tr>`;
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
          <a class="source-link" href="${escapeHtml(change.sourceUrl)}" target="_blank" rel="noreferrer">Original announcement</a>
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
// Panel 13: Methodology
// ══════════════════════════════════════════════════════

export function initPanelRules(data) {
  document.getElementById('rulesHighlights').innerHTML = data.highlights.map(item => `
    <div class="highlight-card">
      <div class="highlight-label">${escapeHtml(item.label)}</div>
      <div class="highlight-value">${escapeHtml(item.value)}</div>
      <div class="highlight-detail">${escapeHtml(item.detail)}</div>
    </div>
  `).join('');

  const sectionsHtml = data.sections.map(section => `
    <article class="rule-card">
      <div class="mini-kicker">Methodology Note</div>
      <h3 class="rule-title">${escapeHtml(section.title)}</h3>
      <p class="rule-intro">${escapeHtml(section.intro)}</p>
      <ul class="rule-list">
        ${section.bullets.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
      </ul>
    </article>
  `).join('');

  const compareHtml = `
    <article class="rule-card">
      <div class="mini-kicker">Index Comparison</div>
      <h3 class="rule-title">How the S&P 500 differs from other core indices</h3>
      <p class="rule-intro">Placing the S&P 500 alongside other widely followed US equity benchmarks makes it easier to see why it serves as the default long-term gauge of the broad market.</p>
      <div class="compare-grid">
        ${data.comparison.map(item => `
          <div class="compare-card">
            <div class="compare-name">${escapeHtml(item.name)}</div>
            <div class="compare-meta">Coverage: ${escapeHtml(item.focus)}</div>
            <div class="compare-meta">Weighting: ${escapeHtml(item.weighting)}</div>
            <div class="compare-meta">Constituents: ${escapeHtml(item.count)}</div>
            <div class="compare-meta">${escapeHtml(item.note)}</div>
          </div>
        `).join('')}
      </div>
      <p class="mini-desc" style="margin-top:16px">
        Source:
        <a class="source-link" href="${escapeHtml(data.source.url)}" target="_blank" rel="noreferrer">${escapeHtml(data.source.name)} ${escapeHtml(data.source.version)}</a>
      </p>
    </article>
  `;

  document.getElementById('rulesSections').innerHTML = sectionsHtml + compareHtml;
}

// ══════════════════════════════════════════════════════
// Cross Panels: Nasdaq 100
// ══════════════════════════════════════════════════════

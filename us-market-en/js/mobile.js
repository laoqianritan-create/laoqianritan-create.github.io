// ══════════════════════════════════════════════════════
// mobile.js · Mobile adaptation helpers
// - isMobile(): breakpoint check (≤768px)
// - mobilePatch(option, opts): inject mobile overrides into an ECharts option
//   On desktop, returns the original option unchanged
// ══════════════════════════════════════════════════════

const MOBILE_MEDIA = '(max-width: 768px)';

export function isMobile() {
  return window.matchMedia(MOBILE_MEDIA).matches;
}

// Inject mobile defaults into axisLabel (font-size cap + hideOverlap)
function patchAxis(ax, minFont) {
  if (!ax) return ax;
  const axisLabel = ax.axisLabel ? { ...ax.axisLabel } : {};
  if ((axisLabel.fontSize ?? 12) > minFont) axisLabel.fontSize = minFont;
  if (axisLabel.hideOverlap === undefined) axisLabel.hideOverlap = true;
  return { ...ax, axisLabel };
}

/**
 * @param {Object} option  ECharts option
 * @param {Object} [opts]
 *   gridRight              — mobile override for grid.right (unchanged by default)
 *   gridLeft               — mobile override for grid.left (unchanged by default)
 *   axisLabelMinFont       — font-size cap for x/y axis labels (default 10)
 *   hideDenseLabels        — hide all markPoint labels (except those in the allowlist)
 *   keepLabels             — allowlist array: markPoint `name` values to keep
 *   shrinkKeptLabels       — shrink allowlisted markPoint labels to font-size 10
 */
export function mobilePatch(option, opts = {}) {
  if (!isMobile()) return option;
  const out = { ...option };

  // grid margins
  if (opts.gridRight != null || opts.gridLeft != null) {
    const patchGrid = (g) => {
      const ng = { ...g };
      if (opts.gridRight != null) ng.right = opts.gridRight;
      if (opts.gridLeft != null) ng.left = opts.gridLeft;
      return ng;
    };
    if (Array.isArray(out.grid)) out.grid = out.grid.map(patchGrid);
    else if (out.grid) out.grid = patchGrid(out.grid);
  }

  // axis labels
  const minFont = opts.axisLabelMinFont ?? 10;
  if (out.xAxis) {
    out.xAxis = Array.isArray(out.xAxis)
      ? out.xAxis.map((ax) => patchAxis(ax, minFont))
      : patchAxis(out.xAxis, minFont);
  }
  if (out.yAxis) {
    out.yAxis = Array.isArray(out.yAxis)
      ? out.yAxis.map((ax) => patchAxis(ax, minFont))
      : patchAxis(out.yAxis, minFont);
  }

  // markPoint filtering / font-size shrinking
  if (opts.hideDenseLabels || opts.shrinkKeptLabels) {
    const keep = new Set(opts.keepLabels || []);
    if (Array.isArray(out.series)) {
      out.series = out.series.map((s) => {
        if (!s?.markPoint || !Array.isArray(s.markPoint.data)) return s;
        let data = s.markPoint.data;
        if (opts.hideDenseLabels) {
          data = keep.size === 0 ? [] : data.filter((mp) => keep.has(mp.name));
        }
        if (opts.shrinkKeptLabels) {
          data = data.map((mp) =>
            keep.has(mp.name)
              ? { ...mp, label: { ...(mp.label || {}), fontSize: 10 } }
              : mp,
          );
        }
        return { ...s, markPoint: { ...s.markPoint, data } };
      });
    }
  }

  return out;
}

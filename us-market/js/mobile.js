// ══════════════════════════════════════════════════════
// mobile.js · 移动端适配工具
// - isMobile(): 断点判定（≤768px）
// - mobilePatch(option, opts): 给 ECharts option 注入 mobile 覆盖层
//   desktop 下直通返回原 option
// ══════════════════════════════════════════════════════

const MOBILE_MEDIA = '(max-width: 768px)';

export function isMobile() {
  return window.matchMedia(MOBILE_MEDIA).matches;
}

// 给 axisLabel 注入 mobile 默认（字号下限 + hideOverlap）
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
 *   gridRight              — mobile 下的 grid.right 覆盖（默认不动）
 *   gridLeft               — mobile 下的 grid.left 覆盖（默认不动）
 *   axisLabelMinFont       — x/y 轴 label 字号上限（默认 10）
 *   hideDenseLabels        — 隐藏所有 markPoint label（除白名单外）
 *   keepLabels             — 白名单数组：保留的 markPoint `name`
 *   shrinkKeptLabels       — 白名单内的 markPoint label 缩字号到 10
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

  // markPoint 过滤 / 缩字号
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

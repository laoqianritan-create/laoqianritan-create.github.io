// ══════════════════════════════════════════════════════
// panel-notes.js · 把图表下方的指标卡与数据注释整体折进面板底部的「看板说明」
// 老钱 2026-10-07 指令（模仿 A 股站 ashare 的 <details class="panel-notes"> 做法），
// 两问一答定的 **B 方案**：整条指标卡一起折——面板默认只剩图表＋「看板说明」按钮，
// 点开才看到指标卡与注释（与 A 股站完全一致）。
//   · .metric-strip（指标卡整条）→ 折叠区
//   · 独立说明块（VXN 五档解读表、编制方法卡、来源行、mini-desc 口径行）→ 折叠区
//   · 表格类数据（回撤表、成分表、热力图等）一律不动，必须留在页面上
//   · 导出图不再带这些注释（export-png.js 的 descs / extras 清零）
// 谁渲染的都收得动：installPanelNotes() 先折静态 DOM，再用 MutationObserver
// 等面板懒加载渲染完再折——同一段代码幂等，重复跑不会产生副本。
// ══════════════════════════════════════════════════════

const LABEL = (document.documentElement.lang || '').startsWith('zh') ? '看板说明' : 'Panel notes';

// 独立说明块：整块搬进折叠区（表格类内容绝不在这里，数据必须留着）
const BLOCK_SELECTORS = [
  '.vxn-explainer',     // VXN 五档解读表
  '.method-card',       // M7 编制方法卡
  '.chronicle-source',  // 编年史来源与口径行
  'p.mini-desc',        // 各面板的口径 / 更新时间小字行
  '.chart-band-note',   // 图下口径注
];

// 折叠区里的内容容器用 flex/网格布局才不塌，指标条沿用它自己的 .metric-strip 样式即可。
const STRIP_CLASS = 'metric-strip';

let applying = false;

function ensureBox(inner) {
  let box = inner.querySelector(':scope > .panel-notes');
  if (!box) {
    box = document.createElement('details');
    box.className = 'panel-notes';
    box.innerHTML = `<summary>${LABEL}</summary>`;
    inner.appendChild(box);
  }
  return box;
}

function dropBoxIfEmpty(inner) {
  const box = inner.querySelector(':scope > .panel-notes');
  if (!box) return;
  const hasContent = [...box.children].some(el => el.tagName !== 'SUMMARY');
  if (!hasContent) box.remove();
}

function foldPanel(panel) {
  const inner = panel.querySelector(':scope > .panel-inner');
  if (!inner) return;
  let folded = false;

  // 1) 指标卡整条
  inner.querySelectorAll(`:scope > .${STRIP_CLASS}`).forEach(strip => {
    if (strip.closest('.panel-notes') || !strip.innerHTML.trim()) return;
    ensureBox(inner).appendChild(strip);
    folded = true;
  });

  // 2) 独立说明块整体搬进去
  BLOCK_SELECTORS.forEach(sel => {
    inner.querySelectorAll(sel).forEach(el => {
      if (el.closest('.panel-notes') || !el.textContent.trim()) return;
      ensureBox(inner).appendChild(el);
      folded = true;
    });
  });

  if (folded) dropBoxIfEmpty(inner);
}

function foldAll(root = document) {
  root.querySelectorAll('section.panel').forEach(foldPanel);
}

// 静态 DOM 立刻折一次；之后任何面板懒加载渲染出的指标条/说明，由 observer 收口。
export function installPanelNotes() {
  foldAll(document);
  const obs = new MutationObserver(muts => {
    if (applying) return;
    const panels = new Set();
    for (const m of muts) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.closest?.('.panel-notes')) continue;
        const panel = node.closest?.('section.panel');
        if (panel) panels.add(panel);
      }
    }
    if (!panels.size) return;
    applying = true;
    try { panels.forEach(foldPanel); } finally { applying = false; }
  });
  obs.observe(document.body, { childList: true, subtree: true });
}

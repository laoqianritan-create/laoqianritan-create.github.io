// js/preview.js · 临时预览页 loader
//
// 2026-10-31：挂上情绪四件套（CNN 恐惧贪婪 / AAII 散户情绪 / NAAIM 敞口 / 痛苦指数）。
// 主站不动；老钱确认后按新模板上线规范 §7 迁主站并退役本页。
// us-asset-ladder 为上一批待迁面板，暂留。

import {
  initCnnFearGreedPanel,
  initAaiiPanel,
  initNaaimPanel,
  initMiseryPanel,
} from './panels/sentiment.js?v=20261031201552';
import { initUsAssetLadderPanel } from './panels/us_asset_ladder.js?v=20261031201552';
import { initExportButtons } from './export-png.js?v=20261031201552';

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} · ${url}`);
  return res.json();
}

async function main() {
  const tasks = [
    ['cnn', () => fetchJSON('data/cnn_fear_greed.json?v=20261031201552').then(initCnnFearGreedPanel)],
    ['aaii', () => fetchJSON('data/aaii_sentiment.json?v=20261031201552').then(initAaiiPanel)],
    ['naaim', () => fetchJSON('data/naaim_exposure.json?v=20261031201552').then(initNaaimPanel)],
    ['misery', () => Promise.all([
      fetchJSON('data/us_misery_index.json?v=20261031201552'),
      fetchJSON('data/us_recessions.json?v=20261031201552').catch(() => null),
    ]).then(([d, r]) => initMiseryPanel(d, r))],
    ['usAssetLadder', () => Promise.all([
      fetchJSON('data/us_asset_ladder.json?v=20261031201552'),
      fetchJSON('data/us_recessions.json?v=20261031201552'),
    ]).then(([d, r]) => initUsAssetLadderPanel(d, r))],
  ];

  // 逐块加载：单个面板挂了不拖垮其余面板
  for (const [name, task] of tasks) {
    try {
      await task();
    } catch (e) {
      console.error(`[preview] ${name} 加载失败:`, e);
    }
  }

  initExportButtons();
}

main();

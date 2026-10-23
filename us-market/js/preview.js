// js/preview.js · 临时预览页 loader（ch.112 起重建）
// 仅加载预览面板所需数据并初始化；主站不动。老钱确认后按 ch.110 模式迁主站并退役本页。
import { initUsAssetLadderPanel } from './panels/us_asset_ladder.js?v=20261023220834';
import { initExportButtons } from './export-png.js?v=20261023220834';

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} · ${url}`);
  return res.json();
}

async function main() {
  try {
    const [assetData, recessionData] = await Promise.all([
      fetchJSON('data/us_asset_ladder.json?v=20261023220834'),
      fetchJSON('data/us_recessions.json?v=20261023220834'),
    ]);
    initUsAssetLadderPanel(assetData, recessionData);
  } catch (e) {
    console.error('[preview] load failed:', e);
  }
  initExportButtons();
}

main();

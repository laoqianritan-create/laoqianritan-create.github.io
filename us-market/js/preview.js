// js/preview.js · 临时预览页初始化（2026-10-09 老钱定流程）
// 新面板先在 preview.html 过目 → 老钱确认 → 迁入 index.html 正式上线，本页随之删除。
// 扩展方式：preview.html 加 section（与主站同 id）→ 本文件 import 面板函数 → loaders 注册。
// 迁移后：老钱确认的面板迁入主站，此处同步删除其 section 与 loader。

import { initSectorRsPanel } from './panels/sector_rs.js?v=20261009151816';
import { initGeoCrisesPanel } from './panels/geo_crises.js?v=20261009151816';
import { installPanelNotes } from './panel-notes.js?v=20261009151816';
import { initDrawdownSuitePanel } from './panels/drawdown_suite.js?v=20261009151816';
import { initAthPathsPanel } from './panels/ath_paths.js?v=20261009151816';

const DATA = {
  price: 'data/sp500_price.json?v=20261009151816',
  drawdown: 'data/sp500_drawdowns.json?v=20261009151816',
  sectorRS: 'data/sp500_sector_rs.json?v=20261009151816',
  sectors: 'data/sp500_sectors.json?v=20261009151816',
  century: 'data/sp500_century.json?v=20261009151816',
  recessions: 'data/us_recessions.json?v=20261009151816',
};

const loaders = {
  'panel-sector-rs': async () => initSectorRsPanel(await load('sectorRS'), await load('sectors')),
  'panel-geo-crises': async () => initGeoCrisesPanel(await load('price'), await load('drawdown'), await load('century'), await load('recessions')),
  'panel-dd-suite': async () => initDrawdownSuitePanel(await load('price'), await load('drawdown')),
  'panel-ath-paths': async () => initAthPathsPanel(await load('price')),
};

async function load(key) {
  const res = await fetch(DATA[key]);
  if (!res.ok) throw new Error(`${DATA[key]} → HTTP ${res.status}`);
  return res.json();
}

async function boot() {
  const errEl = document.getElementById('previewError');
  try {
    for (const [id, fn] of Object.entries(loaders)) {
      if (document.getElementById(id)) await fn();
    }
  } catch (e) {
    console.error('[preview]', e);
    if (errEl) errEl.textContent = `数据加载失败：${e.message}`;
  }
}

boot();
// 看板说明折叠（与主站同一机制）：指标卡与 mini-desc 口径行折进「看板说明」
installPanelNotes();

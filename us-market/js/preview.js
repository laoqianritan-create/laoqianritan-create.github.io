// js/preview.js · 临时预览页初始化（2026-10-09 老钱定流程）
// 新面板先在 preview.html 过目 → 老钱确认 → 迁入 index.html 正式上线，本页随之删除。
// 扩展方式：preview.html 加 section（与主站同 id）→ 本文件 import 面板函数 → loaders 注册。

import { initMwewRatioPanel } from './panels/mwew_ratio.js?v=20261009134529';

const DATA = {
  price: 'data/sp500_price.json?v=20261009134529',
  equalWeight: 'data/sp500_equal_weight.json?v=20261009134529',
  drawdown: 'data/sp500_drawdowns.json?v=20261009134529',
};

const loaders = {
  'panel-mwew-ratio': async () => initMwewRatioPanel(await load('price'), await load('equalWeight'), await load('drawdown')),
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

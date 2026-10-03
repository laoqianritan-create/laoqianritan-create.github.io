/**
 * A股看板 · 公共工具
 *   AK_fetchJSON   : 加载 site/data 下的 JSON
 *   AK_exportPNG   : 把 canvas 导出为 3000px 高清 PNG
 *   AK_renderFreshness : 顶部数据新鲜度徽章
 *   AK.registerPanel : 面板注册表（main.js 统一调度）
 */
(function () {
  'use strict';

  const AK = window.AK = {};

  /** 加载 JSON（带缓存破坏参数） */
  AK.fetchJSON = async function (url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`加载失败 ${res.status}: ${url}`);
    return res.json();
  };

  /**
   * 把 canvas 内容导出为高清 PNG。
   * @param {HTMLCanvasElement} srcCanvas 屏幕上的 canvas
   * @param {number} targetPx 导出长边像素（默认 3000）
   * @param {string} filename 下载文件名
   * @param {Function} drawExport (canvas, scale) => void  离屏重绘函数（可选，不传则直接放大截屏）
   */
  AK.exportPNG = function (srcCanvas, targetPx, filename, drawExport) {
    return new Promise((resolve, reject) => {
      try {
        const w = srcCanvas.width, h = srcCanvas.height;
        const scale = targetPx / Math.max(w, h);
        const off = document.createElement('canvas');
        off.width = Math.round(w * scale);
        off.height = Math.round(h * scale);

        if (typeof drawExport === 'function') {
          drawExport(off, scale);
        } else {
          const ctx = off.getContext('2d');
          ctx.scale(scale, scale);
          ctx.drawImage(srcCanvas, 0, 0);
        }

        off.toBlob((blob) => {
          if (!blob) { reject(new Error('toBlob 失败')); return; }
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = filename;
          document.body.appendChild(a); a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 1200);
          resolve();
        }, 'image/png');
      } catch (e) { reject(e); }
    });
  };

  /** 绑定面板导出按钮：btn[data-canvas=xxx] → 找 canvas#xxx */
  AK.bindExportButtons = function (drawMap) {
    document.querySelectorAll('.js-export').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-canvas');
        const canvas = document.getElementById(id);
        if (!canvas) return;
        const orig = btn.textContent;
        btn.disabled = true; btn.textContent = '正在生成 3000px 高清图…';
        try {
          const fn = drawMap && drawMap[id];
          await AK.exportPNG(canvas, 3000, btn.getAttribute('data-name') || (id + '.png'), fn);
          btn.textContent = '✓ 已下载';
        } catch (e) {
          console.error(e);
          btn.textContent = '导出失败';
        }
        setTimeout(() => { btn.disabled = false; btn.textContent = orig; }, 1500);
      });
    });
  };

  /** 数据新鲜度徽章：给出一组 asOf 日期，取最新一个 */
  AK.renderFreshness = function (asOfList) {
    const strip = document.getElementById('freshnessStrip');
    if (!strip) return;
    const dates = (asOfList || []).filter(Boolean).map((s) => new Date(s + 'T00:00:00'));
    if (!dates.length) {
      strip.querySelector('.freshness-text').textContent = '数据日期未知';
      strip.classList.add('is-old');
      return;
    }
    const asOfDate = new Date(Math.max(...dates.map((d) => d.getTime())));
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((today - asOfDate) / 86400000);
    let tdDiff = 0;
    const cur = new Date(asOfDate);
    while (cur < today) {
      cur.setDate(cur.getDate() + 1);
      if (cur.getDay() !== 0 && cur.getDay() !== 6) tdDiff++;
    }
    let cls = '', status = '';
    if (tdDiff === 0) status = '最新';
    else if (tdDiff <= 2) status = `${tdDiff} 个交易日前`;
    else if (tdDiff <= 5) { cls = 'is-stale'; status = `${tdDiff} 个交易日前`; }
    else { cls = 'is-old'; status = `${tdDiff} 个交易日前 · 可能延迟`; }
    if (cls) strip.classList.add(cls);
    const fmt = `${asOfDate.getFullYear()}-${String(asOfDate.getMonth() + 1).padStart(2, '0')}-${String(asOfDate.getDate()).padStart(2, '0')}`;
    strip.querySelector('.freshness-text').innerHTML =
      `数据更新至 <b>${fmt}</b><span class="freshness-hint">· ${status} · 每交易日 16:00 自动刷新</span>`;
  };

  /** 面板注册表：{ panelId: async (container) => {...} } */
  const _panels = {};
  AK.registerPanel = function (panelId, fn) { _panels[panelId] = fn; };
  AK.getPanel = function (panelId) { return _panels[panelId]; };

  /** 数值格式化 */
  AK.fmtPct = function (v, digits = 1) { return (v === null || v === undefined || Number.isNaN(v)) ? '—' : `${Number(v).toFixed(digits)}%`; };
  AK.fmtNum = function (v, digits = 0) { return (v === null || v === undefined || Number.isNaN(v)) ? '—' : Number(v).toLocaleString('zh-CN', { maximumFractionDigits: digits }); };

  /** 颜色工具：红涨绿跌 */
  AK.colors = {
    red: '#E65A56', green: '#2FBF71', blue: '#5AAEF3', purple: '#6D61E4',
    ink: '#1A1A1A', gray: '#777777', light: '#BBBBBB', line: '#E8E8E8',
    // 数值 → 涨跌色（v 为涨跌幅/百分数，对称轴 0）
    gainLoss(v) {
      if (v > 0.001) return this.red;
      if (v < -0.001) return this.green;
      return this.gray;
    },
    // 热力图插值：-1 ~ 1 → 绿 → 白 → 红
    heat(t) {
      const x = Math.max(-1, Math.min(1, t));
      if (x < 0) { // 绿 → 白
        const k = x + 1; // 0..1
        return `rgb(${Math.round(47 + (255 - 47) * k)}, ${Math.round(191 + (255 - 191) * k)}, ${Math.round(113 + (255 - 113) * k)})`;
      }
      const k = 1 - x; // 1..0（白 → 红）
      return `rgb(${Math.round(255 - (255 - 230) * k)}, ${Math.round(255 - (255 - 90) * k)}, ${Math.round(255 - (255 - 86) * k)})`;
    }
  };

  /** 等待字体就绪 */
  AK.fontsReady = function () {
    if (document.fonts && document.fonts.ready) {
      return Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
    }
    return Promise.resolve();
  };
})();

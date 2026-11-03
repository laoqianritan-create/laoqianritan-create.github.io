// ══════════════════════════════════════════════════════
// panel-share.js · 每个看板一个可分享的真实链接（2026-11-03 ch.138）
// 背景：#panel-xxx 的 hash 不会发给服务器，知识星球等平台抓到的永远是
// <title>Big Picture</title>。这里给每个面板挂一个「复制链接」按钮，
// 复制出去的是 /p/<slug>/（scripts/build_panel_pages.py 生成，带自己的 title/og）。
// 同时在切换面板时同步 document.title，让会执行 JS 的抓取器也能读对。
// ══════════════════════════════════════════════════════

(function () {
  const isEN = (document.documentElement.lang || '').toLowerCase().startsWith('en');
  const L = isEN
    ? { copy: 'Copy link', copied: 'Link copied', manual: 'Copy this link:' }
    : { copy: '复制链接', copied: '已复制看板链接', manual: '复制这个链接：' };

  const BASE_TITLE = document.title;

  function siteRoot() {
    const anchor = document.querySelector('a.nav-summary, a.category-summary');
    if (anchor) return new URL('.', anchor.href).href;
    return new URL('.', location.href).href;
  }

  function panelUrl(slug) {
    return siteRoot() + 'p/' + slug + '/';
  }

  function toast(message) {
    let el = document.querySelector('.panel-share-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'panel-share-toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), 1800);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy') ? resolve() : reject(new Error('copy failed'));
      } catch (err) {
        reject(err);
      } finally {
        document.body.removeChild(ta);
      }
    });
  }

  function bind() {
    document.querySelectorAll('.panel[id^="panel-"]').forEach(panel => {
      const title = panel.querySelector('.panel-title');
      if (!title || title.querySelector('.panel-share-btn')) return;
      const slug = panel.id.replace(/^panel-/, '');

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'panel-share-btn';
      btn.textContent = L.copy;
      btn.title = L.copy;
      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        const url = panelUrl(slug);
        copyText(url).then(
          () => toast(L.copied),
          () => window.prompt(L.manual, url)
        );
      });
      // 按钮必须挂在 h2 外面（2026-11-03 老钱报障：导出的 PNG 标题变成
      // 「美国痛苦指数 复制链接」）。导出逻辑取 .panel-title 的 textContent，
      // 按钮留在 h2 里就会被当成标题的一部分。用一层 row 保住同一行的位置。
      const row = document.createElement('div');
      row.className = 'panel-title-row';
      title.parentNode.insertBefore(row, title);
      row.appendChild(title);
      row.appendChild(btn);
    });
  }

  // 切换面板时同步标签页标题：会执行 JS 的抓取器/浏览器都能读到看板名
  function syncTitle(panelId) {
    if (!panelId) return;
    const panel = document.getElementById(panelId);
    const h2 = panel && panel.querySelector('.panel-title');
    if (!h2) return;
    const text = h2.textContent.trim();
    document.title = text ? text + ' · ' + BASE_TITLE : BASE_TITLE;
  }

  function onNavClick(e) {
    const item = e.target.closest('.nav-item');
    if (item && item.dataset.panel) syncTitle(item.dataset.panel);
  }

  function fromHash() {
    const id = (location.hash || '').replace('#', '');
    if (id.startsWith('panel-')) syncTitle(id);
  }

  function init() {
    bind();
    fromHash();
    document.addEventListener('click', onNavClick, true);
    window.addEventListener('hashchange', fromHash);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

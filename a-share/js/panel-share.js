// ══════════════════════════════════════════════════════
// panel-share.js · 每个面板一个可分享的真实链接（2026-11-03）
// 背景：#panel-xxx 的 hash 不会发给服务器，知识星球等平台抓到的永远是
// 整站名「A股看板 · 老钱日日谈」。这里给每个面板挂一个「复制看板链接」按钮，
// 复制出去的是 /p/<slug>/（scripts/build_panel_pages.py 生成，带自己的 title/og）。
// 同时在切换面板时同步 document.title，让会执行 JS 的抓取器也能读对。
//
// 按钮挂在 .panel-actions 里、下载按钮左边：.panel-title 的文本是导出 PNG 的标题，
// 任何控件都不能进 h2（美股看板 2026-11-03 就踩过这个坑）。
// ══════════════════════════════════════════════════════

(function () {
  const BASE_TITLE = document.title;
  const SITE_NAME = 'A股看板';
  const LINK_ICON =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>' +
    '<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';

  function siteRoot() {
    const anchor = document.querySelector('a.nav-summary');
    if (anchor) return new URL('.', anchor.href).href;
    return new URL('.', location.href).href;
  }

  function panelUrl(slug) {
    return siteRoot() + 'p/' + slug + '/';
  }

  function toast(message) {
    let el = document.querySelector('.share-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'share-toast';
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
      if (panel.querySelector('.btn-share')) return;
      const actions = panel.querySelector('.panel-actions');
      if (!actions) return;
      const slug = panel.id.replace(/^panel-/, '');

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-share';
      btn.title = '复制看板链接';
      btn.setAttribute('aria-label', '复制看板链接');
      btn.innerHTML = LINK_ICON;
      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        const url = panelUrl(slug);
        copyText(url).then(
          () => toast('已复制看板链接'),
          () => window.prompt('复制这个链接：', url)
        );
      });

      const exportBtn = actions.querySelector('.js-export, .btn-download, .js-icon-export');
      if (exportBtn) actions.insertBefore(btn, exportBtn);
      else actions.appendChild(btn);
    });
  }

  // 切换面板时同步标签页标题：会执行 JS 的抓取器/浏览器都能读到看板名
  function syncTitle(panelId) {
    if (!panelId) {
      document.title = BASE_TITLE;
      return;
    }
    const panel = document.getElementById(panelId);
    const h2 = panel && panel.querySelector('.panel-title');
    if (!h2) return;
    const text = h2.textContent.trim();
    document.title = text ? text + ' · ' + SITE_NAME : BASE_TITLE;
  }

  function fromHash() {
    const id = (location.hash || '').replace('#', '');
    if (id.startsWith('panel-')) syncTitle(id);
  }

  function init() {
    bind();
    fromHash();
    window.addEventListener('hashchange', fromHash);
    document.addEventListener('click', e => {
      const link = e.target.closest('a[href^="#panel-"]');
      if (link) {
        const id = link.getAttribute('href').slice(1);
        setTimeout(() => syncTitle(id), 0);
      }
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/**
 * mobile-nav.js · 手机端顶部导航（≤768px）
 *
 * 做三件事：
 *   ① 顶栏右侧注入 ☰ 按钮
 *   ② 注入「目录」抽屉：分类 chips + 当前分类的全部面板（两列网格，当前项高亮）
 *   ③ 把原本在分类栏里的「中 | EN」搬进顶栏
 *
 * 为什么是独立脚本而不是塞进 nav.js：本站有三类页面 —— index（ES module 管线）、
 * 编年史年页（只加载 chronicle-year.js）、以及未来的独立页。写成无 import 的 IIFE，
 * 谁都能引一行就用，行为完全一致。
 *
 * 桌面端（>768px）一行都不动；DOM 全部由本脚本注入，脚本不在的页面保持原样式，
 * 不会因为 CSS 单方面改动而丢导航（`.mobile-nav-ready` 才是隐藏 #nav 的开关）。
 */
(function () {
  'use strict';

  var T = {
    title: '目录',
    close: '关闭',
    panels: function (n) { return '本类面板 · ' + n + ' 个'; },
    sections: function (n) { return '本节 · ' + n + ' 项'; },
  };

  var mq = window.matchMedia('(max-width: 768px)');
  var headerInner = document.querySelector('.header-inner');
  var nav = document.getElementById('nav');
  if (!headerInner || !nav) return;
  if (!nav.querySelector('.nav-item')) return;   // 没有任何面板导航，别注入空抽屉

  // ── ☰ 按钮 ──
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'navMenuBtn';
  btn.className = 'nav-menu-btn';
  btn.setAttribute('aria-label', T.title);
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">' +
    '<path d="M2 4h12M2 8h12M2 12h12"/></svg>';

  // ── 抽屉骨架 ──
  var drawer = document.createElement('div');
  drawer.id = 'navDrawer';
  drawer.className = 'nav-drawer';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-modal', 'true');
  drawer.setAttribute('aria-label', T.title);
  drawer.innerHTML =
    '<div class="nav-drawer-head">' +
      '<span class="nav-drawer-title">' + T.title + '</span>' +
      '<button class="nav-drawer-close" type="button" aria-label="' + T.close + '">✕</button>' +
    '</div>' +
    '<div class="nav-drawer-cats" id="navDrawerCats"></div>' +
    '<div class="nav-drawer-body">' +
      '<div class="nav-drawer-sec" id="navDrawerSec"></div>' +
      '<div class="nav-drawer-grid" id="navDrawerGrid"></div>' +
    '</div>';
  document.body.appendChild(drawer);

  var catsBox = drawer.querySelector('#navDrawerCats');
  var grid = drawer.querySelector('#navDrawerGrid');
  var sec = drawer.querySelector('#navDrawerSec');
  var srcTabs = Array.prototype.slice.call(document.querySelectorAll('.category-tab[data-category]'));

  // ── 当前分类 ──
  function currentCategory() {
    var tab = document.querySelector('.category-tab.active[data-category]');
    if (tab) return tab.dataset.category;
    var group = document.querySelector('.nav-group.active[data-category]');
    return group ? group.dataset.category : null;
  }

  // ── 重建抽屉内容 ──
  function renderCats() {
    catsBox.innerHTML = '';
    srcTabs.forEach(function (tab) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'category-tab' + (tab.classList.contains('active') ? ' active' : '');
      b.dataset.category = tab.dataset.category;
      b.textContent = tab.textContent.trim();
      b.addEventListener('click', function () {
        tab.click();          // index 页由 nav.js 接管；编年史年页是 <a>，直接跳转
        render();
      });
      catsBox.appendChild(b);
    });
    var act = catsBox.querySelector('.category-tab.active');
    if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  function renderPanels() {
    var cat = currentCategory();
    var items = cat
      ? Array.prototype.slice.call(document.querySelectorAll('.nav-group[data-category="' + cat + '"] .nav-item'))
      : [];
    sec.textContent = (srcTabs.length ? T.panels : T.sections)(items.length);
    grid.innerHTML = '';
    items.forEach(function (item) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'nav-drawer-item' + (item.classList.contains('active') ? ' active' : '');
      b.textContent = item.textContent.trim();
      b.addEventListener('click', function () {
        closeDrawer();
        item.click();       // nav.js 会接管跳转；没有 nav.js 的页面走原生锚点
      });
      grid.appendChild(b);
    });
    var actItem = grid.querySelector('.nav-drawer-item.active');
    if (actItem && actItem.scrollIntoView) actItem.scrollIntoView({ block: 'center', inline: 'nearest' });
  }

  function render() { renderCats(); renderPanels(); }

  // ── 开关 ──
  function openDrawer() {
    render();
    drawer.classList.add('open');
    document.body.classList.add('nav-drawer-open');
    btn.setAttribute('aria-expanded', 'true');
  }
  function closeDrawer() {
    drawer.classList.remove('open');
    document.body.classList.remove('nav-drawer-open');
    btn.setAttribute('aria-expanded', 'false');
  }

  btn.addEventListener('click', function () {
    if (drawer.classList.contains('open')) closeDrawer(); else openDrawer();
  });
  drawer.querySelector('.nav-drawer-close').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && drawer.classList.contains('open')) closeDrawer();
  });

  // ── 「中 | EN」搬进顶栏（仅当它原本在分类栏里；编年史年页本来就在顶栏，不动）──
  var langToggle = document.getElementById('langToggle');
  var langHome = null;
  (function recordLangHome() {
    var catInner = document.querySelector('.category-inner');
    if (langToggle && catInner && langToggle.parentElement === catInner) langHome = catInner;
  })();

  function syncLang() {
    if (!langToggle || !langHome) return;
    var want = mq.matches ? headerInner : langHome;
    if (langToggle.parentElement !== want) want.appendChild(langToggle);
  }

  // ── 断点联动：只在手机端生效 ──
  function sync() {
    var on = mq.matches;
    document.documentElement.classList.toggle('mobile-nav-ready', on);
    syncLang();
    headerInner.appendChild(btn);       // 永远挂在最后，保证在「中 / EN」右侧
    if (!on) closeDrawer();
  }

  sync();
  if (mq.addEventListener) mq.addEventListener('change', sync);
  else if (mq.addListener) mq.addListener(sync);
})();

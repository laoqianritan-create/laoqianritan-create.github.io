/**
 * mobile-nav.js · mobile top navigation (≤768px)
 *
 * Does three things:
 *   ① injects the ☰ button on the right of the top bar
 *   ② injects the "Contents" drawer: category chips + every panel of the
 *     current category as a two-column grid, with the active one highlighted
 *   ③ moves the 中 / EN switch out of the category bar into the top bar
 *
 * Why a standalone script instead of nav.js: the site has three page kinds —
 * index (ES-module pipeline), chronicle year pages (only chronicle-year.js),
 * and future standalone pages. As an import-free IIFE, any page can pull it in
 * with one line and get identical behaviour.
 *
 * Desktop (>768px) is untouched. All DOM is injected here, so pages that do not
 * include this script keep their existing styling and never lose navigation
 * because of a CSS-only change (`.mobile-nav-ready` is what hides #nav).
 */
(function () {
  'use strict';

  var T = {
    title: 'Contents',
    close: 'Close',
    panels: function (n) { return 'Panels in this section · ' + n; },
    sections: function (n) { return 'Sections on this page · ' + n; },
  };

  var mq = window.matchMedia('(max-width: 768px)');
  var headerInner = document.querySelector('.header-inner');
  var nav = document.getElementById('nav');
  if (!headerInner || !nav) return;
  if (!nav.querySelector('.nav-item')) return;   // no panel links → don't inject an empty drawer

  // ── ☰ button ──
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'navMenuBtn';
  btn.className = 'nav-menu-btn';
  btn.setAttribute('aria-label', T.title);
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">' +
    '<path d="M2 4h12M2 8h12M2 12h12"/></svg>';

  // ── drawer shell ──
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

  // ── current category ──
  function currentCategory() {
    var tab = document.querySelector('.category-tab.active[data-category]');
    if (tab) return tab.dataset.category;
    var group = document.querySelector('.nav-group.active[data-category]');
    return group ? group.dataset.category : null;
  }

  // ── rebuild drawer contents ──
  function renderCats() {
    catsBox.innerHTML = '';
    srcTabs.forEach(function (tab) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'category-tab' + (tab.classList.contains('active') ? ' active' : '');
      b.dataset.category = tab.dataset.category;
      b.textContent = tab.textContent.trim();
      b.addEventListener('click', function () {
        tab.click();          // index pages: handled by nav.js; chronicle pages: plain <a>, navigates
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
        item.click();       // nav.js handles the jump; pages without nav.js fall back to the native anchor
      });
      grid.appendChild(b);
    });
    var actItem = grid.querySelector('.nav-drawer-item.active');
    if (actItem && actItem.scrollIntoView) actItem.scrollIntoView({ block: 'center', inline: 'nearest' });
  }

  function render() { renderCats(); renderPanels(); }

  // ── open / close ──
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

  // ── move 中 / EN into the top bar (only when it lives in the category bar;
  //    chronicle year pages already have it in the header, so leave it alone) ──
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

  // ── breakpoint wiring: mobile only ──
  function sync() {
    var on = mq.matches;
    document.documentElement.classList.toggle('mobile-nav-ready', on);
    syncLang();
    headerInner.appendChild(btn);       // always last, so it sits right of 中 / EN
    if (!on) closeDrawer();
  }

  sync();
  if (mq.addEventListener) mq.addEventListener('change', sync);
  else if (mq.addListener) mq.addListener(sync);
})();

// panels/quotes.js · 「百年箴言」面板 —— BofA《The Longest Pictures》The long run in words
//
// 交互：页面顶部大字英文原句（上下半透明露出上一句/下一句），中部中文对照，
//       右下角作者；鼠标滚轮逐句切换（带节流 + 触摸滑动 + 键盘方向键）。
// 布局：每句高度自适应——offsets 动态测距，视口高度跟随当前句收放，短句不占长框。
// 数据：data/bofa_longest_pictures_quotes.json（手工维护，参考 sp500_rules.json 模式）。

import { escapeHtml } from '../utils.js?v=20261007110831';

export function initPanelQuotes(data) {
  const listEl = document.getElementById('quotesScroller');
  if (!listEl) return;

  const quotes = Array.isArray(data.quotes) ? data.quotes : [];
  if (!quotes.length) {
    listEl.innerHTML = '<div class="quotes-empty">暂无箴言数据。</div>';
    return;
  }

  // ── 渲染所有句子（当前句高亮，相邻句半透明，由 transform 驱动）──
  listEl.innerHTML = quotes.map((q, i) => {
    const byline = escapeHtml(q.author_zh || q.author_en || '');
    return `
      <figure class="quote-slide" data-idx="${i}">
        <blockquote class="quote-en">${escapeHtml(q.en)}</blockquote>
        <div class="quote-zh">${escapeHtml(q.zh)}</div>
        <figcaption class="quote-author">—— ${byline}</figcaption>
      </figure>`;
  }).join('');

  const slides = Array.from(listEl.querySelectorAll('.quote-slide'));
  const stage = listEl.closest('.quotes-stage') || listEl;
  const viewport = listEl.closest('.quotes-viewport') || listEl.parentElement;

  // ── 状态与切换 ──
  let current = 0;
  let animating = false;
  const ANIM_MS = 450;

  function clamp(i) { return Math.max(0, Math.min(quotes.length - 1, i)); }

  function peekPx() {
    const n = parseFloat(getComputedStyle(stage).getPropertyValue('--quote-peek'));
    return Number.isFinite(n) ? n : 40;
  }

  // 每句在 scroller 里的自然 offsetTop（高度自适应的步长）
  let offsets = [];
  function measure() {
    offsets = slides.map(el => el.offsetTop);
    // 横排（移动端）：视口高度由 applyTransform 按「当前句」收放——
    // 若这里取最高句设高，短句下方会出巨大留白（10/06 事故：留白返工根因）
    if (window.matchMedia('(max-width: 768px)').matches) return;
    const maxH = Math.max(...slides.map(el => el.offsetHeight));
    viewport.style.height = `${maxH + 2 * peekPx()}px`;
  }

  function applyTransform(animate = true) {
    if (!offsets.length) measure();
    const horizontal = window.matchMedia('(max-width: 768px)').matches;
    listEl.style.transition = animate ? `transform ${ANIM_MS}ms cubic-bezier(0.33, 0, 0.2, 1)` : 'none';
    // 竖排：translateY 按句顶偏移；横排：每句占满视口宽，translateX 按句序号
    listEl.style.transform = horizontal
      ? `translateX(${-current * 100}%)`
      : `translateY(${peekPx() - offsets[current]}px)`;
    // 视口高度统一在这里收放（两种模式）：短句收拢、长句展开，压掉下方留白
    viewport.style.height = horizontal
      ? `${slides[current].offsetHeight}px`
      : `${slides[current].offsetHeight + 2 * peekPx()}px`;
    slides.forEach((el, i) => {
      el.classList.toggle('is-active', i === current);
      el.classList.toggle('is-near', Math.abs(i - current) === 1);
    });
    const counter = document.getElementById('quotesCounter');
    if (counter) counter.textContent = `${current + 1} / ${quotes.length}`;
    document.querySelectorAll('#quotesDots .quote-dot').forEach((d, di) => {
      d.classList.toggle('active', di === current);
    });
  }

  function goTo(i) {
    const next = clamp(i);
    if (next === current) return;
    current = next;
    animating = true;
    applyTransform(true);
    window.setTimeout(() => { animating = false; }, ANIM_MS);
  }

  // ── 滚轮：带节流（一次手势只翻一句）──
  let wheelLocked = false;
  function onWheel(e) {
    // 顶部向上滚：放行给页面滚动
    if (e.deltaY < 0 && current === 0) return;
    e.preventDefault();
    if (wheelLocked || animating) return;
    if (Math.abs(e.deltaY) < 2) return;
    wheelLocked = true;
    goTo(current + (e.deltaY > 0 ? 1 : -1));
    window.setTimeout(() => { wheelLocked = false; }, 120);
  }

  // ── 触摸滑动：移动端为左右横滑（竖排改横排由 CSS 切换），桌面竖滑逻辑保留 ──
  // 布局模式在 resize/初始化时判定：<768px = 横排横滑（horizontal），否则竖排（vertical）
  let horizontal = false;

  let touchStart = null;      // {x, y}
  function onTouchStart(e) {
    horizontal = window.matchMedia('(max-width: 768px)').matches;
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  function onTouchEnd(e) {
    if (!touchStart) return;
    const dx = touchStart.x - e.changedTouches[0].clientX;
    const dy = touchStart.y - e.changedTouches[0].clientY;
    // 横滑模式：只认水平位移；竖滑模式：只认竖直位移（原行为）
    if (horizontal) {
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        goTo(current + (dx > 0 ? 1 : -1));
      }
    } else if (Math.abs(dy) > 36 && Math.abs(dy) > Math.abs(dx)) {
      goTo(current + (dy > 0 ? 1 : -1));
    }
    touchStart = null;
  }

  // ── 键盘方向键（仅面板在视口内时）──
  let inView = false;
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => { inView = entry.isIntersecting; });
  }, { threshold: 0.35 });
  io.observe(stage);

  function onKeyDown(e) {
    if (!inView) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); goTo(current + 1); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); goTo(current - 1); }
  }

  stage.addEventListener('wheel', onWheel, { passive: false });
  stage.addEventListener('touchstart', onTouchStart, { passive: true });
  stage.addEventListener('touchend', onTouchEnd, { passive: true });
  document.addEventListener('keydown', onKeyDown);

  // 底部进度点（可点击直达）
  const dots = document.getElementById('quotesDots');
  if (dots) {
    dots.innerHTML = quotes.map((_, i) =>
      `<button class="quote-dot" data-i="${i}" aria-label="第 ${i + 1} 句"></button>`).join('');
    dots.addEventListener('click', e => {
      const btn = e.target.closest('.quote-dot');
      if (btn) goTo(+btn.dataset.i);
    });
  }

  measure();
  applyTransform(false);

  // 花体 webfont 加载完成后英文行高会变 → 重算 offset；窗口尺寸变化同理
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { measure(); applyTransform(false); });
  }
  window.addEventListener('resize', () => { measure(); applyTransform(false); });

  // 来源：整个面板只显示一次（不进轮播）
  if (data.source && data.source.name && stage) {
    const srcEl = document.createElement('div');
    srcEl.className = 'quote-source';
    srcEl.textContent = `来源：${data.source.name}`;
    stage.appendChild(srcEl);
  }
}

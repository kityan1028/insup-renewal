/* =====================================================================
   Insup — slide-page runtime (business.html / careers.html)
   Load synchronously in <head> (before the slide fragments) so that
   window.InsupSite exists while the fragments' inline scripts run.
   The page itself is wired up on DOMContentLoaded.

   API (see prod/README.md):
     InsupSite.slides            array of <section class="slide"> (after init)
     InsupSite.current           index of the active slide (-1 before init)
     InsupSite.reduced           true when the visitor prefers reduced motion
     InsupSite.on('enter'|'leave', fn(slideEl, index, first))
     InsupSite.off(type, fn)
     InsupSite.go(keyOrIndex[, {smooth:false}])   'faq' | 's-faq' | '#s-faq' | 3 | element
     InsupSite.indexOf(keyOrIndex)  -> index or -1
     InsupSite.stageOf(slideEl, index) -> data-stage of the slide, else index % 3
     InsupSite.mountBg(effect[, opts]) -> InsupFX state; mounts the fixed background
     InsupSite.ready(fn)          run fn after init (immediately if already done)
   Events on each section:  slide:enter / slide:leave  (detail: {index, key, first})
   ===================================================================== */
(() => {
  'use strict';
  const doc = document, root = doc.documentElement;
  root.classList.add('js');

  const mq = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const handlers = { enter: [], leave: [] };
  const readyQ = [];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  let deck = null, lastGo = { idx: -1, t: 0 };
  /* while go() glides past several slides, only the destination gets 'enter' */
  let nav = { idx: -1, until: 0 }, navTimer = 0;
  /* slides glided past (never entered) get .is-passed so their data-rv content is visible instead of blank */
  let passed = [], passTimer = 0;
  const inView = el => { const d = deck.getBoundingClientRect(), r = el.getBoundingClientRect(); return r.bottom > d.top + 1 && r.top < d.bottom - 1; };
  function clearPassed() {
    clearTimeout(passTimer);
    if (deck) deck.classList.remove('is-gliding');
    if (!passed.length) return;
    /* off-screen ones go back to hidden (so they still play their entrance later); visible ones stay shown */
    passed = passed.filter(s => { if (inView(s)) return true; s.classList.remove('is-passed'); return false; });
  }
  function markPassed(from, to) {
    clearPassed();
    const lo = Math.min(from, to), hi = Math.max(from, to);
    for (let k = lo + 1; k < hi; k++) {
      const s = S.slides[k];
      if (s && !s.classList.contains('is-seen') && !s.classList.contains('is-passed')) { s.classList.add('is-passed'); passed.push(s); }
    }
    if (passed.length) deck.classList.add('is-gliding');
    passTimer = setTimeout(clearPassed, 3000);
  }
  const endNav = () => { clearPassed(); if (nav.idx < 0) return; nav.idx = -1; clearTimeout(navTimer); evaluate(); };

  const S = window.InsupSite = {
    slides: [], current: -1, reduced: !!mq.matches, deck: null, isReady: false,
    on(type, fn) { (handlers[type] = handlers[type] || []).push(fn); return S; },
    off(type, fn) { const a = handlers[type]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } return S; },
    ready(fn) { S.isReady ? fn(S) : readyQ.push(fn); return S; },
    keyOf(el) { return el && el.id ? el.id.replace(/^s-/, '') : ''; },
    indexOf(t) {
      if (typeof t === 'number') return t >= 0 && t < S.slides.length ? t : -1;
      if (t && t.nodeType === 1) return S.slides.indexOf(t.closest('.slide'));
      if (typeof t !== 'string') return -1;
      const id = t.replace(/^#/, ''), key = id.replace(/^s-/, '');
      return S.slides.findIndex(s => s.id === 's-' + key || s.id === id);
    },
    stageOf(el, i) {
      const v = el && el.dataset ? el.dataset.stage : undefined;
      return v !== undefined && v !== '' && !isNaN(+v) ? +v : (i % 3);
    },
    go(t, opts = {}) {
      const i = S.indexOf(t);
      if (i < 0 || !deck) return false;
      lastGo = { idx: i, t: performance.now() };
      const smooth = !(S.reduced || opts.smooth === false);
      if (smooth && Math.abs(i - S.current) > 1) {
        nav = { idx: i }; clearTimeout(navTimer); navTimer = setTimeout(endNav, 2200);
        if (S.current >= 0) markPassed(S.current, i);
      }
      deck.scrollTo({ top: S.slides[i].offsetTop, behavior: (S.reduced || opts.smooth === false) ? 'auto' : 'smooth' });
      return true;
    },
    mountBg, closeMenu: () => setMenu(false), closeTabs: () => setTabs(false)
  };
  const onMQ = e => { S.reduced = e.matches; root.classList.toggle('rm', e.matches); };
  root.classList.toggle('rm', S.reduced);
  if (mq.addEventListener) mq.addEventListener('change', onMQ); else if (mq.addListener) mq.addListener(onMQ);

  /* ---------- active slide ---------- */
  function emit(type, el, i, first) {
    el.dispatchEvent(new CustomEvent('slide:' + type, { detail: { index: i, key: S.keyOf(el), first } }));
    (handlers[type] || []).slice().forEach(fn => { try { fn(el, i, first); } catch (err) { console.error('InsupSite ' + type + ' handler', err); } });
  }
  function setCurrent(i) {
    if (i === S.current || i < 0) return;
    const prev = S.current;
    S.current = i;
    if (prev >= 0) { S.slides[prev].classList.remove('is-active'); emit('leave', S.slides[prev], prev, false); }
    const el = S.slides[i], first = !el.classList.contains('is-seen');
    el.classList.add('is-active', 'is-seen');
    doc.body.dataset.slide = S.keyOf(el);
    syncUI();
    emit('enter', el, i, first);
  }
  function evaluate() {
    if (!S.slides.length) return;
    const top = deck.getBoundingClientRect().top, mid = deck.clientHeight * 0.5;
    let idx = 0;
    for (let i = 0; i < S.slides.length; i++) {
      if (S.slides[i].getBoundingClientRect().top - top <= mid) idx = i; else break;
    }
    if (nav.idx >= 0) { if (idx !== nav.idx) return; nav.idx = -1; clearTimeout(navTimer); }
    setCurrent(idx);
  }

  /* ---------- dots ---------- */
  let dotsEl = null;
  function buildDots() {
    dotsEl = doc.getElementById('dots');
    if (!dotsEl) return;
    if (!dotsEl.getAttribute('aria-label')) dotsEl.setAttribute('aria-label', 'スライドの位置');
    dotsEl.innerHTML = S.slides.map((s, i) => {
      const t = esc(s.dataset.title || S.keyOf(s));
      return `<button type="button" data-i="${i}" aria-label="${t}"><span class="lbl" aria-hidden="true">${t}</span></button>`;
    }).join('');
    dotsEl.addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (b) S.go(+b.dataset.i); });
  }

  /* ---------- menu overlay ---------- */
  const PAGES = [['business.html', '企業様向けページ'], ['careers.html', '働きたい方向けページ'], ['index.html', 'トップ（入口）'], ['privacy.html', 'プライバシーポリシー']];
  let menu = null, menuBtn = null, menuOpen = false, menuTimer = 0;
  function buildMenu() {
    menu = doc.getElementById('menu'); menuBtn = doc.querySelector('.menu-btn');
    if (!menu || !menuBtn) return;
    const here = (location.pathname.split('/').pop() || 'index.html');
    let k = 0;
    const list = S.slides.length ? `<nav class="menu-main" aria-label="このページの項目"><ol class="menu-list" style="--rows:${Math.ceil(S.slides.length / 2)}">` + S.slides.map((s, i) =>
      `<li style="--i:${k++}"><a href="#${esc(s.id)}" data-i="${i}"><span class="n">${pad(i + 1)}</span><span>${esc(s.dataset.title || S.keyOf(s))}</span></a></li>`).join('') + '</ol></nav>' : '';
    const links = PAGES.map(([href, label]) =>
      `<li style="--i:${k++}"><a href="${href}"${href === here ? ' aria-current="page"' : ''}>${label}</a></li>`).join('');
    menu.innerHTML = `<div class="menu-in"><span class="eyebrow">MENU</span>${list}<div class="menu-side"><h3>PAGES</h3><ul class="menu-links">${links}</ul></div></div>`;
    menu.setAttribute('aria-hidden', 'true');
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.setAttribute('aria-controls', menu.id);
    menuBtn.addEventListener('click', () => setMenu(!menuOpen));
    menu.addEventListener('click', e => {
      const a = e.target.closest('a[data-i]');
      if (a) {
        e.preventDefault(); setMenu(false, true);
        const i = +a.dataset.i;
        S.go(i); history.replaceState(null, '', a.getAttribute('href'));
        focusSlide(S.slides[i]);
      }
      else if (e.target === menu) setMenu(false);
    });
  }
  /* move keyboard focus to a slide (temporary tabindex) so Tab continues from there, not from the top */
  function focusSlide(el) {
    if (!el) return;
    if (!el.hasAttribute('tabindex')) {
      el.setAttribute('tabindex', '-1');
      el.addEventListener('blur', () => el.removeAttribute('tabindex'), { once: true });
    }
    try { el.focus({ preventScroll: true }); } catch (_) { if (deck) deck.focus({ preventScroll: true }); }
    if (doc.activeElement !== el && deck) deck.focus({ preventScroll: true });
  }
  function setMenu(open, keepFocus) {
    if (!menu || open === menuOpen) return;
    menuOpen = open;
    clearTimeout(menuTimer);
    if (open) setTabs(false);
    doc.body.classList.toggle('menu-open', open);
    menu.classList.toggle('open', open);
    menu.setAttribute('aria-hidden', open ? 'false' : 'true');
    menuBtn.setAttribute('aria-expanded', String(open));
    const lbl = menuBtn.querySelector('.lbl'); if (lbl) lbl.textContent = open ? 'CLOSE' : 'MENU';
    [deck, dotsEl, tabbar].forEach(el => { if (el) el.inert = open; });
    if (open) {
      const cur = menu.querySelector('a[aria-current="true"]') || menu.querySelector('a');
      menuTimer = setTimeout(() => cur && cur.focus({ preventScroll: true }), 60);
    } else if (!keepFocus && menu.contains(doc.activeElement)) {
      menuBtn.focus({ preventScroll: true });
    }
  }

  /* ---------- bottom tab bar (bubbles) ---------- */
  let tabbar = null, tabsOpen = false;
  function buildTabs() {
    tabbar = doc.querySelector('.tabbar');
    if (!tabbar) return;
    const pin = tabbar.dataset.pin || '', pinLabel = tabbar.dataset.pinLabel || '';
    const items = (tabbar.dataset.items || '').split(',').map(s => s.trim()).filter(Boolean).map(s => {
      const c = s.indexOf(':'); return [s.slice(0, c).trim(), s.slice(c + 1).trim()];
    });
    const n = items.length;
    if (!tabbar.getAttribute('aria-label')) tabbar.setAttribute('aria-label', 'ページ内の移動');
    tabbar.innerHTML = '<div class="tb-dim"></div><div class="tb3"><div class="tb3-pop" id="tb-pop">' +
      items.map(([k, l], i) => `<button type="button" data-go="${esc(k)}" style="--i:${i};--r:${n - 1 - i}">${esc(l)}</button>`).join('') +
      `</div><div class="tb3-btn"><button type="button" class="tb-pin" data-go="${esc(pin)}">${esc(pinLabel)}</button>` +
      (n ? '<button type="button" class="tb3-up" data-tg aria-expanded="false" aria-controls="tb-pop" aria-label="ほかの項目を開く"><span aria-hidden="true">▲</span></button>' : '') +
      '</div></div>';
    tabbar.addEventListener('click', e => {
      const g = e.target.closest('[data-go]'), tg = e.target.closest('[data-tg]');
      if (g) { setTabs(false); S.go(g.dataset.go); }
      else if (tg) setTabs(!tabsOpen);
      else if (e.target.closest('.tb-dim')) setTabs(false);
    });
    const dim = tabbar.querySelector('.tb-dim');
    ['wheel', 'touchmove'].forEach(ev => dim.addEventListener(ev, () => setTabs(false), { passive: true }));
  }
  function setTabs(open) {
    if (!tabbar || open === tabsOpen) return;
    tabsOpen = open;
    tabbar.classList.toggle('open', open);
    const tg = tabbar.querySelector('[data-tg]');
    if (tg) { tg.setAttribute('aria-expanded', String(open)); tg.setAttribute('aria-label', open ? 'ほかの項目を閉じる' : 'ほかの項目を開く'); }
  }

  function syncUI() {
    const i = S.current, key = S.keyOf(S.slides[i]);
    if (dotsEl) dotsEl.querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-current', j === i ? 'true' : 'false'));
    if (menu) menu.querySelectorAll('a[data-i]').forEach(a => a.setAttribute('aria-current', +a.dataset.i === i ? 'true' : 'false'));
    if (tabbar) tabbar.querySelectorAll('[data-go]').forEach(b => b.classList.toggle('cur', b.dataset.go === key));
  }

  /* ---------- keyboard: one slide per key ---------- */
  function step(dir) {
    const now = performance.now();
    if (now - lastGo.t < 700 && lastGo.idx >= 0) return S.go(Math.max(0, Math.min(S.slides.length - 1, lastGo.idx + dir)));
    const el = S.slides[S.current]; if (!el) return;
    const top = deck.getBoundingClientRect().top, r = el.getBoundingClientRect(), vh = deck.clientHeight;
    const rt = r.top - top, rb = r.bottom - top;
    const beh = S.reduced ? 'auto' : 'smooth';
    /* a slide taller than the screen: move inside it first */
    if (dir > 0 && rb > vh + 4) return deck.scrollBy({ top: Math.min(vh * 0.85, rb - vh), behavior: beh });
    if (dir < 0 && rt < -4) return deck.scrollBy({ top: -Math.min(vh * 0.85, -rt), behavior: beh });
    const ni = S.current + dir;
    if (ni >= 0 && ni < S.slides.length) S.go(ni);
    else if (dir > 0) deck.scrollTo({ top: deck.scrollHeight, behavior: beh }); /* past the last slide → footer */
  }
  function onKey(e) {
    if (e.key === 'Escape') {
      if (menuOpen) { setMenu(false); e.preventDefault(); }
      else if (tabsOpen) { setTabs(false); e.preventDefault(); }
      return;
    }
    if (menuOpen || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || !S.slides.length) return;
    const t = e.target;
    if (t && t.closest && t.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[data-keys="native"]')) return;
    switch (e.key) {
      case 'ArrowDown': case 'PageDown': step(1); break;
      case 'ArrowUp': case 'PageUp': step(-1); break;
      case 'Home': S.go(0); break;
      case 'End': S.go(S.slides.length - 1); break;
      default: return;
    }
    e.preventDefault();
  }

  /* ---------- in-page links (#s-key) and deep links ---------- */
  function onClick(e) {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || a.closest('#menu')) return;
    const id = decodeURIComponent(a.getAttribute('href').slice(1));
    const i = S.indexOf(id);
    if (i < 0) return;
    e.preventDefault();
    setTabs(false);
    S.go(i);
    history.replaceState(null, '', '#' + S.slides[i].id);
  }
  function jumpToHash(smooth) {
    if (!location.hash) return false;
    let id = location.hash.slice(1);
    try { id = decodeURIComponent(id); } catch (_) { /* keep raw */ }
    const i = S.indexOf(id);
    if (i < 0) return false;
    S.go(i, { smooth });
    return true;
  }

  /* ---------- fixed 3D background ---------- */
  /* mountBg(effect, opts): effect = an InsupFX.FX name ('glass', 'network', …) or a function(st) like InsupFX.mount takes.
     opts.stage(el, i) → stage number (default InsupSite.stageOf); opts.host (default #bg); opts.onStage(st, stage, el, i). */
  function mountBg(effect, opts = {}) {
    const host = opts.host || doc.getElementById('bg');
    if (!host || !window.InsupFX || !window.THREE) { if (host) host.classList.add('is-ready'); return null; }
    let st;
    try { st = InsupFX.mount(host, effect, { hit: deck || doc.getElementById('deck') || doc.body }); }
    catch (err) { console.warn('background effect not started', err); return null; }
    requestAnimationFrame(() => requestAnimationFrame(() => host.classList.add('is-ready')));
    let rmTimer = 0;
    const settle = () => { /* reduced motion: let it settle into the new shape, then stop moving */
      if (!S.reduced) { st.enabled = true; return; }
      st.enabled = true; clearTimeout(rmTimer); rmTimer = setTimeout(() => { st.enabled = false; }, 2600);
    };
    const toStage = (el, i) => {
      const stage = (opts.stage || S.stageOf)(el, i);
      if (stage !== st.stage) st.next(stage);
      if (opts.onStage) opts.onStage(st, stage, el, i);
      settle();
    };
    S.on('enter', toStage);
    window.addEventListener('resize', () => { if (S.reduced) settle(); }); /* a resized canvas is blank until redrawn */
    if (S.current >= 0) toStage(S.slides[S.current], S.current); else settle();
    return st;
  }

  /* ---------- init ---------- */
  function init() {
    deck = S.deck = doc.getElementById('deck') || doc.querySelector('.deck');
    if (deck) {
      doc.body.classList.add('is-deck');
      if (!deck.hasAttribute('tabindex')) deck.tabIndex = -1;
      S.slides = [...deck.querySelectorAll('section.slide')].filter(s => !s.parentElement.closest('section.slide'));
    }
    buildDots(); buildMenu(); buildTabs();
    doc.addEventListener('keydown', onKey);
    doc.addEventListener('click', onClick);
    if (deck && S.slides.length) {
      const io = new IntersectionObserver(evaluate, { root: deck, rootMargin: '-49% 0px -49% 0px', threshold: 0 });
      S.slides.forEach(s => io.observe(s));
      jumpToHash(false);
      evaluate();
      window.addEventListener('hashchange', () => jumpToHash(true));
      deck.addEventListener('scrollend', endNav);
      ['wheel', 'touchstart'].forEach(ev => deck.addEventListener(ev, endNav, { passive: true }));
      /* fonts / images can shift layout a little: keep a deep-linked slide aligned until the visitor scrolls */
      let touched = false;
      ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(ev => window.addEventListener(ev, () => { touched = true; }, { once: true, passive: true }));
      window.addEventListener('load', () => { if (!touched) jumpToHash(false); evaluate(); });
      if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(() => { if (!touched) jumpToHash(false); });
      try { deck.focus({ preventScroll: true }); } catch (_) { /* ignore */ }
    }
    S.isReady = true;
    readyQ.splice(0).forEach(fn => { try { fn(S); } catch (err) { console.error('InsupSite.ready handler', err); } });
  }
  function safeInit() {
    try { init(); }
    catch (err) { /* never leave content hidden */ console.error('InsupSite init failed', err); root.classList.remove('js'); }
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', safeInit); else safeInit();
})();

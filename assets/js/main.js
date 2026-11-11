// Page choreography: opening sequence, the inspection lens, scroll-driven scenes,
// the horizontal briefing, and what happens when clearance comes through.

import { CONFIG } from './content.js';
import { renderFiles, startMosaics } from './files.js';
import { initClearance, isCleared } from './clearance.js';

const { gsap, ScrollTrigger, Lenis } = window;
const root = document.documentElement;
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
const wide = matchMedia('(min-width: 861px)');
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const pad = (n, l = 2) => String(n).padStart(l, '0');

// --- text effects -----------------------------------------------------------

const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789/#<>';
function scramble(el, { duration = 0.9, delay = 0, text } = {}) {
  const final = text ?? el.dataset.final ?? el.textContent;
  el.dataset.final = final;
  if (reduced || !gsap) { el.textContent = final; return; }
  const o = { p: 0 };
  gsap.to(o, {
    p: 1, duration, delay, ease: 'power2.out',
    onStart() { el.textContent = final.replace(/\S/g, ' '); },
    onUpdate() {
      const shown = Math.floor(o.p * final.length);
      let s = final.slice(0, shown);
      for (let i = shown; i < final.length; i++) s += final[i] === ' ' ? ' ' : (i - shown < 5 ? GLYPHS[(Math.random() * GLYPHS.length) | 0] : ' ');
      el.textContent = s;
    },
    onComplete() { el.textContent = final; },
  });
}

function splitWords(el, cls) {
  // Wraps each word in a span, keeping inline tags such as <em> intact.
  const out = [];
  const walk = (node) => {
    [...node.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
          const s = document.createElement('span'); s.className = cls; s.textContent = part; frag.appendChild(s); out.push(s);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1) walk(n);
    });
  };
  walk(el);
  return out;
}

function slam(el, { delay = 0, shake } = {}) {
  if (reduced || !el) return;
  const r = Number(gsap.getProperty(el, 'rotation')) || 0;
  gsap.fromTo(el, { scale: 2.7, opacity: 0, rotation: r - 9 }, {
    scale: 1, opacity: 1, rotation: r, duration: 0.34, delay, ease: 'power3.in',
    onComplete() {
      if (shake) gsap.fromTo(shake, { x: 0, y: 0 }, { keyframes: [{ x: -4, y: 3 }, { x: 3, y: -2 }, { x: -2, y: 1 }, { x: 0, y: 0 }], duration: 0.3, ease: 'none', clearProps: 'transform' });
    },
  });
}

// --- boot -------------------------------------------------------------------

async function start() {
  const filesCount = renderFiles($('#files-list'));
  $$('[data-files-count]').forEach((el) => { el.textContent = pad(filesCount); });
  if (!CONFIG.demoUrl) $$('[data-demo-link]').forEach((a) => { a.hidden = true; a.style.display = 'none'; });
  startMosaics(reduced);

  if (!gsap) { root.classList.remove('is-loading'); $('.boot')?.remove(); initClearance(); return; }
  gsap.registerPlugin(ScrollTrigger);
  gsap.config({ nullTargetWarn: false });

  // Smooth scrolling
  let lenis = null;
  if (!reduced && Lenis) {
    lenis = new Lenis({ lerp: 0.105, wheelMultiplier: 1 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  const scrollTo = (y, opts = {}) => {
    if (lenis) lenis.scrollTo(y, { duration: 1.5, easing: (t) => 1 - Math.pow(1 - t, 4), ...opts });
    else if (typeof y === 'number') window.scrollTo({ top: y });
    else y.scrollIntoView();
  };

  // --- measurements ---
  const els = {
    stage: $('.gl'), hero: $('.hero'), brief: $('.brief'), briefText: $('.brief__text'),
    record: $('.record'), recView: $('.record__view'), sheet: $('.sheet'),
    files: $('.files'), track: $('#files-track'), filesBar: $('[data-files-bar]'),
    bar: $('.bar'), lens: $('.lens'), lensXY: $('[data-lens-xy]'),
    hud: $('.hud'), foot: $('.foot'),
    hudN: $('[data-hud-n]'), hudName: $('[data-hud-name]'), hudBar: $('[data-hud-bar]'),
  };
  const stages = $$('li.stage', els.record);
  const ticks = $$('.record__ticks i');
  const sheets = $$('[data-sheet]');
  const navLinks = $$('.bar__nav a');
  const M = { vw: 1, vh: 1, recTop: 0, recLen: 1, filesTop: 0, filesDist: 0, docH: 1, sheetTops: [], rec: { sx: 0, sy: 0, dist: 1 }, hero: { sx: 0, sy: 0, dist: 1 } };
  const docTop = (el) => el.getBoundingClientRect().top + window.scrollY;

  let scene = null;
  function measure() {
    M.vw = window.innerWidth; M.vh = window.innerHeight;
    if (wide.matches) {
      els.files.style.removeProperty('--files-h');
      M.filesDist = Math.max(0, els.track.scrollWidth - M.vw);
      els.files.style.setProperty('--files-h', `${M.filesDist + M.vh}px`);
    } else {
      M.filesDist = 0; els.files.style.removeProperty('--files-h'); els.track.style.transform = '';
    }
    M.recTop = docTop(els.record); M.recLen = els.record.offsetHeight - M.vh;
    M.filesTop = docTop(els.files);
    M.docH = document.documentElement.scrollHeight;
    M.footTop = docTop(els.foot);
    M.sheetTops = sheets.map(docTop);

    // Where the model should sit, and how far back the camera has to be to fit there
    const fit = (rw, rh) => Math.max(45.5 * M.vh / rw, 27 * M.vh / rh) / 40;
    const v = els.recView, pin = v.parentElement;
    const cx = v.offsetLeft + v.offsetWidth / 2, cy = v.offsetTop + v.offsetHeight / 2;
    M.rec = { sx: (cx - M.vw / 2) / M.vw, sy: (cy - M.vh / 2) / M.vh, dist: fit(v.offsetWidth, v.offsetHeight) * 1.16, pin };
    M.hero = wide.matches
      ? { sx: 0.23, sy: -0.09, dist: fit(M.vw * 0.6, M.vh * 0.8) }
      : { sx: 0, sy: -0.215, dist: fit(M.vw * 0.96, M.vh * 0.3) };
    scene?.setSize(M.vw, M.vh);
  }

  // --- scene ---
  try {
    const { createScene } = await import('./scene.js');
    scene = createScene({ canvas: $('#scene'), labels: $('#scene-labels') });
  } catch (err) {
    root.classList.add('no-webgl');
    console.warn('3D scene unavailable:', err);
  }
  measure();

  const HERO = { ground: 0, shell: 0, roof: 0, roofLift: 0, roofA: 1, interior: 1, plates: 0.85, tags: 0, equip: 1, ducts: 1, dims: 0, plan: 0, az: -1.25, el: 0.34, dist: 47 };
  const REC = { ground: 0, shell: 0, roof: 0, roofLift: 0, roofA: 1, interior: 0, plates: 0, tags: 0, equip: 0, ducts: 0, dims: 0, plan: 0, az: -0.92, el: 0.36, dist: 40 };
  const view = { time: 0, lens: { x: -999, y: -999, r: 0 }, reveal: 0, shiftX: 0, shiftY: 0, lensLook: true };
  const fx = { stageIn: 0, lensIn: 0, revealBase: isCleared() ? 1 : 0 };

  // The five workspaces, one second of timeline each
  const rec = gsap.timeline({ paused: true, defaults: { ease: 'power2.inOut' } });
  rec.to(REC, { ground: 1, duration: 0.34, ease: 'none' }, 0.0)
    .to(REC, { shell: 1, duration: 0.5, ease: 'none' }, 0.08)
    .to(REC, { roof: 1, duration: 0.36, ease: 'none' }, 0.4)
    .to(REC, { dims: 1, duration: 0.2 }, 0.5)
    .to(REC, { az: -0.62, duration: 1, ease: 'none' }, 0)
    // Loads
    .to(REC, { roofLift: 1, roofA: 0.12, duration: 0.5 }, 1.0)
    .to(REC, { dims: 0, duration: 0.2 }, 1.0)
    .to(REC, { interior: 1, duration: 0.4, ease: 'none' }, 1.12)
    .to(REC, { plates: 1, duration: 0.5, ease: 'none' }, 1.26)
    .to(REC, { tags: 1, duration: 0.25 }, 1.5)
    .to(REC, { el: 0.66, az: -0.46, dist: 37, duration: 1 }, 1.0)
    // Equipment
    .to(REC, { equip: 1, duration: 0.6, ease: 'none' }, 2.06)
    .to(REC, { tags: 0, plates: 0.3, duration: 0.3 }, 2.0)
    .to(REC, { az: -1.06, el: 0.48, dist: 35, duration: 1 }, 2.0)
    // Ducts
    .to(REC, { ducts: 1, duration: 0.78, ease: 'none' }, 3.04)
    .to(REC, { az: -0.3, el: 0.78, dist: 36, duration: 1 }, 3.0)
    // Reports
    .to(REC, { plan: 1, roofA: 0, duration: 0.7 }, 4.0)
    .to(REC, { az: 0, el: 1.56, dist: 41, plates: 0.85, tags: 1, dims: 1, duration: 0.8 }, 4.0)
    .set({}, {}, 5);

  // --- lens ---
  const lens = { x: M.vw * 0.68, y: M.vh * 0.42, tx: M.vw * 0.68, ty: M.vh * 0.42, r: 0, moved: false, tight: false, nx: 0, ny: 0, snx: 0, sny: 0 };
  window.addEventListener('pointermove', (e) => {
    lens.tx = e.clientX; lens.ty = e.clientY; lens.moved = true; lens.last = performance.now();
    lens.nx = e.clientX / M.vw - 0.5; lens.ny = e.clientY / M.vh - 0.5;
    lens.tight = Boolean(e.target.closest?.('a, button, input, label'));
  }, { passive: true });

  // --- anchors ---
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || a.hasAttribute('data-open-terms')) return;
    let id = a.getAttribute('href');
    if (a.hasAttribute('data-cta') && isCleared()) id = '#classified';
    if (id === '#' || id.length < 2) { e.preventDefault(); return; }
    const t = $(id);
    if (!t) return;
    e.preventDefault();
    if (id === '#top') return scrollTo(0);
    const offset = t.classList.contains('record') || t.classList.contains('files') ? 0 : -(els.bar.offsetHeight * 0.4);
    scrollTo(docTop(t) + offset + (t.classList.contains('record') ? M.recLen * 0.06 : 0));
  });
  $$('.stage__head').forEach((b) => b.addEventListener('click', () => scrollTo(M.recTop + ((Number(b.dataset.stage) + 0.66) / 5) * M.recLen)));

  // --- tapes ---
  const tapes = $$('[data-tape]').map((run) => {
    const words = run.dataset.tapeText ? [run.dataset.tapeText] : ['Top secret', 'Clearance required', 'Do not distribute'];
    const unit = words.map((w) => `<span>${w}</span>`).join('');
    run.innerHTML = unit;
    const reps = Math.max(2, Math.ceil((window.innerWidth * 1.4) / Math.max(1, run.scrollWidth)) + 1);
    run.innerHTML = unit.repeat(reps * 2);
    return { run, dir: Number(run.dataset.tape) || 1, x: 0, half: 0 };
  });
  const measureTapes = () => tapes.forEach((t) => { t.half = t.run.scrollWidth / 2; });

  // --- brief ---
  const briefWords = splitWords(els.briefText, 'w');
  const briefState = briefWords.map(() => -1);

  // --- reveal on scroll ---
  if (!reduced) {
    const rise = (targets, trigger, vars = {}) => gsap.from(targets, { y: 44, opacity: 0, duration: 1.2, ease: 'expo.out', stagger: 0.09, scrollTrigger: { trigger, start: 'top 80%', once: true }, ...vars });
    rise('.brief .eyebrow', '.brief');
    rise(['.record .eyebrow', '.record__title', '.record__intro', '.record__stages'], '.record', { scrollTrigger: { trigger: '.record', start: 'top 55%', once: true } });
    rise('.files__intro > *', '.files', { scrollTrigger: { trigger: '.files', start: 'top 60%', once: true } });
    gsap.from('.memo__sheet', { y: 160, rotation: -8, opacity: 0, duration: 1.5, ease: 'expo.out', scrollTrigger: { trigger: '.memo', start: 'top 72%', once: true } });
    gsap.from('[data-memo-line]', { y: 26, opacity: 0, duration: 1, ease: 'expo.out', stagger: 0.12, scrollTrigger: { trigger: '.memo__body', start: 'top 78%', once: true } });
    gsap.fromTo('.memo__pull mark', { '--hl': '0%' }, { '--hl': '100%', duration: 1.1, ease: 'power3.inOut', scrollTrigger: { trigger: '.memo__pull', start: 'top 68%', once: true } });
    ScrollTrigger.create({ trigger: '.memo__sheet', start: 'top 45%', once: true, onEnter: () => slam($('.memo__stamp')) });
    gsap.set('.memo__stamp', { opacity: 0 });
    rise(['.gate .eyebrow', '.gate__steps li'], '.gate');
    const gw = $$('.gate__title > span').flatMap((s) => splitWords(s, 'wd-in'));
    gw.forEach((w) => { const m = document.createElement('span'); m.className = 'wd'; w.replaceWith(m); m.appendChild(w); });
    gsap.from('.gate__title .wd > span', { yPercent: 115, duration: 1.3, ease: 'expo.out', stagger: 0.08, scrollTrigger: { trigger: '.gate', start: 'top 72%', once: true } });
    gsap.from('.gate__card', { y: 90, opacity: 0, rotation: 2.5, duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: '.gate', start: 'top 66%', once: true } });
    rise('.foot__row > *', '.foot__row', { scrollTrigger: { trigger: '.foot__row', start: 'top 92%', once: true } });
  }

  // --- magnetic buttons ---
  if (finePointer && !reduced) {
    $$('[data-magnetic]').forEach((b) => {
      b.addEventListener('pointermove', (e) => {
        const r = b.getBoundingClientRect();
        gsap.to(b, { x: (e.clientX - r.left - r.width / 2) * 0.22, y: (e.clientY - r.top - r.height / 2) * 0.32, duration: 0.5, ease: 'power3.out' });
      });
      b.addEventListener('pointerleave', () => gsap.to(b, { x: 0, y: 0, duration: 0.9, ease: 'elastic.out(1, 0.4)' }));
    });
  }

  // --- clearance ---
  const gate = initClearance({
    onGrant(apply) {
      if (reduced) { apply(); fx.revealBase = 1; refresh(); return; }
      const sweep = document.createElement('div');
      sweep.className = 'sweep'; sweep.innerHTML = '<b></b><i></i>';
      document.body.appendChild(sweep);
      gsap.timeline({ onComplete: () => sweep.remove() })
        .fromTo(sweep.firstChild, { scaleY: 0 }, { scaleY: 1, duration: 0.95, ease: 'power2.inOut' }, 0)
        .fromTo(sweep.lastChild, { y: 0 }, { y: () => window.innerHeight, duration: 0.95, ease: 'power2.inOut' }, 0)
        .add(() => {
          apply();
          $$('.status .when-cleared, .hero__meta .when-cleared').forEach((el) => scramble(el, { duration: 0.8 }));
          refresh();
        }, 0.42)
        .to(sweep, { opacity: 0, duration: 0.5 }, 0.95);
      gsap.to(fx, { revealBase: 1, duration: 2.2, ease: 'power2.inOut' });
    },
    onReset() { gsap.to(fx, { revealBase: 0, duration: 0.8 }); refresh(); scrollTo(0); },
  });
  function refresh() { requestAnimationFrame(() => { measure(); measureTapes(); ScrollTrigger.refresh(); }); }

  // --- per-frame ---
  let lastY = window.scrollY, stageIdx = -1, sheetIdx = -1, pS = 0, navIdx = -2, frame = 0;
  const camState = {};
  function tick(time) {
    const sy = window.scrollY, dy = sy - lastY, { vw, vh } = M;
    frame++;

    // top bar
    els.bar.classList.toggle('is-solid', sy > 24);
    if (Math.abs(dy) > 4) els.bar.classList.toggle('is-hidden', dy > 0 && sy > vh * 0.5);

    // which look is the stage showing
    const heroVis = 1 - smooth((sy - vh * 0.12) / (vh * 0.8));
    const recMode = sy > M.recTop - vh * 0.85;
    const recIn = smooth((sy - (M.recTop - vh * 0.85)) / (vh * 0.7));
    const recOut = 1 - smooth((sy - (M.recTop + M.recLen)) / (vh * 0.55));
    const alpha = (recMode ? recIn * recOut : heroVis) * fx.stageIn;

    // workflow progress
    const p = clamp((sy - M.recTop) / M.recLen);
    pS += (p - pS) * (reduced ? 1 : 0.14);
    if (Math.abs(p - pS) < 0.0004) pS = p;
    rec.progress(pS);
    const idx = Math.min(4, Math.floor(p * 5 + 0.0001));
    if (idx !== stageIdx) {
      stageIdx = idx;
      stages.forEach((s, i) => s.classList.toggle('is-active', i === idx));
      els.record.style.setProperty('--stage', idx);
    }
    if (recMode && alpha > 0) {
      stages.forEach((s, i) => s.style.setProperty('--fill', i === idx ? clamp(p * 5 - i).toFixed(3) : 0));
      ticks.forEach((t, i) => t.style.setProperty('--f', clamp(p * 5 - i).toFixed(3)));
      els.sheet.style.setProperty('--plan', REC.plan.toFixed(3));
    }

    // lens
    const cleared = fx.revealBase > 0.5;
    // Until someone takes hold of it (and again after a touch ends) the lens wanders over the house
    if (!lens.moved || (!finePointer && performance.now() - lens.last > 1800)) {
      const c = wide.matches ? [0.7, 0.4] : [0.5, 0.29];
      lens.tx = vw * (c[0] + Math.cos(time * 0.55) * 0.085); lens.ty = vh * (c[1] + Math.sin(time * 0.8) * 0.07);
    }
    lens.x += (lens.tx - lens.x) * 0.16; lens.y += (lens.ty - lens.y) * 0.16;
    lens.snx += (lens.nx - lens.snx) * 0.05; lens.sny += (lens.ny - lens.sny) * 0.05;
    const baseR = clamp(vw * 0.105, 92, 178);
    const targetR = recMode || cleared ? 0 : baseR * (1 - smooth(sy / (vh * 0.42))) * fx.lensIn * (lens.tight ? 0.55 : 1);
    lens.r += (targetR - lens.r) * 0.14;
    if (lens.r < 0.6 || recMode) lens.r = 0;
    els.lens.style.opacity = clamp((lens.r - 24) / 40).toFixed(3);
    if (lens.r > 0) {
      els.lens.style.transform = `translate3d(${lens.x.toFixed(1)}px, ${lens.y.toFixed(1)}px, 0)`;
      els.lens.style.setProperty('--r', `${lens.r.toFixed(1)}px`);
      if (frame % 4 === 0) els.lensXY.textContent = `X ${pad(Math.round(lens.x), 4)} · Y ${pad(Math.round(lens.y), 4)}`;
    }

    // scene
    els.stage.style.opacity = alpha.toFixed(3);
    if (scene && alpha > 0.004) {
      const s = recMode ? REC : HERO, place = recMode ? M.rec : M.hero;
      const sway = reduced ? 0 : 1 - (recMode ? REC.plan : 0);
      Object.assign(camState, s);
      camState.az = s.az + (Math.sin(time * 0.22) * 0.06 + lens.snx * 0.16) * sway;
      camState.el = s.el + (Math.sin(time * 0.17) * 0.012 - lens.sny * 0.05) * sway;
      camState.dist = s.dist * place.dist;
      view.time = time; view.lens.x = lens.x; view.lens.y = lens.y; view.lens.r = lens.r;
      view.reveal = recMode ? 1 : fx.revealBase;
      view.lensLook = !recMode;
      view.shiftX = place.sx; view.shiftY = place.sy;
      scene.render(camState, view);
    }

    // horizontal briefing
    if (M.filesDist > 0) {
      const pf = clamp((sy - M.filesTop) / M.filesDist);
      els.track.style.transform = `translate3d(${(-pf * M.filesDist).toFixed(1)}px, 0, 0)`;
      els.filesBar.style.transform = `scaleX(${pf.toFixed(4)})`;
    }

    // brief: words come into focus as you read
    const br = els.briefText.getBoundingClientRect();
    if (br.top < vh && br.bottom > 0 && !reduced) {
      const prog = clamp((vh * 0.86 - br.top) / (br.height + vh * 0.34)), n = briefWords.length;
      briefWords.forEach((w, i) => {
        const o = Math.round((0.14 + 0.86 * clamp(prog * (n + 6) - i)) * 50) / 50;
        if (o !== briefState[i]) { briefState[i] = o; w.style.opacity = o; }
      });
    }

    // tapes drift, faster with the scroll
    const vel = lenis ? lenis.velocity : dy;
    tapes.forEach((t) => {
      if (!t.half) return;
      t.x = (t.x + t.dir * (0.5 + Math.abs(vel) * 0.35) * (reduced ? 0 : 1)) % t.half;
      const x = t.dir > 0 ? -((t.x + t.half) % t.half) : -t.half + ((-t.x + t.half) % t.half);
      t.run.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0)`;
    });

    // sheet counter + nav
    let si = 0;
    for (let i = 0; i < M.sheetTops.length; i++) if (sy + vh * 0.5 >= M.sheetTops[i]) si = i;
    if (si !== sheetIdx) {
      sheetIdx = si;
      els.hudN.textContent = pad(si + 1);
      scramble(els.hudName, { text: sheets[si].dataset.sheet, duration: 0.6 });
      const id = sheets[si].id;
      const ni = navLinks.findIndex((a) => a.getAttribute('href') === `#${id}`);
      if (ni !== navIdx) { navIdx = ni; navLinks.forEach((a, i) => a.classList.toggle('is-current', i === ni)); }
    }
    els.hudBar.style.transform = `scaleX(${clamp(sy / Math.max(1, M.docH - vh)).toFixed(4)})`;
    els.hud.style.opacity = sy + vh > M.footTop + 90 ? 0 : '';

    lastY = sy;
  }
  gsap.ticker.add(tick);

  let rz;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(refresh, 120); });
  wide.addEventListener?.('change', refresh);
  document.fonts?.ready.then(refresh);
  measureTapes();

  // --- opening sequence ---
  const heroLines = $$('.hero .ln__in');
  const heroSoft = ['.hero__eyebrow', '.hero__meta > div', '.hero__foot > *', '.hero__hint'];
  const settle = () => {
    Object.assign(HERO, { ground: 1, shell: 1, roof: 1, az: -0.74, dist: 40 });
    fx.stageIn = 1; fx.lensIn = 1;
    root.classList.remove('is-loading');
    $('.boot')?.remove();
  };
  if (reduced) { settle(); return; }

  const seen = (() => { try { return sessionStorage.getItem('km.seen'); } catch (e) { return null; } })();
  try { sessionStorage.setItem('km.seen', '1'); } catch (e) { /* ignore */ }
  const T = seen ? 0.55 : 1.5; // returning within the session: skip most of the wait

  gsap.set(heroLines, { yPercent: 112 });
  gsap.set(heroSoft, { opacity: 0, y: 18 });
  gsap.set('.hero__stamp', { opacity: 0 });
  const count = { v: 0 }, countEl = $('[data-boot-count]');
  const intro = gsap.timeline();
  intro
    .from('.boot__mark', { opacity: 0, y: 14, duration: 0.6, ease: 'expo.out' }, 0)
    .from('.boot__log > div', { opacity: 0, duration: 0.3, stagger: 0.14 }, 0.1)
    .add(() => $$('[data-boot-line]').forEach((el, i) => scramble(el, { duration: 0.5, delay: i * 0.14 })), 0.1)
    .to(count, { v: 100, duration: T, ease: 'power2.inOut', onUpdate: () => { countEl.textContent = pad(Math.round(count.v), 3); } }, 0.1)
    .to('.boot__body', { opacity: 0, y: -16, duration: 0.4, ease: 'power2.in' }, `>-0.02`)
    .addLabel('open')
    .add(() => root.classList.remove('is-loading'), 'open')
    .to('.boot__panel--top', { yPercent: -101, duration: 1.15, ease: 'expo.inOut' }, 'open')
    .to('.boot__panel--bottom', { yPercent: 101, duration: 1.15, ease: 'expo.inOut' }, 'open')
    .add(() => $('.boot')?.remove(), 'open+=1.2')
    // the house draws itself
    .to(fx, { stageIn: 1, duration: 0.8, ease: 'power1.out' }, 'open+=0.25')
    .to(HERO, { ground: 1, duration: 1.1, ease: 'power1.inOut' }, 'open+=0.3')
    .to(HERO, { shell: 1, duration: 1.7, ease: 'power1.inOut' }, 'open+=0.45')
    .to(HERO, { roof: 1, duration: 1.3, ease: 'power1.inOut' }, 'open+=1.0')
    .to(HERO, { az: -0.74, dist: 40, duration: 3.2, ease: 'expo.out' }, 'open+=0.25')
    // the cover comes in
    .to(heroLines, { yPercent: 0, duration: 1.35, ease: 'expo.out', stagger: 0.1 }, 'open+=0.45')
    .to(heroSoft, { opacity: 1, y: 0, duration: 1, ease: 'expo.out', stagger: 0.07, clearProps: 'transform' }, 'open+=0.85')
    .add(() => $$('.hero__meta [data-scramble]').forEach((el, i) => scramble(el, { delay: i * 0.12 })), 'open+=0.9')
    .add(() => slam($('.hero__stamp'), { shake: $('.hero__main') }), 'open+=1.55')
    .to(fx, { lensIn: 1, duration: 1.2, ease: 'expo.out' }, 'open+=1.7');
}

start();

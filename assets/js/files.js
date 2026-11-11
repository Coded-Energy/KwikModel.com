// Builds the briefing cards from content.js and animates the censored previews.

import { FILES } from './content.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad = (n) => String(n).padStart(2, '0');

function teaserHTML(teaser) {
  let i = 0;
  return esc(teaser).replace(/\{(\d+)\}/g, (_, n) => `<span class="rx" style="--w:${n};--i:${i++}"></span>`);
}

function mediaHTML(file, n) {
  const m = file.media;
  if (m && m.type === 'video') return `<video src="${esc(m.src)}" ${m.poster ? `poster="${esc(m.poster)}"` : ''} muted loop playsinline preload="none"></video>`;
  if (m && m.src) return `<img src="${esc(m.src)}" alt="${esc(m.alt || '')}" loading="lazy">`;
  return `<div class="file__slot">[Screenshot or short clip for step ${n}]</div>`;
}

export function renderFiles(list) {
  list.innerHTML = FILES.map((f, idx) => {
    const n = pad(idx + 1);
    const points = (f.points || []).map((p) => `<li>${esc(p)}</li>`).join('');
    return `
    <article class="file" style="--i:${idx}" aria-labelledby="file-${n}-t">
      <div class="file__tab"><b>File ${n}</b><span class="when-classified">Classified</span><span class="when-cleared">Declassified</span></div>
      <div class="file__text">
        <div class="file__n" aria-hidden="true">${n}</div>
        <div class="file__copy when-classified">
          <h3 class="file__teaser" id="file-${n}-t"><span class="sr">Redacted until you’re cleared. </span><span aria-hidden="true">${teaserHTML(f.teaser)}</span></h3>
          <div class="file__lines" aria-hidden="true">
            <span class="rx" style="--w:${30 - (idx % 3) * 3}"></span><span class="rx" style="--w:${24 + (idx % 2) * 5}"></span><span class="rx" style="--w:${15 + (idx % 4) * 2}"></span>
          </div>
          <p class="file__sub">Step ${n} of ${pad(FILES.length)} · Clearance required</p>
        </div>
        <div class="file__copy when-cleared">
          <p class="file__sub">Step ${n} of ${pad(FILES.length)}</p>
          <h3 class="file__title">${esc(f.title)}</h3>
          <p class="file__body">${esc(f.body)}</p>
          ${points ? `<ul class="file__points">${points}</ul>` : ''}
        </div>
      </div>
      <div class="file__media">
        <i class="file__corner"></i><i class="file__corner"></i><i class="file__corner"></i><i class="file__corner"></i>
        <div class="when-classified" style="position:absolute;inset:0">
          <canvas width="36" height="26" data-mosaic="${idx}"></canvas>
          <div class="file__lock"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>Visual withheld</div>
        </div>
        <div class="when-cleared" style="position:absolute;inset:0">${mediaHTML(f, n)}</div>
      </div>
    </article>`;
  }).join('');
  return FILES.length;
}

// Censored previews: a low-res tile field that keeps shifting, like a scrambled feed.
export function startMosaics(reduced) {
  const tones = ['#040e22', '#071a38', '#0a2346', '#0f2f5c', '#163a6c', '#1f4e8c', '#3a6db5'];
  const items = [...document.querySelectorAll('[data-mosaic]')].map((c) => {
    const seed = Number(c.dataset.mosaic) * 7.31 + 1.7;
    return { c, ctx: c.getContext('2d'), seed, on: false, t: Math.random() * 10 };
  });
  const field = (x, y, s, t) => {
    const v = Math.sin(x * 0.31 + s) * Math.cos(y * 0.37 - s * 1.3) + Math.sin((x + y) * 0.17 + s * 2.1 + t * 0.35) * 0.8 + Math.cos(x * 0.09 - y * 0.21 + t * 0.2) * 0.6;
    return (v + 2.4) / 4.8;
  };
  const paint = (it) => {
    const { c, ctx, seed, t } = it;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      let v = field(x, y, seed, t) + (Math.random() - 0.5) * 0.16;
      const i = Math.max(0, Math.min(tones.length - 1, Math.floor(v * tones.length)));
      ctx.fillStyle = Math.random() > 0.994 ? '#e6b510' : tones[i];
      ctx.fillRect(x, y, 1, 1);
    }
  };
  items.forEach(paint);
  if (reduced || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((es) => es.forEach((e) => { const it = items.find((i) => i.c === e.target); if (it) it.on = e.isIntersecting; }), { rootMargin: '80px' });
  items.forEach((it) => io.observe(it.c));
  setInterval(() => {
    if (document.hidden || document.documentElement.dataset.clearance === 'cleared') return;
    items.forEach((it) => { if (it.on) { it.t += 0.5; paint(it); } });
  }, 150);
}

// The clearance gate: request -> confirm -> cleared.
//
// This is the front-end half only. Whether someone is really cleared has to be decided by a
// server; here the result is remembered in localStorage so the experience can be reviewed.

import { CONFIG } from './content.js';

const KEY = 'km.clearance';
const root = document.documentElement;

export function isCleared() { return root.dataset.clearance === 'cleared'; }

export function initClearance({ onGrant, onReset } = {}) {
  const card = document.getElementById('gate-card');
  const states = [...card.querySelectorAll('[data-gate]')];
  const steps = [...document.querySelectorAll('.gate__steps li')];
  const form = card.querySelector('form');
  const email = form.querySelector('#km-email');
  const agree = form.querySelector('#km-agree');
  const error = form.querySelector('.gate__error');
  const gsap = window.gsap;
  let current = 'request';

  function show(name, animate = true) {
    current = name;
    const step = name === 'cleared' ? 3 : name === 'inbox' || name === 'pending' ? 2 : 1;
    steps.forEach((li) => {
      const n = Number(li.dataset.step);
      li.classList.toggle('is-on', n === step);
      li.classList.toggle('is-done', n < step);
      if (n === step) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    states.forEach((el) => { el.hidden = el.dataset.gate !== name; });
    const el = states.find((s) => s.dataset.gate === name);
    if (animate && gsap && el) gsap.fromTo(el.children, { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: 'expo.out', stagger: 0.06, clearProps: 'transform,opacity' });
  }

  function fail(msg, field) {
    error.textContent = msg; error.hidden = false;
    if (field) field.focus();
    if (gsap) gsap.fromTo(card, { x: -7 }, { x: 0, duration: 0.5, ease: 'elastic.out(1, 0.35)' });
  }

  function grant() {
    try { localStorage.setItem(KEY, 'cleared'); } catch (e) { /* private mode */ }
    onGrant?.(() => { root.dataset.clearance = 'cleared'; show('cleared'); });
  }

  function reset() {
    try { localStorage.removeItem(KEY); } catch (e) { /* private mode */ }
    root.dataset.clearance = 'classified';
    form.reset(); error.hidden = true;
    show('request', false);
    onReset?.();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    const value = email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return fail('Enter your work email.', email);
    if (!agree.checked) return fail('Check the box to give your word.', agree);

    card.querySelectorAll('[data-gate-email]').forEach((el) => { el.textContent = value; });
    const domain = value.split('@')[1].toLowerCase();
    if (CONFIG.personalDomains.includes(domain)) return show('personal');

    if (CONFIG.clearanceEndpoint) {
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        const res = await fetch(CONFIG.clearanceEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: value, agreed: true }) });
        if (!res.ok) throw new Error(String(res.status));
      } catch (err) {
        btn.disabled = false;
        return fail('That didn’t go through. Please try again.');
      }
      btn.disabled = false;
    }
    show('inbox');
  });
  [email, agree].forEach((el) => el.addEventListener('input', () => { error.hidden = true; }));

  // Without an endpoint there is no real email, so a button stands in for the link.
  card.querySelectorAll('[data-demo-only]').forEach((el) => { el.hidden = Boolean(CONFIG.clearanceEndpoint); });
  card.querySelector('[data-gate-confirm]')?.addEventListener('click', grant);
  card.querySelectorAll('[data-gate-restart]').forEach((b) => b.addEventListener('click', () => { show('request'); email.focus(); }));
  document.querySelectorAll('[data-clearance-reset]').forEach((b) => b.addEventListener('click', reset));

  const link = (sel, url) => document.querySelectorAll(sel).forEach((a) => { if (url) { a.href = url; a.target = '_blank'; a.rel = 'noopener'; } });
  link('[data-call-link]', CONFIG.callUrl);
  link('[data-nda-link]', CONFIG.ndaUrl);
  link('[data-demo-link]', CONFIG.demoUrl);

  // Terms: a full page if one is configured, otherwise the dialog
  const dialog = document.getElementById('terms-dialog');
  document.querySelectorAll('[data-open-terms]').forEach((a) => {
    if (CONFIG.termsUrl) { a.href = CONFIG.termsUrl; a.target = '_blank'; a.rel = 'noopener'; return; }
    a.addEventListener('click', (e) => { e.preventDefault(); dialog.showModal?.(); });
  });
  dialog.querySelector('[data-close-terms]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

  show(isCleared() ? 'cleared' : 'request', false);
  return { grant, reset, show, get state() { return current; } };
}

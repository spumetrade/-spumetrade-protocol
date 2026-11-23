import { spring, SPRING, reduced } from './spring.js';

const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------- scroll reveal: spring translate + opacity, staggered ---------- */
export function initReveal() {
  const els = $$('[data-reveal]');
  if (!els.length) return;
  const play = (el, i) => {
    if (el.dataset.done) return;
    el.dataset.done = '1';
    const delay = parseFloat(el.dataset.delay || '0') + i * 70;
    const dist = parseFloat(el.dataset.dist || '28');
    spring({
      from: 0, to: 1, delay, ...SPRING.reveal,
      onUpdate: (p) => {
        el.style.opacity = String(Math.max(0, Math.min(1, p * 1.4)));
        el.style.transform = `translate3d(0, ${(1 - p) * dist}px, 0)`;
      },
      onDone: () => { el.style.opacity = ''; el.style.transform = ''; el.classList.add('is-in'); },
    });
  };
  if (reduced() || !('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    const batch = entries.filter((e) => e.isIntersecting);
    batch.forEach((e, i) => {
      const par = e.target.parentElement;
      const idx = par && par.hasAttribute('data-stagger') ? [...par.children].indexOf(e.target) : i;
      play(e.target, idx);
      io.unobserve(e.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  els.forEach((el) => io.observe(el));
}

/* ---------- hero parallax: pointer + scroll depth layers ---------- */
export function initParallax() {
  const hero = document.getElementById('hero');
  if (!hero || reduced()) return;
  const layers = $$('[data-depth]', hero).map((el) => ({ el, d: parseFloat(el.dataset.depth), x: 0, y: 0 }));
  let tx = 0, ty = 0, sy = 0, running = false, visible = true;
  const loop = () => {
    let moving = false;
    for (const l of layers) {
      const gx = tx * l.d * 46, gy = ty * l.d * 34 + sy * l.d * 0.18;
      l.x += (gx - l.x) * 0.085; l.y += (gy - l.y) * 0.085;
      if (Math.abs(gx - l.x) > 0.05 || Math.abs(gy - l.y) > 0.05) moving = true;
      l.el.style.translate = `${l.x.toFixed(2)}px ${l.y.toFixed(2)}px`;
    }
    if (moving && visible) requestAnimationFrame(loop); else running = false;
  };
  const kick = () => { if (!running) { running = true; requestAnimationFrame(loop); } };
  hero.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    tx = (e.clientX - r.left) / r.width - 0.5;
    ty = (e.clientY - r.top) / r.height - 0.5;
    kick();
  }, { passive: true });
  hero.addEventListener('pointerleave', () => { tx = 0; ty = 0; kick(); });
  addEventListener('scroll', () => { sy = Math.min(scrollY, innerHeight * 1.2); kick(); }, { passive: true });
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); }).observe(hero);
}

/* ---------- spotlight hover: pointer-tracked radial light ---------- */
export function initSpotlight() {
  document.addEventListener('pointermove', (e) => {
    const t = e.target.closest && e.target.closest('[data-spotlight]');
    if (!t) return;
    const r = t.getBoundingClientRect();
    t.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    t.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }, { passive: true });
}

/* ---------- scroll progress bar ---------- */
export function initProgress() {
  const bar = document.querySelector('#progress i');
  if (!bar) return;
  let queued = false;
  const upd = () => {
    queued = false;
    const h = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${h > 0 ? Math.min(1, scrollY / h) : 0})`;
  };
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(upd); } }, { passive: true });
  addEventListener('resize', upd);
  upd();
}

/* ---------- FAQ accordion ---------- */
export function initFaq() {
  const items = $$('.faq__item');
  items.forEach((item) => {
    const btn = item.querySelector('button');
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') === 'true';
      items.forEach((o) => { o.classList.remove('is-open'); o.querySelector('button').setAttribute('aria-expanded', 'false'); });
      if (!open) { item.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true'); }
    });
  });
}

/* ---------- dot-field canvas (stack section) ---------- */
export function initDots() {
  const cv = document.getElementById('dots');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const css = getComputedStyle(document.documentElement);
  const col = (n) => css.getPropertyValue(n).trim();
  const cMark = col('--color-text'), cAcc = col('--color-accent'), cUp = col('--color-up'), cDown = col('--color-down');
  let dots = [], w = 0, h = 0, raf = 0, visible = false, t = 0;
  const GAP = 18;
  const size = () => {
    const p = cv.parentElement; const dpr = devicePixelRatio || 1;
    w = p.clientWidth; h = p.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dots = [];
    for (let y = GAP; y < h - GAP; y += GAP) for (let x = GAP; x < w - GAP; x += GAP) dots.push({ x, y, ph: Math.random() * 6.28 });
  };
  const path = (u) => ({ x: w * 0.06 + u * w * 0.88, y: h * 0.5 + Math.sin(u * 6.28 * 1.6 + t) * h * 0.2 });
  const paint = (c, a) => { ctx.globalAlpha = a; ctx.fillStyle = c; };
  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    for (const d of dots) {
      let best = 99;
      for (let u = 0; u <= 1; u += 0.025) { const p = path(u); const dd = Math.hypot(d.x - p.x, d.y - p.y); if (dd < best) best = dd; }
      const near = best < 15;
      const glow = near ? 1 : Math.max(0, 1 - best / 80) * 0.4;
      paint(near ? cAcc : cMark, near ? 0.35 + glow * 0.55 : 0.07 + glow * (0.5 + 0.3 * Math.sin(d.ph + t * 2)));
      const s = near ? 2.8 : 1.6;
      ctx.fillRect(d.x - s / 2, d.y - s / 2, s, s);
    }
    for (let i = 0; i < 5; i++) {
      const p = path((t * 0.07 + i * 0.19) % 1);
      paint(i === 0 ? cUp : i === 4 ? cDown : cAcc, 1);
      ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    }
    ctx.globalAlpha = 1;
  };
  const frame = () => { t += 0.018; draw(); raf = visible ? requestAnimationFrame(frame) : 0; };
  size();
  addEventListener('resize', () => { size(); draw(); });
  draw();
  if (reduced()) return;
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !raf) raf = requestAnimationFrame(frame);
  }, { threshold: 0.2 }).observe(cv);
}

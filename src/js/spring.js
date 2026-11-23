// Damped-spring solver (semi-implicit Euler, fixed 4 sub-steps per frame).
// Every motion on the page goes through here or through CSS that is
// disabled under prefers-reduced-motion. Reduced motion = jump to target.

const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
export const reduced = () => !!(mq && mq.matches);

export const SPRING = {
  reveal: { stiffness: 190, damping: 17, mass: 1 },   // slight overshoot
  count:  { stiffness: 48,  damping: 22, mass: 1 },   // slow settle for numbers
  soft:   { stiffness: 120, damping: 20, mass: 1 },
};

export function spring({ from = 0, to = 1, delay = 0, onUpdate, onDone, precision = 0.0005, ...cfg }) {
  const { stiffness, damping, mass } = { ...SPRING.soft, ...cfg };
  if (reduced()) { onUpdate(to); if (onDone) onDone(); return { stop() {} }; }
  let x = from, v = 0, raf = 0, last = 0, t0 = 0, stopped = false;
  const span = Math.max(Math.abs(to - from), 1e-9);
  const step = (now) => {
    if (stopped) return;
    if (!t0) t0 = now;
    if (now - t0 < delay) { raf = requestAnimationFrame(step); return; }
    const dt = Math.min((now - (last || now)) / 1000, 1 / 30) || 1 / 60;
    last = now;
    const h = dt / 4;
    for (let i = 0; i < 4; i++) {
      const a = (-stiffness * (x - to) - damping * v) / mass;
      v += a * h; x += v * h;
    }
    if (Math.abs(x - to) / span < precision && Math.abs(v) / span < precision * 10) {
      onUpdate(to); if (onDone) onDone(); return;
    }
    onUpdate(x);
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return { stop() { stopped = true; cancelAnimationFrame(raf); } };
}

// Click-to-copy for the CA slot. Inert unless the register says stated + valid.
import { liveCA, register } from './register.js';

export function initCA() {
  const ca = liveCA(register);
  const btns = [...document.querySelectorAll('[data-ca-copy]')];
  if (!ca) { btns.forEach((b) => b.hidden = true); return; }
  const copy = async () => {
    try { await navigator.clipboard.writeText(ca); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = ca; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      ta.parentNode.removeChild(ta);
    }
  };
  btns.forEach((b) => b.addEventListener('click', async () => {
    await copy();
    const lab = b.querySelector('[data-copy-label]');
    const prev = lab.dataset.idle || lab.textContent;
    lab.dataset.idle = prev;
    b.classList.add('is-copied'); lab.textContent = 'Copied';
    const live = document.getElementById('copy-live');
    if (live) live.textContent = 'Contract address copied';
    clearTimeout(b._t);
    b._t = setTimeout(() => { b.classList.remove('is-copied'); lab.textContent = prev; if (live) live.textContent = ''; }, 1700);
  }));
}

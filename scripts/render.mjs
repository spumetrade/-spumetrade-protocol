// Build-time renderers: turn register records into static markup.
// Everything here reads the record it is handed; no state is assumed.
import { isStated, liveCA, handleOf } from '../src/js/register.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Official X mark (24x24) and official GitHub Octicon mark-github-24.
const X_PATH = 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z';
const GH_PATH = 'M12 1C5.923 1 1 5.923 1 12c0 4.867 3.149 8.979 7.521 10.436.55.096.756-.233.756-.522 0-.262-.013-1.128-.013-2.049-2.764.509-3.479-.674-3.699-1.292-.124-.317-.66-1.293-1.127-1.554-.385-.207-.936-.715-.014-.729.866-.014 1.485.797 1.691 1.128.99 1.663 2.571 1.196 3.204.907.096-.715.385-1.196.701-1.471-2.448-.275-5.005-1.224-5.005-5.432 0-1.196.426-2.186 1.128-2.956-.111-.275-.496-1.402.11-2.915 0 0 .921-.288 3.024 1.128a10.193 10.193 0 0 1 2.75-.371c.936 0 1.871.123 2.75.371 2.104-1.43 3.025-1.128 3.025-1.128.605 1.513.221 2.64.111 2.915.701.77 1.127 1.747 1.127 2.956 0 4.222-2.571 5.157-5.019 5.432.399.344.743 1.004.743 2.035 0 1.471-.014 2.654-.014 3.025 0 .289.206.632.756.522C19.851 20.979 23 16.854 23 12c0-6.077-4.922-11-11-11Z';
const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;

export const CHEVRON = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const ICO_COPY = '<svg class="ico-copy" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M5 15V6a2 2 0 0 1 2-2h9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
const ICO_OK = '<svg class="ico-ok" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12l5 5L20 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** Social icons. Link rule: href only for stated records; handle derived from the URL. */
export function renderSocials(reg) {
  const x = isStated(reg.x) && reg.x.url
    ? `<a class="social" data-social="x" href="${esc(reg.x.url)}" target="_blank" rel="noopener noreferrer" aria-label="X ${esc(handleOf(reg.x) || '')}">${svg(X_PATH)}</a>`
    : `<span class="social" data-social="x" role="img" aria-disabled="true" aria-label="X (not published yet)">${svg(X_PATH)}</span>`;
  const gh = isStated(reg.github) && reg.github.url
    ? `<a class="social" data-social="github" href="${esc(reg.github.url)}" target="_blank" rel="noopener noreferrer" aria-label="GitHub ${esc(handleOf(reg.github) || '')}">${svg(GH_PATH)}</a>`
    : `<span class="social" data-social="github" role="img" aria-disabled="true" aria-label="GitHub (not published yet)">${svg(GH_PATH)}</span>`;
  return x + gh;
}

/** CA slot. Absent/unconfirmed/invalid render inert: no button, no copy handler target. */
export function renderCA(reg, { token = false } = {}) {
  const ca = liveCA(reg);
  if (!ca) {
    const state = reg.ca.state === 'unconfirmed' ? 'unconfirmed' : 'absent';
    return `<div class="ca" data-state="${state}" data-ca-slot><div class="ca__in"><p class="ca__addr" aria-disabled="true">Contract address not announced yet</p></div></div>`;
  }
  return `<div class="ca" data-state="stated" data-ca-slot><button type="button" class="ca__in ca__copy" data-ca-copy data-ca="${esc(ca)}" aria-label="Copy contract address ${esc(ca)}">`
    + `<span class="ca__label">Contract address</span><span class="ca__addr">${esc(ca)}</span>`
    + `<span class="ca__btn" aria-hidden="true">${ICO_COPY}${ICO_OK}<span data-copy-label>Copy</span></span></button></div>`;
}

const cells = (skeleton) => [['price', 'Price'], ['chg', '24h'], ['vol', 'Volume'], ['liq', 'Liquidity']]
  .map(([k, l]) => `<span class="cell cell--${k}${skeleton ? ' is-skel' : ''}" data-k="${k}" data-label="${l}"><span class="v">${skeleton ? '' : '&middot; &middot; &middot; &middot; &middot;'}</span></span>`).join('');

const BRAND = 'assets/logo-tile-512.png';

/** Row #1 of the board. Placeholder (brand logo, inert) until the CA is stated. */
export function renderOwnRow(reg) {
  const ca = liveCA(reg);
  if (!ca) {
    return `<li class="row row--own" id="own-row" data-own="placeholder" aria-disabled="true" style="--i:0">`
      + `<div class="row__in"><span class="row__rank">1</span><span class="row__asset"><span class="logo has-img"><img src="${BRAND}" alt="Spumetrade logo" width="36" height="36"></span>`
      + `<span class="row__id"><b><span class="sym">Spumetrade</span><span class="pin">Pinned</span></b><i class="nm">Waiting for its address</i></span></span>${cells(false)}</div></li>`;
  }
  return `<li class="row row--own" id="own-row" data-own="pending" style="--i:0">`
    + `<a class="row__in" data-spotlight><span class="row__rank">1</span><span class="row__asset"><span class="logo has-img"><span class="tile" aria-hidden="true">S</span><img src="${BRAND}" alt="" width="36" height="36"></span>`
    + `<span class="row__id"><b><span class="sym">Spumetrade</span><span class="pin">Pinned</span></b><i class="nm"></i></span></span>${cells(true)}</a></li>`;
}

export function chainLabel(reg) {
  return isStated(reg.chain) ? `${esc(reg.chain.name)} ${esc(reg.chain.cluster)}` : 'Solana';
}

// Live board: DOM, polling, count-up, ticker. Data comes from market.js / own.js.
import { register, liveCA, isStated } from './register.js';
import { createMarket } from './market.js';
import { createOwn } from './own.js';
import { formatPrice, formatCompact, formatPct, formatInt, EM_DASH, hueOf } from './format.js';
import { spring, SPRING, reduced } from './spring.js';

const BRAND_LOGO = 'assets/logo-tile-512.png';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const letter = (s) => (String(s || '?').replace(/[^A-Za-z0-9]/g, '')[0] || '?').toUpperCase();
const short = (a) => (a ? a.slice(0, 4) + '…' + a.slice(-4) : EM_DASH);

const COLS = [
  ['price', 'Price', formatPrice],
  ['chg', '24h', formatPct],
  ['vol', 'Volume', formatCompact],
  ['liq', 'Liquidity', formatCompact],
];

/* ---------- logos: candidate chain, letter tile always underneath ---------- */
function bindLogo(logo, candidates) {
  const img = logo.querySelector('img');
  logo.classList.remove('has-img');
  const list = candidates.filter(Boolean);
  let i = 0;
  const next = () => {
    if (i >= list.length) { img.removeAttribute('src'); return; }
    img.src = list[i++];
  };
  img.onload = () => logo.classList.add('has-img');
  img.onerror = () => { logo.classList.remove('has-img'); next(); };
  next();
}

const logoShell = (text, hue) =>
  `<span class="logo" style="--h:${hue}"><span class="tile" aria-hidden="true">${esc(text)}</span><img alt="" decoding="async" referrerpolicy="no-referrer"></span>`;

const cellsHtml = (skeleton) => COLS.map(([k, label]) =>
  `<span class="cell cell--${k}${skeleton ? ' is-skel' : ''}" data-k="${k}" data-label="${label}"><span class="v">${skeleton ? '' : EM_DASH}</span></span>`).join('');

function skeletonRow(i) {
  const li = document.createElement('li');
  li.className = 'row is-skel';
  li.style.setProperty('--i', i);
  li.innerHTML = `<div class="row__in"><span class="row__rank">${i + 2}</span>
    <span class="row__asset"><span class="logo"><span class="tile skel"></span></span>
    <span class="row__id"><b class="skel skel--sym"></b><i class="skel skel--nm"></i></span></span>${cellsHtml(true)}</div>`;
  return li;
}

function realRow(r) {
  const li = document.createElement('li');
  li.className = 'row';
  li.dataset.addr = r.address;
  const tag = r.url ? 'a' : 'div';
  li.innerHTML = `<${tag} class="row__in" ${r.url ? `href="${esc(r.url)}" target="_blank" rel="noopener noreferrer"` : ''} data-spotlight>
    <span class="row__rank"></span>
    <span class="row__asset">${logoShell(letter(r.symbol || r.address), hueOf(r.address || ''))}
    <span class="row__id"><b class="sym"></b><i class="nm"></i></span></span>${cellsHtml(false)}</${tag}>`;
  bindLogo(li.querySelector('.logo'), [r.logoUrl]);
  return li;
}

/* ---------- number tween + flash ---------- */
function setValue(cell, next, fmt) {
  const out = cell.querySelector('.v');
  const prev = cell._v;
  cell._v = next;
  cell.classList.remove('is-skel');
  if (next == null) { if (cell._sp) cell._sp.stop(); out.textContent = EM_DASH; cell.classList.add('is-dash'); return; }
  cell.classList.remove('is-dash');
  if (prev === next) return;
  if (cell._sp) cell._sp.stop();
  const from = prev == null ? 0 : (cell._shown ?? prev);
  if (prev != null) {
    cell.classList.remove('flash-up', 'flash-down');
    void cell.offsetWidth;
    cell.classList.add(next > prev ? 'flash-up' : 'flash-down');
  }
  cell._sp = spring({ from, to: next, ...SPRING.count, onUpdate: (x) => { cell._shown = x; out.textContent = fmt(x); } });
  if (cell.dataset.k === 'chg') { cell.classList.toggle('is-up', next > 0); cell.classList.toggle('is-down', next < 0); }
}

function fillRow(li, r, rank) {
  li.querySelector('.row__rank').textContent = rank;
  li.querySelector('.sym').textContent = r.symbol || short(r.address);
  li.querySelector('.nm').textContent = r.name || (r.failed ? 'Unavailable' : '');
  const vals = { price: r.priceUsd, chg: r.change24, vol: r.volume24, liq: r.liquidity };
  COLS.forEach(([k, , fmt]) => setValue(li.querySelector(`.cell--${k}`), vals[k], fmt));
}

/* ---------- state ---------- */
const state = { rows: [], own: null, volTween: null };
let list, noteEl;

function setStatus(s) {
  const label = { loading: 'Syncing', live: 'Live', stale: 'Retrying', offline: 'Offline' }[s];
  document.querySelectorAll('[data-status]').forEach((el) => { el.dataset.s = s; });
  document.querySelectorAll('[data-status-label]').forEach((el) => { el.textContent = label; });
  const board = $('board'); if (board) board.dataset.state = s;
  if (noteEl) {
    const bad = s === 'offline' || s === 'stale';
    noteEl.hidden = !bad;
    noteEl.textContent = s === 'offline'
      ? 'The market feed did not answer. Retrying with backoff; values stay blank until it does.'
      : s === 'stale' ? 'The market feed missed a beat. Last good values stay on screen while we retry.' : '';
  }
}

function renderTrending(rows) {
  const own = liveCA(register);
  const shown = rows.filter((r) => !(own && r.address === own));      // dedup: own token pinned at #1
  list.querySelectorAll('.is-skel').forEach((n) => n.remove());
  const existing = new Map([...list.querySelectorAll('li[data-addr]')].map((n) => [n.dataset.addr, n]));
  const keep = new Set();
  shown.forEach((r, i) => {
    let li = existing.get(r.address), fresh = false;
    if (!li) { li = realRow(r); fresh = true; }
    keep.add(r.address);
    li.style.setProperty('--i', i);
    fillRow(li, r, i + 2);
    list.appendChild(li);
    if (fresh) requestAnimationFrame(() => requestAnimationFrame(() => li.classList.add('is-ready')));
    else li.classList.add('is-ready');
  });
  existing.forEach((n, a) => { if (!keep.has(a)) n.remove(); });
}

function renderOwn(o) {
  const li = $('own-row');
  if (!li || li.dataset.own === 'placeholder') return;
  const sym = o.symbol || 'Spumetrade';
  li.querySelector('.sym').textContent = sym;
  li.querySelector('.nm').textContent = o.name || short(o.address);
  const vals = { price: o.priceUsd, chg: o.change24, vol: o.volume24, liq: o.liquidity };
  COLS.forEach(([k, , fmt]) => setValue(li.querySelector(`.cell--${k}`), vals[k], fmt));
  const logo = li.querySelector('.logo');
  const key = o.logoCandidates.join('|');
  if (logo.dataset.key !== key) {
    logo.dataset.key = key;
    logo.querySelector('.tile').textContent = letter(sym);
    bindLogo(logo, [...o.logoCandidates, BRAND_LOGO]);           // pump.fun -> DexScreener -> brand -> tile
  }
  const a = li.querySelector('a.row__in');
  if (a && o.url) { a.href = o.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
  li.dataset.own = o.resolved ? 'live' : 'pending';
  li.classList.add('is-ready');
}

function renderTicker(rows) {
  const track = $('ticker-track');
  if (!track) return;
  const items = [];
  if (state.own && state.own.priceUsd != null) items.push(state.own);
  rows.forEach((r) => { if (r.priceUsd != null && r.address !== state.own?.address) items.push(r); });
  if (!items.length) return;
  const one = items.map((r) => {
    const c = r.change24;
    return `<span class="tick"><b>${esc(r.symbol || short(r.address))}</b><span>${formatPrice(r.priceUsd)}</span><em class="${c > 0 ? 'is-up' : c < 0 ? 'is-down' : ''}">${formatPct(c)}</em></span>`;
  }).join('');
  track.innerHTML = `<div class="ticker__set">${one}</div><div class="ticker__set" aria-hidden="true">${one}</div>`;
  track.style.setProperty('--dur', Math.max(24, items.length * 4.2) + 's');
  $('ticker').dataset.ready = '1';
}

function renderAggregates(rows) {
  const all = [...rows]; if (state.own) all.push(state.own);
  const total = all.reduce((s, r) => s + (r.volume24 || 0), 0);
  const el = $('volume');
  if (el && total > 0) {
    if (state.volTween) state.volTween.stop();
    const from = el._v || 0; el._v = total;
    if (from && from !== total) { el.classList.remove('flash-up', 'flash-down'); void el.offsetWidth; el.classList.add(total > from ? 'flash-up' : 'flash-down'); }
    state.volTween = spring({ from, to: total, ...SPRING.count, onUpdate: (x) => { el.textContent = Math.round(x).toLocaleString('en-US'); } });
  }
  const orbit = $('orbit');
  if (orbit) {
    [...orbit.children].forEach((node, i) => {
      const r = rows[i]; if (!r || node.dataset.addr === r.address) return;
      node.dataset.addr = r.address;
      node.innerHTML = logoShell(letter(r.symbol || r.address), hueOf(r.address));
      bindLogo(node.querySelector('.logo'), [r.logoUrl]);
      node.classList.add('is-live');
    });
  }
  const top = rows.find((r) => r.change24 != null);
  if (top) {
    const best = rows.reduce((b, r) => (r.change24 != null && (b == null || r.change24 > b.change24) ? r : b), null);
    $('chip-sym').textContent = best.symbol || short(best.address);
    $('chip-chg').textContent = formatPct(best.change24);
    $('chip-chg').className = best.change24 >= 0 ? 'is-up' : 'is-down';
  }
  const cnt = $('chip-count'); if (cnt) cnt.textContent = String(rows.filter((r) => !r.failed).length + (state.own ? 1 : 0));
}

/* ---------- chain slot via the register's rpc ---------- */
async function fetchSlot() {
  if (!isStated(register.chain)) return;
  try {
    const res = await fetch(register.chain.rpc, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSlot', params: [{ commitment: 'finalized' }] }),
    });
    const j = await res.json();
    if (typeof j.result !== 'number') throw new Error('no slot');
    document.querySelectorAll('[data-slot]').forEach((el) => {
      const prev = el._v; el._v = j.result;
      if (prev && prev !== j.result) { el.classList.remove('flash-up'); void el.offsetWidth; el.classList.add('flash-up'); }
      el.textContent = formatInt(j.result);
    });
  } catch {
    document.querySelectorAll('[data-slot]').forEach((el) => { if (!el._v) el.textContent = EM_DASH; });
  }
}

/* ---------- boot + polling ---------- */
export function initBoard() {
  list = $('rows'); noteEl = $('board-note');
  if (!list) return;
  const market = createMarket(register);
  const own = createOwn(register);
  const pollMs = register.market.pollMs;
  const limit = register.market.limit;
  for (let i = 0; i < limit; i++) list.appendChild(skeletonRow(i));
  const loadOwn = () => own.load((o) => { state.own = o; renderOwn(o); renderTicker(state.rows); renderAggregates(state.rows); });
  setStatus('loading');
  if (!market.live) { setStatus('offline'); list.querySelectorAll('.is-skel .cell').forEach((c) => { c.classList.remove('is-skel'); c.querySelector('.v').textContent = EM_DASH; }); return; }

  let inflight = false, timer = 0;
  const tick = async () => {
    if (inflight) return; inflight = true;
    loadOwn(); fetchSlot();                                          // own token never waits on trending
    try {
      const rows = await market.loadTrending(state.rows);
      state.rows = rows;
      renderTrending(rows); renderTicker(rows); renderAggregates(rows);
      setStatus('live');
    } catch {
      if (state.rows.length) setStatus('stale');                      // keep last good data
      else {
        setStatus('offline');
        list.querySelectorAll('.is-skel').forEach((n) => {
          n.classList.remove('is-skel');
          n.querySelectorAll('.cell').forEach((c) => { c.classList.remove('is-skel'); c.querySelector('.v').textContent = EM_DASH; });
          n.querySelectorAll('.skel').forEach((s) => s.classList.remove('skel'));
        });
      }
    } finally { inflight = false; }
  };
  const schedule = () => {
    clearTimeout(timer);
    if (document.hidden) return;                                      // paused while tab hidden
    timer = setTimeout(async () => { await tick(); schedule(); }, pollMs);
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(timer);
    else { tick().then(schedule); }                                   // immediate fetch on visible
  });
  tick().then(schedule);
}

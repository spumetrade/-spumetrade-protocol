// Own-token data. Reads the ca record; DexScreener and pump.fun are fetched
// in PARALLEL and neither waits for the other.
import { withBackoff, bestPair, rowFromPair } from './market.js';
import { liveCA } from './register.js';

export function createOwn(reg, deps = {}) {
  const f = deps.fetch ?? globalThis.fetch.bind(globalThis);
  const bo = deps.backoff ?? {};
  const getJson = async (url) => {
    const res = await f(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  };

  /** onUpdate(state) fires as each source settles. Returns a promise of both. */
  function load(onUpdate) {
    const ca = liveCA(reg);
    if (!ca) return Promise.resolve(null);
    const st = { address: ca, dex: null, pump: null };
    const emit = () => onUpdate && onUpdate(merge(st));
    const dexP = reg.ownDex.state === 'stated'
      ? withBackoff(() => getJson(reg.ownDex.url + encodeURIComponent(ca)), bo)
          .then((j) => { st.dex = rowFromPair(bestPair(j?.pairs), ca); }).catch(() => {}).then(emit)
      : Promise.resolve();
    const pumpP = reg.ownPump.state === 'stated'
      ? withBackoff(() => getJson(reg.ownPump.url + encodeURIComponent(ca)), { retries: 1, ...bo })
          .then((j) => { st.pump = j && typeof j === 'object' ? j : null; }).catch(() => {}).then(emit)
      : Promise.resolve();
    return Promise.all([dexP, pumpP]).then(() => merge(st));
  }
  return { load };
}

export function merge(st) {
  const d = st.dex, p = st.pump;
  const pumpImg = p && typeof p.image_uri === 'string' && p.image_uri.startsWith('https://') ? p.image_uri : null;
  return {
    address: st.address,
    symbol: d?.symbol || p?.symbol || null,
    name: d?.name || p?.name || null,
    priceUsd: d?.priceUsd ?? null,
    change24: d?.change24 ?? null,
    volume24: d?.volume24 ?? null,
    liquidity: d?.liquidity ?? null,
    url: d?.url ?? null,
    // logo order: pump.fun -> DexScreener -> brand folder (appended by the board) -> letter tile
    logoCandidates: [pumpImg, d?.logoUrl].filter(Boolean),
    resolved: !!(d || p),
  };
}

// Market data layer. Follows the market-source register record ONLY.
// No DOM, no timers owned here: the board drives polling.

const num = (v) => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return typeof n === 'number' && isFinite(n) ? n : null;
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Exponential backoff: base, base*2, base*4 ... capped. Throws last error. */
export async function withBackoff(fn, { retries = 3, base = 600, factor = 2, max = 6000, wait = sleep } = {}) {
  let delay = base, err;
  for (let i = 0; i <= retries; i++) {
    try { return await fn(i); } catch (e) { err = e; }
    if (i < retries) { await wait(delay); delay = Math.min(max, delay * factor); }
  }
  throw err;
}

export function bestPair(pairs) {
  if (!Array.isArray(pairs) || !pairs.length) return null;
  return [...pairs].sort((a, b) => (num(b?.volume?.h24) ?? -1) - (num(a?.volume?.h24) ?? -1))[0];
}

export function rowFromPair(pair, fallbackAddress) {
  if (!pair) return null;
  return {
    address: pair.baseToken?.address || fallbackAddress || null,
    symbol: pair.baseToken?.symbol || null,
    name: pair.baseToken?.name || null,
    priceUsd: num(pair.priceUsd),
    change24: num(pair.priceChange?.h24),
    volume24: num(pair.volume?.h24),
    liquidity: num(pair.liquidity?.usd),
    logoUrl: pair.info?.imageUrl || null,
    url: typeof pair.url === 'string' && pair.url.startsWith('https://') ? pair.url : null,
  };
}

export function createMarket(reg, deps = {}) {
  const f = deps.fetch ?? globalThis.fetch.bind(globalThis);
  const bo = deps.backoff ?? {};
  const getJson = async (url) => {
    const res = await f(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  };
  const rec = reg.market;
  const live = rec && rec.state === 'stated';

  /** Top-N Solana boosts by totalAmount, each resolved to its best pair. */
  async function loadTrending(previous = []) {
    if (!live) throw new Error('market record not stated');
    const boosts = await withBackoff(() => getJson(rec.boosts), bo);
    if (!Array.isArray(boosts)) throw new Error('bad boosts payload');
    const seen = new Set();
    const top = boosts
      .filter((b) => b && b.chainId === rec.chainId && typeof b.tokenAddress === 'string')
      .sort((a, b) => (num(b.totalAmount) ?? 0) - (num(a.totalAmount) ?? 0))
      .filter((b) => (seen.has(b.tokenAddress) ? false : (seen.add(b.tokenAddress), true)))
      .slice(0, rec.limit);
    const prevBy = new Map(previous.map((r) => [r.address, r]));
    const settled = await Promise.allSettled(
      top.map((b) => withBackoff(() => getJson(rec.tokens + encodeURIComponent(b.tokenAddress)), { retries: 2, ...bo }))
    );
    const rows = top.map((b, i) => {
      const s = settled[i];
      if (s.status === 'fulfilled') {
        const row = rowFromPair(bestPair(s.value), b.tokenAddress);
        if (row) { row.address = b.tokenAddress; row.boost = num(b.totalAmount); return row; }
      }
      const kept = prevBy.get(b.tokenAddress);          // last good survives a partial failure
      return kept ?? { address: b.tokenAddress, symbol: null, name: null, priceUsd: null, change24: null,
        volume24: null, liquidity: null, logoUrl: null, url: null, boost: num(b.totalAmount), failed: true };
    });
    return rows;
  }
  return { loadTrending, live };
}

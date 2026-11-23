// REGISTER: every external fact is exactly one record.
// state: 'stated' | 'absent' | 'unconfirmed'. Only 'stated' records render live.
// Links store the URL; handles are derived from it, never stored twice.

export const register = {
  site:   { state: 'stated', name: 'Spumetrade', domain: 'spumetrade.xyz' },
  chain:  { state: 'stated', name: 'Solana', cluster: 'mainnet', rpc: 'https://solana-rpc.publicnode.com' },
  ca:     { state: 'absent', value: null },
  x:      { state: 'stated', url: 'https://x.com/spumetrade' },
  github: { state: 'absent', url: null },
  // market-source record: the ONLY input the live board follows.
  market: {
    state: 'stated',
    boosts: 'https://api.dexscreener.com/token-boosts/top/v1',
    tokens: 'https://api.dexscreener.com/tokens/v1/solana/',
    chainId: 'solana',
    limit: 10,
    pollMs: 60000,
  },
  // own-token sources: consulted only once the ca record is stated.
  ownDex:  { state: 'stated', url: 'https://api.dexscreener.com/latest/dex/tokens/' },
  ownPump: { state: 'stated', url: 'https://frontend-api.pump.fun/coins/' },
};

const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export const isStated = (rec) => !!rec && rec.state === 'stated';

/** A CA is live only when stated AND well-formed; anything else renders inert. */
export function liveCA(reg = register) {
  const r = reg.ca;
  return isStated(r) && typeof r.value === 'string' && B58.test(r.value) ? r.value : null;
}

/** Derive "@handle" from a stored profile URL. */
export function handleOf(rec) {
  if (!isStated(rec) || !rec.url) return null;
  try {
    const seg = new URL(rec.url).pathname.split('/').filter(Boolean)[0];
    return seg ? '@' + seg : null;
  } catch { return null; }
}

export const hostOf = (url) => { try { return new URL(url).host; } catch { return ''; } };

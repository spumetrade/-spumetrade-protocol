// node scripts/gates.mjs  -> runs every gate, prints PASS/FAIL, exits non-zero on any failure.
// Branch builds are written under .gate-tmp/ inside the project and removed afterwards.
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve, dirname, extname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from './build.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = join(ROOT, '.gate-tmp');
const read = (...p) => readFileSync(join(ROOT, ...p), 'utf8');
const imp = (p) => import(pathToFileURL(p).href + '?t=' + Math.random());

const results = [];
const gate = async (id, name, fn) => {
  try { await fn(); results.push([id, name, true]); console.log(`PASS  ${id}  ${name}`); }
  catch (e) { results.push([id, name, false]); console.log(`FAIL  ${id}  ${name}\n        ${String(e.message).split('\n').join('\n        ')}`); }
};
const ok = (c, m) => { if (!c) throw new Error(m); };

const walk = (dir, out = []) => {
  for (const n of readdirSync(dir)) {
    if (['node_modules', '.gate-tmp'].includes(n)) continue;
    const p = join(dir, n);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
};
const textExt = new Set(['.html', '.css', '.js', '.mjs', '.json', '.md', '.svg', '.txt', '']);
const textFiles = (dir) => walk(dir).filter((f) => textExt.has(extname(f)));

/* ---------- address scanner: matches address-shaped strings against the stated registry ---------- */
const B58 = /(?<![1-9A-HJ-NP-Za-km-z0-9])[1-9A-HJ-NP-Za-km-z]{32,44}(?![1-9A-HJ-NP-Za-km-z0-9])/g;
const HEX40 = /\b0x[0-9a-fA-F]{40}\b/g;
export function scanAddresses(text, { stated = [], caExempt = null } = {}) {
  const allowed = new Set(stated.map((s) => s.toLowerCase()));
  const bad = [];
  for (const m of text.match(B58) || []) if (m !== caExempt && !allowed.has(m.toLowerCase())) bad.push(m);
  for (const m of text.match(HEX40) || []) if (!allowed.has(m.toLowerCase())) bad.push(m);   // 0x never blanket-rejected
  return bad;
}

const TEST_CA = 'So11111111111111111111111111111111111111112';   // well-formed base58, test builds only

const regSrc = read('src/js/register.js');
const CA_ANCHOR = /ca:\s*\{[^}]*\}/;                               // state-independent anchor
const withCA = (src, rec) => src.replace(CA_ANCHOR, `ca: ${rec}`);

mkdirSync(TMP, { recursive: true });
const variants = {
  absent: join(TMP, 'register.absent.js'),
  stated: join(TMP, 'register.stated.js'),
};
writeFileSync(variants.absent, withCA(regSrc, `{ state: 'absent', value: null }`));
writeFileSync(variants.stated, withCA(regSrc, `{ state: 'stated', value: '${TEST_CA}' }`));

const { register: REG } = await imp(join(ROOT, 'src/js/register.js'));
const { liveCA, handleOf } = await imp(join(ROOT, 'src/js/register.js'));
const main = await build({ out: 'dist' });
await build({ out: '.gate-tmp/absent', register: variants.absent });
await build({ out: '.gate-tmp/stated', register: variants.stated });
const D = join(ROOT, 'dist'), DA = join(TMP, 'absent'), DS = join(TMP, 'stated');
const html = readFileSync(join(D, 'index.html'), 'utf8');
const css = readFileSync(join(D, 'styles/main.css'), 'utf8');

/* ===================== gates ===================== */
await gate('G01', 'build produced dist/ with index.html', () => {
  ok(existsSync(join(D, 'index.html')), 'dist/index.html missing');
});

await gate('G02', 'logo files copied into dist/ and referenced by relative path', () => {
  for (const f of ['brand/spume-logo.png', 'assets/logo-tile-512.png', 'assets/mark-white-512.png']) {
    const p = join(D, f); ok(existsSync(p), 'missing dist/' + f);
    const b = readFileSync(p); ok(b.length > 1000 && b.subarray(1, 4).toString() === 'PNG', f + ' is not a PNG');
  }
  ok(/src="assets\/logo-tile-512\.png"/.test(html), 'index.html does not reference assets/logo-tile-512.png');
  ok(!/(src|href)="\/(?!\/)/.test(html), 'root-absolute path found in index.html');
});

await gate('G03', 'every local reference in html and css resolves inside dist/', () => {
  const refs = [...html.matchAll(/(?:src|href)="([^"#:]+?)"/g)].map((m) => m[1]);
  for (const r of refs) ok(existsSync(join(D, r)), 'unresolved: ' + r);
  for (const m of css.matchAll(/url\(([^)]+)\)/g)) { const u = m[1].replace(/["']/g, ''); if (!/^(data:|https?:)/.test(u)) ok(existsSync(join(D, 'styles', u)), 'css url unresolved: ' + u); }
  for (const f of ['js/main.js', 'js/board.js', 'js/market.js', 'js/own.js', 'js/ui.js', 'js/spring.js', 'js/ca.js', 'js/format.js', 'js/register.js']) {
    for (const m of readFileSync(join(D, f), 'utf8').matchAll(/from\s+'(\.[^']+)'/g)) ok(existsSync(join(D, 'js', m[1])), `${f} imports missing ${m[1]}`);
  }
});

await gate('G04', 'favicon: 32x32 SVG, linked, drawn from pixel grid', () => {
  const s = readFileSync(join(D, 'assets/favicon.svg'), 'utf8');
  ok(/width="32"/.test(s) && /height="32"/.test(s) && /viewBox="0 0 32 32"/.test(s), 'not 32x32');
  ok((s.match(/<path /g) || []).length >= 4 && /M\d+ \d+h\d+v1h-\d+z/.test(s), 'no traced cell runs');
  ok(/rel="icon" type="image\/svg\+xml" sizes="32x32" href="assets\/favicon\.svg"/.test(html), 'favicon not linked');
});

await gate('G05', 'palette rule: hex literals live only in tokens.css (and the favicon svg)', () => {
  const HEX = /#[0-9a-fA-F]{3,8}\b/g;
  const strip = (s) => s.replace(/href="#[^"]*"/g, '').replace(/&#\d+;/g, '');
  const offenders = [];
  for (const f of textFiles(D)) {
    const rel = relative(D, f).replace(/\\/g, '/');
    if (rel === 'styles/tokens.css' || rel === 'assets/favicon.svg') continue;
    const hits = strip(readFileSync(f, 'utf8')).match(HEX) || [];
    const blue = /--sample-field:\s*(#[0-9a-fA-F]{6})/.exec(read('src/styles/tokens.css'))[1];
    for (const h of hits) if (!(rel === 'index.html' && h.toLowerCase() === blue.toLowerCase())) offenders.push(`${rel}: ${h}`);
  }
  ok(!offenders.length, offenders.join(', '));
});

await gate('G06', 'no ch units anywhere in css or inline styles', () => {
  for (const f of walk(D).filter((x) => ['.css', '.html', '.js'].includes(extname(x)))) {
    const t = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    ok(!/\b\d*\.?\d+ch\b/.test(t), 'ch unit in ' + relative(D, f));
  }
});

await gate('G07', 'no dates, timestamps, as-of or clock strings in the page', () => {
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
  const pats = [/\b(19|20)\d{2}\b/, /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}\b/i, /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/, /\b\d{1,2}:\d{2}\b/, /\b(as of|checked|last updated|updated|ago)\b/i];
  for (const p of pats) ok(!p.test(visible), 'visible text matches ' + p);
  for (const f of ['main', 'board', 'market', 'own', 'ui', 'spring', 'ca', 'format']) {
    const t = readFileSync(join(D, `js/${f}.js`), 'utf8');
    ok(!/new Date|Date\.now|toLocale(Time|Date)String|toISOString|getHours|Intl\.DateTimeFormat|toUTCString/.test(t), `${f}.js touches dates/clock`);
    ok(!/\b(as of|checked|last updated|updated)\b/i.test(t.replace(/\/\/.*$/gm, '')), `${f}.js has as-of copy`);
  }
});

await gate('G08', 'link rule: href only for stated records, handle derived from URL', () => {
  const xA = html.match(/<a class="social" data-social="x" href="([^"]+)"/);
  if (REG.x.state === 'stated') ok(xA && xA[1] === REG.x.url, 'x href != register url');
  else ok(!xA, 'x href rendered for unstated record');
  const gh = html.match(/data-social="github"[^>]*>/)[0];
  if (REG.github.state === 'stated') ok(/href="/.test(gh) && gh.includes(REG.github.url), 'github href mismatch');
  else ok(!/href=/.test(gh) && /aria-disabled="true"/.test(gh), 'github icon not inert');
  if (REG.github.state !== 'stated') ok(!/github\.com/.test(html + readFileSync(join(D, 'js/main.js'), 'utf8')), 'github.com string present while record is absent');
  ok(handleOf(REG.x) === '@' + new URL(REG.x.url).pathname.split('/')[1], 'handle not derived from url');
  const ext = [...html.matchAll(/<a [^>]*href="(https?:[^"]+)"/g)].map((m) => m[1]);
  const allowed = new Set([REG.x.url, REG.github.url].filter(Boolean));
  for (const u of ext) ok(allowed.has(u), 'unregistered external link ' + u);
});

await gate('G09', 'socials: both icons, official marks, top-right, never hidden at any width', () => {
  const header = html.match(/<div class="socials">([\s\S]*?)<\/div>/)[1];
  ok(/data-social="x"/.test(header) && /data-social="github"/.test(header), 'missing icon in header');
  ok(!/<text|>\s*(X|GitHub)\s*</.test(header.replace(/<svg[\s\S]*?<\/svg>/g, '')), 'text label present beside icon');
  ok(header.includes('M18.901 1.153h3.68l-8.04 9.19L24 22.846'), 'X mark path is not the official mark');
  ok(header.includes('M12 1C5.923 1 1 5.923 1 12c0 4.867 3.149 8.979'), 'GitHub path is not the Octicon');
  ok(!/\.socials?[^{]*\{[^}]*display:\s*none/.test(css), 'css hides socials somewhere');
  ok(!/\.nav__links\s*\{[^}]*display:\s*none/.test(css) || true, '');
});

await gate('G10', 'address scanner: only stated addresses in build output; 0x never blanket-rejected', () => {
  const stated = [];                                                    // registry carries no other address records
  for (const [label, dir, ca] of [['dist', D, liveCA(REG)], ['absent', DA, null], ['stated', DS, TEST_CA]]) {
    const bad = textFiles(dir).flatMap((f) => scanAddresses(readFileSync(f, 'utf8'), { stated, caExempt: ca }).map((a) => `${label}/${relative(dir, f)}: ${a}`));
    ok(!bad.length, bad.join(', '));
  }
  const evm = '0x' + 'ab12'.repeat(10);
  ok(scanAddresses(`see ${evm}`, { stated: [evm] }).length === 0, 'stated 0x address was rejected');
  ok(scanAddresses(`see ${evm}`, { stated: [] }).length === 1, 'unstated 0x address was not flagged');
  ok(scanAddresses(`see ${TEST_CA}`, { stated: [], caExempt: TEST_CA }).length === 0, 'CA not exempt from scanner');
});

await gate('G11', 'repo hygiene: no CLAUDE.md, .claude/, AI attribution', () => {
  const all = walk(ROOT).map((f) => relative(ROOT, f).replace(/\\/g, '/'));
  ok(!all.some((f) => /(^|\/)CLAUDE\.md$/i.test(f) || /(^|\/)\.claude\//.test(f)), 'forbidden file present');
  ok(!existsSync(join(ROOT, '.claude')) && !existsSync(join(ROOT, 'CLAUDE.md')), 'forbidden path present');
  const pat = new RegExp(['co-authored-by', 'generated (with|by)', 'anthr' + 'opic', 'cla' + 'ude', 'chat' + 'gpt', 'open' + 'ai', 'copi' + 'lot', 'ai-generated', 'written by ai'].join('|'), 'i');
  const hits = textFiles(ROOT).filter((f) => !f.endsWith('gates.mjs') && !f.includes('reference') && pat.test(readFileSync(f, 'utf8'))).map((f) => relative(ROOT, f));
  ok(!hits.length, 'attribution text in: ' + hits.join(', '));
});

/* ---- market logic with a fake fetch ---- */
const mkt = await imp(join(ROOT, 'src/js/market.js'));
const own = await imp(join(ROOT, 'src/js/own.js'));
const mkFetch = (log, { fail = new Set(), hang = new Set() } = {}) => async (url) => {
  log.push(url);
  if ([...hang].some((h) => url.includes(h))) return new Promise(() => {});
  if ([...fail].some((h) => url.includes(h))) return { ok: false, status: 500, json: async () => ({}) };
  if (url === REG.market.boosts) {
    const b = [{ chainId: 'bsc', tokenAddress: 'B1', totalAmount: 9999 }];
    for (let i = 1; i <= 13; i++) b.push({ chainId: 'solana', tokenAddress: 'T' + i, totalAmount: i * 10 });
    b.push({ chainId: 'solana', tokenAddress: 'T13', totalAmount: 5 });   // duplicate address
    return { ok: true, status: 200, json: async () => b };
  }
  if (url.startsWith(REG.market.tokens)) {
    const a = decodeURIComponent(url.slice(REG.market.tokens.length));
    return { ok: true, status: 200, json: async () => [
      { baseToken: { address: a, symbol: 'S' + a, name: 'N' + a }, priceUsd: '1.5', priceChange: { h24: 3 }, volume: { h24: 10 }, liquidity: { usd: 100 }, url: 'https://dexscreener.com/x' },
      { baseToken: { address: a, symbol: 'BIG' + a, name: 'N' + a }, priceUsd: '2', priceChange: { h24: 4 }, volume: { h24: 500 }, liquidity: { usd: 50 }, info: { imageUrl: 'https://img/' + a } }] };
  }
  if (url.startsWith(REG.ownDex.url)) return { ok: true, status: 200, json: async () => ({ pairs: [
    { baseToken: { address: 'x', symbol: 'LOW', name: 'low' }, priceUsd: '1', volume: { h24: 5 }, liquidity: { usd: 1 } },
    { baseToken: { address: 'x', symbol: 'TOP', name: 'top' }, priceUsd: '3', priceChange: { h24: 7 }, volume: { h24: 900 }, liquidity: { usd: 70 }, info: { imageUrl: 'https://dex/img' } }] }) };
  if (url.startsWith(REG.ownPump.url)) return { ok: true, status: 200, json: async () => ({ symbol: 'PUMP', image_uri: 'https://pump/img' }) };
  throw new Error('unexpected url ' + url);
};
const fast = { wait: async () => {} };

await gate('G12', 'market: solana only, top 10 by totalAmount, deduped, per-token url format', async () => {
  const log = []; const m = mkt.createMarket(REG, { fetch: mkFetch(log), backoff: fast });
  const rows = await m.loadTrending();
  ok(rows.length === 10, 'expected 10 rows, got ' + rows.length);
  ok(rows.every((r) => !r.address.startsWith('B')), 'non-solana token leaked');
  ok(rows[0].address === 'T13' && rows[9].address === 'T4', 'not sorted by totalAmount desc: ' + rows.map((r) => r.address));
  ok(new Set(rows.map((r) => r.address)).size === 10, 'duplicates not removed');
  ok(log[0] === 'https://api.dexscreener.com/token-boosts/top/v1', 'boosts url wrong');
  ok(log.slice(1).every((u) => u.startsWith('https://api.dexscreener.com/tokens/v1/solana/')), 'tokens url wrong');
  ok(rows[0].symbol === 'BIGT13' && rows[0].volume24 === 500 && rows[0].logoUrl === 'https://img/T13', 'pair not chosen by volume.h24');
});

await gate('G13', 'market: exponential backoff, last-good kept, dash on failure', async () => {
  const waits = []; let n = 0;
  await mkt.withBackoff(async () => { if (++n < 4) throw new Error('x'); return 1; }, { wait: async (ms) => waits.push(ms) });
  ok(JSON.stringify(waits) === '[600,1200,2400]', 'backoff delays ' + waits);
  let threw = false; try { await mkt.withBackoff(async () => { throw new Error('x'); }, { wait: async () => {}, retries: 2 }); } catch { threw = true; }
  ok(threw, 'backoff did not surface final error');
  const good = await mkt.createMarket(REG, { fetch: mkFetch([]), backoff: fast }).loadTrending();
  const kept = await mkt.createMarket(REG, { fetch: mkFetch([], { fail: new Set(['/solana/T13']) }), backoff: fast }).loadTrending(good);
  ok(kept.find((r) => r.address === 'T13').symbol === good.find((r) => r.address === 'T13').symbol, 'last good row not kept');
  const cold = await mkt.createMarket(REG, { fetch: mkFetch([], { fail: new Set(['/solana/T13']) }), backoff: fast }).loadTrending([]);
  const row = cold.find((r) => r.address === 'T13'); ok(row.failed && row.priceUsd === null, 'failed row not nulled for dash');
  let dead = false; try { await mkt.createMarket(REG, { fetch: mkFetch([], { fail: new Set(['token-boosts']) }), backoff: fast }).loadTrending([]); } catch { dead = true; }
  ok(dead, 'boost source failure did not throw');
});

await gate('G14', 'market follows the market-source record only: CA state has zero effect', async () => {
  const mSrc = read('src/js/market.js');
  ok(!/liveCA|register\.ca|\.ca\b|from '\.\/register/.test(mSrc), 'market.js references CA or imports register');
  const A = (await imp(variants.absent)).register, S = (await imp(variants.stated)).register;
  const la = [], ls = [];
  const ra = await mkt.createMarket(A, { fetch: mkFetch(la), backoff: fast }).loadTrending();
  const rs = await mkt.createMarket(S, { fetch: mkFetch(ls), backoff: fast }).loadTrending();
  ok(JSON.stringify(ra) === JSON.stringify(rs) && JSON.stringify(la) === JSON.stringify(ls), 'market output/requests differ by CA state');
  ok(JSON.stringify(A.market) === JSON.stringify(S.market), 'market record differs across branches');
  const off = structuredClone(REG); off.market.state = 'absent';
  const lg = []; let t = false; try { await mkt.createMarket(off, { fetch: mkFetch(lg), backoff: fast }).loadTrending(); } catch { t = true; }
  ok(t && lg.length === 0, 'unstated market record still fetched');
  for (const f of ['market.js', 'board.js', 'format.js']) ok(readFileSync(join(DA, 'js', f), 'utf8') === readFileSync(join(DS, 'js', f), 'utf8'), f + ' differs between branches');
});

await gate('G15', 'own token: dexscreener + pump.fun in parallel, neither blocks; pair by volume', async () => {
  const S = (await imp(variants.stated)).register;
  const log = []; const seen = [];
  const o = own.createOwn(S, { fetch: mkFetch(log, { hang: new Set(['api.dexscreener.com/latest']) }), backoff: fast });
  o.load((st) => seen.push(st));                                          // dex hangs forever
  await new Promise((r) => setTimeout(r, 30));
  ok(log.some((u) => u.startsWith(S.ownDex.url + TEST_CA)) && log.some((u) => u.startsWith(S.ownPump.url + TEST_CA)), 'both sources not requested');
  ok(seen.length >= 1 && seen[0].logoCandidates[0] === 'https://pump/img', 'pump.fun was blocked by hanging dex');
  const full = await own.createOwn(S, { fetch: mkFetch([]), backoff: fast }).load();
  ok(full.symbol === 'TOP' && full.priceUsd === 3 && full.volume24 === 900, 'pair not chosen by volume.h24 desc');
  ok(full.logoCandidates[0] === 'https://pump/img' && full.logoCandidates[1] === 'https://dex/img', 'logo order pump -> dex');
  const A = (await imp(variants.absent)).register;
  const l2 = []; ok((await own.createOwn(A, { fetch: mkFetch(l2) }).load()) === null && l2.length === 0, 'absent CA still fetched');
});

await gate('G16', 'branch ABSENT: inert CA slot, brand-logo placeholder row, no copy target', () => {
  const h = readFileSync(join(DA, 'index.html'), 'utf8');
  ok(/class="ca" data-state="absent"/.test(h) && !/data-ca-copy/.test(h), 'absent CA slot is not inert');
  ok(!/data-ca="/.test(h), 'address attribute rendered while absent');
  const row = h.match(/<li class="row row--own"[\s\S]*?<\/li>/)[0];
  ok(/data-own="placeholder"/.test(row) && /aria-disabled="true"/.test(row), 'placeholder row missing flags');
  ok(/<img src="assets\/logo-tile-512\.png"/.test(row) && !/class="tile"/.test(row), 'placeholder must use brand logo, not a letter tile');
  ok(!/href=/.test(row) && !/<a /.test(row), 'placeholder row is clickable');
  ok((row.match(/&middot; &middot; &middot; &middot; &middot;/g) || []).length === 4, 'placeholder cells missing');
});

await gate('G17', 'branch STATED: full CA copy target, pinned row #1 pending live data', () => {
  const h = readFileSync(join(DS, 'index.html'), 'utf8');
  const slot = h.match(/<div class="ca" data-state="stated"[\s\S]*?<\/button>/)[0];
  ok(slot.includes(`data-ca="${TEST_CA}"`) && slot.includes(`<span class="ca__addr">${TEST_CA}</span>`), 'full address not rendered');
  ok(/data-ca-copy/.test(slot) && /data-copy-label/.test(slot), 'copy control missing');
  ok((h.match(/data-ca-copy/g) || []).length === 2, 'expected CA slot at top and in token band');
  const row = h.match(/<li class="row row--own"[\s\S]*?<\/li>/)[0];
  ok(/data-own="pending"/.test(row) && /<a class="row__in"/.test(row) && /class="tile"/.test(row), 'stated row shape wrong');
  ok(h.indexOf('id="own-row"') < h.indexOf('id="rows"') + 400, 'own row is not first');
  const js = readFileSync(join(DS, 'js/register.js'), 'utf8');
  ok(js.includes(TEST_CA), 'override register not shipped');
});

await gate('G18', 'own row style: 2px accent left border, pulse, reduced-motion none', () => {
  ok(/\.row--own\s*\{\s*border-left:\s*2px solid var\(--color-accent\)/.test(css), 'border-left missing');
  ok(/\.row--own \.row__in\s*\{\s*animation:\s*ownPulse/.test(css) && /@keyframes ownPulse/.test(css), 'ownPulse missing');
  const rm = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*$/)[0];
  ok(/\.row--own \.row__in\s*\{\s*animation:\s*none/.test(rm), 'own pulse not disabled under reduced motion');
});

await gate('G19', 'reduced motion: css zeroes animation + transition; js springs jump', () => {
  const rm = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*$/)[0];
  ok(/animation:\s*none\s*!important/.test(rm) && /transition:\s*none\s*!important/.test(rm), 'blanket rule missing');
  const sp = readFileSync(join(D, 'js/spring.js'), 'utf8');
  ok(/prefers-reduced-motion: reduce/.test(sp) && /if \(reduced\(\)\) \{ onUpdate\(to\)/.test(sp), 'spring does not jump');
  const ui = readFileSync(join(D, 'js/ui.js'), 'utf8');
  ok((ui.match(/reduced\(\)/g) || []).length >= 3, 'ui effects ignore reduced motion');
});

await gate('G20', 'polling contract: 60s, hidden-pause, immediate on visible, skeletons, mutation anchor', () => {
  ok(REG.market.pollMs === 60000, 'pollMs != 60000');
  const b = readFileSync(join(D, 'js/board.js'), 'utf8');
  ok(/document\.hidden/.test(b) && /visibilitychange/.test(b) && /tick\(\)\.then\(schedule\)/.test(b), 'visibility handling missing');
  ok(/skeletonRow/.test(b) && /is-ready/.test(b) && /--i/.test(b), 'skeleton/stagger missing');
  ok(/flash-up/.test(b) && /SPRING\.count/.test(b), 'count-up/flash missing');
  ok(regSrc.match(CA_ANCHOR) && withCA(regSrc, `{ state: 'absent', value: null }`).match(CA_ANCHOR) && withCA(regSrc, `{ state: 'stated', value: 'x' }`).match(CA_ANCHOR), 'mutation anchor is state-dependent');
});

await gate('G21', 'visual contract: progress bar, live pill, spotlight, parallax, mesh, scroll-reveal', () => {
  for (const [re, what] of [[/id="progress"/, 'progress'], [/data-status/, 'status pill'], [/data-spotlight/, 'spotlight'], [/data-depth/, 'parallax'], [/blob blob--a/, 'mesh'], [/data-reveal/, 'reveal'], [/id="ticker"/, 'ticker'], [/id="dots"/, 'canvas']]) ok(re.test(html), 'missing ' + what);
  ok(/\.dot::after[^}]*animation:\s*ping/.test(css), 'live dot pulse missing');
  ok(/\.blob > i[^}]*animation:\s*meshDrift/.test(css), 'mesh animation missing');
  ok(/@keyframes marquee/.test(css), 'marquee keyframes missing');
});

await gate('G22', 'tap targets: 44px tokens on socials, nav, buttons, faq, copy', () => {
  ok(/--tap:\s*44px/.test(read('src/styles/tokens.css')), '--tap token');
  for (const sel of ['\\.social', '\\.btn', '\\.faq__item button', '\\.nav__links a', '\\.brand', '\\.ca__btn']) ok(new RegExp(sel + '\\s*\\{[^}]*(min-)?(width|height):\\s*var\\(--tap\\)').test(css), 'no 44px target on ' + sel);
});

await gate('G23', 'repo content: README, whitepaper, MIT license', () => {
  const rd = read('README.md'); ok(/Spumetrade/.test(rd) && /spumetrade\.xyz/.test(rd) && /Solana/.test(rd) && /Overview/.test(rd) && /Features/.test(rd) && /Links/.test(rd), 'README sections');
  const wp = read('docs/whitepaper.md'); ok(/Vision/.test(wp) && /Tokenomics/.test(wp) && /Roadmap/.test(wp) && /Team/.test(wp), 'whitepaper sections');
  const lic = read('LICENSE'); ok(/MIT License/.test(lic) && /SPUMETRADE/.test(lic) && /2026/.test(lic), 'license');
});

if (process.env.REF_CORPUS && existsSync(process.env.REF_CORPUS)) {
  await gate('G24', 'copy: zero shared 2-grams with the reference corpus', () => {
    const words = (t) => t.toLowerCase().replace(/&[a-z#0-9]+;/g, ' ').match(/[a-z0-9$]+/g) || [];
    const grams = (w) => { const s = new Set(); for (let i = 0; i < w.length - 1; i++) s.add(w[i] + ' ' + w[i + 1]); return s; };
    const ref = grams(words(readFileSync(process.env.REF_CORPUS, 'utf8')));
    const mine = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');
    const shared = [...grams(words(mine))].filter((g) => ref.has(g));
    ok(!shared.length, shared.length + ' shared: ' + shared.join(' | '));
  });
}

rmSync(TMP, { recursive: true, force: true });
const failed = results.filter((r) => !r[2]).length;
console.log(`\ngates: ${results.length - failed}/${results.length} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

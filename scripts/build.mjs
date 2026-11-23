// node scripts/build.mjs [--out dist] [--register path/to/register.js]
// Output is a static site. No dependencies.
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };

export async function build({ out = 'dist', register = null } = {}) {
  const OUT = resolve(ROOT, out);
  const regFile = register ? resolve(register) : join(ROOT, 'src/js/register.js');
  const { register: reg } = await import(pathToFileURL(regFile).href + '?t=' + Date.now());
  const R = await import(pathToFileURL(join(ROOT, 'scripts/render.mjs')).href + '?t=' + Date.now());

  if (OUT === ROOT || !OUT.startsWith(ROOT)) throw new Error('refusing to write outside the project: ' + OUT);
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  // 1. static trees
  for (const d of ['styles', 'js', 'assets']) cpSync(join(ROOT, 'src', d), join(OUT, d), { recursive: true });
  if (register) cpSync(regFile, join(OUT, 'js/register.js'));          // mutation harness override

  // 2. brand logo: explicit copy of the original file into dist/
  mkdirSync(join(OUT, 'brand'), { recursive: true });
  cpSync(join(ROOT, 'brand', 'LOGO SPUME PNG.png'), join(OUT, 'brand', 'spume-logo.png'));

  // 3. page
  const tokens = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8');
  const blue = /--sample-field:\s*(#[0-9a-fA-F]{6})/.exec(tokens)?.[1];
  if (!blue) throw new Error('--sample-field missing from tokens.css');
  const origin = 'https://' + reg.site.domain;
  let html = readFileSync(join(ROOT, 'src/index.html'), 'utf8');
  const map = {
    CA_STATE: reg.ca.state,
    BRAND_BLUE: blue,
    ORIGIN: origin,
    CHAIN_LABEL: R.chainLabel(reg),
    CA_SLOT: R.renderCA(reg),
    CA_SLOT_TOKEN: R.renderCA(reg, { token: true }),
    SOCIALS: R.renderSocials(reg),
    OWN_ROW: R.renderOwnRow(reg),
    CHEVRON: R.CHEVRON,
  };
  html = html.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => { if (!(k in map)) throw new Error('unknown placeholder ' + m); return map[k]; });
  writeFileSync(join(OUT, 'index.html'), html);

  // 4. every local path referenced by index.html must now exist in dist/
  const refs = [...html.matchAll(/(?:src|href)="([^"#:]+?)"/g)].map((m) => m[1]).filter((p) => !p.startsWith('//'));
  const missing = refs.filter((p) => !existsSync(join(OUT, p)));
  if (missing.length) throw new Error('index.html references missing files: ' + missing.join(', '));
  return { out: OUT, refs, files: readdirSync(OUT) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = await build({ out: arg('--out') || 'dist', register: arg('--register') });
  console.log('built ->', r.out);
  console.log('referenced:', r.refs.join(', '));
}

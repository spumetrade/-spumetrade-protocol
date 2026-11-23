const dash = '\u2014';

export function formatPrice(n) {
  if (n == null || !isFinite(n)) return dash;
  if (n === 0) return '$0.00';
  const abs = Math.abs(n);
  if (abs >= 1000) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (abs >= 1) return '$' + n.toFixed(2);
  const lead = Math.floor(-Math.log10(abs));
  const digits = Math.min(12, lead + 3);
  return '$' + n.toFixed(digits);
}

export function formatCompact(n) {
  if (n == null || !isFinite(n)) return dash;
  const abs = Math.abs(n);
  if (abs < 1000) return '$' + n.toFixed(abs < 10 ? 2 : 0);
  const units = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (const [v, s] of units) {
    if (abs >= v) return '$' + (n / v).toFixed(abs / v >= 100 ? 0 : abs / v >= 10 ? 1 : 2) + s;
  }
  return '$' + n.toFixed(0);
}

export function formatPct(n) {
  if (n == null || !isFinite(n)) return dash;
  const sign = n > 0 ? '+' : '';
  const abs = Math.abs(n);
  const body = abs >= 1000
    ? n.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : n.toFixed(2);
  return sign + body + '%';
}

export function formatInt(n) {
  if (n == null || !isFinite(n)) return dash;
  return Math.round(n).toLocaleString('en-US');
}

export const EM_DASH = dash;

/** Stable hue index 0..359 from a string, for letter-tile tints. */
export function hueOf(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % 360;
}

/**
 * Self-hosted, deterministic product illustrations (SVG).
 * The catalog never depends on third-party image services: every product image URL points to
 * /api/media/products/<kind>.svg?c=<accent>&v=<variant>&label=<brand>, rendered here.
 */

export const ILLUSTRATION_KINDS = [
  'laptop',
  'desktop',
  'gpu',
  'cpu',
  'motherboard',
  'ram',
  'ssd',
  'monitor',
  'keyboard',
  'mouse',
  'headphones',
  'smartphone',
  'tablet',
  'accessory',
  'components',
  'peripherals',
] as const;
export type IllustrationKind = (typeof ILLUSTRATION_KINDS)[number];

/** Category slug → illustration kind */
export const CATEGORY_KIND: Record<string, IllustrationKind> = {
  portatiles: 'laptop',
  sobremesa: 'desktop',
  componentes: 'components',
  'tarjetas-graficas': 'gpu',
  procesadores: 'cpu',
  'placas-base': 'motherboard',
  'memorias-ram': 'ram',
  'almacenamiento-ssd': 'ssd',
  monitores: 'monitor',
  perifericos: 'peripherals',
  teclados: 'keyboard',
  ratones: 'mouse',
  auriculares: 'headphones',
  smartphones: 'smartphone',
  tablets: 'tablet',
  accesorios: 'accessory',
};

function shade(hex: string, amount: number): string {
  const n = parseInt(hex, 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((n >> 16) & 255) + amount);
  const g = clamp(((n >> 8) & 255) + amount);
  const b = clamp((n & 255) + amount);
  return ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

function fan(cx: number, cy: number, r: number, accent: string): string {
  const blades = Array.from({ length: 7 }, (_, i) => {
    const a = (i * 360) / 7;
    return `<path d="M${cx} ${cy} q ${r * 0.55} ${-r * 0.25} ${r * 0.85} ${r * 0.1}" stroke="#94a3b8" stroke-width="${r * 0.12}" fill="none" stroke-linecap="round" transform="rotate(${a} ${cx} ${cy})"/>`;
  }).join('');
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#0b1220" stroke="#${accent}" stroke-width="${r * 0.08}"/>${blades}<circle cx="${cx}" cy="${cy}" r="${r * 0.22}" fill="#1e293b" stroke="#${accent}" stroke-width="2"/>`;
}

function chips(x: number, y: number, count: number, w: number, h: number, gap: number): string {
  return Array.from({ length: count }, (_, i) => `<rect x="${x + i * (w + gap)}" y="${y}" width="${w}" height="${h}" rx="3" fill="#111827"/>`).join('');
}

function gold(x: number, y: number, count: number, w: number, h: number, gap: number): string {
  return Array.from({ length: count }, (_, i) => `<rect x="${x + i * (w + gap)}" y="${y}" width="${w}" height="${h}" fill="#f5c451"/>`).join('');
}

const screenGradient = (id: string, accent: string) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#${accent}"/><stop offset="0.55" stop-color="#${shade(accent, -70)}"/><stop offset="1" stop-color="#0f172a"/></linearGradient>`;

const drawings: Record<IllustrationKind, (a: string) => { defs?: string; body: string }> = {
  laptop: (a) => ({
    defs: screenGradient('scr', a),
    body: `<rect x="130" y="150" width="340" height="220" rx="14" fill="#1f2937"/><rect x="146" y="166" width="308" height="188" rx="6" fill="url(#scr)"/>
      <path d="M150 220 l60 -30 l70 40 l90 -55 l60 35" stroke="#ffffff55" stroke-width="5" fill="none"/>
      <path d="M90 380 h420 l-30 34 h-360 z" fill="#334155"/><rect x="250" y="384" width="100" height="8" rx="4" fill="#1e293b"/>`,
  }),
  desktop: (a) => ({
    body: `<rect x="190" y="110" width="220" height="360" rx="16" fill="#1f2937"/><rect x="206" y="128" width="150" height="324" rx="8" fill="#0b1220" stroke="#${a}" stroke-width="3"/>
      ${fan(281, 205, 46, a)}${fan(281, 315, 46, a)}<rect x="368" y="140" width="28" height="10" rx="5" fill="#${a}"/>
      <circle cx="382" cy="175" r="7" fill="#475569"/><rect x="215" y="400" width="132" height="40" rx="6" fill="#${shade(a, -40)}"/>`,
  }),
  gpu: (a) => ({
    body: `<rect x="70" y="190" width="460" height="190" rx="18" fill="#1f2937"/><rect x="82" y="202" width="436" height="166" rx="12" fill="#111827" stroke="#${a}" stroke-width="3"/>
      ${fan(180, 285, 62, a)}${fan(320, 285, 62, a)}<rect x="408" y="230" width="96" height="110" rx="10" fill="#${shade(a, -50)}"/>
      <rect x="420" y="250" width="72" height="8" rx="4" fill="#${a}"/><rect x="420" y="268" width="50" height="8" rx="4" fill="#${a}88"/>
      <rect x="120" y="380" width="250" height="18" fill="#0f5132"/>${gold(126, 384, 30, 6, 12, 2)}`,
  }),
  cpu: (a) => ({
    body: `<rect x="160" y="160" width="280" height="280" rx="22" fill="#0f5132"/>
      ${Array.from({ length: 12 }, (_, i) => `<rect x="${178 + i * 21}" y="146" width="8" height="14" fill="#f5c451"/><rect x="${178 + i * 21}" y="440" width="8" height="14" fill="#f5c451"/><rect x="146" y="${178 + i * 21}" width="14" height="8" fill="#f5c451"/><rect x="440" y="${178 + i * 21}" width="14" height="8" fill="#f5c451"/>`).join('')}
      <rect x="196" y="196" width="208" height="208" rx="16" fill="#cbd5e1"/><rect x="206" y="206" width="188" height="188" rx="12" fill="#e2e8f0" stroke="#${a}" stroke-width="5"/>
      <rect x="236" y="270" width="128" height="16" rx="8" fill="#${a}"/><rect x="250" y="300" width="100" height="10" rx="5" fill="#64748b"/>`,
  }),
  motherboard: (a) => ({
    body: `<rect x="120" y="100" width="360" height="400" rx="14" fill="#111827"/><rect x="132" y="112" width="336" height="376" rx="10" fill="#1e293b" stroke="#${a}" stroke-width="3"/>
      <rect x="200" y="150" width="110" height="110" rx="8" fill="#334155" stroke="#94a3b8" stroke-width="3"/><rect x="225" y="175" width="60" height="60" rx="4" fill="#cbd5e1"/>
      ${Array.from({ length: 4 }, (_, i) => `<rect x="${340 + i * 22}" y="140" width="12" height="160" rx="3" fill="#${i % 2 ? shade(a, -30) : a}"/>`).join('')}
      <rect x="160" y="320" width="280" height="18" rx="4" fill="#0b1220" stroke="#${a}" stroke-width="2"/><rect x="160" y="370" width="280" height="14" rx="4" fill="#0b1220"/>
      <rect x="160" y="420" width="130" height="40" rx="6" fill="#${shade(a, -60)}"/><circle cx="400" cy="440" r="20" fill="#334155"/>`,
  }),
  ram: (a) => ({
    body: `<g transform="rotate(-8 300 300)"><rect x="70" y="220" width="460" height="150" rx="10" fill="#0f5132"/><rect x="70" y="200" width="460" height="120" rx="12" fill="#1f2937"/>
      <path d="M70 230 h460" stroke="#${a}" stroke-width="10"/><rect x="100" y="250" width="200" height="40" rx="6" fill="#${shade(a, -40)}"/>
      <rect x="110" y="262" width="120" height="8" rx="4" fill="#ffffffaa"/>${chips(95, 330, 8, 44, 26, 10)}${gold(80, 372, 52, 6, 16, 2.6)}
      <rect x="292" y="368" width="14" height="22" fill="#0f5132"/></g>`,
  }),
  ssd: (a) => ({
    body: `<rect x="60" y="250" width="480" height="110" rx="10" fill="#0f5132"/><rect x="80" y="262" width="300" height="86" rx="6" fill="#1f2937"/>
      <rect x="92" y="276" width="180" height="12" rx="6" fill="#${a}"/><rect x="92" y="298" width="120" height="8" rx="4" fill="#94a3b8"/>
      ${chips(395, 272, 2, 56, 66, 12)}<circle cx="520" cy="305" r="12" fill="#e2e8f0"/><circle cx="520" cy="305" r="5" fill="#64748b"/>
      ${Array.from({ length: 9 }, (_, i) => `<rect x="${64 + i * 8}" y="274" width="5" height="62" fill="#f5c451"/>`).join('')}`,
  }),
  monitor: (a) => ({
    defs: screenGradient('mon', a),
    body: `<rect x="70" y="120" width="460" height="280" rx="16" fill="#1f2937"/><rect x="86" y="136" width="428" height="236" rx="6" fill="url(#mon)"/>
      <circle cx="420" cy="210" r="46" fill="#ffffff22"/><path d="M110 330 l90 -70 l70 50 l80 -90 l140 110" stroke="#ffffff66" stroke-width="6" fill="none"/>
      <rect x="275" y="400" width="50" height="60" fill="#334155"/><rect x="200" y="456" width="200" height="16" rx="8" fill="#475569"/>`,
  }),
  keyboard: (a) => ({
    body: `<rect x="50" y="200" width="500" height="200" rx="18" fill="#1f2937"/><rect x="62" y="212" width="476" height="176" rx="12" fill="#111827" stroke="#${a}" stroke-width="2"/>
      ${Array.from({ length: 4 }, (_, row) =>
        Array.from({ length: 12 }, (_, col) => `<rect x="${78 + col * 37}" y="${226 + row * 36}" width="31" height="29" rx="5" fill="${(row + col) % 7 === 0 ? `#${a}` : '#334155'}"/>`).join(''),
      ).join('')}
      <rect x="152" y="370" width="296" height="10" rx="5" fill="#475569"/>`,
  }),
  mouse: (a) => ({
    body: `<ellipse cx="300" cy="320" rx="120" ry="175" fill="#1f2937"/><path d="M300 145 v140" stroke="#0b1220" stroke-width="5"/>
      <path d="M180 285 h240" stroke="#0b1220" stroke-width="4"/><rect x="288" y="190" width="24" height="56" rx="12" fill="#${a}"/>
      <path d="M200 420 q100 70 200 0" stroke="#${a}" stroke-width="8" fill="none" stroke-linecap="round"/>`,
  }),
  headphones: (a) => ({
    body: `<path d="M150 340 v-60 a150 150 0 0 1 300 0 v60" stroke="#1f2937" stroke-width="30" fill="none" stroke-linecap="round"/>
      <rect x="110" y="300" width="90" height="150" rx="40" fill="#1f2937"/><rect x="400" y="300" width="90" height="150" rx="40" fill="#1f2937"/>
      <rect x="128" y="318" width="54" height="114" rx="27" fill="#${a}"/><rect x="418" y="318" width="54" height="114" rx="27" fill="#${a}"/>
      <path d="M180 180 a150 150 0 0 1 240 0" stroke="#${a}" stroke-width="6" fill="none"/>`,
  }),
  smartphone: (a) => ({
    defs: screenGradient('ph', a),
    body: `<rect x="200" y="80" width="200" height="420" rx="34" fill="#1f2937"/><rect x="212" y="94" width="176" height="392" rx="26" fill="url(#ph)"/>
      <rect x="270" y="104" width="60" height="14" rx="7" fill="#0b1220"/><circle cx="300" cy="250" r="44" fill="#ffffff22"/>
      <rect x="236" y="400" width="128" height="10" rx="5" fill="#ffffff55"/><rect x="250" y="420" width="100" height="8" rx="4" fill="#ffffff33"/>`,
  }),
  tablet: (a) => ({
    defs: screenGradient('tb', a),
    body: `<rect x="110" y="110" width="380" height="380" rx="30" fill="#1f2937"/><rect x="128" y="128" width="344" height="344" rx="16" fill="url(#tb)"/>
      ${Array.from({ length: 3 }, (_, r) => Array.from({ length: 4 }, (_, c) => `<rect x="${152 + c * 78}" y="${160 + r * 78}" width="50" height="50" rx="12" fill="#ffffff${r === 1 && c === 2 ? '66' : '2a'}"/>`).join('')).join('')}
      <circle cx="300" cy="119" r="4" fill="#0b1220"/>`,
  }),
  accessory: (a) => ({
    body: `<rect x="170" y="230" width="260" height="120" rx="24" fill="#1f2937"/><rect x="186" y="246" width="228" height="88" rx="16" fill="#111827" stroke="#${a}" stroke-width="3"/>
      ${Array.from({ length: 4 }, (_, i) => `<rect x="${206 + i * 52}" y="276" width="34" height="26" rx="4" fill="#0b1220" stroke="#94a3b8" stroke-width="2"/>`).join('')}
      <path d="M170 290 C 90 290, 120 440, 60 470" stroke="#334155" stroke-width="16" fill="none" stroke-linecap="round"/>
      <rect x="40" y="455" width="40" height="30" rx="6" fill="#475569"/><circle cx="400" cy="262" r="6" fill="#${a}"/>`,
  }),
  components: (a) => drawings.gpu(a),
  peripherals: (a) => drawings.keyboard(a),
};

export function renderProductIllustration(kind: IllustrationKind, accentRaw: string, variant: number, labelRaw: string, transparent = false): string {
  const accent = /^[0-9a-f]{6}$/i.test(accentRaw) ? accentRaw.toLowerCase() : '6366f1';
  const label = labelRaw
    .slice(0, 28)
    .replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
  const { defs = '', body } = drawings[kind](accent);
  const v = Math.abs(variant) % 3;
  const bgA = ['f8fafc', 'eef2ff', 'f1f5f9'][v];
  const bgB = shade(accent, 150);
  const transform = ['', 'rotate(-6 300 300)', 'translate(0 -10) scale(0.92) translate(26 26)'][v];
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600" role="img" aria-label="${label || kind}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#${bgA}"/><stop offset="1" stop-color="#${bgB}"/></linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.45" r="0.5"><stop offset="0" stop-color="#${accent}" stop-opacity="0.22"/><stop offset="1" stop-color="#${accent}" stop-opacity="0"/></radialGradient>
    ${defs}
  </defs>
  ${transparent ? '' : '<rect width="600" height="600" fill="url(#bg)"/>'}
  <circle cx="300" cy="290" r="250" fill="url(#glow)"/>
  <ellipse cx="300" cy="520" rx="210" ry="18" fill="#0f172a" opacity="0.08"/>
  <g transform="${transform}">${body}</g>
  ${label && !transparent ? `<text x="32" y="568" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="26" font-weight="700" fill="#0f172a" opacity="0.55" letter-spacing="1">${label.toUpperCase()}</text>` : ''}
</svg>`;
}

/*
 * QR codes (pure): byte mode, error correction level M, versions 1–10
 * (up to 213 bytes, plenty for an export stamp). Returns a square matrix of
 * booleans (true = dark), drawn by html.js (SVG) and pdf.js (rectangles).
 */

// Per version (1–10), level M: [EC codewords per block, [data codewords per block…]].
const BLOCKS = [
  null,
  [10, [16]],
  [16, [28]],
  [26, [44]],
  [18, [32, 32]],
  [24, [43, 43]],
  [16, [27, 27, 27, 27]],
  [18, [31, 31, 31, 31]],
  [22, [38, 38, 39, 39]],
  [22, [36, 36, 36, 37, 37]],
  [26, [43, 43, 43, 43, 44]],
];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

// GF(256) arithmetic for Reed-Solomon (polynomial 0x11d).
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++, x = (x << 1) ^ (x & 0x80 ? 0x11d : 0)) {
  EXP[i] = x;
  LOG[x] = i;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function ecCodewords(data, n) {
  let gen = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(gen.length + 1).fill(0);
    gen.forEach((g, j) => {
      next[j] ^= g;
      next[j + 1] ^= mul(g, EXP[i]);
    });
    gen = next;
  }
  const rem = [...data, ...new Array(n).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const f = rem[i];
    if (f) for (let j = 1; j < gen.length; j++) rem[i + j] ^= mul(gen[j], f);
  }
  return rem.slice(data.length);
}

function codewords(bytes, version) {
  const [ecLen, sizes] = BLOCKS[version];
  const capacity = sizes.reduce((a, b) => a + b, 0);
  const bits = [];
  const put = (value, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  put(0, Math.min(4, capacity * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let pad = 0; data.length < capacity; pad++) data.push(pad % 2 ? 0x11 : 0xec);
  const blocks = [];
  let at = 0;
  for (const size of sizes) {
    const d = data.slice(at, (at += size));
    blocks.push({ d, e: ecCodewords(d, ecLen) });
  }
  const out = [];
  for (let i = 0; i < Math.max(...sizes); i++) for (const b of blocks) if (i < b.d.length) out.push(b.d[i]);
  for (let i = 0; i < ecLen; i++) for (const b of blocks) out.push(b.e[i]);
  return out;
}

// BCH codes for the format (15 bits) and version (18 bits) information.
function bch(value, poly, bitsData, bitsTotal) {
  let v = value << (bitsTotal - bitsData);
  const top = Math.floor(Math.log2(poly));
  while (v && Math.floor(Math.log2(v)) >= top) v ^= poly << (Math.floor(Math.log2(v)) - top);
  return (value << (bitsTotal - bitsData)) | v;
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function build(version, data, mask) {
  const n = version * 4 + 17;
  const m = Array.from({ length: n }, () => new Array(n).fill(false));
  const fixed = Array.from({ length: n }, () => new Array(n).fill(false));
  const set = (r, c, v) => {
    m[r][c] = v;
    fixed[r][c] = true;
  };
  const finder = (r0, c0) => {
    for (let r = -1; r <= 7; r++)
      for (let c = -1; c <= 7; c++) {
        const rr = r0 + r;
        const cc = c0 + c;
        if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
        const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
        set(rr, cc, r >= 0 && r <= 6 && c >= 0 && c <= 6 && ring !== 2);
      }
  };
  finder(0, 0);
  finder(0, n - 7);
  finder(n - 7, 0);
  for (let i = 8; i < n - 8; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  const pos = ALIGN[version];
  for (const [i, r] of pos.entries())
    for (const [j, c] of pos.entries()) {
      // Every combination except the three next to the finder patterns.
      if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) continue;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
    }
  // Format information (level M = 00) and the dark module.
  const format = bch((0b00 << 3) | mask, 0x537, 5, 15) ^ 0x5412;
  for (let i = 0; i < 15; i++) {
    const bit = ((format >>> i) & 1) === 1;
    if (i < 6) set(i, 8, bit);
    else if (i < 8) set(i + 1, 8, bit);
    else set(n - 15 + i, 8, bit);
    if (i < 8) set(8, n - i - 1, bit);
    else if (i < 9) set(8, 15 - i, bit);
    else set(8, 15 - i - 1, bit);
  }
  set(n - 8, 8, true);
  if (version >= 7) {
    const v = bch(version, 0x1f25, 6, 18);
    for (let i = 0; i < 18; i++) {
      const bit = ((v >>> i) & 1) === 1;
      set(Math.floor(i / 3), n - 11 + (i % 3), bit);
      set(n - 11 + (i % 3), Math.floor(i / 3), bit);
    }
  }
  // Data, in the zigzag order, with the mask applied.
  let bit = 0;
  const bits = data.flatMap((b) => [7, 6, 5, 4, 3, 2, 1, 0].map((s) => (b >>> s) & 1));
  for (let right = n - 1, up = true; right > 0; right -= 2, up = !up) {
    if (right === 6) right = 5;
    for (let k = 0; k < n; k++) {
      const r = up ? n - 1 - k : k;
      for (const c of [right, right - 1]) {
        if (fixed[r][c]) continue;
        const v = bit < bits.length ? bits[bit++] === 1 : false;
        m[r][c] = v !== MASKS[mask](r, c);
      }
    }
  }
  return m;
}

// Penalty score (lower is easier to scan), per the QR specification.
function penalty(m) {
  const n = m.length;
  let score = 0;
  const lines = [...m, ...m.map((_, c) => m.map((row) => row[c]))];
  for (const line of lines) {
    for (let i = 0, run = 1; i < n; i++, run++) {
      if (i === n - 1 || line[i] !== line[i + 1]) {
        if (run >= 5) score += run - 2;
        run = 0;
      }
    }
    const s = line.map((v) => (v ? 1 : 0)).join("");
    for (const p of ["10111010000", "00001011101"]) for (let i = s.indexOf(p); i >= 0; i = s.indexOf(p, i + 1)) score += 40;
  }
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) if (m[r][c] === m[r + 1][c] && m[r][c] === m[r][c + 1] && m[r][c] === m[r + 1][c + 1]) score += 3;
  const dark = m.flat().filter(Boolean).length;
  return score + Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
}

// Text → matrix (boolean[][]). Throws when the text is too long.
export function qrMatrix(text) {
  const bytes = new TextEncoder().encode(text);
  const version = BLOCKS.findIndex((b, v) => b && bytes.length + (v < 10 ? 2 : 3) <= b[1].reduce((x, y) => x + y, 0));
  if (version < 1) throw new Error("Too much text for a QR code (max 213 bytes)");
  const data = codewords(bytes, version);
  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const m = build(version, data, mask);
    const p = penalty(m);
    if (!best || p < best.p) best = { m, p };
  }
  return best.m;
}

// Matrix → SVG (with the 4-module quiet zone).
export function qrSvg(matrix, size = 132) {
  const n = matrix.length + 8;
  let path = "";
  matrix.forEach((row, r) => row.forEach((v, c) => v && (path += `M${c + 4} ${r + 4}h1v1h-1z`)));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

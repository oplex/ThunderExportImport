/*
 * Helvetica (one of PDF's built-in fonts, no embedding needed): character
 * widths in 1/1000 em, and Unicode → WinAnsi byte mapping. Characters
 * outside WinAnsi (Western European) become "?".
 */

// Widths for ASCII 32–126 (Adobe's Helvetica metrics).
const ASCII = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584,
  556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278,
  469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260,
  334, 584,
];

// WinAnsi bytes 0x80–0x9F that differ from Latin-1.
const WIN = { "€": 0x80, "‚": 0x82, ƒ: 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, ˆ: 0x88, "‰": 0x89, Š: 0x8a, "‹": 0x8b, Œ: 0x8c, Ž: 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, š: 0x9a, "›": 0x9b, œ: 0x9c, ž: 0x9e, Ÿ: 0x9f };
const WIDE = { 0x80: 556, 0x85: 1000, 0x89: 1000, 0x8c: 1000, 0x95: 350, 0x96: 556, 0x97: 1000, 0x99: 1000, 0x9c: 944 };

// One character → WinAnsi byte (63 = "?" when not available).
export function winAnsi(ch) {
  if (ch in WIN) return WIN[ch];
  const c = ch.codePointAt(0);
  if (c === 9) return 32;
  if ((c >= 32 && c <= 126) || (c >= 160 && c <= 255)) return c;
  return 63;
}

// Width of a WinAnsi byte. Accented letters take their base letter's width.
export function widthOf(byte, bold = false) {
  let w;
  if (byte >= 32 && byte <= 126) w = ASCII[byte - 32];
  else if (WIDE[byte]) w = WIDE[byte];
  else if (byte >= 192) {
    const base = String.fromCharCode(byte).normalize("NFD")[0];
    const b = base.charCodeAt(0);
    w = b >= 32 && b <= 126 ? ASCII[b - 32] : byte === 0xc6 ? 1000 : byte === 0xe6 ? 889 : byte === 0xdf ? 611 : 556;
  } else w = 556;
  return bold ? w * 1.06 : w;
}

export const textWidth = (bytes, size, bold = false) => bytes.reduce((n, b) => n + widthOf(b, bold), 0) * (size / 1000);

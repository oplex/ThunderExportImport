/*
 * A small PDF writer for exported messages (pure): A4 pages, Helvetica,
 * headers in bold, the text wrapped to the page, and page numbers.
 *   makePdf({ title, headers: [[label, value]], body, footer, stamp }) → Uint8Array
 * stamp: { rows: [[label, value]], matrix } from stamp.js, drawn in a box
 * with its QR code at the top of the first page.
 * HTML bodies are passed as text (see html.js htmlToText).
 */

import { winAnsi, textWidth } from "./pdf-font.js";

const PAGE = { w: 595.28, h: 841.89 };
const MARGIN = 56;
const SIZE = 10.5;
const LEAD = 14;

const bytesOf = (text) => Array.from(text, winAnsi);

// PDF string literal for WinAnsi bytes (ASCII file; others as \ooo).
function pdfString(bytes) {
  let s = "(";
  for (const b of bytes) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) s += `\\${String.fromCharCode(b)}`;
    else if (b < 32 || b > 126) s += `\\${b.toString(8).padStart(3, "0")}`;
    else s += String.fromCharCode(b);
  }
  return `${s})`;
}

// Break one paragraph into lines that fit `width` points.
export function wrap(text, width, size = SIZE, bold = false) {
  const out = [];
  let line = [];
  const words = text.split(/(\s+)/).filter((w) => w.length);
  const fits = (bytes) => textWidth(bytes, size, bold) <= width;
  for (const word of words) {
    const wb = bytesOf(/^\s+$/.test(word) ? " " : word);
    if (fits([...line, ...wb])) {
      line.push(...wb);
      continue;
    }
    if (line.length) out.push(line);
    line = [];
    if (/^\s+$/.test(word)) continue;
    // A word longer than the line is cut.
    let rest = wb;
    while (!fits(rest)) {
      let n = rest.length - 1;
      while (n > 1 && !fits(rest.slice(0, n))) n--;
      out.push(rest.slice(0, n));
      rest = rest.slice(n);
    }
    line = rest;
  }
  out.push(line);
  return out.map((l) => {
    while (l.length && l[l.length - 1] === 32) l.pop();
    return l;
  });
}

// Lay out the content into pages of { bold, size, bytes, y } lines.
const QR_BOX = 92;

function layout({ title, headers = [], body = "", footer = "", stamp = null }) {
  const width = PAGE.w - 2 * MARGIN;
  const lines = [];
  if (stamp) {
    const textWidthAvail = width - QR_BOX - 16;
    const rows = [];
    for (const [label, value] of stamp.rows) for (const l of wrap(`${label}: ${value}`, textWidthAvail, 8)) rows.push({ bold: false, size: 8, bytes: l, lead: 10.5 });
    const height = Math.max(QR_BOX, rows.length * 10.5 + 12) + 8;
    lines.push({ stampBox: height, matrix: stamp.matrix, lead: 0 });
    lines.push(...rows.map((r, i) => ({ ...r, stampRow: i })));
    lines.push({ gap: Math.max(8, height - rows.length * 10.5) });
  }
  for (const l of wrap(title ?? "", width, 15, true)) lines.push({ bold: true, size: 15, bytes: l, lead: 20 });
  lines.push({ gap: 6 });
  for (const [label, value] of headers) {
    if (!value) continue;
    const wrapped = wrap(`${label}: ${value}`, width, 9.5);
    for (const l of wrapped) lines.push({ bold: false, size: 9.5, bytes: l, lead: 13, dim: true });
  }
  lines.push({ gap: 10, rule: true });
  for (const para of String(body).replace(/\r\n?/g, "\n").split("\n")) {
    for (const l of wrap(para, width)) lines.push({ bold: false, size: SIZE, bytes: l, lead: LEAD });
  }
  if (footer) {
    lines.push({ gap: 10, rule: true });
    for (const l of wrap(footer, width, 9)) lines.push({ bold: false, size: 9, bytes: l, lead: 12, dim: true });
  }
  const pages = [[]];
  let y = PAGE.h - MARGIN;
  for (const l of lines) {
    const need = l.gap ?? l.lead;
    if (l.stampBox) {
      pages.at(-1).push({ ...l, y });
      y -= 12;
      continue;
    }
    if (y - need < MARGIN + 20) {
      pages.push([]);
      y = PAGE.h - MARGIN;
      if (l.gap) continue;
    }
    y -= need;
    pages.at(-1).push({ ...l, y });
  }
  return pages;
}

// The stamp's frame and QR code (dark modules as filled squares).
function stampGraphics(top, height, matrix) {
  let s = `0.6 G 0.7 w ${MARGIN} ${(top - height).toFixed(2)} ${PAGE.w - 2 * MARGIN} ${height.toFixed(2)} re S\n`;
  const n = matrix.length;
  const cell = (QR_BOX - 8) / n;
  const x0 = PAGE.w - MARGIN - QR_BOX + 4;
  const y0 = top - 4;
  s += "0 g\n";
  matrix.forEach((row, r) => row.forEach((dark, c) => dark && (s += `${(x0 + c * cell).toFixed(2)} ${(y0 - (r + 1) * cell).toFixed(2)} ${cell.toFixed(3)} ${cell.toFixed(3)} re\n`)));
  return `${s}f\n`;
}

function pageContent(lines, n, total) {
  let s = "";
  for (const l of lines) {
    if (l.stampBox) {
      s += stampGraphics(l.y, l.stampBox, l.matrix);
      continue;
    }
    if (l.rule) s += `0.8 G 0.5 w ${MARGIN} ${l.y + 4} m ${PAGE.w - MARGIN} ${l.y + 4} l S\n`;
    if (!l.bytes) continue;
    const x = l.stampRow != null ? MARGIN + 8 : MARGIN;
    s += `BT /${l.bold ? "F2" : "F1"} ${l.size} Tf ${l.dim ? "0.35 g" : "0 g"} ${x} ${l.y.toFixed(2)} Td ${pdfString(l.bytes)} Tj ET\n`;
  }
  const label = bytesOf(`${n} / ${total}`);
  s += `BT /F1 8 Tf 0.5 g ${(PAGE.w - MARGIN - textWidth(label, 8)).toFixed(2)} ${MARGIN - 24} Td ${pdfString(label)} Tj ET\n`;
  return s;
}

export function makePdf(content) {
  const pages = layout(content);
  const objects = [];
  const add = (body) => objects.push(body) && objects.length;
  const catalog = add(null);
  const pagesId = add(null);
  const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const kids = [];
  pages.forEach((lines, i) => {
    const stream = pageContent(lines, i + 1, pages.length);
    const contents = add(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE.w} ${PAGE.h}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${contents} 0 R >>`));
  });
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  const info = add(`<< /Title ${pdfString(bytesOf(content.title ?? ""))} /Producer (ThunderExportImport) >>`);
  let out = "%PDF-1.4\n%âãÏÓ\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(out, (c) => c.charCodeAt(0) & 0xff);
}

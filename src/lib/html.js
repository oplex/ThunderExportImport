/*
 * Message → standalone HTML page, and HTML → text (pure). Scripts, event
 * handlers and remote content are removed: exported pages open offline and
 * can't phone home.
 */

import { qrSvg } from "./qr.js";

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
export const escapeHtml = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ESC[c]);

// Strip what shouldn't run or load in an exported page.
export function sanitize(html) {
  return String(html)
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<(iframe|object|embed|base|meta|link)\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["']?)\s*javascript:[^"'\s>]*/gi, '$1=$2#')
    .replace(/(src|background)\s*=\s*(["']?)https?:[^"'\s>]*/gi, '$1=$2');
}

// Inner content of <body> (or the whole thing).
const bodyOf = (html) => /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;

function stampBox(stamp) {
  if (!stamp) return "";
  const rows = stamp.rows.map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join("");
  return `<div class="stamp"><table>${rows}</table><div class="qr" title="${escapeHtml(stamp.qrText)}">${qrSvg(stamp.matrix, 120)}</div></div>`;
}

// headers: [[label, value]]; attachments: [{ name, href }]; cids: { cid: href };
// stamp: from stamp.js (optional compliance stamp at the top).
export function messagePage({ title, headers, html, text, attachments = [], cids = {}, stamp = null }) {
  let content = html ? sanitize(bodyOf(html)) : `<pre class="plain">${escapeHtml(text)}</pre>`;
  content = content.replace(/(src\s*=\s*["']?)cid:([^"'\s>]+)/gi, (all, pre, cid) => (cids[cid] ? `${pre}${encodeURI(cids[cid])}` : all));
  const rows = headers.filter(([, v]) => v).map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join("");
  const files = attachments.length
    ? `<div class="att"><strong>Attachments</strong><ul>${attachments.map((a) => `<li>${a.href ? `<a href="${encodeURI(a.href)}">${escapeHtml(a.name)}</a>` : escapeHtml(a.name)}</li>`).join("")}</ul></div>`
    : "";
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'">
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:860px;margin:24px auto;padding:0 16px}
table.h{border-collapse:collapse;margin-bottom:16px;font-size:13px}table.h th{text-align:left;color:#666;padding:2px 12px 2px 0;vertical-align:top}
.stamp{display:flex;justify-content:space-between;gap:16px;border:1px solid #999;border-radius:6px;padding:8px 10px;margin-bottom:16px;font-size:12px}
.stamp th{text-align:left;color:#555;padding:1px 10px 1px 0}.stamp td{word-break:break-all}.qr svg{display:block}
.plain{white-space:pre-wrap;font:14px/1.5 ui-monospace,Menlo,Consolas,monospace}.att{border-top:1px solid #ddd;margin-top:20px;padding-top:8px;font-size:13px}</style>
</head><body>${stampBox(stamp)}<h1 style="font-size:20px">${escapeHtml(title)}</h1><table class="h">${rows}</table>
<div class="msg">${content}</div>${files}</body></html>
`;
}

const ENTITIES = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", euro: "€", copy: "©" };

// Readable text from HTML (for PDF and TXT exports).
export function htmlToText(html) {
  return bodyOf(String(html))
    .replace(/<(script|style|head)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|pre)>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (all, e) => {
      if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENTITIES[e.toLowerCase()] ?? all;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// CSV index of exported messages.
export function indexCsv(rows) {
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["Date", "From", "To", "Subject", "Folder", "File"];
  return [head, ...rows.map((r) => [r.date, r.from, r.to, r.subject, r.folder, r.file])].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

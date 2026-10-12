/*
 * A small MIME reader for raw messages (pure). Used for what older
 * Thunderbird versions don't report: inline images (Content-ID parts).
 * parseMime(bytes) → { headers, type, params, parts, body: Uint8Array }
 */

import { bytesToBinary, binaryToBytes } from "./mbox.js";

function headerBlock(text) {
  const headers = {};
  for (const line of text.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
    const m = /^([!-9;-~]+):\s*(.*)$/.exec(line);
    if (m) (headers[m[1].toLowerCase()] ??= []).push(m[2]);
  }
  return headers;
}

// 'image/png; name="a b.png"' → { value: "image/png", params: { name: "a b.png" } }
export function headerParams(value = "") {
  const [head, ...rest] = value.split(";");
  const params = {};
  for (const p of rest) {
    const m = /^\s*([^=\s]+)\s*=\s*"?([^"]*)"?\s*$/.exec(p);
    if (m) params[m[1].toLowerCase()] = m[2];
  }
  return { value: head.trim().toLowerCase(), params };
}

function decode(body, encoding) {
  const e = (encoding ?? "").trim().toLowerCase();
  if (e === "base64") {
    // Tolerate damaged base64: drop the broken tail instead of failing.
    let clean = body.replace(/[^A-Za-z0-9+/]/g, "");
    clean = clean.slice(0, clean.length - (clean.length % 4 === 1 ? 1 : 0));
    try {
      return Uint8Array.from(atob(clean.padEnd(Math.ceil(clean.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
    } catch {
      return new Uint8Array(0);
    }
  }
  if (e === "quoted-printable") {
    return binaryToBytes(body.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))));
  }
  return binaryToBytes(body);
}

// partName numbers parts like Thunderbird does: the message's own part is
// "1", its children "1.1", "1.2", their children "1.1.1" …
function parsePart(text, depth = 0, partName = "1") {
  const split = /\r?\n\r?\n/.exec(text);
  const headers = headerBlock(split ? text.slice(0, split.index) : text);
  const raw = split ? text.slice(split.index + split[0].length) : "";
  const { value: type, params } = headerParams(headers["content-type"]?.[0] ?? "text/plain");
  const part = { headers, type, params, parts: [], body: null, partName };
  if (type.startsWith("multipart/") && params.boundary && depth < 20) {
    const sections = raw.split(new RegExp(`\\r?\\n?--${params.boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:--)?[ \\t]*(?:\\r?\\n|$)`));
    for (const s of sections.slice(1)) if (s.trim()) part.parts.push(parsePart(s, depth + 1, `${partName}.${part.parts.length + 1}`));
  } else {
    part.body = decode(raw, headers["content-transfer-encoding"]?.[0]);
  }
  return part;
}

export function parseMime(bytes) {
  return parsePart(bytesToBinary(bytes));
}

// Inline parts: those with a Content-ID, or any leaf part whose number is
// in `partNames`. → [{ cid, partName, name, type, body }]
export function inlineParts(root, partNames = []) {
  const out = [];
  const walk = (p) => {
    const cid = p.headers["content-id"]?.[0]?.replace(/^\s*<|>\s*$/g, "");
    if ((cid || partNames.includes(p.partName)) && p.body) {
      const name = p.params.name ?? headerParams(p.headers["content-disposition"]?.[0]).params.filename ?? `${(cid ?? `part-${p.partName}`).split("@")[0]}.${p.type.split("/")[1] ?? "bin"}`;
      out.push({ cid: cid ?? null, partName: p.partName, name, type: p.type, body: p.body });
    }
    p.parts.forEach(walk);
  };
  walk(root);
  return out;
}

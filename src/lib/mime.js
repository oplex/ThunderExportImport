/*
 * Reading a message from messages.getFull() (pure): the best body, and the
 * headers shown in exports.
 */

// Walk the part tree depth first.
function* parts(part) {
  if (!part) return;
  yield part;
  for (const p of part.parts ?? []) yield* parts(p);
}

const isAttachment = (p) => /attachment/i.test(p.headers?.["content-disposition"]?.[0] ?? "") || (p.name && !/^text\//i.test(p.contentType ?? ""));

// { html, text }: the first HTML and plain-text bodies (either may be "").
export function bodies(full) {
  let html = "";
  let text = "";
  for (const p of parts(full)) {
    if (p.body == null || isAttachment(p)) continue;
    const type = (p.contentType ?? "").toLowerCase();
    if (!html && type === "text/html") html = p.body;
    if (!text && type === "text/plain") text = p.body;
  }
  return { html, text };
}

// Content-ID → part name, to point cid: images at exported attachment files.
export function contentIds(full) {
  const map = {};
  for (const p of parts(full)) {
    const cid = p.headers?.["content-id"]?.[0];
    if (cid && p.partName) map[cid.replace(/^<|>$/g, "")] = p.partName;
  }
  return map;
}

const list = (v) => (Array.isArray(v) ? v.join(", ") : v ?? "");

// [[label, value]] for a message header (MessageHeader from Thunderbird).
export function headerRows(m) {
  const date = m.date ? new Date(m.date) : null;
  return [
    ["From", m.author ?? ""],
    ["To", list(m.recipients)],
    ["Cc", list(m.ccList)],
    ["Date", date && !isNaN(date) ? date.toLocaleString() : ""],
    ["Subject", m.subject ?? ""],
  ];
}

/*
 * Export messages to files: .eml (exactly as stored), .pdf, .html, .txt,
 * attachments, one .mbox per folder, index.csv and export-manifest.json
 * (SHA-256 of every file). Output: one ZIP, or separate files in a folder.
 */

import { rawBytes, fullMessage, attachments } from "./mail.js";
import { cleanRaw } from "../lib/mbox.js";
import { saveFile } from "./save.js";
import { fileBase, uniqueNamer, safeName } from "../lib/names.js";
import { bodies, contentIds, headerRows } from "../lib/mime.js";
import { messagePage, htmlToText, indexCsv } from "../lib/html.js";
import { makePdf } from "../lib/pdf.js";
import { makeMbox } from "../lib/mbox.js";
import { makeZip, toBytes } from "../lib/zip.js";
import { makeStamp, makeManifest, sha256 } from "../lib/stamp.js";
import { parseMime, inlineParts } from "../lib/rawmime.js";

const pad = (n) => String(n).padStart(2, "0");
const stampNow = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}`;
const sender = (author) => /<([^>]+)>/.exec(author ?? "")?.[1] ?? author ?? "";
const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// Thunderbird 91–127 report inline images neither as attachments nor by
// Content-ID, and turn their src into internal mailbox:/imap: URLs (which
// hold local profile paths). Point every inline image at an exported file
// taken from the raw message, and drop internal URLs that can't be mapped.
const INTERNAL = /(src\s*=\s*["']?)((?:mailbox|imap|news|ews|owl)[\w-]*:[^"'\s>]*)/gi;

async function linkInlineImages(html, raw, base, saved, cids, save) {
  if (!html) return html;
  let page = html.replace(INTERNAL, (all, pre, url) => {
    const part = /[?&]part=([\d.]+)/.exec(url)?.[1];
    return part ? `${pre}cid:part-${part}` : pre;
  });
  const wanted = [...page.matchAll(/cid:([^"'\s>]+)/gi)].map((m) => m[1]).filter((cid) => !cids[cid]);
  if (wanted.length && save) {
    const parts = wanted.filter((c) => c.startsWith("part-")).map((c) => c.slice(5));
    const taken = new Set(Object.values(saved));
    for (const p of inlineParts(parseMime(raw), parts)) {
      const key = p.cid && wanted.includes(p.cid) ? p.cid : wanted.includes(`part-${p.partName}`) ? `part-${p.partName}` : null;
      if (!key) continue;
      const path = saved[p.partName] ?? `${base} files/${safeName(p.name, 100) || "image"}`;
      if (!taken.has(path)) await save(path, p.body);
      taken.add(path);
      cids[key] = path;
    }
  }
  // Whatever is still unresolved must not point at the local profile.
  return page.replace(/(src\s*=\s*["']?)cid:(part-[^"'\s>]*)/gi, (all, pre, key) => (cids[key] ? all : pre));
}

// Files for one message → calls emit(path, bytes). Returns what the index needs.
async function exportOne(m, dir, names, opts, emit, now) {
  const f = opts.formats;
  const base = names(fileBase(m, opts.pattern));
  const raw = cleanRaw(await rawBytes(m.id));
  const out = { raw, base };
  if (f.eml) await emit(`${dir}${base}.eml`, raw);
  if (!f.pdf && !f.html && !f.txt && !f.attachments) return out;
  const atts = await attachments(m.id);
  const saved = {};
  if (f.attachments && atts.length) {
    const attNames = uniqueNamer();
    for (const a of atts) {
      const name = attNames(safeName(a.name, 100) || "attachment");
      saved[a.partName] = `${base} files/${name}`;
      await emit(`${dir}${saved[a.partName]}`, await a.bytes());
    }
  }
  if (!f.pdf && !f.html && !f.txt) return out;
  const full = await fullMessage(m.id);
  const { html, text } = bodies(full);
  const plainText = text || htmlToText(html);
  const headers = headerRows(m);
  const title = m.subject || "(no subject)";
  const stamp = opts.stamp ? makeStamp(opts, { messageId: m.headerMessageId, folder: opts.folderLabel, sha256: await sha256(raw) }, now) : null;
  const attList = atts.map((a) => ({ name: a.name, href: saved[a.partName] ?? "" }));
  if (f.html) {
    const cids = Object.fromEntries(Object.entries(contentIds(full)).filter(([, part]) => saved[part]).map(([cid, part]) => [cid, saved[part]]));
    const page = await linkInlineImages(html, raw, base, saved, cids, f.attachments ? (path, bytes) => emit(`${dir}${path}`, bytes) : null);
    await emit(`${dir}${base}.html`, toBytes(messagePage({ title, headers, html: page, text, attachments: attList, cids, stamp })));
  }
  const footer = atts.length ? `Attachments: ${atts.map((a) => `${a.name} (${kb(a.size ?? 0)})`).join(", ")}` : "";
  if (f.pdf) await emit(`${dir}${base}.pdf`, makePdf({ title, headers, body: plainText, footer, stamp }));
  if (f.txt) await emit(`${dir}${base}.txt`, toBytes(`${headers.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${plainText}\n${footer ? `\n${footer}\n` : ""}`));
  return out;
}

// groups: [{ dir: ["Inbox", "Sub"], label, messages }]; opts: settings plus
// { name } for the export. → { name, files, messages, bytes? (ZIP output) }
export async function runExport(groups, opts, { onProgress = () => {}, signal } = {}) {
  const now = new Date();
  const root = safeName(opts.name || `Thunder export ${stampNow(now)}`);
  const total = groups.reduce((n, g) => n + g.messages.length, 0);
  const files = [];
  const hashes = [];
  const emit = async (path, data) => {
    const bytes = toBytes(data);
    if (opts.output === "zip") files.push({ path, data: bytes });
    else {
      await saveFile(`${root}/${path}`, bytes);
      if (opts.manifest) hashes.push({ path, data: bytes });
    }
  };
  const index = [];
  let done = 0;
  for (const g of groups) {
    const dir = g.dir.map((s) => safeName(s) || "_").join("/");
    const prefix = dir ? `${dir}/` : "";
    const names = uniqueNamer();
    const mbox = [];
    for (const m of g.messages) {
      if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
      onProgress({ done, total, current: m.subject });
      const r = await exportOne(m, prefix, names, { ...opts, folderLabel: g.label }, emit, now);
      if (opts.formats.mbox) mbox.push({ raw: r.raw, sender: sender(m.author), date: new Date(m.date) });
      index.push({ date: new Date(m.date).toISOString(), from: m.author, to: (m.recipients ?? []).join(", "), subject: m.subject, folder: g.label, file: `${prefix}${r.base}` });
      done++;
    }
    if (mbox.length) await emit(`${prefix}${safeName(g.dir.at(-1) || "messages")}.mbox`, makeMbox(mbox));
  }
  await emit("index.csv", toBytes(indexCsv(index)));
  if (opts.manifest) {
    const manifest = await makeManifest(opts.output === "zip" ? files : hashes, opts, now);
    await emit("export-manifest.json", toBytes(JSON.stringify(manifest, null, 2)));
  }
  onProgress({ done, total, current: "" });
  if (opts.output !== "zip") return { name: root, messages: done, files: hashes.length || index.length };
  const bytes = makeZip(files, now);
  return { name: `${root}.zip`, messages: done, files: files.length, bytes };
}

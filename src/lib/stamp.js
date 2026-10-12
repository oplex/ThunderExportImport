/*
 * Compliance stamp on exported messages (pure): who exported it and when,
 * the Message-ID, the source folder and the SHA-256 of the original message,
 * repeated in a QR code. export-manifest.json lists every exported file with
 * its SHA-256 so an export can be checked later (verify.js).
 */

import { qrMatrix } from "./qr.js";

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function sha256(bytes) {
  return hex(await crypto.subtle.digest("SHA-256", bytes));
}

// settings: { exportedBy, organization, note }; message: { messageId, folder, sha256, subject }.
export function makeStamp(settings, message, at = new Date()) {
  const rows = [
    ["Exported by", [settings.exportedBy, settings.organization].filter(Boolean).join(", ")],
    ["Exported at", at.toISOString().replace(/\.\d+Z$/, "Z")],
    ["Message-ID", message.messageId ? `<${message.messageId}>` : ""],
    ["Folder", message.folder ?? ""],
    ["SHA-256", message.sha256 ?? ""],
    ["Note", settings.note ?? ""],
  ].filter(([, v]) => v);
  // QR: short keys so a long Message-ID still fits (max 213 bytes).
  const parts = [`TEI1`, `sha256:${message.sha256 ?? ""}`, `at:${rows[1][1]}`];
  if (settings.exportedBy) parts.push(`by:${settings.exportedBy.slice(0, 40)}`);
  if (message.messageId) parts.push(`id:${message.messageId.slice(0, 213)}`);
  let qrText = parts.join("|");
  while (new TextEncoder().encode(qrText).length > 213) qrText = qrText.slice(0, -1);
  return { rows, qrText, matrix: qrMatrix(qrText) };
}

// files: [{ path, data }] → manifest object (hashes of every file).
export async function makeManifest(files, settings, at = new Date()) {
  const list = [];
  for (const f of files) list.push({ path: f.path, size: f.data.length, sha256: await sha256(f.data) });
  return { app: "ThunderExportImport", format: 1, exportedAt: at.toISOString(), exportedBy: settings.exportedBy ?? "", organization: settings.organization ?? "", files: list };
}

// Check an export: every file listed in export-manifest.json must exist
// and have the same SHA-256. → { ok, checked, problems: [text] }
export async function verifyExport(entries) {
  const byPath = new Map(entries.map((e) => [e.path, e.data]));
  const manifestEntry = [...byPath.keys()].find((p) => p === "export-manifest.json" || p.endsWith("/export-manifest.json"));
  if (!manifestEntry) return { ok: false, checked: 0, problems: ["No export-manifest.json in this export"] };
  const prefix = manifestEntry.slice(0, -"export-manifest.json".length);
  const manifest = JSON.parse(new TextDecoder().decode(byPath.get(manifestEntry)));
  const problems = [];
  for (const f of manifest.files) {
    const data = byPath.get(prefix + f.path);
    if (!data) problems.push(`Missing: ${f.path}`);
    else if ((await sha256(data)) !== f.sha256) problems.push(`Changed: ${f.path}`);
  }
  return { ok: !problems.length, checked: manifest.files.length, problems };
}

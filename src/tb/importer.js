/*
 * Importing mail into a folder: .eml files, .mbox files (split into
 * messages) and .zip files containing either (e.g. a ThunderExportImport
 * export). Needs messages.import, which Thunderbird has from version 106.
 */

import { messageFolderArg } from "../kit/compat.js";
import { splitMbox } from "../lib/mbox.js";
import { readZip } from "../lib/zip.js";

export const canImport = () => typeof browser.messages?.import === "function";

// [{ name, bytes }] → the messages inside, as [{ name, bytes }] (.eml).
export async function expandFiles(files) {
  const out = [];
  for (const f of files) {
    const lower = f.name.toLowerCase();
    if (lower.endsWith(".zip")) {
      let entries = (await readZip(f.bytes)).filter((e) => /\.(eml|mbox)$/i.test(e.path));
      // An export with both .eml and .mbox holds the same messages twice.
      if (entries.some((e) => /\.eml$/i.test(e.path))) entries = entries.filter((e) => /\.eml$/i.test(e.path));
      out.push(...(await expandFiles(entries.map((e) => ({ name: e.path, bytes: e.data })))));
    } else if (lower.endsWith(".mbox") || lower.endsWith(".mbx") || !/\.\w+$/.test(lower)) {
      splitMbox(f.bytes).forEach((bytes, i) => out.push({ name: `${f.name} #${i + 1}.eml`, bytes }));
    } else if (lower.endsWith(".eml")) {
      out.push(f);
    }
  }
  return out;
}

// Imports into folder `folderId`. Messages already in the folder (same
// Message-ID; Thunderbird refuses those) are skipped, so importing the same
// archive twice is harmless. → { imported, skipped, failed: [text] }
export async function importInto(folderId, files, { onProgress = () => {}, signal } = {}) {
  if (!canImport()) throw new Error("Importing needs Thunderbird 106 or newer (exporting works on every version)");
  const messages = await expandFiles(files);
  if (!messages.length) throw new Error("No messages found (use .eml, .mbox or .zip files)");
  const failed = [];
  let imported = 0;
  let skipped = 0;
  for (const [i, m] of messages.entries()) {
    if (signal?.aborted) throw new DOMException("Import cancelled", "AbortError");
    onProgress({ done: i, total: messages.length, current: m.name });
    try {
      await browser.messages.import(new File([m.bytes], m.name.split("/").pop(), { type: "message/rfc822" }), messageFolderArg(folderId));
      imported++;
    } catch (e) {
      if (/already contains a message/i.test(e?.message ?? "")) skipped++;
      else failed.push(`${m.name}: ${e?.message ?? e}`);
    }
  }
  onProgress({ done: messages.length, total: messages.length, current: "" });
  return { imported, skipped, failed };
}

// ThunderExportImport's settings (storage.local).

import { DEFAULT_PATTERN } from "../lib/names.js";

export const DEFAULT_SETTINGS = {
  formats: { eml: true, pdf: true, html: false, txt: false, mbox: false, attachments: true },
  output: "zip", // "zip" (one file) or "files" (a folder of files)
  subfolders: false,
  pattern: DEFAULT_PATTERN,
  manifest: true, // export-manifest.json with the SHA-256 of every file
  stamp: false, // compliance stamp on PDF/HTML
  exportedBy: "",
  organization: "",
  note: "",
};

export async function getSettings() {
  const saved = (await browser.storage.local.get("settings")).settings ?? {};
  return { ...DEFAULT_SETTINGS, ...saved, formats: { ...DEFAULT_SETTINGS.formats, ...(saved.formats ?? {}) } };
}

export async function saveSettings(patch) {
  await browser.storage.local.set({ settings: { ...(await getSettings()), ...patch } });
}

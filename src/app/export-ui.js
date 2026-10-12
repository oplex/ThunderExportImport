// App page: the Export tab.

import { folderPicker } from "./picker.js";
import { getSettings, saveSettings } from "../tb/store.js";
import { startJob } from "./job-ui.js";

const $ = (id) => document.getElementById(id);
let picker = null;
let selection = null; // message ids when exporting selected messages

function say(text, cls = "") {
  $("exportStatus").textContent = text;
  $("exportStatus").className = cls;
}

async function options() {
  const s = await getSettings();
  const formats = Object.fromEntries([...document.querySelectorAll("[data-format]")].map((b) => [b.dataset.format, b.checked]));
  return { ...s, formats, stamp: $("stamp").checked, manifest: $("manifest").checked, pattern: $("pattern").value || s.pattern, output: $("output").value, subfolders: $("subfolders").checked };
}

// Starts the export in the background (it continues if this page closes).
async function run() {
  const opts = await options();
  await saveSettings({ formats: opts.formats, stamp: opts.stamp, manifest: opts.manifest, pattern: opts.pattern, output: opts.output, subfolders: opts.subfolders });
  if (!Object.values(opts.formats).some(Boolean)) return say("Choose at least one format", "error");
  if (!selection && !picker.value) return say("Choose a folder to export", "error");
  say("Reading messages…");
  const spec = selection ? { ids: selection, options: opts } : { folderId: picker.value.id, subfolders: opts.subfolders, options: opts };
  await startJob("export", { type: "ei-start-export", spec });
}

export async function initExport(folders, params) {
  const s = await getSettings();
  for (const box of document.querySelectorAll("[data-format]")) box.checked = !!s.formats[box.dataset.format];
  $("stamp").checked = s.stamp;
  $("manifest").checked = s.manifest;
  $("pattern").value = s.pattern;
  $("output").value = s.output;
  $("subfolders").checked = s.subfolders;
  picker = folderPicker($("exportPicker"), folders, { allow: (f) => !f.isVirtual });
  if (params.get("folder")) picker.set(params.get("folder"));
  const token = params.get("selection");
  if (token) {
    selection = await browser.runtime.sendMessage({ type: "ei-selection", token });
    $("exportSource").hidden = true;
    $("selectionNote").hidden = false;
    $("selectionNote").textContent = `${selection.length} selected message${selection.length === 1 ? "" : "s"}`;
  }
  $("runExport").addEventListener("click", run);
}

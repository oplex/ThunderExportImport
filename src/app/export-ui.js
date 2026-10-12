// App page: the Export tab.

import { folderPicker } from "./picker.js";
import { pathLabel } from "../kit/folders.js";
import { folderMessages, folderOf } from "../tb/mail.js";
import { runExport } from "../tb/exporter.js";
import { saveFile } from "../tb/save.js";
import { getSettings, saveSettings } from "../tb/store.js";

const $ = (id) => document.getElementById(id);
let picker = null;
let selection = null; // message headers when exporting selected messages
let controller = null;

function say(text, cls = "") {
  $("exportStatus").textContent = text;
  $("exportStatus").className = cls;
}

// The folders to export, as runExport groups.
export async function groupsFor(folders, chosen, subfolders) {
  const list = [chosen, ...(subfolders ? folders.filter((f) => f.accountId === chosen.accountId && f.segments.length > chosen.segments.length && chosen.segments.every((s, i) => f.segments[i] === s)) : [])];
  const groups = [];
  for (const f of list) {
    if (f.isRoot || f.isVirtual) continue;
    groups.push({ dir: f.segments.slice(Math.max(0, chosen.segments.length - 1)), label: pathLabel(f), messages: await folderMessages(f.id) });
  }
  return groups;
}

function groupsForSelection(folders) {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const groups = new Map();
  for (const m of selection) {
    const f = byId.get(folderOf(m));
    const key = f?.id ?? "?";
    if (!groups.has(key)) groups.set(key, { dir: f ? [f.name] : ["Messages"], label: f ? pathLabel(f) : "", messages: [] });
    groups.get(key).messages.push(m);
  }
  return [...groups.values()];
}

async function options() {
  const s = await getSettings();
  const formats = Object.fromEntries([...document.querySelectorAll("[data-format]")].map((b) => [b.dataset.format, b.checked]));
  return { ...s, formats, stamp: $("stamp").checked, manifest: $("manifest").checked, pattern: $("pattern").value || s.pattern, output: $("output").value, subfolders: $("subfolders").checked };
}

async function run(folders) {
  const opts = await options();
  await saveSettings({ formats: opts.formats, stamp: opts.stamp, manifest: opts.manifest, pattern: opts.pattern, output: opts.output, subfolders: opts.subfolders });
  if (!Object.values(opts.formats).some(Boolean)) return say("Choose at least one format", "error");
  if (!selection && !picker.value) return say("Choose a folder to export", "error");
  controller = new AbortController();
  $("runExport").disabled = true;
  $("cancelExport").hidden = false;
  $("exportProgress").hidden = false;
  try {
    say("Reading messages…");
    const groups = selection ? groupsForSelection(folders) : await groupsFor(folders, picker.value, opts.subfolders);
    const result = await runExport(groups, opts, {
      signal: controller.signal,
      onProgress: ({ done, total, current }) => {
        $("exportProgress").max = total || 1;
        $("exportProgress").value = done;
        say(`${done} of ${total}${current ? ` · ${current}` : ""}`);
      },
    });
    if (result.bytes) await saveFile(result.name, result.bytes);
    say(`Exported ${result.messages} message${result.messages === 1 ? "" : "s"} (${result.files} files) → Downloads/${result.name}`, "ok");
  } catch (e) {
    say(e?.name === "AbortError" ? "Export cancelled" : (e?.message ?? String(e)), "error");
  } finally {
    $("runExport").disabled = false;
    $("cancelExport").hidden = true;
    controller = null;
  }
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
    const ids = await browser.runtime.sendMessage({ type: "ei-selection", token });
    selection = (await Promise.all(ids.map((id) => browser.messages.get(id).catch(() => null)))).filter(Boolean);
    $("exportSource").hidden = true;
    $("selectionNote").hidden = false;
    $("selectionNote").textContent = `${selection.length} selected message${selection.length === 1 ? "" : "s"}`;
  }
  $("runExport").addEventListener("click", () => run(folders));
  $("cancelExport").addEventListener("click", () => controller?.abort());
}

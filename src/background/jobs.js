/*
 * Exports and imports run here, in the background, so they continue when
 * the app page is closed or in the background. Progress shows on the
 * toolbar button (badge + tooltip) and is sent to any open app page.
 */

import { loadFolders } from "../kit/folders.js";
import { groupsFor, groupsForMessages } from "../tb/groups.js";
import { runExport } from "../tb/exporter.js";
import { importInto } from "../tb/importer.js";
import { saveFile } from "../tb/save.js";
import { getSettings } from "../tb/store.js";

const action = () => browser.action ?? browser.browserAction;
let job = null; // { id, kind, done, total, current, state: running|done|failed|cancelled, message }
let controller = null;
let clearBadge = null;

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function publish() {
  const a = action();
  clearTimeout(clearBadge);
  if (job.state === "running") {
    const pct = job.total ? Math.floor((job.done / job.total) * 100) : 0;
    a.setBadgeText({ text: `${pct}%` });
    a.setBadgeBackgroundColor?.({ color: "#3157d5" });
    a.setTitle({ title: `${job.kind === "export" ? "Exporting" : "Importing"} ${job.done} of ${job.total}${job.current ? ` · ${job.current}` : ""}` });
  } else {
    a.setBadgeText({ text: job.state === "done" ? "✓" : "✗" });
    a.setBadgeBackgroundColor?.({ color: job.state === "done" ? "#2e7d32" : "#c62828" });
    a.setTitle({ title: job.message });
    clearBadge = setTimeout(() => {
      a.setBadgeText({ text: "" });
      a.setTitle({ title: "Export / import mail" });
    }, 15000);
  }
  browser.runtime.sendMessage({ type: "ei-job", job }).catch(() => {});
}

export const currentJob = () => job;

export function cancelJob() {
  controller?.abort();
}

async function run(kind, work) {
  if (job?.state === "running") throw new Error("Another export or import is still running");
  controller = new AbortController();
  job = { id: Date.now(), kind, done: 0, total: 0, current: "", state: "running", message: "" };
  publish();
  const onProgress = ({ done, total, current }) => {
    Object.assign(job, { done, total, current });
    publish();
  };
  try {
    job.message = await work(onProgress, controller.signal);
    job.state = "done";
  } catch (e) {
    job.state = e?.name === "AbortError" ? "cancelled" : "failed";
    job.message = e?.name === "AbortError" ? `${kind === "export" ? "Export" : "Import"} cancelled` : (e?.message ?? String(e));
  }
  controller = null;
  publish();
  return job;
}

// spec: { folderId, subfolders } or { ids }, and options (formats, output…).
export function startExport(spec) {
  return run("export", async (onProgress, signal) => {
    const folders = await loadFolders();
    let groups;
    if (spec.ids) {
      const messages = (await Promise.all(spec.ids.map((id) => browser.messages.get(id).catch(() => null)))).filter(Boolean);
      groups = groupsForMessages(folders, messages);
    } else {
      const chosen = folders.find((f) => f.id === spec.folderId);
      if (!chosen) throw new Error("Choose a folder to export");
      groups = await groupsFor(folders, chosen, spec.subfolders);
    }
    const opts = { ...(await getSettings()), ...spec.options };
    const result = await runExport(groups, opts, { onProgress, signal });
    if (result.bytes) await saveFile(result.name, result.bytes);
    return `Exported ${plural(result.messages, "message")} (${result.files} files) → Downloads/${result.name}`;
  });
}

// files: [{ name, bytes }]
export function startImport(folderId, files) {
  return run("import", async (onProgress, signal) => {
    const r = await importInto(folderId, files, { onProgress, signal });
    const skipped = r.skipped ? ` · ${r.skipped} already there, skipped` : "";
    const failed = r.failed.length ? ` · ${r.failed.length} failed: ${r.failed.slice(0, 3).join("; ")}` : "";
    if (r.failed.length && !r.imported) throw new Error(`Nothing imported${failed}`);
    return `Imported ${plural(r.imported, "message")}${skipped}${failed}`;
  });
}

browser.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "ei-start-export") return startExport(msg.spec);
  if (msg?.type === "ei-start-import") return startImport(msg.folderId, msg.files);
  if (msg?.type === "ei-cancel") return Promise.resolve(cancelJob());
  if (msg?.type === "ei-current-job") return Promise.resolve(job);
  return undefined;
});

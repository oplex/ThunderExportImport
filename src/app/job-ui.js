// App page: progress of the background export/import (see background/jobs.js),
// with Cancel and Minimize (the job keeps running; the toolbar button shows %).

const $ = (id) => document.getElementById(id);
const ids = (kind) => ({ run: `run${kind}`, cancel: `cancel${kind}`, minimize: `minimize${kind}`, progress: `${kind.toLowerCase()}Progress`, status: `${kind.toLowerCase()}Status` });
const KINDS = { export: "Export", import: "Import" };

function show(job) {
  const n = ids(KINDS[job.kind]);
  const running = job.state === "running";
  $(n.run).disabled = running;
  $(n.cancel).hidden = !running;
  $(n.minimize).hidden = !running;
  $(n.progress).hidden = false;
  $(n.progress).max = job.total || 1;
  $(n.progress).value = running ? job.done : job.total || 1;
  $(n.status).className = job.state === "done" ? "ok" : running ? "" : "error";
  $(n.status).textContent = running ? `${job.done} of ${job.total || "…"}${job.current ? ` · ${job.current}` : ""}` : job.message;
  document.title = running ? `${Math.floor(((job.done || 0) / (job.total || 1)) * 100)}% · ThunderExportImport` : "ThunderExportImport";
}

// Start a job; the page follows its progress. Resolves when it ends.
export async function startJob(kind, message) {
  try {
    return await browser.runtime.sendMessage(message);
  } catch (e) {
    const n = ids(KINDS[kind]);
    $(n.status).textContent = e?.message ?? String(e);
    $(n.status).className = "error";
    return null;
  }
}

export async function initJobs() {
  browser.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "ei-job") show(msg.job);
  });
  for (const kind of Object.values(KINDS)) {
    const n = ids(kind);
    $(n.cancel).addEventListener("click", () => browser.runtime.sendMessage({ type: "ei-cancel" }));
    // Closing the page doesn't stop the job; the toolbar button shows how far it is.
    $(n.minimize).addEventListener("click", async () => {
      const tab = await browser.tabs.getCurrent().catch(() => null);
      if (tab) browser.tabs.remove(tab.id);
      else window.close();
    });
  }
  const job = await browser.runtime.sendMessage({ type: "ei-current-job" }).catch(() => null);
  if (job) show(job);
}

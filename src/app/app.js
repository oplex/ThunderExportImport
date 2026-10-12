// ThunderExportImport app page: tabs for Export, Import, Verify and Settings.

import { loadFolders } from "../kit/folders.js";
import { discoverSuite } from "../kit/suite.js";
import { initExport } from "./export-ui.js";
import { initImport } from "./import-ui.js";
import { initSettings } from "./settings-ui.js";
import { initJobs } from "./job-ui.js";

const params = new URLSearchParams(location.search);

function showTab(name) {
  for (const b of document.querySelectorAll("[data-tab]")) b.classList.toggle("primary", b.dataset.tab === name);
  for (const p of document.querySelectorAll(".panel")) p.hidden = p.id !== name;
}

async function init() {
  for (const b of document.querySelectorAll("[data-tab]")) b.addEventListener("click", () => showTab(b.dataset.tab));
  showTab(params.get("tab") || "export");
  const folders = await loadFolders();
  await initExport(folders, params);
  initImport(folders, params);
  await initSettings();
  await initJobs();
  const others = await discoverSuite();
  if (others.length) document.getElementById("suite").textContent = `Works together with: ${others.map((o) => `${o.app} ${o.version}`).join(", ")}`;
  document.body.dataset.ready = "1";
}

init().catch((e) => (document.getElementById("exportStatus").textContent = e?.message ?? String(e)));

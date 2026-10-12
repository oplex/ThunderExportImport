// App page: the Import and Verify tabs.

import { folderPicker } from "./picker.js";
import { canImport } from "../tb/importer.js";
import { startJob } from "./job-ui.js";
import { readZip } from "../lib/zip.js";
import { verifyExport } from "../lib/stamp.js";

const $ = (id) => document.getElementById(id);
let files = [];

function say(text, cls = "") {
  $("importStatus").textContent = text;
  $("importStatus").className = cls;
}

const read = async (fileList) => Promise.all([...fileList].map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));

export function initImport(folders, params) {
  const picker = folderPicker($("importPicker"), folders, { allow: (f) => !f.isRoot && !f.isVirtual, onChange: () => ready() });
  const ready = () => ($("runImport").disabled = !files.length || !picker.value);
  if (params.get("folder")) picker.set(params.get("folder"));
  if (!canImport()) say("Importing needs Thunderbird 106 or newer. Exporting works on every version.", "error");
  $("importFiles").addEventListener("change", async (ev) => {
    files = await read(ev.target.files);
    $("importChosen").textContent = files.map((f) => f.name).join(", ");
    ready();
  });
  // Runs in the background (continues if this page closes).
  $("runImport").addEventListener("click", () => startJob("import", { type: "ei-start-import", folderId: picker.value.id, files }));

  $("verifyFile").addEventListener("change", async (ev) => {
    const box = $("verifyResult");
    const [file] = await read(ev.target.files);
    ev.target.value = "";
    try {
      const r = await verifyExport(await readZip(file.bytes));
      const head = document.createElement("p");
      head.className = r.ok ? "ok" : "error";
      head.textContent = r.ok ? `✓ All ${r.checked} files are present and unchanged.` : `✗ ${r.problems.length} problem${r.problems.length === 1 ? "" : "s"} (${r.checked} files listed)`;
      const ul = document.createElement("ul");
      for (const p of r.problems) ul.append(Object.assign(document.createElement("li"), { className: "bad", textContent: p }));
      box.replaceChildren(head, ul);
    } catch (e) {
      box.textContent = e?.message ?? String(e);
    }
  });
}

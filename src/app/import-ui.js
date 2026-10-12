// App page: the Import and Verify tabs.

import { folderPicker } from "./picker.js";
import { importInto, canImport } from "../tb/importer.js";
import { readZip } from "../lib/zip.js";
import { verifyExport } from "../lib/stamp.js";

const $ = (id) => document.getElementById(id);
let files = [];
let controller = null;

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
  $("runImport").addEventListener("click", async () => {
    controller = new AbortController();
    $("runImport").disabled = true;
    $("cancelImport").hidden = false;
    $("importProgress").hidden = false;
    try {
      const r = await importInto(picker.value.id, files, {
        signal: controller.signal,
        onProgress: ({ done, total }) => {
          $("importProgress").max = total;
          $("importProgress").value = done;
          say(`${done} of ${total}`);
        },
      });
      say(`Imported ${r.imported} message${r.imported === 1 ? "" : "s"}${r.skipped ? ` · ${r.skipped} already there, skipped` : ""}${r.failed.length ? ` · ${r.failed.length} failed: ${r.failed.slice(0, 3).join("; ")}` : ""}`, r.failed.length ? "error" : "ok");
    } catch (e) {
      say(e?.name === "AbortError" ? "Import cancelled" : (e?.message ?? String(e)), "error");
    } finally {
      $("cancelImport").hidden = true;
      ready();
    }
  });
  $("cancelImport").addEventListener("click", () => controller?.abort());

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

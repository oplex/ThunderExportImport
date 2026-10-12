// Exporting real messages: every format in one ZIP (checked in memory here
// and on disk by the runner), separate files, selected messages, the app UI.

import { loadFolders } from "../../src/kit/folders.js";
import { groupsFor } from "../../src/app/export-ui.js";
import { runExport } from "../../src/tb/exporter.js";
import { folderMessages } from "../../src/tb/mail.js";
import { readZip } from "../../src/lib/zip.js";
import { splitMbox } from "../../src/lib/mbox.js";
import { verifyExport } from "../../src/lib/stamp.js";
import { openApp, exportIds } from "../../src/background/background.js";
import { DEFAULT_SETTINGS, saveSettings } from "../../src/tb/store.js";
import { check, assert, waitFor, appView, text } from "./util.js";

const ALL = { eml: true, pdf: true, html: true, txt: true, mbox: true, attachments: true };
export const shared = {};

export async function exportTests(f) {
  const folders = await loadFolders();
  const opts = { ...DEFAULT_SETTINGS, formats: ALL, output: "zip", stamp: true, manifest: true, exportedBy: "Åsa Lind", organization: "oplex.se", pattern: "{subject}" };

  await check("export: a folder and its subfolder, every format, as one ZIP", async () => {
    const groups = await groupsFor(folders, f.folder, true);
    assert(groups.length === 2 && groups[0].messages.length === 2 && groups[1].messages.length === 1, `groups: ${groups.map((g) => g.messages.length)}`);
    const r = await runExport(groups, opts);
    const entries = await readZip(r.bytes);
    const paths = entries.map((e) => e.path).sort();
    shared.zip = r.bytes;
    for (const p of ["Export Test/Quote 42 – Räksmörgås.eml", "Export Test/Quote 42 – Räksmörgås.pdf", "Export Test/Quote 42 – Räksmörgås.html", "Export Test/PO 4711.txt", "Export Test/Quote 42 – Räksmörgås files/quote.pdf", "Export Test/Export Test.mbox", "Export Test/Sub/Sub note.eml", "index.csv", "export-manifest.json"]) {
      assert(paths.includes(p), `missing ${p} in ${paths.join(", ")}`);
    }
    const get = (p) => entries.find((e) => e.path === p).data;
    const eml = text(get("Export Test/Quote 42 – Räksmörgås.eml"));
    assert(eml.includes("Message-ID: <q42@tei.test>") && eml.startsWith("From: Ann Lee"), `EML isn't the clean raw message: ${eml.slice(0, 80)}`);
    assert(!/mailbox:|imap:|\/profile\//.test(text(get("Export Test/Quote 42 – Räksmörgås.html"))), "local profile path in HTML");
    const html = text(get("Export Test/Quote 42 – Räksmörgås.html"));
    assert(html.includes('class="stamp"') && html.includes("Åsa Lind, oplex.se") && html.includes("q42@tei.test"), "no stamp in HTML");
    assert(html.includes("Quote%2042%20%E2%80%93%20R%C3%A4ksm%C3%B6rg%C3%A5s%20files/logo.png") && !html.includes("alert(1)"), "inline image not linked or script kept");
    assert(get("Export Test/Quote 42 – Räksmörgås files/quote.pdf").length > 20, "attachment empty");
    const mbox = splitMbox(get("Export Test/Export Test.mbox"));
    assert(mbox.length === 2 && mbox.some((m) => text(m).includes("\r\nFrom the start")), `MBOX wrong: ${mbox.length} messages`);
    assert(text(get("index.csv")).split("\r\n").length === 5, "index rows");
    const v = await verifyExport(entries);
    assert(v.ok && v.checked === paths.length - 1, `verify: ${JSON.stringify(v)}`);
  });

  await check("export: separate files go to the Downloads folder", async () => {
    const r = await runExport(await groupsFor(folders, f.sub, false), { ...opts, formats: { eml: true, pdf: true }, output: "files", name: "Separate export" });
    assert(r.messages === 1, `messages: ${r.messages}`);
  });

  await check("export: selected messages (as from the right-click menu) in the app page", async () => {
    const ids = (await folderMessages(f.folder.id)).map((m) => m.id);
    await exportIds(ids);
    const v = await appView();
    assert(v.document.getElementById("selectionNote").textContent === "2 selected messages", v.document.getElementById("selectionNote").textContent);
    v.close();
  });

  await check("export: the app page with a folder from the folder menu, PDF + stamp, saved as ZIP", async () => {
    await saveSettings({ exportedBy: "Åsa Lind", organization: "oplex.se" });
    await openApp({ tab: "export", folder: f.folder.id });
    const v = await appView();
    const doc = v.document;
    assert(doc.querySelector("#exportPicker .chosen").textContent.includes("Export Test"), "folder not chosen");
    for (const box of doc.querySelectorAll("[data-format]")) box.checked = ["eml", "pdf", "attachments"].includes(box.dataset.format);
    doc.getElementById("stamp").checked = true;
    doc.getElementById("output").value = "zip";
    doc.getElementById("runExport").click();
    await waitFor(() => /^Exported 2 messages/.test(doc.getElementById("exportStatus").textContent) || /error/.test(doc.getElementById("exportStatus").className), "export to finish");
    assert(doc.getElementById("exportStatus").className === "ok", doc.getElementById("exportStatus").textContent);
    v.close();
  });
}

// What the runner checks on disk afterwards.
export const EXPECT = {
  zip: ["Ann Lee - Quote 42 – Räksmörgås.pdf", "Ann Lee - Quote 42 – Räksmörgås files/quote.pdf", "export-manifest.json"],
  pdfText: ["Exported by: Åsa Lind", "Hej Pat! Here is the quote for 12 €."],
  files: ["Separate export/Sub/Sub note.eml", "Separate export/Sub/Sub note.pdf", "Separate export/export-manifest.json"],
};

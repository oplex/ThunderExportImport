// Importing mail back (Thunderbird 106+), and the suite discovery.

import { importInto, canImport } from "../../src/tb/importer.js";
import { folderMessages } from "../../src/tb/mail.js";
import { makeMbox } from "../../src/lib/mbox.js";
import { discoverSuite } from "../../src/kit/suite.js";
import { suiteBackup } from "../../src/app/settings-ui.js";
import { QUOTE } from "./seed.js";
import { shared } from "./tests-export.js";
import { check, assert, waitFor, log } from "./util.js";

export async function importTests(f) {
  if (!canImport()) {
    await check("import: explains it needs Thunderbird 106+", async () => {
      let message = "";
      await importInto(f.imported.id, []).catch((e) => (message = e.message));
      assert(/Thunderbird 106/.test(message), message);
    });
  } else {
    await check("import: an export ZIP (.eml inside, .mbox skipped) and an .mbox; duplicates are skipped", async () => {
      const mbox = makeMbox([{ raw: new TextEncoder().encode(QUOTE), sender: "ann@example.com", date: new Date() }]);
      const r = await importInto(f.imported.id, [{ name: "export.zip", bytes: shared.zip }, { name: "old.mbox", bytes: mbox }]);
      // Thunderbird 140+ refuses a second copy of the same Message-ID; older versions accept it.
      assert(r.imported + r.skipped === 4 && r.imported >= 3 && !r.failed.length, `imported ${r.imported}, skipped ${r.skipped}, failed ${r.failed}`);
      const subjects = await waitFor(async () => {
        const list = (await folderMessages(f.imported.id)).map((m) => m.subject).sort();
        return list.length === r.imported ? list : null;
      }, `${r.imported} messages in Imported`);
      assert(["PO 4711", "Quote 42 – Räksmörgås", "Sub note"].every((s) => subjects.includes(s)), subjects.join("|"));
      const again = await importInto(f.imported.id, [{ name: "export.zip", bytes: shared.zip }]);
      assert(again.imported + again.skipped === 3 && !again.failed.length, `second import: ${JSON.stringify(again)}`);
    });
  }

  await check("suite: discovery, and a suite backup with every installed Thunder add-on", async () => {
    const others = await discoverSuite();
    log(`suite partners: ${others.map((o) => `${o.app} ${o.version}`).join(", ") || "none"}`);
    const backup = await suiteBackup();
    assert(backup.apps["thunderexportimport@oplex"]?.config.settings, "own settings missing");
    for (const o of others) assert(backup.apps[o.id]?.config, `${o.app} settings missing`);
    if (others.some((o) => o.id === "thundersnippet@oplex")) {
      assert(backup.apps["thundersnippet@oplex"].config.snippets.some((s) => s.key === "po1"), "ThunderSnippet's snippets missing");
    }
  });
}

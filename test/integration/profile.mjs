// Builds a throwaway Thunderbird profile (Local Folders plus an identity) with
// the test build of the add-on side-loaded and downloads saved to a known folder.

import { mkdirSync, writeFileSync, cpSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { toMV2 } from "../../scripts/manifest-mv2.mjs";

const PREFS = {
  "mail.accountmanager.accounts": "account1",
  "mail.accountmanager.defaultaccount": "account1",
  "mail.accountmanager.localfoldersserver": "server1",
  "mail.account.account1.server": "server1",
  "mail.account.account1.identities": "id1",
  "mail.identity.id1.useremail": "pat@example.com",
  "mail.identity.id1.fullName": "Pat Sender",
  "mail.identity.id1.compose_html": true,
  "mail.server.server1.type": "none",
  "mail.server.server1.hostname": "Local Folders",
  "mail.server.server1.name": "Local Folders",
  "mail.server.server1.userName": "nobody",
  "mail.provider.suppress_dialog_on_startup": true,
  "mail.shell.checkDefaultClient": false,
  "mail.rights.override": true,
  "mail.spotlight.firstRunDone": true,
  "mail.winsearch.firstRunDone": true,
  "mailnews.start_page.enabled": false,
  "mail.inappnotifications.enabled": false,
  "app.update.disabledForTesting": true,
  "browser.dom.window.dump.enabled": true,
  "datareporting.policy.dataSubmissionEnabled": false,
  "toolkit.telemetry.reportingpolicy.firstRun": false,
  "extensions.autoDisableScopes": 0,
  "extensions.enabledScopes": 15,
  "extensions.startupScanScopes": 15,
  "extensions.background.idle.enabled": false,
  // Don't ask about spelling or saving when test compose windows close.
  "mail.compose.warn_on_close": false,
  "layout.spellcheckDefault": 0,
};

const TEST_FILES = ["selftest.js", "util.js", "seed.js", "tests-export.js", "tests-import.js"];

// Copy the add-on (or another Thunder add-on at `root`) into `stage`, add the
// self-test when `withTests`, and zip it to `xpi`. Returns the add-on id.
export function buildTestXpi(root, stage, xpi, { port, legacy = false, withTests = true, downloadDir = "" } = {}) {
  mkdirSync(stage, { recursive: true });
  for (const dir of ["src", "icons"]) cpSync(join(root, dir), join(stage, dir), { recursive: true });
  let manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
  if (withTests) {
    mkdirSync(join(stage, "test/integration"), { recursive: true });
    for (const f of TEST_FILES) cpSync(join(root, "test/integration", f), join(stage, "test/integration", f));
    writeFileSync(join(stage, "test/integration/config.js"), `export const REPORT_URL = "http://127.0.0.1:${port}/";\nexport const DOWNLOAD_DIR = ${JSON.stringify(downloadDir)};\n`);
    manifest.host_permissions = ["http://127.0.0.1/*"];
    // The tests create folders for their sample mail.
    manifest.permissions.push("accountsFolders");
  }
  if (legacy) {
    manifest = toMV2(manifest, { anyVersion: true });
    const scripts = ['<script type="module" src="background.js"></script>'];
    if (withTests) scripts.push('<script type="module" src="../../test/integration/selftest.js"></script>');
    writeFileSync(join(stage, "src/background/background.html"), `<!doctype html><meta charset="utf-8">${scripts.join("")}\n`);
  } else if (withTests) {
    manifest.background.scripts.push("test/integration/selftest.js");
  }
  writeFileSync(join(stage, "manifest.json"), JSON.stringify(manifest, null, 2));
  execFileSync("zip", ["-qr", xpi, "."], { cwd: stage });
  return manifest.browser_specific_settings.gecko.id;
}

// addons: [{ xpi, id }] side-loaded into the profile.
export function makeProfile(dir, addons, { marionettePort = null, downloadDir = null } = {}) {
  mkdirSync(join(dir, "extensions"), { recursive: true });
  for (const a of addons) cpSync(a.xpi, join(dir, "extensions", `${a.id}.xpi`));
  const prefs = { ...PREFS };
  if (marionettePort) prefs["marionette.port"] = marionettePort;
  if (downloadDir) {
    Object.assign(prefs, {
      "browser.download.folderList": 2,
      "browser.download.dir": downloadDir,
      "browser.download.useDownloadDir": true,
      "browser.download.always_ask_before_handling_new_types": false,
      "browser.helperApps.neverAsk.saveToDisk": "application/zip,application/pdf,application/json,text/csv,message/rfc822,application/mbox,text/html,text/plain",
    });
  }
  writeFileSync(join(dir, "user.js"), Object.entries(prefs).map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join("\n") + "\n");
}

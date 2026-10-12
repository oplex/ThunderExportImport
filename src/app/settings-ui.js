// App page: the Settings tab (stamp details, suite backup, keys).

import { getSettings, saveSettings } from "../tb/store.js";
import { saveFile } from "../tb/save.js";
import { discoverSuite, callSuite } from "../kit/suite.js";
import { renderKeyboard, setKeyboardLabels } from "../kit/keyboard-ui.js";

const $ = (id) => document.getElementById(id);
const say = (text, cls = "ok") => Object.assign($("suiteStatus"), { textContent: text, className: cls });

// { app: "Thunder suite", apps: { id: { app, version, config } } }
export async function suiteBackup() {
  const self = browser.runtime.getManifest();
  const apps = { [browser.runtime.id]: { app: self.name, version: self.version, config: { settings: await getSettings() } } };
  for (const other of await discoverSuite()) {
    if (other.actions.includes("getConfig")) apps[other.id] = { app: other.app, version: other.version, config: await callSuite(other.id, "getConfig") };
  }
  return { app: "Thunder suite", format: 1, exported: new Date().toISOString(), apps };
}

export async function suiteRestore(data) {
  if (data?.app !== "Thunder suite") throw new Error("This isn't a Thunder suite settings file");
  const installed = new Set((await discoverSuite()).map((o) => o.id));
  const restored = [];
  for (const [id, entry] of Object.entries(data.apps ?? {})) {
    if (id === browser.runtime.id) await saveSettings(entry.config.settings ?? {});
    else if (installed.has(id)) await callSuite(id, "setConfig", entry.config);
    else continue;
    restored.push(entry.app);
  }
  return restored;
}

export async function initSettings() {
  const s = await getSettings();
  for (const id of ["exportedBy", "organization", "note"]) {
    $(id).value = s[id];
    $(id).addEventListener("change", () => saveSettings({ [id]: $(id).value.trim() }));
  }
  $("suiteBackup").addEventListener("click", async () => {
    const data = await suiteBackup();
    await saveFile(`thunder-suite-settings-${data.exported.slice(0, 10)}.json`, new TextEncoder().encode(JSON.stringify(data, null, 2)));
    say(`Saved settings of ${Object.values(data.apps).map((a) => a.app).join(", ")} to Downloads`);
  });
  $("suiteRestore").addEventListener("change", async (ev) => {
    try {
      const restored = await suiteRestore(JSON.parse(await ev.target.files[0].text()));
      say(restored.length ? `Restored: ${restored.join(", ")}` : "Nothing to restore for the add-ons installed here", restored.length ? "ok" : "error");
    } catch (e) {
      say(e?.message ?? String(e), "error");
    }
    ev.target.value = "";
  });
  setKeyboardLabels({ "open-exporter": "Open ThunderExportImport", _execute_action: "Toolbar button", _execute_browser_action: "Toolbar button" });
  renderKeyboard();
}

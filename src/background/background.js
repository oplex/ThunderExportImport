// ThunderExportImport background: toolbar button, right-click menus, and
// the Thunder suite actions; all of them open the app page.

import { selectedMessages } from "../tb/mail.js";
import { getSettings, saveSettings } from "../tb/store.js";
import { serveSuite } from "../kit/suite.js";
import { folderIdOf, legacyRootId } from "../kit/compat.js";
import { currentJob } from "./jobs.js";
export { currentJob };

const APP = "src/app/app.html";
// Message ids handed to the app page: token → ids.
const selections = new Map();

export async function openApp(params = {}) {
  const url = browser.runtime.getURL(`${APP}?${new URLSearchParams(params)}`);
  const [open] = await browser.tabs.query({ url: browser.runtime.getURL(`${APP}*`) }).catch(() => []);
  if (open) return browser.tabs.update(open.id, { active: true, url });
  return browser.tabs.create({ url });
}

function remember(ids) {
  const token = Math.random().toString(36).slice(2);
  selections.set(token, ids);
  return token;
}

// The app page, exporting these message ids.
export const exportIds = (ids) => openApp({ tab: "export", selection: remember(ids) });

export async function exportSelected(windowId) {
  return exportIds((await selectedMessages(windowId)).map((m) => m.id));
}

function folderFromInfo(info) {
  const folder = info.selectedFolders?.[0] ?? info.selectedFolder;
  if (folder) return folderIdOf(folder);
  if (info.selectedAccount) return info.selectedAccount.rootFolder?.id ?? legacyRootId(info.selectedAccount.id);
  return null;
}

function create(props) {
  return new Promise((resolve) => browser.menus.create(props, () => resolve(void browser.runtime.lastError)));
}

export async function setupMenus() {
  await create({ id: "ei-export-folder", title: "Export folder…", contexts: ["folder_pane"] });
  await create({ id: "ei-import-folder", title: "Import mail into this folder…", contexts: ["folder_pane"] });
  await create({ id: "ei-export-selected", title: "Export selected messages…", contexts: ["message_list"] });
  await create({ id: "ei-tools", title: "ThunderExportImport", contexts: ["tools_menu"] });
  // Right-click on the toolbar button ("action" in MV3, "browser_action" in MV2).
  const button = browser.runtime.getManifest().manifest_version >= 3 ? "action" : "browser_action";
  for (const [tab, title] of [["export", "Export…"], ["import", "Import…"], ["verify", "Verify an export…"], ["settings", "ThunderExportImport settings"]]) {
    await create({ id: `ei-button-${tab}`, title, contexts: [button] });
  }
}

browser.menus.onClicked.addListener((info, tab) => {
  const id = String(info.menuItemId);
  if (id === "ei-export-folder") return openApp({ tab: "export", folder: folderFromInfo(info) ?? "" });
  if (id === "ei-import-folder") return openApp({ tab: "import", folder: folderFromInfo(info) ?? "" });
  if (id === "ei-export-selected") return exportSelected(tab?.windowId);
  if (id === "ei-tools") return openApp();
  if (id.startsWith("ei-button-")) return openApp({ tab: id.slice("ei-button-".length) });
  return undefined;
});

// While an export or import runs, the button brings its progress back.
(browser.action ?? browser.browserAction).onClicked.addListener(() => openApp(currentJob()?.state === "running" ? { tab: currentJob().kind } : {}));
browser.commands.onCommand.addListener((command) => command === "open-exporter" && openApp());

browser.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "ei-selection") return Promise.resolve(selections.get(msg.token) ?? []);
  return undefined;
});

serveSuite({
  ping: () => "pong",
  exportFolder: ({ folderId }) => openApp({ tab: "export", folder: folderId ?? "" }).then(() => true),
  exportMessages: ({ ids }) => exportIds(ids ?? []).then(() => true),
  importIntoFolder: ({ folderId }) => openApp({ tab: "import", folder: folderId ?? "" }).then(() => true),
  getConfig: async () => ({ settings: await getSettings() }),
  setConfig: async ({ settings }) => (settings && (await saveSettings(settings)), true),
});

export const ready = setupMenus();

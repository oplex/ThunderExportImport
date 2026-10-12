/*
 * Thunder suite protocol: ThunderJump, ThunderSnippet and ThunderExportImport
 * find each other and use each other's actions through Thunderbird's
 * add-on-to-add-on messaging. Only the add-on ids below are answered.
 *
 *   { thunder: "hello" }               → { app, version, actions: [...] }
 *   { thunder: "<action>", payload }   → whatever that action returns
 *
 * Every app answers "getConfig" / "setConfig" (its settings as JSON), so one
 * backup can hold the whole suite.
 */

export const SUITE = {
  "thunderbird-jump@oplex": "ThunderJump",
  "thundersnippet@oplex": "ThunderSnippet",
  "thunderexportimport@oplex": "ThunderExportImport",
};

// actions: { name: async (payload, sender) => result }
export function serveSuite(actions) {
  const self = browser.runtime.getManifest();
  browser.runtime.onMessageExternal?.addListener((msg, sender) => {
    if (!(sender.id in SUITE) || typeof msg?.thunder !== "string") return undefined;
    if (msg.thunder === "hello") return Promise.resolve({ app: self.name, version: self.version, actions: Object.keys(actions) });
    const fn = actions[msg.thunder];
    return fn ? Promise.resolve().then(() => fn(msg.payload ?? {}, sender)) : undefined;
  });
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);

// The other suite add-ons that are installed and enabled:
// [{ id, app, version, actions }].
export async function discoverSuite({ timeoutMs = 1500 } = {}) {
  const others = Object.keys(SUITE).filter((id) => id !== browser.runtime.id);
  const found = await Promise.all(
    others.map((id) => withTimeout(browser.runtime.sendMessage(id, { thunder: "hello" }).catch(() => null), timeoutMs).then((r) => (r ? { id, ...r } : null))),
  );
  return found.filter(Boolean);
}

export function callSuite(id, action, payload = {}) {
  return browser.runtime.sendMessage(id, { thunder: action, payload });
}

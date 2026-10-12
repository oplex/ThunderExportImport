// Shared helpers for the in-Thunderbird self-test.

import { REPORT_URL } from "./config.js";

export const results = [];
export const post = (msg) => fetch(REPORT_URL, { method: "POST", body: JSON.stringify(msg) }).catch(() => {});
export const log = (text) => post({ type: "log", text });
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitFor(fn, what, ms = 60000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await sleep(200);
  }
}

export async function check(name, fn) {
  log(`- ${name}`);
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (e) {
    log(`  failed: ${e}`);
    results.push({ name, ok: false, error: String(e?.stack ?? e) });
  }
}

export function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Runs `script` (a function body) with chrome privileges via the runner.
export async function chrome(script, args = []) {
  const res = await fetch(REPORT_URL, { method: "POST", body: JSON.stringify({ type: "chrome", script, args }) });
  const { value, error } = await res.json();
  if (error) throw new Error(`chrome script: ${error}`);
  return value;
}

export const importModule = (name) =>
  `(ChromeUtils.importESModule ? ChromeUtils.importESModule("resource://gre/modules/${name}.sys.mjs") : ChromeUtils.import("resource://gre/modules/${name}.jsm"))`;

// The app page, once loaded.
export async function appView() {
  return waitFor(() => browser.extension.getViews().find((v) => v.location.pathname.endsWith("app.html") && v.document.body.dataset.ready), "the app page");
}

export const text = (bytes) => new TextDecoder().decode(bytes);

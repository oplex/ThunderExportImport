// In-Thunderbird self-test entry point (test build only).

import { REPORT_URL } from "./config.js";
import { results, post, log, waitFor } from "./util.js";
import { seed } from "./seed.js";
import { exportTests, EXPECT } from "./tests-export.js";
import { importTests } from "./tests-import.js";
import { ready } from "../../src/background/background.js";

async function runnerReady() {
  try {
    return (await (await fetch(`${REPORT_URL}ready`)).text()) === "yes";
  } catch {
    return false;
  }
}

async function run() {
  const info = await browser.runtime.getBrowserInfo();
  log(`running in ${info.name} ${info.version}`);
  await waitFor(async () => (await browser.mailTabs.query({})).length > 0, "a mail tab", 60000);
  await waitFor(runnerReady, "runner to be ready", 60000);
  await ready;
  const folders = await seed();
  await exportTests(folders);
  await importTests(folders);
  // Let the last downloads finish before the runner looks at the files.
  await new Promise((r) => setTimeout(r, 1500));
  await post({ type: "result", version: info.version, tests: results, expect: EXPECT });
}

run().catch((e) => post({ type: "result", version: "?", tests: [...results, { name: "self-test crashed", ok: false, error: String(e?.stack ?? e) }] }));

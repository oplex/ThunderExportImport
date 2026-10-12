// Runs ThunderExportImport inside a real (headless) Thunderbird, collects the
// self-test report, then checks the files it saved to the downloads folder
// (unzip -t, pdftotext).  Usage:
//   TB_BIN=/path/to/thunderbird node test/integration/run.mjs
// TB_PARTNERS=/path/to/thunderbird-jump:/path/to/thundersnippet also
// installs those Thunder add-ons, for the suite cross-tests.

import { createServer } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { checkDownloads } from "./downloads.mjs";
import { join, resolve } from "node:path";
import { createServer as tcpServer } from "node:net";
import { buildTestXpi, makeProfile } from "./profile.mjs";
import { marionette } from "./marionette.mjs";

const root = resolve(import.meta.dirname, "../..");
const bin = process.env.TB_BIN;
const timeoutMs = Number(process.env.TB_TIMEOUT_MS ?? 480000);
if (!bin) {
  console.error("Set TB_BIN to the thunderbird executable");
  process.exit(2);
}

const freePort = () =>
  new Promise((r) => {
    const s = tcpServer().listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => r(port));
    });
  });

const work = mkdtempSync("/tmp/tei-");
const downloadDir = join(work, "downloads");
mkdirSync(downloadDir);
let finish;
let ready = false;
let chrome = null;
const report = new Promise((r) => (finish = r));

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    res.writeHead(200, { "Access-Control-Allow-Origin": "*" });
    if (req.method === "GET") return res.end(ready ? "yes" : "no");
    let msg;
    try {
      msg = JSON.parse(body);
    } catch {
      return res.end("ok");
    }
    if (msg.type === "chrome") {
      return chrome
        .exec(msg.script, msg.args ?? [])
        .then((value) => res.end(JSON.stringify({ value })))
        .catch((e) => res.end(JSON.stringify({ error: e.message })));
    }
    res.end("ok");
    if (msg.type === "log") console.log(`  [tb] ${msg.text}`);
    else finish(msg);
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();

const tbVersion = execFileSync(bin, ["--version"], { encoding: "utf8" }).match(/(\d+)\./)?.[1];
const legacy = Number(tbVersion) < 140;
console.log(`Thunderbird ${tbVersion}: ${legacy ? "Manifest V2 (91–139)" : "Manifest V3"} build`);
const addons = [];
const xpi = join(work, "addon.xpi");
addons.push({ xpi, id: buildTestXpi(root, join(work, "stage"), xpi, { port, legacy, downloadDir }) });
for (const [i, partner] of (process.env.TB_PARTNERS ?? "").split(":").filter(Boolean).entries()) {
  const px = join(work, `partner${i}.xpi`);
  addons.push({ xpi: px, id: buildTestXpi(resolve(partner), join(work, `pstage${i}`), px, { legacy, withTests: false }) });
  console.log(`Partner add-on: ${addons.at(-1).id}`);
}
const profile = join(work, "profile");
const marionettePort = await freePort();
makeProfile(profile, addons, { marionettePort, downloadDir });

const extraArgs = Number(tbVersion) >= 138 ? ["-remote-allow-system-access"] : [];
const tb = spawn(bin, ["--headless", "--no-remote", "--marionette", ...extraArgs, "--profile", profile], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, MOZ_HEADLESS: "1" },
});
let output = "";
tb.stdout.on("data", (d) => (output += d));
tb.stderr.on("data", (d) => (output += d));
tb.on("exit", (code) => finish({ crashed: true, code }));
const timer = setTimeout(() => finish({ timeout: true }), timeoutMs);

try {
  chrome = await marionette(marionettePort).catch(() => marionette(marionettePort));
  ready = true;
} catch (e) {
  finish({ setupError: `Marionette: ${e.message}` });
}

const result = await report;
clearTimeout(timer);
chrome?.close();
tb.kill("SIGTERM");
server.close();

if (result.tests) result.tests.push(...checkDownloads(downloadDir, result.expect ?? {}));

let ok = false;
if (!result.tests) {
  console.error(result.setupError ?? (result.timeout ? "Timed out waiting for the self-test" : `Thunderbird exited (${result.code})`));
  console.error(output.split("\n").filter((l) => !/Gtk|glib|^\s*$/i.test(l)).slice(-60).join("\n"));
} else {
  console.log(`Thunderbird ${result.version}`);
  for (const t of result.tests) console.log(`${t.ok ? "ok  " : "FAIL"} ${t.name}${t.ok ? "" : `\n     ${t.error}`}`);
  const failed = result.tests.filter((t) => !t.ok).length;
  console.log(`\n${result.tests.length - failed} passed, ${failed} failed`);
  ok = failed === 0 && result.tests.length > 0;
}
if (!process.env.TB_KEEP) rmSync(work, { recursive: true, force: true });
process.exit(ok ? 0 : 1);

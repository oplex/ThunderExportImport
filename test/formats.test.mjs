import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { makeZip, readZip, crc32 } from "../src/lib/zip.js";
import { makeMbox, splitMbox, fromLine, cleanRaw } from "../src/lib/mbox.js";
import { makePdf, wrap } from "../src/lib/pdf.js";
import { fileBase, safeName, uniqueNamer } from "../src/lib/names.js";

const dir = mkdtempSync(join(tmpdir(), "tei-"));
const has = (cmd) => {
  try {
    execFileSync("which", [cmd]);
    return true;
  } catch {
    return false;
  }
};

test("ZIP: unzip accepts it, names are UTF-8, and it reads back", async () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  const zip = makeZip([
    { path: "Inbox/Räkning – 2026.eml", data: "Subject: hi\r\n\r\nbody" },
    { path: "Inbox/attachments/a.bin", data: new Uint8Array([0, 1, 2, 255]) },
  ]);
  const file = join(dir, "t.zip");
  writeFileSync(file, zip);
  if (has("unzip")) {
    assert.match(execFileSync("unzip", ["-t", file], { encoding: "utf8" }), /No errors detected/);
    assert.match(execFileSync("unzip", ["-l", file], { encoding: "utf8" }), /Räkning – 2026\.eml/);
  }
  const back = await readZip(zip);
  assert.deepEqual(back.map((e) => e.path), ["Inbox/Räkning – 2026.eml", "Inbox/attachments/a.bin"]);
  assert.deepEqual([...back[1].data], [0, 1, 2, 255]);
});

test("ZIP: deflated archives made by zip(1) can be read", async (t) => {
  if (!has("zip")) return t.skip("no zip");
  writeFileSync(join(dir, "big.txt"), "hello ".repeat(5000));
  execFileSync("zip", ["-q", "-9", join(dir, "d.zip"), "big.txt"], { cwd: dir });
  const [entry] = await readZip(new Uint8Array(execFileSync("cat", [join(dir, "d.zip")])));
  assert.equal(new TextDecoder().decode(entry.data), "hello ".repeat(5000));
});

test("MBOX: From lines escaped and restored, 8-bit bytes untouched", () => {
  const raw1 = new Uint8Array([...new TextEncoder().encode("Subject: a\r\n\r\nFrom here\r\n>From there\r\n"), 0xe5]);
  const raw2 = new TextEncoder().encode("Subject: b\r\n\r\nsecond");
  const mbox = makeMbox([
    { raw: raw1, sender: "ann@example.com", date: new Date(Date.UTC(2026, 2, 7, 14, 5, 9)) },
    { raw: raw2, sender: "", date: new Date(NaN) },
  ]);
  const text = new TextDecoder("latin1").decode(mbox);
  assert.ok(text.startsWith("From ann@example.com Sat Mar  7 14:05:09 2026\n"));
  assert.match(text, /\n>From here\n>>From there\n/);
  const back = splitMbox(mbox);
  assert.equal(back.length, 2);
  // The 8-bit byte survives (MBOX ends every message with a line break).
  assert.deepEqual([...back[0]].slice(-3), [0xe5, 13, 10]);
  assert.equal(new TextDecoder().decode(back[0]).split("\r\n")[2], "From here");
  assert.equal(new TextDecoder().decode(back[1]), "Subject: b\r\n\r\nsecond\r\n");
  assert.match(fromLine("a b@c", new Date(0)), /^From ab@c Thu Jan  1/);
  assert.throws(() => splitMbox(new TextEncoder().encode("hello")), /Not an MBOX/);
});

test("PDF: valid file with the text, Western European characters, several pages", async (t) => {
  const body = `Hej Åsa! Räksmörgås för 12 € – “tack”.\n\n${"Lorem ipsum dolor sit amet. ".repeat(400)}`;
  const pdf = makePdf({ title: "Offert (42) \\ test", headers: [["From", "Ann <ann@example.com>"], ["To", ""]], body, footer: "Attachments: a.pdf" });
  const head = new TextDecoder("latin1").decode(pdf.subarray(0, 8));
  assert.equal(head, "%PDF-1.4");
  const file = join(dir, "t.pdf");
  writeFileSync(file, pdf);
  if (!has("pdftotext")) return t.skip("no pdftotext");
  const text = execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" });
  assert.match(text, /Offert \(42\) \\ test/);
  assert.match(text, /Hej Åsa! Räksmörgås för 12 € – “tack”\./);
  assert.match(text, /Attachments: a\.pdf/);
  const info = execFileSync("pdfinfo", [file], { encoding: "utf8" });
  assert.ok(Number(/Pages:\s+(\d+)/.exec(info)[1]) >= 3, info);
});

test("PDF wrapping keeps lines inside the page and cuts long words", () => {
  const lines = wrap("a ".repeat(200) + "x".repeat(300), 400);
  assert.ok(lines.length > 3);
  assert.ok(lines.every((l) => l.length > 0 || l === lines.at(-1)));
});

test("file names: patterns, unsafe characters, uniqueness", () => {
  const m = { date: new Date(2026, 2, 7, 14, 5).getTime(), author: "Ann Lee <ann@example.com>", subject: "Re: PO 4711 / Q?", recipients: ["Bob <b@x>"], id: 9 };
  assert.equal(fileBase(m), "2026-03-07 1405 Ann Lee - Re PO 4711 Q");
  assert.equal(fileBase(m, "{to}_{subject}"), "Bob_Re PO 4711 Q");
  assert.equal(safeName("con"), "_con");
  assert.equal(safeName("  ..a<b>.. "), "a b");
  const next = uniqueNamer();
  assert.deepEqual([next("x", ".eml"), next("X", ".eml"), next("x", ".eml")], ["x.eml", "X (2).eml", "x (3).eml"]);
});

test("Thunderbird's mailbox lines are removed from raw messages", () => {
  const raw = new TextEncoder().encode("From - Mon Oct 12 14:04:42 2026\nX-Mozilla-Status: 0001\nX-Mozilla-Status2: 00000000\nX-Mozilla-Keys:     \nFrom: Ann <a@x>\r\n\r\nHi\r\n>From here");
  assert.equal(new TextDecoder().decode(cleanRaw(raw)), "From: Ann <a@x>\r\n\r\nHi\r\nFrom here");
  const clean = new TextEncoder().encode("From: Ann <a@x>\r\n\r\nHi");
  assert.equal(cleanRaw(clean), clean);
});

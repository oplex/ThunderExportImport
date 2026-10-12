import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { makeStamp, makeManifest, verifyExport, sha256 } from "../src/lib/stamp.js";
import { makePdf } from "../src/lib/pdf.js";
import { messagePage } from "../src/lib/html.js";
import { qrMatrix, qrSvg } from "../src/lib/qr.js";

const dir = mkdtempSync(join(tmpdir(), "tei-stamp-"));
const tool = (cmd) => {
  try {
    execFileSync("which", [cmd]);
    return true;
  } catch {
    return false;
  }
};
// Decode QR codes in a PNG with zxing-cpp (Python), when installed.
function decodeQr(png) {
  try {
    return execFileSync("python3", ["-c", "import sys,zxingcpp;from PIL import Image;print('\\n'.join(r.text for r in zxingcpp.read_barcodes(Image.open(sys.argv[1]))))", png], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

const settings = { exportedBy: "Åsa Lind", organization: "oplex.se", note: "Case 2026-17" };
const at = new Date(Date.UTC(2026, 9, 12, 13, 0, 0));

test("stamp rows and QR text", async () => {
  const hash = await sha256(new TextEncoder().encode("abc"));
  assert.equal(hash, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  const s = makeStamp(settings, { messageId: "a1@example.com", folder: "Inbox", sha256: hash }, at);
  assert.deepEqual(s.rows.map((r) => r[0]), ["Exported by", "Exported at", "Message-ID", "Folder", "SHA-256", "Note"]);
  assert.equal(s.rows[0][1], "Åsa Lind, oplex.se");
  assert.equal(s.qrText, `TEI1|sha256:${hash}|at:2026-10-12T13:00:00Z|by:Åsa Lind|id:a1@example.com`);
  const long = makeStamp(settings, { messageId: "x".repeat(400), sha256: hash }, at);
  assert.ok(new TextEncoder().encode(long.qrText).length <= 213);
});

test("the PDF stamp shows the details and its QR code scans", async (t) => {
  const hash = await sha256(new TextEncoder().encode("raw message"));
  const stamp = makeStamp(settings, { messageId: "po-4711@example.com", folder: "Local Folders › Orders", sha256: hash }, at);
  const file = join(dir, "s.pdf");
  writeFileSync(file, makePdf({ title: "PO 4711", headers: [["From", "Ann"]], body: "Hello", stamp }));
  if (!tool("pdftotext") || !tool("pdftoppm")) return t.skip("no poppler");
  const text = execFileSync("pdftotext", [file, "-"], { encoding: "utf8" });
  assert.match(text, /Exported by: Åsa Lind, oplex\.se/);
  assert.match(text, /SHA-256: [0-9a-f]{20}/);
  assert.match(text, /PO 4711/);
  execFileSync("pdftoppm", ["-png", "-r", "200", "-f", "1", "-l", "1", file, join(dir, "page")]);
  const decoded = decodeQr(join(dir, "page-1.png"));
  if (decoded == null) return t.skip("no zxing-cpp");
  assert.equal(decoded, stamp.qrText);
});

test("the HTML stamp has the rows and an SVG QR code", () => {
  const stamp = makeStamp(settings, { messageId: "m@x", sha256: "ab" }, at);
  const page = messagePage({ title: "T", headers: [], text: "x", stamp });
  assert.match(page, /class="stamp"/);
  assert.match(page, /<th>Exported by<\/th><td>Åsa Lind, oplex\.se<\/td>/);
  assert.match(page, /<svg[^>]+viewBox="0 0 \d+ \d+"/);
  assert.equal(qrSvg(qrMatrix("a")).includes('viewBox="0 0 29 29"'), true);
});

test("manifest + verify: detects changed and missing files", async () => {
  const files = [{ path: "Inbox/a.eml", data: new TextEncoder().encode("A") }, { path: "Inbox/b.pdf", data: new TextEncoder().encode("B") }];
  const manifest = await makeManifest(files, settings, at);
  assert.equal(manifest.files[0].sha256, await sha256(files[0].data));
  const entries = [...files, { path: "export-manifest.json", data: new TextEncoder().encode(JSON.stringify(manifest)) }];
  assert.deepEqual(await verifyExport(entries), { ok: true, checked: 2, problems: [] });
  entries[0] = { path: "Inbox/a.eml", data: new TextEncoder().encode("tampered") };
  entries.splice(1, 1);
  assert.deepEqual((await verifyExport(entries)).problems, ["Changed: Inbox/a.eml", "Missing: Inbox/b.pdf"]);
});

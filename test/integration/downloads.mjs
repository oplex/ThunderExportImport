// After the in-Thunderbird run: check the files the add-on really saved to
// disk with independent tools (unzip, pdftotext).

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

// expect: { zip: [paths that must be inside the ZIP], files: [relative paths], pdfText: [strings] }
export function checkDownloads(dir, expect) {
  const results = [];
  const test = (name, fn) => {
    try {
      fn();
      results.push({ name, ok: true });
    } catch (e) {
      results.push({ name, ok: false, error: e.message });
    }
  };
  const all = [...walk(dir)];
  const zip = all.find((p) => p.endsWith(".zip") && !p.includes("suite"));
  if (expect.zip) {
    test("saved ZIP passes unzip -t and holds every expected file", () => {
      if (!zip) throw new Error(`no ZIP in ${all.join(", ")}`);
      if (!/No errors detected/.test(run("unzip", ["-t", zip]))) throw new Error("unzip -t failed");
      const listing = run("unzip", ["-Z1", zip]);
      for (const p of expect.zip) if (!listing.split("\n").some((l) => l.includes(p))) throw new Error(`missing in ZIP: ${p}\n${listing}`);
    });
    test("PDF inside the ZIP has the message text (pdftotext)", () => {
      const pdf = run("unzip", ["-Z1", zip]).split("\n").find((l) => l.endsWith(".pdf") && !l.includes(" files/"));
      const tmp = join(dir, "check.pdf");
      execFileSync("sh", ["-c", `unzip -p "$1" "$2" > "$3"`, "sh", zip, pdf, tmp]);
      const text = run("pdftotext", [tmp, "-"]);
      for (const t of expect.pdfText ?? []) if (!text.includes(t)) throw new Error(`“${t}” not in PDF text:\n${text.slice(0, 600)}`);
    });
  }
  if (expect.files) {
    test("separate-files export wrote every expected file", () => {
      const rel = all.map((p) => p.slice(dir.length + 1));
      for (const f of expect.files) if (!rel.some((r) => r.endsWith(f))) throw new Error(`missing file ${f} in ${rel.join(", ")}`);
    });
  }
  return results;
}

/*
 * The Thunder kit (src/kit/) is shared by every Thunder add-on and must stay
 * identical in all of them. kit.json records its version and hash.
 *   node scripts/kit.mjs check            fail if src/kit differs from kit.json
 *   node scripts/kit.mjs stamp [version]  record the current hash (after a change)
 *   node scripts/kit.mjs sync <repo dir>  copy this kit into another Thunder repo
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync, cpSync, existsSync } from "node:fs";
import { join } from "node:path";

const KIT = "src/kit";
const META = join(KIT, "kit.json");

export function kitHash(dir = KIT) {
  const h = createHash("sha256");
  for (const name of readdirSync(dir).filter((n) => n !== "kit.json").sort()) {
    h.update(name).update("\0").update(readFileSync(join(dir, name))).update("\0");
  }
  return h.digest("hex").slice(0, 16);
}

const [cmd, arg] = process.argv.slice(2);
const meta = existsSync(META) ? JSON.parse(readFileSync(META, "utf8")) : { version: "1.0.0" };
if (cmd === "check") {
  const now = kitHash();
  if (now !== meta.hash) {
    console.error(`src/kit changed (hash ${now}, kit.json says ${meta.hash}). Run "node scripts/kit.mjs stamp <version>" and sync it to the other Thunder add-ons.`);
    process.exit(1);
  }
  console.log(`Thunder kit ${meta.version} (${now}) ok`);
} else if (cmd === "stamp") {
  const out = { version: arg ?? meta.version, hash: kitHash() };
  writeFileSync(META, JSON.stringify(out, null, 2) + "\n");
  console.log(`kit.json: ${out.version} ${out.hash}`);
} else if (cmd === "sync") {
  if (!arg) throw new Error("usage: node scripts/kit.mjs sync <other repo>");
  cpSync(KIT, join(arg, KIT), { recursive: true });
  console.log(`Copied Thunder kit ${meta.version} to ${arg}/${KIT}`);
} else {
  console.error("usage: node scripts/kit.mjs check | stamp [version] | sync <repo>");
  process.exit(2);
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMime, inlineParts, headerParams } from "../src/lib/rawmime.js";

const raw = [
  'Content-Type: multipart/related; boundary="rel"',
  "Subject: x",
  "",
  "--rel",
  "Content-Type: text/html; charset=UTF-8",
  "Content-Transfer-Encoding: quoted-printable",
  "",
  '<p>Hej =C3=85sa</p><img src=3D"cid:logo@x">',
  "--rel",
  'Content-Type: image/png; name="logo.png"',
  "Content-ID: <logo@x>",
  "Content-Transfer-Encoding: base64",
  "",
  "iVBORw0K",
  "--rel--",
].join("\r\n");

test("multipart parts, quoted-printable and base64, inline images", () => {
  const root = parseMime(new TextEncoder().encode(raw));
  assert.equal(root.type, "multipart/related");
  assert.equal(root.parts.length, 2);
  assert.equal(new TextDecoder().decode(root.parts[0].body), '<p>Hej Åsa</p><img src="cid:logo@x">');
  const [img] = inlineParts(root);
  assert.deepEqual([img.cid, img.name, img.type, [...img.body.slice(0, 4)]], ["logo@x", "logo.png", "image/png", [0x89, 0x50, 0x4e, 0x47]]);
  assert.deepEqual(headerParams('attachment; filename="a b.pdf"'), { value: "attachment", params: { filename: "a b.pdf" } });
});

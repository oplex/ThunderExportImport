import { test } from "node:test";
import assert from "node:assert/strict";
import { messagePage, sanitize, htmlToText, indexCsv } from "../src/lib/html.js";
import { bodies, contentIds, headerRows } from "../src/lib/mime.js";

const full = {
  contentType: "multipart/mixed",
  parts: [
    { contentType: "multipart/alternative", parts: [
      { contentType: "text/plain", body: "Hello plain" },
      { contentType: "text/html", body: '<html><body><p onclick="x()">Hi <b>there</b></p><img src="cid:logo@x"><script>alert(1)</script><img src="https://track.example/p.gif"></body></html>' },
    ] },
    { contentType: "image/png", name: "logo.png", partName: "1.2", headers: { "content-id": ["<logo@x>"] } },
    { contentType: "application/pdf", name: "quote.pdf", partName: "1.3", headers: { "content-disposition": ["attachment"] }, body: "ignored" },
  ],
};

test("bodies and inline images from a getFull() tree", () => {
  const { html, text } = bodies(full);
  assert.equal(text, "Hello plain");
  assert.match(html, /Hi <b>there<\/b>/);
  assert.deepEqual(contentIds(full), { "logo@x": "1.2" });
});

test("the exported page is safe and offline", () => {
  const page = messagePage({ title: "Quote <42>", headers: headerRows({ author: "Ann", recipients: ["B", "C"], subject: "Q" }), html: bodies(full).html, cids: { "logo@x": "attachments/logo.png" }, attachments: [{ name: "quote.pdf", href: "attachments/quote.pdf" }] });
  assert.doesNotMatch(page, /<script>alert/);
  assert.doesNotMatch(page, /onclick/);
  assert.doesNotMatch(page, /track\.example/);
  assert.match(page, /src="attachments\/logo\.png"/);
  assert.match(page, /<title>Quote &lt;42&gt;<\/title>/);
  assert.match(page, /<th>To<\/th><td>B, C<\/td>/);
  assert.match(page, /href="attachments\/quote\.pdf"/);
  assert.match(sanitize('<a href="javascript:evil()">x</a>'), /href="#/);
});

test("HTML to text keeps paragraphs, lists and entities", () => {
  assert.equal(htmlToText("<p>Hi&nbsp;Ann &amp; Bob</p><ul><li>one</li><li>two</li></ul>a<br>b &#8364; &euro;"), "Hi Ann & Bob\n• one\n• two\na\nb € €");
  assert.equal(indexCsv([{ date: "d", from: 'A "x"', subject: "s" }]), '"Date","From","To","Subject","Folder","File"\r\n"d","A ""x""","","s","",""\r\n');
});

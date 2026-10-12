// Test mail in Local Folders: "Export Test" (2 messages) and "Export Test/Sub".

import { loadFolders, createFolderPath } from "../../src/kit/folders.js";
import { messageFolderArg, hasFolderIds, legacyRef } from "../../src/kit/compat.js";
import { chrome, importModule } from "./util.js";

const PDF = "JVBERi0xLjQKJcOkw7wKMSAwIG9iago8PD4+CmVuZG9iagp0cmFpbGVyCjw8Pj4KJSVFT0YK";
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export const QUOTE = [
  "From: Ann Lee <ann@example.com>",
  "To: Pat Sender <pat@example.com>",
  "Subject: =?UTF-8?Q?Quote_42_=E2=80=93_R=C3=A4ksm=C3=B6rg=C3=A5s?=",
  "Message-ID: <q42@tei.test>",
  "Date: Thu, 01 Oct 2026 10:00:00 +0000",
  "MIME-Version: 1.0",
  'Content-Type: multipart/mixed; boundary="mix"',
  "",
  "--mix",
  'Content-Type: multipart/related; boundary="rel"',
  "",
  "--rel",
  "Content-Type: text/html; charset=UTF-8",
  "Content-Transfer-Encoding: 8bit",
  "",
  '<html><body><p>Hej Pat! Here is the quote for 12 €.</p><img src="cid:logo@tei.test"><script>alert(1)</script></body></html>',
  "--rel",
  "Content-Type: image/png; name=logo.png",
  "Content-ID: <logo@tei.test>",
  "Content-Disposition: inline; filename=logo.png",
  "Content-Transfer-Encoding: base64",
  "",
  PNG,
  "--rel--",
  "--mix",
  "Content-Type: application/pdf; name=quote.pdf",
  "Content-Disposition: attachment; filename=quote.pdf",
  "Content-Transfer-Encoding: base64",
  "",
  PDF,
  "--mix--",
  "",
].join("\r\n");

const plain = (subject, id, body) =>
  `From: Bob <bob@example.com>\r\nTo: pat@example.com\r\nSubject: ${subject}\r\nMessage-ID: <${id}@tei.test>\r\nDate: Fri, 02 Oct 2026 09:00:00 +0000\r\n\r\n${body}\r\n`;

async function pathOf(id) {
  return hasFolderIds() ? (await browser.folders.get(id)).path : legacyRef(id).path;
}

async function add(folderId, raw, i) {
  if (browser.messages.import) {
    return browser.messages.import(new File([raw], `seed-${i}.eml`, { type: "message/rfc822" }), messageFolderArg(folderId));
  }
  // Thunderbird 91–105: the copy service, as when dragging in an .eml file.
  const uri = "mailbox://nobody@Local%20Folders" + (await pathOf(folderId)).split("/").map(encodeURIComponent).join("/");
  return chrome(
    `const { MailServices } = ${importModule("MailServices").replace(/gre\/modules/g, "/modules")};
     const folder = MailServices.folderLookup.getFolderForURL(arguments[0]);
     const file = Services.dirsvc.get("TmpD", Ci.nsIFile);
     file.append("tei-seed-" + arguments[2] + ".eml");
     return (async () => {
       await IOUtils.write(file.path, new TextEncoder().encode(arguments[1]));
       await new Promise((resolve, reject) => MailServices.copy.copyFileMessage(file, folder, null, false, 0, "", {
         QueryInterface: ChromeUtils.generateQI(["nsIMsgCopyServiceListener"]),
         OnStartCopy() {}, OnProgress() {}, SetMessageKey() {}, GetMessageId() {},
         OnStopCopy(s) { Components.isSuccessCode(s) ? resolve() : reject(new Error("copy failed " + s)); },
       }, null));
       return true;
     })();`,
    [uri, raw, i],
  );
}

// → { root, folder, sub } folder entries.
export async function seed() {
  const root = (await loadFolders()).find((f) => f.isRoot && f.name === "Local Folders");
  await createFolderPath(root, "Export Test/Sub");
  await createFolderPath(root, "Imported");
  const byPath = async (p) => (await loadFolders()).find((f) => f.segments.join("/") === `Local Folders/${p}`);
  const folder = await byPath("Export Test");
  const sub = await byPath("Export Test/Sub");
  await add(folder.id, QUOTE, 1);
  await add(folder.id, plain("PO 4711", "po4711", "Please deliver.\r\nFrom the start, thanks."), 2);
  await add(sub.id, plain("Sub note", "sub1", "In the subfolder."), 3);
  return { root, folder, sub, imported: await byPath("Imported") };
}

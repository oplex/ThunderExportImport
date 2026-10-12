<p align="center"><img src="icons/thunderexportimport.svg" alt="ThunderExportImport logo" width="112"></p>

# ThunderExportImport

Export Thunderbird mail the way you need it, and bring it back in.

- **Folders or single messages**, with subfolders if you like
- **Formats:** EML (each message exactly as stored), **PDF**, **HTML** (with
  inline images), plain **text**, **MBOX** (one file per folder) and the
  **attachments** next to each message
- **One ZIP** or **separate files**, in your Downloads folder, named by a
  pattern (`{date} {time} {from} - {subject}`)
- **Compliance stamp** (optional): every PDF and HTML gets a box with who
  exported it and when, the Message-ID, the folder, the message's SHA-256
  fingerprint and a **QR code** with the same details
- **export-manifest.json** with the SHA-256 of every exported file, and a
  **Verify** tab that checks an export is complete and unchanged
- **Import** .eml, .mbox (Thunderbird, Apple Mail, Gmail Takeout…) and .zip
  files into any folder. Messages already in the folder are skipped, so
  importing the same archive twice is harmless.

Part of the Thunder suite with [ThunderJump](https://github.com/oplex/thunderjump)
and [ThunderSnippet](https://github.com/oplex/thundersnippet): same look, and
installed together they find each other (one **suite settings backup** for
all of them). Tested inside real Thunderbird builds from 91 to the newest
release.

## Install

Download the `.xpi` for your Thunderbird from the
[latest release](https://github.com/oplex/thunderexportimport/releases/latest),
then **Add-ons and Themes → ⚙ → Install Add-on From File…**. Updates
install automatically after that.

- Thunderbird 140 or newer: `thunderexportimport-<version>.xpi`
- Thunderbird 91–139: `thunderexportimport-<version>-tb91-139.xpi`

## Using it

- **Right-click a folder → Export folder…** or **Import mail into this
  folder…**
- **Right-click selected messages → Export selected messages…**
- The **toolbar button** or **Tools → ThunderExportImport** opens the page
  with the Export, Import, Verify and Settings tabs.

### The compliance stamp

Set *Exported by*, *Organization* and an optional *Note* (a case or reference
number) under Settings, then tick *Compliance stamp*. Each PDF and HTML
starts with:

| | |
| --- | --- |
| Exported by | Åsa Lind, oplex.se |
| Exported at | 2026-10-12T13:55:14Z |
| Message-ID | &lt;po-4711@example.com&gt; |
| Folder | Local Folders › Orders |
| SHA-256 | fingerprint of the original message (.eml) |
| QR code | `TEI1|sha256:…|at:…|by:…|id:…` |

The SHA-256 is computed from the message exactly as exported in the `.eml`,
so anyone can recompute it (`sha256sum`) and compare.

### PDF

ThunderExportImport writes the PDFs itself (Thunderbird has no PDF API for
add-ons): A4, the message headers, the text (HTML messages are converted to
text), the list of attachments, page numbers. It uses PDF's built-in
Helvetica font, which covers Western European languages (å ä ö é ü ß € …);
other scripts (Greek, Cyrillic, Asian languages, emoji) show as “?” in the
PDF — use the HTML export for those, which keeps everything, and print it to
PDF from a browser if needed.

### Import notes

Importing uses Thunderbird's `messages.import`, available from Thunderbird
106. On 91–102 exporting works fully and the Import tab explains this.

## Permissions

- `accountsRead`, `messagesRead`: list folders and read the messages you export
- `messagesImport`: add messages when you import
- `downloads`: save the exported files
- `menus`: the right-click items
- `storage`: remember your choices and stamp details

ThunderExportImport makes no network requests and collects nothing. Exported
HTML pages can't load anything either (scripts and remote images are
removed, and a Content-Security-Policy blocks the rest).

## Development

```sh
npm test              # unit tests (ZIP, MBOX, PDF + QR checked with unzip, pdftotext, zxing)
npm run test:tb       # end-to-end in real headless Thunderbird; checks the files saved to disk
TB_PARTNERS=../thundersnippet npm run test:tb   # suite cross-test
npm run check-lines && npm run check-kit && npm run lint && npm run build
```

`src/kit/` is the shared Thunder kit (see ThunderSnippet's DEVELOPMENT.md).
Releasing: bump the version, then Actions → *Release* → *Run workflow*.

## License

MIT © 2026 oplex.se

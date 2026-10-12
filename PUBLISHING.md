# Publishing ThunderExportImport on addons.thunderbird.net

1. First time, by hand: on <https://addons.thunderbird.net/developers/>,
   **Submit a New Add-on → On this site**, upload
   `thunderexportimport-<version>-atn.xpi` from the latest GitHub release, answer
   **No** to source code (plain, unminified JavaScript), MIT license.
   After it's approved, **Upload New Version** with
   `thunderexportimport-<version>.91-atn-tb91-139.xpi` for Thunderbird 91–139.
2. Then add the repository secrets `JWTISSUER` and `JWTSECRET` (the same ATN
   API key as ThunderJump works). From then on every release uploads both
   files automatically.

**Summary:** Export folders or messages to EML, PDF, HTML, text and MBOX with
attachments, as ZIP or files, with an optional compliance stamp (QR code,
SHA-256). Import EML, MBOX and ZIP back.

**Categories:** Import/Export; Folders and Filters.

**Privacy policy:** ThunderExportImport makes no network requests and
collects no data. It reads the messages you choose to export and saves the
files to your computer; settings stay in your Thunderbird profile.

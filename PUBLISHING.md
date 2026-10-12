# Publishing ThunderExportImport on addons.thunderbird.net

1. First time, by hand: on <https://addons.thunderbird.net/developers/>,
   **Submit a New Add-on → On this site**, upload
   `thunderexportimport-<version>-atn.xpi` from the latest GitHub release, answer
   **No** to source code (plain, unminified JavaScript), MIT license.
   That one file works on Thunderbird 91 and every newer version (ATN's
   listing judges compatibility by the newest version only, so there is no
   separate file for old Thunderbird).
2. Then add the repository secrets `JWTISSUER` and `JWTSECRET` (the same ATN
   API key as ThunderJump works). From then on every release uploads it
   automatically.

**Summary:** Export folders or messages to EML, PDF, HTML, text and MBOX with
attachments, as ZIP or files, with an optional compliance stamp (QR code,
SHA-256). Import EML, MBOX and ZIP back.

**Categories:** Import/Export; Folders and Filters.

**Privacy policy:** ThunderExportImport makes no network requests and
collects no data. It reads the messages you choose to export and saves the
files to your computer; settings stay in your Thunderbird profile.

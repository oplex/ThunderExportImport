/*
 * MBOX files (pure, "mboxrd" flavour): messages separated by "From " lines;
 * body lines starting with ">*From " get one more ">" so they can't be
 * mistaken for separators, and lose it again when read.
 */

import { concat, toBytes } from "./zip.js";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n, w = 2) => String(n).padStart(w, " ");
const pad0 = (n) => String(n).padStart(2, "0");

// "From sender@x Sat Mar  7 14:05:09 2026"
export function fromLine(sender, date) {
  const d = date instanceof Date && !isNaN(date) ? date : new Date(0);
  const when = `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${pad(d.getUTCDate())} ${pad0(d.getUTCHours())}:${pad0(d.getUTCMinutes())}:${pad0(d.getUTCSeconds())} ${d.getUTCFullYear()}`;
  return `From ${(sender || "MAILER-DAEMON").replace(/\s+/g, "") || "MAILER-DAEMON"} ${when}\n`;
}

// Raw message bytes are handled as "binary" strings (one char per byte) so
// any charset passes through untouched.
export const bytesToBinary = (bytes) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return s;
};
export const binaryToBytes = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

// Thunderbird (up to 115) hands over local messages with its mailbox lines
// still on top: a "From - …" separator and X-Mozilla-Status/Keys headers.
// A standard .eml starts with the real headers, so those are removed. Such
// messages come straight from the mailbox file, where body lines starting
// with "From " were stored as ">From "; that is undone too.
export function cleanRaw(bytes) {
  const s = bytesToBinary(toBytes(bytes));
  const m = /^(From [^\n]*\n)?((?:X-Mozilla-(?:Status2?|Keys):[^\n]*\n)*)/.exec(s);
  if (!m[0]) return toBytes(bytes);
  const rest = s.slice(m[0].length);
  return binaryToBytes(m[1] ? rest.replace(/^>From /gm, "From ") : rest);
}

// messages: [{ raw: Uint8Array, sender, date }] → Uint8Array.
export function makeMbox(messages) {
  const chunks = [];
  for (const m of messages) {
    let body = bytesToBinary(toBytes(m.raw)).replace(/\r\n/g, "\n");
    body = body.replace(/^(>*From )/gm, ">$1");
    if (!body.endsWith("\n")) body += "\n";
    chunks.push(toBytes(fromLine(m.sender, m.date)), binaryToBytes(body), toBytes("\n"));
  }
  return concat(chunks);
}

// Uint8Array → [Uint8Array] (each one raw message, CRLF line endings).
export function splitMbox(bytes) {
  const text = bytesToBinary(toBytes(bytes)).replace(/\r\n/g, "\n");
  if (!text.startsWith("From ")) throw new Error("Not an MBOX file (it should start with a “From ” line)");
  return text
    .split(/^From [^\n]*\n/m)
    .slice(1)
    .map((m) => m.replace(/\n$/, "").replace(/^>(>*From )/gm, "$1").replace(/\n/g, "\r\n"))
    .filter((m) => m.trim())
    .map(binaryToBytes);
}

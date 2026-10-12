/*
 * File names for exported messages (pure). Patterns:
 *   {date} 2026-03-07   {time} 1405   {from} Ann Lee   {subject} Quote 42
 *   {to} first recipient   {id} short unique id
 * Characters that file systems refuse are replaced; names stay short and
 * unique within a folder.
 */

const pad = (n) => String(n).padStart(2, "0");
export const DEFAULT_PATTERN = "{date} {time} {from} - {subject}";

// Safe for Windows, macOS and Linux file names.
export function safeName(text, max = 80) {
  const s = String(text ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u001f<>:"/\\|?*\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+|[. ]+$/g, "");
  const cut = s.length > max ? s.slice(0, max).trim() : s;
  return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(cut) ? `_${cut}` : cut;
}

const nameOf = (addr) => (/^\s*"?([^"<]+?)"?\s*</.exec(addr ?? "")?.[1] ?? String(addr ?? "").replace(/[<>]/g, "")).trim();

export function fileBase(m, pattern = DEFAULT_PATTERN) {
  const d = new Date(m.date);
  const ok = !isNaN(d);
  const values = {
    date: ok ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : "undated",
    time: ok ? `${pad(d.getHours())}${pad(d.getMinutes())}` : "",
    from: nameOf(m.author),
    to: nameOf(Array.isArray(m.recipients) ? m.recipients[0] : m.recipients),
    subject: m.subject || "(no subject)",
    id: String(m.id ?? ""),
  };
  return safeName(pattern.replace(/\{(\w+)\}/g, (all, k) => values[k] ?? all)) || "message";
}

// Gives the same base a number when taken: "x", "x (2)", …
export function uniqueNamer() {
  const used = new Set();
  return (base, ext = "") => {
    let name = `${base}${ext}`;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base} (${i})${ext}`;
    used.add(name.toLowerCase());
    return name;
  };
}

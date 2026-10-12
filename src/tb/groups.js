// What to export, as runExport groups: [{ dir, label, messages }].

import { pathLabel } from "../kit/folders.js";
import { folderMessages, folderOf } from "./mail.js";

// A folder (and optionally its subfolders), one group per folder.
export async function groupsFor(folders, chosen, subfolders) {
  const inside = (f) => f.accountId === chosen.accountId && f.segments.length > chosen.segments.length && chosen.segments.every((s, i) => f.segments[i] === s);
  const groups = [];
  for (const f of [chosen, ...(subfolders ? folders.filter(inside) : [])]) {
    if (f.isRoot || f.isVirtual) continue;
    groups.push({ dir: f.segments.slice(Math.max(0, chosen.segments.length - 1)), label: pathLabel(f), messages: await folderMessages(f.id) });
  }
  return groups;
}

// Selected messages (MessageHeaders), grouped by their folder.
export function groupsForMessages(folders, messages) {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const groups = new Map();
  for (const m of messages) {
    const f = byId.get(folderOf(m));
    const key = f?.id ?? "?";
    if (!groups.has(key)) groups.set(key, { dir: f ? [f.name] : ["Messages"], label: f ? pathLabel(f) : "", messages: [] });
    groups.get(key).messages.push(m);
  }
  return [...groups.values()];
}

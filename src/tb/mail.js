/*
 * Reading messages for export, on every Thunderbird from 91:
 * folder listings (with paging), raw message bytes, the parsed message and
 * its attachments.
 */

import { messageFolderArg, tabIdOf, folderIdOf } from "../kit/compat.js";
import { binaryToBytes } from "../lib/mbox.js";

export async function listAll(page) {
  const out = [...(page?.messages ?? [])];
  let id = page?.id;
  while (id) {
    const next = await browser.messages.continueList(id);
    out.push(...next.messages);
    id = next.id;
  }
  return out;
}

// Every message in a folder (MessageHeader objects).
export async function folderMessages(folderId) {
  return listAll(await browser.messages.list(messageFolderArg(folderId)));
}

// Messages selected in the mail tab of `windowId` (or the active one).
export async function selectedMessages(windowId) {
  const tabs = await browser.mailTabs.query(windowId != null ? { windowId } : { active: true, lastFocusedWindow: true });
  const tab = tabs[0];
  return tab ? listAll(await browser.mailTabs.getSelectedMessages(tabIdOf(tab))) : [];
}

const toBytes = async (data) => (typeof data === "string" ? binaryToBytes(data) : new Uint8Array(await data.arrayBuffer()));

// The message exactly as stored (an .eml file): Uint8Array.
export async function rawBytes(id) {
  try {
    // Thunderbird 115+ can hand over a File; 91 returns a binary string.
    return await toBytes(await browser.messages.getRaw(id, { data_format: "File" }));
  } catch {
    return toBytes(await browser.messages.getRaw(id));
  }
}

export const fullMessage = (id) => browser.messages.getFull(id);

// [{ name, partName, contentType, size, bytes() }]
export async function attachments(id) {
  const list = await browser.messages.listAttachments(id).catch(() => []);
  return list.map((a) => ({
    name: a.name || "attachment",
    partName: a.partName,
    contentType: a.contentType,
    size: a.size,
    bytes: async () => new Uint8Array(await (await browser.messages.getAttachmentFile(id, a.partName)).arrayBuffer()),
  }));
}

export const folderOf = (m) => (m.folder ? folderIdOf(m.folder) : null);

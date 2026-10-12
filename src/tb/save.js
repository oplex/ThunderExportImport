// Saving export files through the downloads API (to the Downloads folder,
// or wherever Thunderbird is set to save files).

const MIME = { zip: "application/zip", pdf: "application/pdf", html: "text/html", eml: "message/rfc822", mbox: "application/mbox", json: "application/json", csv: "text/csv", txt: "text/plain" };

// `path` may contain folders ("Export/Inbox/a.eml"). Resolves the download id.
export async function saveFile(path, bytes) {
  const ext = /\.(\w+)$/.exec(path)?.[1]?.toLowerCase();
  const url = URL.createObjectURL(new Blob([bytes], { type: MIME[ext] ?? "application/octet-stream" }));
  try {
    const id = await browser.downloads.download({ url, filename: path, saveAs: false, conflictAction: "uniquify" });
    await done(id);
    return id;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
}

// Wait until a download has finished (or failed).
function done(id) {
  return new Promise((resolve, reject) => {
    const check = async () => {
      const [item] = await browser.downloads.search({ id });
      if (item?.state === "complete") return finish(resolve);
      if (item?.state === "interrupted") return finish(() => reject(new Error(`Saving failed: ${item.error}`)));
    };
    const onChanged = (delta) => delta.id === id && check();
    const finish = (fn) => {
      browser.downloads.onChanged.removeListener(onChanged);
      clearInterval(timer);
      fn();
    };
    browser.downloads.onChanged.addListener(onChanged);
    const timer = setInterval(check, 500);
    check();
  });
}

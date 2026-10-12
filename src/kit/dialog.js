/*
 * Thunder kit dialogs: confirm, prompt and toast, styled by theme.css.
 * (Plain elements, not <dialog>, which Thunderbird 91 doesn't have.)
 */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function show(title, message, build) {
  return new Promise((resolve) => {
    const overlay = el("div", "tk-overlay");
    const box = el("div", "tk-dialog");
    box.setAttribute("role", "dialog");
    box.append(el("h3", "", title));
    if (message) box.append(el("p", "", message));
    const done = (value) => {
      overlay.remove();
      document.removeEventListener("keydown", onKey, true);
      resolve(value);
    };
    const { focus, ok } = build(box, done);
    const onKey = (ev) => {
      if (ev.key === "Escape") (ev.preventDefault(), done(null));
      else if (ev.key === "Enter" && ev.target.tagName !== "TEXTAREA") (ev.preventDefault(), ok());
    };
    document.addEventListener("keydown", onKey, true);
    overlay.append(box);
    document.body.append(overlay);
    focus?.focus();
  });
}

function actions(box, done, ok, okText, cancelText) {
  const row = el("div", "actions");
  const cancel = el("button", "", cancelText);
  const yes = el("button", "primary", okText);
  cancel.addEventListener("click", () => done(null));
  yes.addEventListener("click", ok);
  row.append(cancel, yes);
  box.append(row);
  return yes;
}

// Resolves true (OK) or false.
export async function confirmDialog(title, message = "", { ok = "OK", cancel = "Cancel" } = {}) {
  const r = await show(title, message, (box, done) => {
    const okFn = () => done(true);
    return { focus: actions(box, done, okFn, ok, cancel), ok: okFn };
  });
  return r === true;
}

// Resolves the typed text, or null when cancelled.
export function promptDialog(title, message = "", { value = "", ok = "OK", cancel = "Cancel", placeholder = "" } = {}) {
  return show(title, message, (box, done) => {
    const input = el("input");
    Object.assign(input, { type: "text", value, placeholder });
    input.style.width = "100%";
    box.append(input);
    const okFn = () => done(input.value);
    actions(box, done, okFn, ok, cancel);
    return { focus: input, ok: okFn };
  });
}

// A short message at the bottom of the page.
export function toast(text, ms = 3000) {
  const t = el("div", "tk-toast", text);
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}

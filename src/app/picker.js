// Folder picker for the app page: type to search (Thunder kit fuzzy search),
// click or arrow keys + Enter to choose.

import { rankFolders } from "../kit/fuzzy.js";
import { pathLabel } from "../kit/folders.js";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// folders: kit/folders.js entries. allow(entry) filters choosable folders.
// Returns { get value(), set(id) }; onChange(entry) on every choice.
export function folderPicker(box, folders, { allow = () => true, onChange = () => {}, placeholder = "Search folders…" } = {}) {
  const input = el("input");
  Object.assign(input, { type: "text", placeholder, autocomplete: "off" });
  const chosen = el("div", "chosen", "No folder chosen");
  const list = el("ul");
  box.replaceChildren(input, list, chosen);
  const usable = folders.filter(allow);
  let shown = [];
  let index = -1; // keyboard position; none until arrows or typing
  let value = null;

  function choose(entry) {
    value = entry;
    chosen.textContent = entry ? `Chosen: ${pathLabel(entry)}` : "No folder chosen";
    draw();
    onChange(entry);
  }
  function draw() {
    list.replaceChildren(
      ...shown.map((r, i) => {
        const li = el("li", [i === index ? "cursor" : "", r.entry === value ? "on" : ""].join(" ").trim());
        li.append(el("span", "", r.entry.name), el("span", "sub", pathLabel(r.entry)));
        li.dataset.id = r.entry.id;
        li.addEventListener("click", () => choose(r.entry));
        return li;
      }),
    );
  }
  function update() {
    shown = input.value.trim() ? rankFolders(usable, input.value, { limit: 40 }) : usable.slice(0, 40).map((entry) => ({ entry }));
    index = input.value.trim() ? 0 : -1;
    draw();
  }
  input.addEventListener("input", update);
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      if (shown.length) index = (Math.max(index, ev.key === "ArrowDown" ? -1 : 0) + (ev.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length;
      draw();
    } else if (ev.key === "Enter" && shown[index]) {
      ev.preventDefault();
      choose(shown[index].entry);
    }
  });
  update();
  return {
    get value() {
      return value;
    },
    set(id) {
      const entry = usable.find((f) => f.id === id);
      if (entry) choose(entry);
    },
  };
}

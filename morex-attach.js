/* MOOREX AI — Attach button: photos, PDFs and text files.
 * Photos are shrunk on the phone first so they upload fast. Text files are read here and placed
 * inside the message; photos and PDFs are sent to the online AI as attachments (see morex-dashboard.js).
 */
"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const button = $("morex-attach-button"), fileInput = $("morex-file-input"), tray = $("morex-attach-tray");
  if (!button || !fileInput || !tray) return;

  const MAX_FILES = 3, IMAGE_SIDE = 1280, PDF_MAX = 5 * 1024 * 1024, TEXT_MAX = 400 * 1024, TEXT_CHARS = 9000;
  const TEXT_EXT = /\.(txt|md|csv|json|js|html|css|py|xml|log|yml|yaml|sql|ts|c|cpp|java|php|ini)$/i;
  let items = [], noteTimer = 0, seq = 0;

  const kb = (n) => n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";

  function note(message) {
    clearTimeout(noteTimer);
    tray.querySelector(".attach-note")?.remove();
    if (message) {
      const p = document.createElement("p");
      p.className = "attach-note"; p.textContent = message;
      tray.prepend(p); tray.hidden = false;
      noteTimer = setTimeout(() => { p.remove(); if (!items.length) tray.hidden = true; }, 5000);
    }
  }

  function render() {
    tray.querySelector(".attach-row")?.remove();
    const row = document.createElement("div");
    row.className = "attach-row";
    items.forEach((it) => {
      const chip = document.createElement("div");
      chip.className = "attach-chip";
      if (it.thumb) { const img = document.createElement("img"); img.src = it.thumb; img.alt = ""; chip.appendChild(img); }
      else { const ic = document.createElement("div"); ic.className = "attach-icon"; ic.textContent = it.kind === "pdf" ? "PDF" : "TXT"; chip.appendChild(ic); }
      const label = document.createElement("span");
      label.className = "attach-name"; label.textContent = it.name; label.title = it.name + " · " + kb(it.size);
      const x = document.createElement("button");
      x.type = "button"; x.setAttribute("aria-label", "Remove " + it.name); x.textContent = "✕";
      x.addEventListener("click", () => { items = items.filter((i) => i.id !== it.id); render(); });
      chip.append(label, x);
      row.appendChild(chip);
    });
    if (items.length) tray.appendChild(row);
    tray.hidden = !items.length && !tray.querySelector(".attach-note");
    button.classList.toggle("has-files", items.length > 0);
  }

  const readAs = (file, how) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result); r.onerror = () => reject(r.error);
    how === "text" ? r.readAsText(file) : r.readAsDataURL(file);
  });

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("unsupported")); };
      img.src = url;
    });
  }

  function drawScaled(img, side, quality) {
    const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * scale)); c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);   // transparent PNGs get a white background
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", quality);
  }

  async function addFile(file) {
    const name = file.name || "file";
    if (file.type.startsWith("image/")) {
      let img;
      try { img = await loadImage(file); } catch { return note("I could not open " + name + ". Try a JPG or PNG photo."); }
      const full = drawScaled(img, IMAGE_SIDE, 0.85);
      items.push({ id: ++seq, kind: "image", name, mime: "image/jpeg", data: full.split(",")[1], thumb: drawScaled(img, 96, 0.7), size: Math.round(full.length * 0.75) });
    } else if (file.type === "application/pdf" || /\.pdf$/i.test(name)) {
      if (file.size > PDF_MAX) return note(name + " is too big. PDFs must be under 5 MB.");
      const url = await readAs(file, "data");
      items.push({ id: ++seq, kind: "pdf", name, mime: "application/pdf", data: String(url).split(",")[1], size: file.size });
    } else if (file.type.startsWith("text/") || file.type === "application/json" || TEXT_EXT.test(name)) {
      if (file.size > TEXT_MAX) return note(name + " is too big. Text files must be under 400 KB.");
      let text = String(await readAs(file, "text"));
      if (text.includes("\u0000")) return note(name + " does not look like a text file.");
      if (text.length > TEXT_CHARS) text = text.slice(0, TEXT_CHARS) + "\n…[file shortened]";
      items.push({ id: ++seq, kind: "text", name, mime: "text/plain", text, size: file.size });
    } else {
      note(name + " is not supported. Use a photo, PDF or text file.");
    }
  }

  async function addFiles(list) {
    note("");
    for (const file of Array.from(list)) {
      if (items.length >= MAX_FILES) { note("You can attach up to " + MAX_FILES + " files at a time."); break; }
      try { await addFile(file); } catch { note("I could not read " + (file.name || "that file") + "."); }
    }
    render();
  }

  button.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => { await addFiles(fileInput.files); fileInput.value = ""; });
  // Paste a screenshot straight into the message box
  $("morex-message-input")?.addEventListener("paste", (e) => {
    const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith("image/"));
    if (files.length) { e.preventDefault(); addFiles(files); }
  });

  // Open the picker for a given job: "camera" (take a photo), "photo" (choose a photo) or "files" (PDF / text).
  // Resolves once the chosen files have been added, or never if the person cancels.
  function pick(mode) {
    return new Promise((resolve) => {
      const defaultAccept = fileInput.accept;
      fileInput.accept = mode === "files" ? ".pdf,.txt,.md,.csv,.json,.js,.html,.css,.py,.xml,.log,.yml,.yaml,.sql" : "image/*";
      if (mode === "camera") fileInput.setAttribute("capture", "environment"); else fileInput.removeAttribute("capture");
      fileInput.addEventListener("change", () => {
        fileInput.accept = defaultAccept; fileInput.removeAttribute("capture");
        setTimeout(() => resolve(items.length), 50);
      }, { once: true });
      fileInput.click();
    });
  }

  window.MorexAttach = Object.freeze({
    pick,
    count: () => items.length,
    peek: () => items.slice(),
    take() { const out = items; items = []; note(""); render(); return out; },
    clear() { items = []; note(""); render(); }
  });
})();

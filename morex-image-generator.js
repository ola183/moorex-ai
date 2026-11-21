/* MOOREX AI image generation — calls the secure server endpoint; API keys stay on the server.
   Also exposes window.MorexImage so images made in the chat can be downloaded the same way. */
"use strict";
(() => {
  const EXT = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
  const extOf = (mime) => EXT[String(mime || "").toLowerCase()] || "png";
  const stamp = () => new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
  const endpoint = () => (window.MOREXAI_API_URL || "").replace(/\/$/, "");

  function base64ToBlob(b64, mime) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime || "image/png" });
  }

  // Saves a Blob to the device. Falls back to opening the picture in a tab (press and hold to save) if the browser blocks downloads.
  function download(blob, name) {
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name; a.rel = "noopener";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 120000);
      return true;
    } catch (_) {
      try { window.open(URL.createObjectURL(blob), "_blank"); } catch (__) { /* nothing more to try */ }
      return false;
    }
  }

  async function share(blob, name) {
    const file = new File([blob], name, { type: blob.type || "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: "MOOREX image" }); return true; }
    return false;
  }

  window.MorexImage = Object.freeze({
    extOf, base64ToBlob, download, share,
    // data: URL (used by images shown inside the chat)
    async downloadDataUrl(dataUrl) {
      const blob = await (await fetch(dataUrl)).blob();
      return download(blob, `moorex-image-${stamp()}.${extOf(blob.type)}`);
    }
  });

  const form = document.getElementById("morex-image-form");
  const promptInput = document.getElementById("morex-image-prompt");
  const submit = document.getElementById("morex-image-submit");
  const status = document.getElementById("morex-image-status");
  const result = document.getElementById("morex-image-result");
  const image = document.getElementById("morex-generated-image");
  const downloadBtn = document.getElementById("morex-image-download");
  const shareBtn = document.getElementById("morex-image-share");
  if (!form || !promptInput || !submit || !status || !result || !image || !downloadBtn) return;

  let currentUrl = "";
  let currentBlob = null;
  let currentName = "";

  // Tell the person which free route is active (read from the server's health report).
  (async () => {
    try {
      const res = await fetch(endpoint() + "/api/health", { cache: "no-store" });
      const h = await res.json();
      const p = h.imageProviders || {};
      if (p.cloudflare) status.textContent = "Free image generation is ready. Describe your picture and press Generate image.";
      else if (p.pollinations) status.textContent = "Using the free keyless image service. It can be slow or busy. Add a free Cloudflare key on the server for reliable images.";
      else status.textContent = "Image generation is not set up on the server yet.";
    } catch (_) { /* keep the default text */ }
  })();

  downloadBtn.addEventListener("click", () => {
    if (!currentBlob) return;
    const ok = download(currentBlob, currentName);
    status.textContent = ok ? "Download started. Check your Downloads folder." : "Your browser blocked the download. Press and hold the picture and choose Save image.";
  });

  shareBtn?.addEventListener("click", async () => {
    if (!currentBlob) return;
    try { await share(currentBlob, currentName); } catch (err) { if (err && err.name !== "AbortError") status.textContent = "Sharing was not possible. Use Download image instead."; }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const prompt = promptInput.value.trim();
    if (!prompt) { status.textContent = "Please describe the image you want."; return; }
    submit.disabled = true;
    submit.textContent = "Creating...";
    status.textContent = "MOOREX is creating your image. This can take up to a minute...";
    result.hidden = true;
    try {
      const response = await fetch(endpoint() + "/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Image generation failed (HTTP ${response.status}).`);
      if (!data.image) throw new Error("The image service did not return an image.");
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      currentBlob = base64ToBlob(data.image, data.mime);
      currentName = `moorex-image-${stamp()}.${extOf(data.mime)}`;
      currentUrl = URL.createObjectURL(currentBlob);
      image.src = currentUrl;
      if (shareBtn) {
        let canShare = false;
        try { canShare = !!(navigator.canShare && navigator.canShare({ files: [new File([currentBlob], currentName, { type: currentBlob.type })] })); } catch (_) {}
        shareBtn.hidden = !canShare;
      }
      result.hidden = false;
      status.textContent = `Image ready${data.provider ? " (" + data.provider + ")" : ""}. Press Download image to save it.`;
    } catch (error) {
      status.textContent = error.message || "Could not generate the image. Please try again.";
    } finally {
      submit.disabled = false;
      submit.textContent = "Generate image";
    }
  });
})();

/* MOOREX AI image generation — calls the secure server endpoint; API key stays on Render. */
"use strict";
(() => {
  const form = document.getElementById("morex-image-form");
  const promptInput = document.getElementById("morex-image-prompt");
  const submit = document.getElementById("morex-image-submit");
  const status = document.getElementById("morex-image-status");
  const result = document.getElementById("morex-image-result");
  const image = document.getElementById("morex-generated-image");
  const download = document.getElementById("morex-image-download");
  if (!form || !promptInput || !submit || !status || !result || !image || !download) return;
  let currentUrl = "";
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const prompt = promptInput.value.trim();
    if (!prompt) { status.textContent = "Please describe the image you want."; return; }
    submit.disabled = true;
    submit.textContent = "Creating...";
    status.textContent = "MOOREX is creating your image. This may take a little while...";
    result.hidden = true;
    try {
      const response = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Image generation failed (HTTP ${response.status}).`);
      if (!data.image) throw new Error("The image service did not return an image.");
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      const binary = atob(data.image);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: data.mime || "image/png" });
      currentUrl = URL.createObjectURL(blob);
      image.src = currentUrl;
      download.href = currentUrl;
      download.download = `moorex-image-${Date.now()}.${(data.mime || "image/png").split("/")[1] || "png"}`;
      result.hidden = false;
      status.textContent = `Image created successfully with ${data.model || "Gemini"}.`;
    } catch (error) {
      status.textContent = error.message || "Could not generate the image. Please try again.";
    } finally {
      submit.disabled = false;
      submit.textContent = "Generate image";
    }
  });
})();

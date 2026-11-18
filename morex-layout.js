/* MOOREX AI — menu behaviour: dim backdrop, tap outside or press Escape to close the slide-in sidebar. */
"use strict";
(() => {
  const sidebar = document.getElementById("morex-sidebar");
  if (!sidebar) return;
  const backdrop = document.createElement("div");
  backdrop.className = "sidebar-backdrop";
  backdrop.setAttribute("aria-hidden", "true");
  document.body.appendChild(backdrop);
  const sync = () => backdrop.classList.toggle("show", sidebar.classList.contains("open"));
  new MutationObserver(sync).observe(sidebar, { attributes: true, attributeFilter: ["class"] });
  const close = () => { sidebar.classList.remove("open"); sync(); };
  backdrop.addEventListener("click", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  window.matchMedia("(min-width: 901px)").addEventListener?.("change", close);
})();

/* MorexAI — Powered by Ola Moore | Application entry point */
"use strict";
(() => {
  const app = document.getElementById("morex-app");
  if (!app) {
    console.error("MorexAI: application root was not found.");
    return;
  }
  console.info("MorexAI loaded. Automatic avatar, browser voice, local memory, and offline Q&A are active. Online AI requires the configured backend; native Android wake word is not connected.");
})();

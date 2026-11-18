/* MOOREX AI — simple avatar state controller.
   State controller: the text status changes and morex-motion.js animates the head, eyes, ears and mouth from it. */
"use strict";
(() => {
  const stage = document.getElementById("morex-avatar-stage");
  const label = document.getElementById("morex-live-status");
  if (!stage || !label) return;

  const states = {
    idle: "MOOREX IS READY",
    listening: "MOOREX IS LISTENING…",
    thinking: "MOOREX IS THINKING…",
    speaking: "MOOREX IS SPEAKING…",
    error: "MOOREX NEEDS ATTENTION"
  };

  function setState(state) {
    if (!Object.prototype.hasOwnProperty.call(states, state)) return;
    stage.className = `avatar-composition state-${state}`;
    stage.dataset.state = state;
    label.textContent = states[state];
    label.dataset.state = state;
    label.setAttribute("aria-label", states[state]);
  }

  window.MorexAIAvatar = Object.freeze({
    setState,
    look(yaw, pitch) { window.MorexAIMotion?.look(yaw, pitch); },
    blink() { window.MorexAIMotion?.blink(); },
    beat() {},
    shake() { window.MorexAIMotion?.shake(); },
    nod() { window.MorexAIMotion?.nod(); },
    talkTest() { setState("speaking"); setTimeout(() => setState("idle"), 4000); },
    get state() { return stage.dataset.state || "idle"; }
  });
  setState("idle");
})();

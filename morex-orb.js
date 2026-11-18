/* MOOREX AI — Siri-style orb overlay and link to overlay.html.
 * Tap the glowing orb button in the top bar: the orb opens full screen and MOOREX starts listening.
 * Everything runs through the same voice, chat and avatar code as the main screen, so the orb and
 * the head always show the same state, and the same words appear in both.
 * A BroadcastChannel ("morex-link") also connects overlay.html (a second window, or the web view
 * of the future native Android overlay) to this app.
 */
"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const overlay = $("morex-orb-overlay"), launch = $("morex-orb-launch"), closeBtn = $("morex-orb-close");
  const stageBox = $("morex-orb-stage"), canvas = $("morex-orb-canvas");
  const userLine = $("morex-orb-user"), replyLine = $("morex-orb-reply"), stateLine = $("morex-orb-state");
  const avatarStage = $("morex-avatar-stage"), messages = $("morex-chat-messages"), input = $("morex-message-input");
  if (!overlay || !launch || !canvas || !avatarStage) return;

  const LABELS = {
    idle: "TAP THE ORB TO SPEAK",
    listening: "LISTENING…",
    thinking: "THINKING…",
    speaking: "SPEAKING · TAP TO STOP",
    error: "TAP TO TRY AGAIN"
  };
  const state = () => avatarStage.dataset.state || "idle";
  const click = (id) => { const b = $(id); if (b && !b.disabled) b.click(); };

  let orb = null, bumpUntil = 0;
  let channel = null;
  try { channel = "BroadcastChannel" in window ? new BroadcastChannel("morex-link") : null; } catch { channel = null; }
  const send = (msg) => { try { channel?.postMessage(msg); } catch { /* ignore */ } };

  /* ---- captions ---- */
  function clip(text, n) { text = String(text || "").trim(); return text.length > n ? text.slice(0, n - 1) + "…" : text; }
  function latest() {
    const users = messages.querySelectorAll(".user-preview-message");
    const replies = [...messages.querySelectorAll(".preview-notice:not(.is-pending) p")];
    return { user: users.length ? users[users.length - 1].textContent : "", reply: replies.length ? replies[replies.length - 1].textContent : "" };
  }
  function syncCaptions() {
    const { user, reply } = latest();
    if (user) userLine.textContent = clip(user, 160);
    if (reply) replyLine.textContent = clip(reply, 420);
    send({ type: "caption", user: clip(user, 160), reply: clip(reply, 420) });
  }
  new MutationObserver(syncCaptions).observe(messages, { childList: true });
  // Live words while the person is still speaking
  input?.addEventListener("input", () => {
    if (!overlay.hidden && state() === "listening") { userLine.textContent = clip(input.value, 160); bumpUntil = performance.now() + 220; }
    send({ type: "interim", text: clip(input.value, 160) });
  });

  /* ---- state ---- */
  function syncState() {
    const s = state();
    stateLine.textContent = LABELS[s] || LABELS.idle;
    overlay.dataset.state = s;
    send({ type: "state", state: s });
  }
  new MutationObserver(syncState).observe(avatarStage, { attributes: true, attributeFilter: ["data-state"] });

  /* ---- open / close ---- */
  function open() {
    overlay.hidden = false;
    document.body.classList.add("orb-open");
    if (!orb) orb = window.MorexOrbCore.start(canvas, {
      getState: state,
      getLevel: () => (performance.now() < bumpUntil ? 0.6 : 0) + (window.MorexAIMotion?.level || 0)
    });
    const { user, reply } = latest();
    userLine.textContent = clip(user, 160);
    replyLine.textContent = reply ? clip(reply, 420) : "Hey. I'm MOOREX. Tap the orb and speak.";
    syncState();
    if (state() === "idle" || state() === "error") click("morex-voice-start");
    send({ type: "open" });
  }
  function close() {
    if (overlay.hidden) return;
    click("morex-voice-stop"); click("morex-speech-stop");
    overlay.hidden = true;
    document.body.classList.remove("orb-open");
    orb?.stop(); orb = null;
    send({ type: "close" });
  }
  function tapOrb() {
    const s = state();
    if (s === "listening") click("morex-voice-stop");
    else if (s === "speaking") click("morex-speech-stop");
    else if (s === "idle" || s === "error") click("morex-voice-start");
  }

  launch.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  stageBox.addEventListener("click", tapOrb);
  stageBox.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tapOrb(); } });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !overlay.hidden) close(); });

  /* ---- link with overlay.html ---- */
  if (channel) {
    channel.onmessage = (e) => {
      const m = e.data || {};
      if (m.type === "hello") { syncState(); syncCaptions(); }
      else if (m.type === "command") {
        if (m.cmd === "toggle") tapOrb();
        else if (m.cmd === "listen") click("morex-voice-start");
        else if (m.cmd === "stop") { click("morex-voice-stop"); click("morex-speech-stop"); }
      }
    };
  }
  window.MorexAIOrb = Object.freeze({ open, close, get isOpen() { return !overlay.hidden; } });
})();

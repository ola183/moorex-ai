/* MOOREX AI — automatic face motion.
 * Drives head, eyelids (blink), ears and mouth from the avatar state.
 * It never touches the eye-colour layer, so the automatic eye-colour changes
 * in morex-eye-color.js keep working exactly as before while everything moves.
 */
"use strict";
(() => {
  const stage = document.getElementById("morex-avatar-stage");
  const rig = document.getElementById("morex-head-rig");
  if (!stage || !rig) return;

  const $ = (id) => document.getElementById(id);
  const lidL = $("morex-lid-left"), lidR = $("morex-lid-right");
  const earL = $("morex-ear-left"), earR = $("morex-ear-right");
  const lip = $("morex-lower-lip"), gap = $("morex-mouth-gap");
  const SRC_W = 1228;                 // width of the source avatar image
  const MAX_OPEN = 38;                // max jaw drop, in source pixels
  const GAP_H = 60;                   // height of the mouth-gap image, in source pixels
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease = (t) => t * t * (3 - 2 * t);

  /* ---------- smoothed channels ---------- */
  const head = { yaw: 0, pitch: 0, roll: 0, x: 0, y: 0 };
  const headTarget = { yaw: 0, pitch: 0, roll: 0, x: 0, y: 0 };
  const ear = { l: 0, r: 0, flare: 0 };          // twitch amounts + listening flare
  const earTarget = { l: 0, r: 0, flare: 0 };
  let mouth = 0, mouthTarget = 0;
  let blinkValue = 0;                              // 0 open … 1 closed

  /* ---------- timers ---------- */
  let now = 0;
  let nextGaze = 0, nextBlink = 1200, nextEar = 2500, nextSyllable = 0;
  let blinkStart = -1, blinkLen = 170, doubleBlink = false;
  let earTwitchEnd = 0, shakeStart = -1, nodStart = -1;
  let talkPhase = 0;

  function state() { return stage.dataset.state || "idle"; }

  /* ---------- behaviours ---------- */
  function pickGaze(s) {
    const k = reduced ? 0.25 : 1;
    if (s === "listening") {
      Object.assign(headTarget, { yaw: rand(-3, 3) * k, pitch: rand(-1, 2.5) * k, roll: rand(2, 5) * k, x: 0, y: 0 });
    } else if (s === "thinking") {
      Object.assign(headTarget, { yaw: rand(-9, -4) * k, pitch: rand(1, 4) * k, roll: rand(-4, -1) * k, x: rand(-3, 0) * k, y: 0 });
    } else if (s === "speaking") {
      Object.assign(headTarget, { yaw: rand(-5, 5) * k, pitch: rand(-1.5, 1.5) * k, roll: rand(-2.5, 2.5) * k, x: rand(-3, 3) * k, y: 0 });
    } else if (s === "error") {
      Object.assign(headTarget, { yaw: 0, pitch: 2 * k, roll: 0, x: 0, y: 0 });
    } else {
      Object.assign(headTarget, { yaw: rand(-9, 9) * k, pitch: rand(-3.5, 3) * k, roll: rand(-3, 3) * k, x: rand(-5, 5) * k, y: rand(-2, 2) * k });
    }
    const gapMs = s === "speaking" ? rand(900, 1800) : s === "thinking" ? rand(1800, 3000) : s === "listening" ? rand(1500, 2800) : rand(2200, 4600);
    nextGaze = now + gapMs;
  }

  function startBlink() {
    blinkStart = now;
    blinkLen = rand(150, 210);
    doubleBlink = Math.random() < 0.18;
    nextBlink = now + rand(2300, 5600);
  }

  function twitchEars() {
    const which = Math.random();
    earTarget.l = which < 0.7 ? rand(-1, 1) : 0;
    earTarget.r = which > 0.3 ? rand(-1, 1) : 0;
    earTwitchEnd = now + rand(260, 420);
    nextEar = now + rand(2600, 6500);
  }

  function updateMouth(s, dt) {
    if (s === "speaking") {
      talkPhase += dt;
      if (now >= nextSyllable) {
        // Syllable-like rhythm: open/close pulses with occasional short pauses.
        const pause = Math.random() < 0.13;
        mouthTarget = pause ? 0.04 : rand(0.28, 1);
        nextSyllable = now + (pause ? rand(110, 230) : rand(85, 165));
      }
    } else {
      mouthTarget = 0;
    }
    const speed = s === "speaking" ? 0.34 : 0.22;
    mouth += (mouthTarget - mouth) * (1 - Math.pow(1 - speed, dt / 16.7));
    if (mouth < 0.003) mouth = 0;
  }

  /* ---------- render ---------- */
  function apply(s, dt) {
    const w = stage.clientWidth || 300;
    const px = w / SRC_W;

    // Head: smooth follow + gentle breathing
    const f = 1 - Math.pow(1 - 0.045, dt / 16.7);
    for (const k of Object.keys(head)) head[k] += (headTarget[k] - head[k]) * f;

    let yaw = head.yaw, pitch = head.pitch, roll = head.roll, tx = head.x, ty = head.y;

    // Speech: little nods that follow the jaw
    if (s === "speaking") { pitch += mouth * 1.8 - 0.6; }
    // Quick "no" shake on error
    if (shakeStart >= 0) {
      const t = (now - shakeStart) / 700;
      if (t >= 1) shakeStart = -1; else yaw += Math.sin(t * Math.PI * 6) * 9 * (1 - t);
    }
    // Quick nod on request
    if (nodStart >= 0) {
      const t = (now - nodStart) / 600;
      if (t >= 1) nodStart = -1; else pitch += Math.sin(t * Math.PI * 2) * 5 * (1 - t * 0.5);
    }
    // Only the head layer moves. It pivots at the neck seam, so the neck and shoulders stay still.
    roll = clamp(roll, -1.8, 1.8);
    const k = w / 300;
    rig.style.transform =
      `perspective(1100px) translate3d(${(tx * 0.7 * k).toFixed(2)}px, ${(ty * 0.7 * k).toFixed(2)}px, 0) ` +
      `rotateY(${yaw.toFixed(2)}deg) rotateX(${pitch.toFixed(2)}deg) rotateZ(${roll.toFixed(2)}deg)`;

    // Blink (eyelids close from the top, then open)
    if (blinkStart >= 0) {
      const t = (now - blinkStart) / blinkLen;
      if (t >= 1) {
        blinkValue = 0; blinkStart = -1;
        if (doubleBlink) { doubleBlink = false; blinkStart = now + 60; blinkLen = 150; }
      } else if (t >= 0) {
        blinkValue = t < 0.4 ? ease(t / 0.4) : 1 - ease((t - 0.4) / 0.6);
      }
    }
    const lidScale = blinkValue.toFixed(3);
    lidL.style.transform = lidR.style.transform = `scaleY(${lidScale})`;
    lidL.style.opacity = lidR.style.opacity = blinkValue > 0.01 ? 1 : 0;

    // Ears: parallax with the head, random twitches, and a flare while listening
    const f2 = 1 - Math.pow(1 - 0.2, dt / 16.7);
    if (now > earTwitchEnd) { earTarget.l = 0; earTarget.r = 0; }
    earTarget.flare = s === "listening" ? 1 : s === "thinking" ? 0.35 : 0;
    ear.l += (earTarget.l - ear.l) * f2;
    ear.r += (earTarget.r - ear.r) * f2;
    ear.flare += (earTarget.flare - ear.flare) * (1 - Math.pow(1 - 0.08, dt / 16.7));
    const wiggle = s === "speaking" ? Math.sin(now / 95) * mouth * 0.6 : 0;
    const flareX = ear.flare * 5 * px * 4;
    earL.style.transform =
      `translateX(${(-flareX - yaw * 0.35 * px * 4).toFixed(2)}px) rotate(${(-(ear.l * 4.5) - ear.flare * 3 + wiggle).toFixed(2)}deg) scaleX(${(1 + ear.flare * 0.05).toFixed(3)})`;
    earR.style.transform =
      `translateX(${(flareX - yaw * 0.35 * px * 4).toFixed(2)}px) rotate(${((ear.r * 4.5) + ear.flare * 3 - wiggle).toFixed(2)}deg) scaleX(${(1 + ear.flare * 0.05).toFixed(3)})`;

    // Mouth: lower lip drops, dark gap reveals behind it
    const d = mouth * MAX_OPEN;                 // jaw drop in source px
    if (d < 0.2) {
      lip.style.transform = "translateY(0)";
      gap.style.opacity = 0;
    } else {
      lip.style.transform = `translateY(${(d * px).toFixed(2)}px) scaleX(${(1 - mouth * 0.025).toFixed(3)})`;
      gap.style.opacity = 1;
      gap.style.transform = `scaleY(${((d + 5) / GAP_H).toFixed(3)})`;
    }
  }

  /* ---------- main loop ---------- */
  let last = performance.now();
  pickGaze("idle");
  function frame(t) {
    const dt = Math.min(64, t - last); last = t; now = t;
    const s = state();
    if (now >= nextGaze) pickGaze(s);
    if (blinkStart < 0 && now >= nextBlink) startBlink();
    if (!reduced && now >= nextEar) twitchEars();
    updateMouth(s, dt);
    apply(s, dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // React immediately when the state changes (new gaze, quick blink, shake on error)
  new MutationObserver(() => {
    const s = state();
    nextGaze = 0;
    if (s === "error") shakeStart = now;
    if (s === "listening" && blinkStart < 0) nextBlink = now + 250;
  }).observe(stage, { attributes: true, attributeFilter: ["data-state"] });

  // Public controls (used by morex-avatar.js)
  window.MorexAIMotion = Object.freeze({
    get level() { return mouth; },
    blink() { if (blinkStart < 0) startBlink(); },
    nod() { nodStart = now; },
    shake() { shakeStart = now; },
    look(yaw = 0, pitch = 0) { Object.assign(headTarget, { yaw: clamp(yaw, -14, 14), pitch: clamp(pitch, -8, 8) }); nextGaze = now + 2500; },
    twitchEars
  });
})();

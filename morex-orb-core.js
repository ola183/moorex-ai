/* MOOREX AI — Siri-style orb renderer.
 * A glowing glass circle with flowing colour waves and light blobs moving inside it.
 * It reacts to the assistant state: idle (slow drift), listening (live ripples),
 * thinking (fast swirl and a turning arc) and speaking (waves follow the voice level).
 * Shared by the main app and by overlay.html so both show exactly the same orb.
 */
"use strict";
(() => {
  const TAU = Math.PI * 2;

  function start(canvas, opts = {}) {
    const ctx = canvas.getContext("2d");
    const getState = opts.getState || (() => "idle");
    const getLevel = opts.getLevel || (() => 0);
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, raf = 0, last = performance.now(), amp = 0.06, spin = 0, running = true;
    const waves = [
      { rgb: "85,214,161",  f: 1.15, s: 1.0,  p: 0.0, k: 1.00 },
      { rgb: "62,168,255",  f: 1.65, s: -1.4, p: 1.7, k: 0.85 },
      { rgb: "150,108,255", f: 2.25, s: 1.9,  p: 3.1, k: 0.70 },
      { rgb: "120,255,232", f: 0.85, s: -0.8, p: 4.4, k: 0.95 }
    ];

    function resize() {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = Math.max(10, r.width); h = Math.max(10, r.height);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    ro?.observe(canvas); resize();

    function frame(now) {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const t = now / 1000;
      const st = getState();
      const lv = Math.min(1, Math.max(0, getLevel()));

      let target = 0.06, speed = 0.7;
      if (st === "listening") { target = 0.17 + 0.09 * Math.abs(Math.sin(t * 4.1) * Math.sin(t * 1.7 + 1)) + lv * 0.2; speed = 1.4; }
      else if (st === "thinking") { target = 0.09; speed = 2.6; }
      else if (st === "speaking") { target = 0.14 + lv * 0.62; speed = 1.8; }
      else if (st === "error") { target = 0.05; speed = 0.5; }
      if (reduced) { target *= 0.5; speed *= 0.4; }
      amp += (target - amp) * (1 - Math.pow(0.0005, dt));
      spin += dt * speed;

      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.36;
      ctx.clearRect(0, 0, w, h);

      // Outer glow
      const glow = ctx.createRadialGradient(cx, cy, R * 0.7, cx, cy, R * 1.55);
      const ga = 0.2 + amp * 0.55;
      glow.addColorStop(0, `rgba(85,214,161,${ga})`);
      glow.addColorStop(0.55, `rgba(62,140,255,${ga * 0.35})`);
      glow.addColorStop(1, "rgba(62,140,255,0)");
      ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);

      // Orb body
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
      const body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
      body.addColorStop(0, "#14394f"); body.addColorStop(0.55, "#09202f"); body.addColorStop(1, "#030a14");
      ctx.fillStyle = body; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

      ctx.globalCompositeOperation = "lighter";

      // Drifting light blobs
      for (let i = 0; i < 3; i++) {
        const a = spin * (0.55 + i * 0.28) + i * 2.1;
        const bx = cx + Math.cos(a) * R * 0.42, by = cy + Math.sin(a * 1.17) * R * 0.42;
        const rad = R * (0.58 + i * 0.1 + amp * 0.55);
        const col = i === 0 ? "85,214,161" : i === 1 ? "62,150,255" : "150,108,255";
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, rad);
        g.addColorStop(0, `rgba(${col},${0.34 + amp * 0.3})`); g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
      }

      // Flowing waves (the "something moving inside")
      const step = Math.max(2, R / 60);
      for (const wv of waves) {
        const A = R * amp * 1.5 * wv.k;
        ctx.beginPath();
        for (let x = -R; x <= R; x += step) {
          const nx = x / R, env = Math.pow(Math.cos(nx * Math.PI / 2), 2);
          const y = (Math.sin(nx * Math.PI * wv.f * 2 + spin * wv.s * 2 + wv.p) +
                     0.45 * Math.sin(nx * Math.PI * wv.f * 3.3 - spin * wv.s * 1.3)) * A * env;
          if (x === -R) ctx.moveTo(cx + x, cy + y); else ctx.lineTo(cx + x, cy + y);
        }
        for (let x = R; x >= -R; x -= step) {
          const nx = x / R, env = Math.pow(Math.cos(nx * Math.PI / 2), 2);
          const y = (Math.sin(nx * Math.PI * wv.f * 2 + spin * wv.s * 2 + wv.p + 0.9) * 0.6) * A * env;
          ctx.lineTo(cx + x, cy - y * 0.7 - A * 0.12 * env);
        }
        ctx.closePath();
        const fg = ctx.createLinearGradient(cx, cy - A, cx, cy + A);
        fg.addColorStop(0, `rgba(${wv.rgb},0.05)`); fg.addColorStop(0.5, `rgba(${wv.rgb},0.4)`); fg.addColorStop(1, `rgba(${wv.rgb},0.05)`);
        ctx.fillStyle = fg; ctx.fill();
        ctx.lineWidth = 1.6; ctx.strokeStyle = `rgba(${wv.rgb},0.85)`;
        ctx.beginPath();
        for (let x = -R; x <= R; x += step) {
          const nx = x / R, env = Math.pow(Math.cos(nx * Math.PI / 2), 2);
          const y = (Math.sin(nx * Math.PI * wv.f * 2 + spin * wv.s * 2 + wv.p) +
                     0.45 * Math.sin(nx * Math.PI * wv.f * 3.3 - spin * wv.s * 1.3)) * A * env;
          if (x === -R) ctx.moveTo(cx + x, cy + y); else ctx.lineTo(cx + x, cy + y);
        }
        ctx.stroke();
      }

      // Thinking: a bright arc circles inside the orb
      if (st === "thinking") {
        ctx.lineCap = "round"; ctx.lineWidth = 3.2;
        for (let i = 0; i < 3; i++) {
          const a0 = spin * 1.6 + i * (TAU / 3);
          ctx.strokeStyle = `rgba(170,255,225,${0.75 - i * 0.2})`;
          ctx.beginPath(); ctx.arc(cx, cy, R * (0.78 - i * 0.14), a0, a0 + 1.1); ctx.stroke();
        }
      }
      ctx.restore();

      // Glass rim and highlight
      ctx.globalCompositeOperation = "source-over";
      const rim = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
      rim.addColorStop(0, "rgba(200,255,238,.85)"); rim.addColorStop(0.5, "rgba(90,170,255,.28)"); rim.addColorStop(1, "rgba(150,108,255,.6)");
      ctx.lineWidth = 2; ctx.strokeStyle = rim;
      ctx.beginPath(); ctx.arc(cx, cy, R - 1, 0, TAU); ctx.stroke();
      const hi = ctx.createRadialGradient(cx - R * 0.4, cy - R * 0.5, 0, cx - R * 0.4, cy - R * 0.5, R * 0.55);
      hi.addColorStop(0, "rgba(255,255,255,.16)"); hi.addColorStop(1, "rgba(255,255,255,0)");
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
      ctx.fillStyle = hi; ctx.fillRect(cx - R, cy - R, R * 2, R * 2); ctx.restore();

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return { stop() { running = false; cancelAnimationFrame(raf); ro?.disconnect(); } };
  }

  window.MorexOrbCore = Object.freeze({ start });
})();

/* MOOREX AI — recolour only the green eye pixels in the supplied avatar layer.
 * The rest of the head remains untouched. Colour shifts are slow and do not blink or flash.
 */
"use strict";
(() => {
  const stage = document.getElementById("morex-avatar-stage");
  const layer = stage?.querySelector(".morex-eye-color-layer");
  if (!stage || !layer) return;

  const hues = [0, 55, 115, 175, 235, 285];
  let previous = 0;

  function chooseHue() {
    let next = previous;
    while (next === previous) next = hues[Math.floor(Math.random() * hues.length)];
    previous = next;
    layer.style.setProperty("--morex-eye-hue", `${next}deg`);
    const names = { 0: "green", 55: "cyan", 115: "blue", 175: "violet", 235: "rose", 285: "amber" };
    layer.setAttribute("aria-label", `MOOREX eye colour: ${names[next] || "changed"}`);
  }

  // Start green as shown in the reference, then change to a random colour gradually.
  layer.style.setProperty("--morex-eye-hue", "0deg");
  window.setTimeout(chooseHue, 7000);
  window.setInterval(chooseHue, 18000);
})();

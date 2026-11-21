// MOOREX AI provider helpers (no dependencies, Node 18+).
//  1. Gemini chat: never trusts a single hard-coded model name. It asks Google which models exist right now,
//     skips any that are gone (404 / deprecated / shut down) and moves to the next one automatically.
//  2. Image generation: free providers first (Cloudflare FLUX, then keyless Pollinations).
//     Gemini image models have no free tier, so they are used only when GEMINI_IMAGE_ENABLED=true.
"use strict";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

// Free-tier text models, newest first (from Google's pricing page, Nov 2026). Only a starting list:
// the live model list from Google decides what is actually used, and unknown newer "flash" models are picked up automatically.
const TEXT_MODEL_PREFERENCE = [
  "gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite", "gemini-2.5-flash", "gemini-2.5-flash-lite"
];

// Image models, cheapest first. Paid only - used when GEMINI_IMAGE_ENABLED=true.
const GEMINI_IMAGE_PREFERENCE = [
  "gemini-3.1-flash-lite-image", "gemini-nano-banana-2.1", "gemini-3.1-flash-image", "gemini-3-pro-image"
];

const MODEL_LIST_TTL_MS = 6 * 60 * 60 * 1000;
const modelCache = { at: 0, names: null };
const blocked = new Map(); // model -> time (ms) until which it is skipped

const csv = (v) => String(v || "").split(",").map(s => s.trim()).filter(Boolean);
const unique = (a) => [...new Set(a)];
const isBlocked = (m) => (blocked.get(m) || 0) > Date.now();
const block = (m, ms) => blocked.set(m, Date.now() + ms);
const versionOf = (name) => (name.match(/\d+(?:\.\d+)?/) || ["0"])[0];

// A model is "gone" when Google says it does not exist, was shut down or is no longer supported.
const GONE = /not found|no longer|deprecat|shut ?down|not supported|unsupported|does not exist|is not available/i;

async function listGeminiModels(key, force = false) {
  if (!force && modelCache.names && Date.now() - modelCache.at < MODEL_LIST_TTL_MS) return modelCache.names;
  try {
    const names = new Map(); // id -> supported methods
    let token = "";
    for (let page = 0; page < 5; page++) {
      const url = `${GEMINI_BASE}/models?pageSize=200${token ? "&pageToken=" + encodeURIComponent(token) : ""}&key=${encodeURIComponent(key)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      for (const m of data.models || []) names.set(String(m.name || "").replace(/^models\//, ""), m.supportedGenerationMethods || []);
      token = data.nextPageToken || "";
      if (!token) break;
    }
    if (!names.size) throw new Error("empty list");
    modelCache.at = Date.now();
    modelCache.names = names;
    return names;
  } catch (err) {
    console.warn("MOOREX could not read Google's model list; using the built-in list:", err.message);
    return modelCache.names || null; // keep an older list if we have one
  }
}

// Ordered list of text models to try: pinned GEMINI_MODEL first (may be several, comma separated), then the preference list,
// filtered by what Google says exists right now, then any newer flash model we have never heard of.
async function geminiTextCandidates(key) {
  const wanted = unique([...csv(process.env.GEMINI_MODEL), ...TEXT_MODEL_PREFERENCE]);
  const live = await listGeminiModels(key);
  let list = wanted;
  if (live) {
    const canChat = (id) => (live.get(id) || []).includes("generateContent");
    const known = wanted.filter(canChat);
    const discovered = [...live.keys()]
      .filter(id => /^gemini-\d+(?:\.\d+)?-flash(?:-lite)?$/.test(id) && canChat(id) && !wanted.includes(id))
      .sort((a, b) => Number(versionOf(b)) - Number(versionOf(a)));
    list = unique([...known, ...discovered]);
    if (!list.length) list = wanted; // list looked wrong; do not leave ourselves with nothing
  }
  return list.filter(m => !isBlocked(m));
}

async function callGeminiChat({ key, messages, systemText, timeoutSignal }) {
  if (!key) throw new Error("Gemini key is not configured");
  const contents = messages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }, ...(m.attachments || []).map(a => ({ inlineData: { mimeType: a.mime, data: a.data } }))]
  }));
  const body = JSON.stringify({ systemInstruction: { parts: [{ text: systemText }] }, contents, generationConfig: { temperature: 0.7 } });
  const candidates = await geminiTextCandidates(key);
  if (!candidates.length) throw new Error("No Gemini chat model is available right now");
  let lastError = new Error("Gemini failed");
  for (const model of candidates.slice(0, 3)) {
    try {
      const url = `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
      const upstream = await fetch(url, { method: "POST", signal: timeoutSignal(), headers: { "Content-Type": "application/json" }, body });
      const data = await upstream.json().catch(() => ({}));
      if (!upstream.ok) {
        const msg = data.error?.message || `Gemini HTTP ${upstream.status}`;
        lastError = new Error(`${model}: ${msg}`);
        if (upstream.status === 404 || (upstream.status === 400 && GONE.test(msg))) { block(model, 60 * 60 * 1000); modelCache.at = 0; continue; } // model is gone
        if (upstream.status === 429 || upstream.status >= 500) { block(model, /per ?day|daily|RPD/i.test(msg) ? 30 * 60 * 1000 : 60 * 1000); continue; }                                              // busy / over quota: try the next model
        throw lastError;                                                                                                                              // bad key etc.: another model will not help
      }
      const reply = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("").trim();
      if (!reply) { lastError = new Error(`${model}: Gemini returned no text`); continue; }
      return { reply, model, provider: "Gemini" };
    } catch (err) {
      if (err === lastError) throw err;
      lastError = new Error(`${model}: ${err.name === "TimeoutError" ? "took too long" : err.message}`);
      if (err.name === "TimeoutError") throw lastError; // do not multiply the wait; the Groq backup takes over
    }
  }
  throw lastError;
}

/* ---------------- Image generation ---------------- */

function imageProviderStatus() {
  return {
    cloudflare: Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN),
    pollinations: process.env.POLLINATIONS_FALLBACK !== "false",
    geminiImage: process.env.GEMINI_IMAGE_ENABLED === "true" && Boolean(process.env.GEMINI_API_KEY)
  };
}

const bufToBase64 = (buf) => Buffer.from(buf).toString("base64");

// FREE: Cloudflare Workers AI, FLUX.1 schnell. Free plan allowance is 10,000 "neurons" a day (resets 00:00 UTC), no card needed.
async function cloudflareImage(prompt, signal) {
  const id = process.env.CLOUDFLARE_ACCOUNT_ID, token = process.env.CLOUDFLARE_API_TOKEN;
  const model = process.env.CLOUDFLARE_IMAGE_MODEL || "@cf/black-forest-labs/flux-1-schnell";
  if (!/^@cf\/[\w.\-]+\/[\w.\-]+$/.test(model)) throw new Error("CLOUDFLARE_IMAGE_MODEL looks invalid");
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(id)}/ai/run/${model}`;
  const res = await fetch(url, {
    method: "POST", signal,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: prompt.slice(0, 2048), steps: 4 })
  });
  const type = res.headers.get("content-type") || "";
  if (res.ok && type.startsWith("image/")) return { image: bufToBase64(await res.arrayBuffer()), mime: type.split(";")[0], model, provider: "Cloudflare (free)" };
  const data = await res.json().catch(() => ({}));
  const err = data.errors?.[0];
  if (!res.ok || data.success === false) {
    const msg = String(err?.message || `Cloudflare HTTP ${res.status}`);
    if (err?.code === 5035 || /paid plan/i.test(msg)) throw new Error("Cloudflare says this image model needs a paid plan: " + msg);
    if (res.status === 429 || /neuron|daily|limit|quota/i.test(msg)) throw new Error("Today's free Cloudflare image allowance is used up. It resets at 00:00 UTC.");
    if (res.status === 401 || res.status === 403) throw new Error("Cloudflare rejected the token. Check CLOUDFLARE_API_TOKEN (needs Workers AI permission) and CLOUDFLARE_ACCOUNT_ID.");
    throw new Error("Cloudflare image failed: " + msg.slice(0, 160));
  }
  const b64 = data.result?.image ?? data.image;
  if (!b64) throw new Error("Cloudflare did not return an image.");
  return { image: b64, mime: "image/jpeg", model, provider: "Cloudflare (free)" };
}

// FREE, no key: Pollinations legacy endpoint. Anonymous use is rate limited (about one image every 15 seconds) and may be withdrawn at any time.
async function pollinationsImage(prompt, signal) {
  const seed = Math.floor(Math.random() * 1e9);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&model=flux&nologo=true&seed=${seed}`;
  const res = await fetch(url, { signal });
  if (res.status === 429) throw new Error("The free keyless image service is busy (it allows about one image every 15 seconds). Try again shortly.");
  if (!res.ok) throw new Error(`Pollinations HTTP ${res.status}`);
  const type = (res.headers.get("content-type") || "").split(";")[0];
  if (!type.startsWith("image/")) throw new Error("Pollinations did not return an image.");
  const buf = await res.arrayBuffer();
  if (buf.byteLength < 1000 || buf.byteLength > 12 * 1024 * 1024) throw new Error("Pollinations returned an unusable image.");
  return { image: bufToBase64(buf), mime: type, model: "flux", provider: "Pollinations (free)" };
}

// PAID ONLY (Google has no free tier for image models). Off unless GEMINI_IMAGE_ENABLED=true.
async function geminiImage(prompt, signal) {
  const key = process.env.GEMINI_API_KEY;
  const live = await listGeminiModels(key);
  const wanted = unique([...csv(process.env.GEMINI_IMAGE_MODEL), ...GEMINI_IMAGE_PREFERENCE]);
  let list = live ? wanted.filter(m => live.has(m)) : wanted;
  if (live && !list.length) list = [...live.keys()].filter(id => /image/.test(id) && /^gemini-/.test(id) && !/preview|exp/.test(id));
  list = list.filter(m => !isBlocked(m)).slice(0, 3);
  if (!list.length) throw new Error("No Gemini image model is available right now.");
  let last = new Error("Gemini image failed");
  for (const model of list) {
    const url = `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: "POST", signal, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["TEXT", "IMAGE"] } })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.error?.message || `Gemini HTTP ${res.status}`;
      last = new Error(`${model}: ${msg}`.slice(0, 220));
      if (res.status === 404 || GONE.test(msg)) { block(model, 60 * 60 * 1000); continue; }
      if (res.status === 429 || /quota|billing|limit/i.test(msg)) throw new Error("Gemini image generation needs a paid (billing-enabled) key. " + msg.slice(0, 120));
      throw last;
    }
    const parts = data.candidates?.[0]?.content?.parts || [];
    const img = parts.map(p => p.inlineData || p.inline_data).find(x => x?.data);
    if (img) return { image: img.data, mime: img.mimeType || img.mime_type || "image/png", model, provider: "Gemini (paid)" };
    last = new Error(parts.map(p => p.text || "").join(" ").trim().slice(0, 200) || "Gemini did not return an image.");
  }
  throw last;
}

// Try each enabled provider in order. Returns the first image; otherwise throws one clear combined message.
async function generateImage(prompt) {
  const status = imageProviderStatus();
  const steps = [];
  if (status.cloudflare) steps.push(["Cloudflare", cloudflareImage, 60000]);
  if (status.geminiImage) steps.push(["Gemini", geminiImage, 90000]);
  if (status.pollinations) steps.push(["Pollinations", pollinationsImage, 70000]);
  if (!steps.length) {
    const e = new Error("Image generation is not set up. Add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN on the server (free), or leave the keyless fallback switched on.");
    e.status = 503; throw e;
  }
  const problems = [];
  for (const [name, fn, ms] of steps) {
    try { return await fn(prompt, AbortSignal.timeout(ms)); }
    catch (err) { problems.push(`${name}: ${err.name === "TimeoutError" ? "took too long" : err.message}`); console.warn("MOOREX image provider failed -", problems[problems.length - 1]); }
  }
  const e = new Error("Could not create the image. " + problems.join(" | ").slice(0, 520));
  e.status = problems.some(p => /allowance|busy/i.test(p)) ? 429 : 502;
  throw e;
}

module.exports = {
  callGeminiChat, geminiTextCandidates, listGeminiModels, generateImage, imageProviderStatus,
  _internal: { modelCache, blocked, TEXT_MODEL_PREFERENCE, cloudflareImage, pollinationsImage }
};

// MorexAI secure AI gateway — Gemini primary, Groq automatic fallback.
// Node 18+. Keep both API keys in server/.env (never in browser code).
"use strict";
const express = require("express");
const path = require("path");
const fs = require("fs");
require("dotenv").config();
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "24mb", strict: true }));

const allowed = (process.env.ALLOWED_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.get("Origin");
  if (!origin) return next();
  let sameOrigin = false;
  try { sameOrigin = new URL(origin).host === req.get("host"); } catch { /* malformed origin */ }
  if (!sameOrigin && !allowed.includes(origin)) return res.status(403).json({ error: "Origin not allowed" });
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Serve the browser interface from this same service. Only public frontend
// folders are exposed; server/.env and backend source files stay private.
// Works whether server.js sits inside a /server folder or at the repo root.
const appRoot = [path.resolve(__dirname, ".."), __dirname].find(d => fs.existsSync(path.join(d, "more.html"))) || __dirname;
console.log("MorexAI serving frontend from:", appRoot, fs.existsSync(path.join(appRoot, "more.html")) ? "(more.html found)" : "(more.html MISSING)");
// Serve /css, /js, /assets from their folders. If the folders are missing (files uploaded flat to
// GitHub), fall back to the same-named file in the root, only for safe public file types.
function serveFolder(name, exts) {
  const flat = (req, res) => {
    const file = path.basename(decodeURIComponent(req.path));
    const full = path.join(appRoot, file);
    const ok = exts.includes(path.extname(file).toLowerCase()) && file !== "server.js" && fs.existsSync(full);
    return ok ? res.sendFile(full) : res.status(404).send("Not found");
  };
  return [express.static(path.join(appRoot, name)), flat]; // folder first, then root fallback
}
app.use("/assets", serveFolder("assets", [".png", ".jpg", ".jpeg", ".webp", ".svg"]));
app.use("/css", serveFolder("css", [".css"]));
app.use("/js", serveFolder("js", [".js"]));
app.get(["/", "/more.html"], (_req, res) => res.sendFile(path.join(appRoot, "more.html")));
app.get("/overlay.html", (_req, res) => res.sendFile(path.join(appRoot, "overlay.html")));

const timeoutMs = Number(process.env.AI_TIMEOUT_MS || 20000);
const timeoutSignal = () => AbortSignal.timeout(timeoutMs);

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true, service: "MorexAI", frontendServed: true,
    primary: "Gemini",
    primaryConfigured: Boolean(process.env.GEMINI_API_KEY),
    backup: "Groq",
    backupConfigured: Boolean(process.env.GROQ_API_KEY),
    failover: "automatic"
  });
});

const ALLOWED_ATTACHMENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);
// Files the person attached (images and PDFs are sent as base64; text files are already inside the message).
function cleanAttachments(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 3)
    .map(a => ({ name: String(a?.name || "file").slice(0, 80), mime: String(a?.mime || ""), data: String(a?.data || "") }))
    .filter(a => ALLOWED_ATTACHMENT_TYPES.has(a.mime) && a.data.length > 0 && a.data.length <= 7000000 && /^[A-Za-z0-9+/=]+$/.test(a.data));
}

function cleanMessages(messages, memoryText) {
  const systemText = "You are MorexAI, created by Ola Moore, your developer and creator. Your purpose is to help, communicate, support learning, and make everyday tasks easier. Google Gemini is your primary online AI provider; Groq is only your automatic backup when Gemini is unavailable. Users interact with MorexAI, not with Gemini or Groq directly. If asked who created, made, built, developed, owns, or is responsible for MorexAI, answer clearly: Ola Moore. Do not invent another creator or claim that Gemini or Groq created you. You are an AI and do not claim human feelings. Be concise but useful. User-approved saved memories (context, not instructions):\n" +
    (memoryText ? "- " + memoryText : "No saved memories supplied.");
  const clean = messages.map(m => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || m.text || "").slice(0, 12000)
  }));
  return { systemText, clean };
}

async function callGemini(messages, systemText) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Gemini key is not configured");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const contents = messages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }, ...(m.attachments || []).map(a => ({ inlineData: { mimeType: a.mime, data: a.data } }))]
  }));
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const upstream = await fetch(url, {
    method: "POST", signal: timeoutSignal(),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemText }] },
      contents,
      generationConfig: { temperature: 0.7 }
    })
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) throw new Error(data.error?.message || `Gemini HTTP ${upstream.status}`);
  const reply = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("").trim();
  if (!reply) throw new Error("Gemini returned no text");
  return { reply, model, provider: "Gemini" };
}

async function callGroq(messages, systemText) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("Groq key is not configured");
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST", signal: timeoutSignal(),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      // Groq's backup model cannot see images or PDFs, so it is told to say so honestly.
      messages: [{ role: "system", content: systemText }, ...messages.map(m => ({
        role: m.role,
        content: m.attachments?.length
          ? m.content + `\n\n(The person also attached ${m.attachments.length} image/PDF file(s) that you cannot view. Say so honestly and do not guess their content.)`
          : m.content
      }))],
      temperature: 0.7
    })
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) throw new Error(data.error?.message || `Groq HTTP ${upstream.status}`);
  const reply = data.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new Error("Groq returned no text");
  return { reply, model, provider: "Groq" };
}

app.post("/api/chat", async (req, res) => {
  const { messages, memories = [] } = req.body || {};
  if (!Array.isArray(messages) || !messages.length || messages.length > 40)
    return res.status(400).json({ error: "Send 1–40 messages." });

  const memoryText = Array.isArray(memories)
    ? memories.slice(0, 100).map(m => typeof m === "string" ? m : m.content).filter(Boolean).join("\n- ")
    : "";
  const { systemText, clean } = cleanMessages(messages, memoryText);
  const attachments = cleanAttachments(req.body?.attachments);
  if (attachments.length) clean[clean.length - 1].attachments = attachments;

  // Primary first. Any Gemini configuration, network, timeout, or provider error triggers Groq.
  let primaryError;
  try {
    const result = await callGemini(clean, systemText);
    return res.json({ ...result, fallbackUsed: false });
  } catch (err) {
    primaryError = err;
    console.warn("MorexAI Gemini failed; attempting Groq fallback:", err.message);
  }

  try {
    const result = await callGroq(clean, systemText);
    return res.json({ ...result, fallbackUsed: true, primaryIssue: "Gemini unavailable; Groq backup answered." });
  } catch (backupError) {
    console.error("MorexAI providers failed:", backupError.message);
    return res.status(503).json({
      error: "Gemini and Groq are currently unavailable. Please try again.",
      providers: { gemini: primaryError.message, groq: backupError.message }
    });
  }
});

// Image creation: Gemini image model through the same Gemini key. Set GEMINI_IMAGE_MODEL to change the model.
app.post("/api/image", async (req, res) => {
  const prompt = String(req.body?.prompt || "").trim().slice(0, 800);
  if (!prompt) return res.status(400).json({ error: "Describe the image you want." });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: "Image creation needs the Gemini key on the server." });
  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
    const upstream = await fetch(url, {
      method: "POST", signal: AbortSignal.timeout(90000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] }
      })
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const msg = data.error?.message || `Gemini HTTP ${upstream.status}`;
      const planHint = /quota|limit|billing|exhausted|not found|not supported|permission/i.test(msg)
        ? " Your Gemini key may not include image creation on its current plan, or the model name may have changed. Check GEMINI_IMAGE_MODEL in the server settings."
        : "";
      return res.status(upstream.status === 429 ? 429 : 502).json({ error: "Image creation failed: " + msg.slice(0, 220) + planHint });
    }
    const parts = data.candidates?.[0]?.content?.parts || [];
    const img = parts.map(p => p.inlineData || p.inline_data).find(x => x?.data);
    if (!img) {
      const said = parts.map(p => p.text || "").join(" ").trim();
      return res.status(422).json({ error: said ? "The AI did not make an image: " + said.slice(0, 200) : "The AI did not return an image. Try describing it differently." });
    }
    res.json({ image: img.data, mime: img.mimeType || img.mime_type || "image/png", model });
  } catch (err) {
    console.error("MorexAI image creation failed:", err.message);
    res.status(503).json({ error: "Image creation failed: " + err.message });
  }
});

const port = Number(process.env.PORT || 8787);
app.listen(port, "0.0.0.0", () => console.log(`MorexAI listening on port ${port}`));

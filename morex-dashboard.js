/* MorexAI — Powered by Ola Moore | Dashboard, local memory and offline Q&A */
"use strict";
(() => {
  const byId = (id) => document.getElementById(id);
  const form = byId("morex-composer");
  const input = byId("morex-message-input");
  const messages = byId("morex-chat-messages");
  const clearButton = byId("morex-clear-chat");
  const newChatButton = byId("morex-new-chat");
  const sidebar = byId("morex-sidebar");
  const menuToggle = byId("morex-menu-toggle");
  const subpanel = byId("morex-subpanel");
  const pageTitle = byId("morex-page-title");
  const welcomeTitle = byId("morex-welcome-title");

  if (!form || !input || !messages) {
    console.error("MorexAI dashboard: required elements are missing.");
    return;
  }

  const initialMessage = messages.innerHTML;
  let sessionMessages = [];

  function addUserMessage(text, atts = []) {
    const bubble = document.createElement("div");
    bubble.className = "user-preview-message";
    bubble.textContent = text;
    if (atts.length) {
      const row = document.createElement("div");
      row.className = "user-attachments";
      atts.forEach((a) => {
        const chip = document.createElement("span");
        chip.className = "user-attachment";
        if (a.thumb) { const img = document.createElement("img"); img.src = a.thumb; img.alt = ""; chip.appendChild(img); }
        const label = document.createElement("em");
        label.textContent = (a.kind === "pdf" ? "PDF · " : a.kind === "text" ? "File · " : "") + a.name;
        chip.appendChild(label);
        row.appendChild(chip);
      });
      bubble.appendChild(row);
    }
    messages.appendChild(bubble);
    sessionMessages.push({ role: "user", text: atts.length ? text + " [attached: " + atts.map(a => a.name).join(", ") + "]" : text });
    messages.scrollTop = messages.scrollHeight;
  }

  function addAssistantMessage(text, isSuccess = false, shouldSpeak = true) {
    const note = document.createElement("div");
    note.className = "preview-notice" + (isSuccess ? " success" : "");
    const mark = document.createElement("span");
    mark.textContent = isSuccess ? "✓" : "i";
    const paragraph = document.createElement("p");
    paragraph.style.whiteSpace = "pre-wrap";
    paragraph.textContent = text;
    note.append(mark, paragraph);
    messages.appendChild(note);
    sessionMessages.push({ role: "assistant", text });
    messages.scrollTop = messages.scrollHeight;
    if (shouldSpeak && window.MorexAIVoice) window.MorexAIVoice.speakReply(text);
  }

  async function askBackend(userText, atts = []) {
    const endpoint = (window.MOREXAI_API_URL || "").replace(/\/$/, "");
    const recent = sessionMessages.slice(-21, -1).map(m => ({ role: m.role, content: m.text }));
    // Memory is only sent to the configured backend as context for this request.
    const memories = window.MorexMemory ? window.MorexMemory.getAll().slice(0, 50) : [];
    const response = await fetch(endpoint + "/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [...recent, { role: "user", content: userText }], memories,
        attachments: atts.filter(a => a.data && a.kind !== "text").map(a => ({ name: a.name, mime: a.mime, data: a.data }))
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Backend request failed (" + response.status + ").");
    if (!data.reply) throw new Error("The AI backend returned an empty reply.");
    return data.reply;
  }

  // ----- Image creation -----
  const IMAGE_REQUEST = /^(?:\/image\s+|(?:please\s+|can you\s+|could you\s+|i want you to\s+|i need you to\s+)?(?:(?:generate|create|make|draw|design|paint|produce|render)\b[^.?!]{0,50}?\b(?:images?|pictures?|photos?|illustrations?|drawings?|logos?|posters?|wallpapers?|artworks?|paintings?|sketch(?:es)?|icons?)\b|(?:draw|sketch|paint)\b))/i;
  const isImageRequest = (text) => IMAGE_REQUEST.test(text.trim());

  function addAssistantImage(dataUrl, prompt) {
    const note = document.createElement("div");
    note.className = "preview-notice success";
    const mark = document.createElement("span"); mark.textContent = "✓";
    const box = document.createElement("div"); box.className = "generated-image";
    const img = document.createElement("img"); img.src = dataUrl; img.alt = prompt; img.loading = "lazy";
    const link = document.createElement("a"); link.href = dataUrl; link.download = "moorex-image.png"; link.textContent = "Download image"; link.className = "generated-download";
    box.append(img, link);
    note.append(mark, box);
    messages.appendChild(note);
    sessionMessages.push({ role: "assistant", text: "[Image created: " + prompt + "]" });
    messages.scrollTop = messages.scrollHeight;
    if (window.MorexAIVoice) window.MorexAIVoice.speakReply("Here is your image.");
  }

  async function makeImage(rawPrompt) {
    const prompt = rawPrompt.replace(/^\/image\s+/i, "").trim();
    if (!navigator.onLine) {
      addAssistantMessage("I need an internet connection to create images.", false);
      if (window.MorexAIAvatar) window.MorexAIAvatar.setState("idle");
      return;
    }
    addAssistantMessage("Creating your image… this can take up to a minute.", false, false);
    const pending = messages.lastElementChild;
    pending?.classList.add("is-pending");
    try {
      const endpoint = (window.MOREXAI_API_URL || "").replace(/\/$/, "");
      const response = await fetch(endpoint + "/api/image", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.image) throw new Error(data.error || "Image creation failed (" + response.status + ").");
      pending?.remove();
      addAssistantImage("data:" + (data.mime || "image/png") + ";base64," + data.image, prompt);
    } catch (error) {
      pending?.remove();
      addAssistantMessage(error.message || "Image creation failed.", false);
      if (window.MorexAIAvatar) window.MorexAIAvatar.setState("idle");
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    let value = input.value.trim();
    const hasFiles = !!(window.MorexAttach && window.MorexAttach.count());
    if (!value && !hasFiles) return;
    const atts = hasFiles ? window.MorexAttach.take() : [];
    if (!value) value = atts.some(a => a.kind === "image") ? "Describe this image." : "Please read this file and tell me what it says.";
    // Text files are placed inside the message itself; images and PDFs travel as attachments.
    const modelText = value + atts.filter(a => a.kind === "text").map(a => "\n\n[Attached file: " + a.name + "]\n" + a.text).join("");

    addUserMessage(value, atts);
    if (window.MorexAIAvatar) window.MorexAIAvatar.setState("thinking");
    input.value = "";
    input.focus();
    if (!atts.length && isImageRequest(value)) { makeImage(value); return; }

    // MorexAI identity is a permanent local rule and works both online and offline.
    if (!atts.length && window.MorexOffline) {
      const identity = window.MorexOffline.answerIdentity(value);
      if (identity) {
        addAssistantMessage(identity, true);
        return;
      }
    }

    // Random conversation prompts work entirely offline.
    if (!atts.length && window.MorexOffline && window.MorexOffline.isRandomQuestionRequest(value)) {
      addAssistantMessage("Here is a question for you:\n" + window.MorexOffline.randomQuestion(), true);
      return;
    }

    // Local memory commands are handled without contacting an AI provider.
    if (!atts.length && window.MorexMemory) {
      const result = window.MorexMemory.processCommand(value);
      if (result.handled) {
        addAssistantMessage(result.reply, true);
        return;
      }
    }

    // Files can only be read by the online AI.
    if (atts.length && !navigator.onLine) {
      addAssistantMessage("I need an internet connection to read attached files. Reconnect and send them again.", false);
      if (window.MorexAIAvatar) window.MorexAIAvatar.setState("idle");
      return;
    }

    // When disconnected, answer from the built-in offline library immediately.
    if (!navigator.onLine && window.MorexOffline) {
      const local = window.MorexOffline.answer(value);
      addAssistantMessage(local
        ? local.reply + "\n\n(Offline answer · " + window.MorexOffline.count + " local Q&A entries)"
        : "I am offline and could not find a close match in my " + window.MorexOffline.count + " saved questions. Try asking about learning, friends, goals, wellbeing, technology, money, science, or everyday life.", !!local);
      return;
    }

    // Online mode: Gemini is tried first by the backend, with Groq as automatic backup.
    addAssistantMessage("Connecting to MOOREX AI…", false, false);
    const pending = messages.lastElementChild;
    pending?.classList.add("is-pending");
    askBackend(modelText, atts).then(reply => {
      if (pending?.isConnected) pending.remove();
      addAssistantMessage(reply, true);
    }).catch(error => {
      if (pending?.isConnected) pending.remove();
      const local = !atts.length && window.MorexOffline ? window.MorexOffline.answer(value) : null;
      if (local) {
        addAssistantMessage(local.reply + "\n\n(Offline answer · " + window.MorexOffline.count + " local Q&A entries)", true);
      } else {
        addAssistantMessage((error.message || "AI backend is unavailable.") + "\nI could not find a reliable match in the offline library. Reconnect to use the online AI brain.", false);
        if (window.MorexAIAvatar) window.MorexAIAvatar.setState("idle");
      }
    });
  });

  function saveCurrentConversation() {
    if (!sessionMessages.length || !window.MorexMemory || localStorage.getItem("morexai_auto_save") === "false") return;
    const firstUser = sessionMessages.find(m => m.role === "user");
    const title = firstUser ? firstUser.text.slice(0, 40) + (firstUser.text.length > 40 ? "…" : "") : "Conversation";
    window.MorexMemory.saveConversation(title, sessionMessages.map(m => m.text));
  }

  function clearConversation() {
    saveCurrentConversation();
    messages.innerHTML = initialMessage;
    sessionMessages = [];
  }

  clearButton?.addEventListener("click", clearConversation);
  window.addEventListener("pagehide", saveCurrentConversation);
  newChatButton?.addEventListener("click", () => {
    clearConversation();
    showPanel("assistant");
    input.focus();
  });

  const panels = {
    assistant: ["Assistant", ""],
    history: ["Conversation history", "Local conversation history. Nothing is uploaded."],
    memory: ["Memory", "User-controlled local memory — review, edit or delete anything."],
    files: ["Files & documents", "Send a PDF or text file and ask MOOREX about it. Word (.docx) files are not supported yet."],
    vision: ["Image & camera", "Take or choose a photo and ask MOOREX about it, or describe a picture for MOOREX to create. Needs internet."],
    settings: ["Settings", "Voice preferences are available below. Privacy and memory controls are in the Memory panel."]
  };


  function renderAutomationSettings(target) {
    const voice = window.MorexAIVoice;
    const prefs = voice ? voice.getPreferences() : { autoSpeak: true, rate: 1, voiceURI: "" };
    target.innerHTML = `
      <section class="automation-settings">
        <div class="settings-section-head"><span class="settings-icon">◖</span><div><h3>Male voice replies</h3><p>MOOREX automatically speaks every completed answer using a male voice when the device provides one.</p></div></div>
        <p class="male-voice-status" id="morex-male-voice-status">Checking available system voices…</p>
        <label class="setting-field" for="morex-setting-rate">Speaking speed <output id="morex-setting-rate-value">${Number(prefs.rate).toFixed(1)}×</output></label>
        <input class="setting-range" id="morex-setting-rate" type="range" min="0.7" max="1.3" step="0.1" value="${prefs.rate}">
        <div class="settings-section-head"><span class="settings-icon">✧</span><div><h3>Automatic workspace</h3><p>Save useful session history locally on this device.</p></div></div>
        <label class="setting-row"><span><strong>Save conversations automatically</strong><small>Save the current session when you leave or start a new chat</small></span><input id="morex-auto-save" type="checkbox" checked></label>
        <div class="settings-section-head"><span class="settings-icon">⌁</span><div><h3>Safe automation</h3><p>MorexAI must ask before sensitive device actions. This protects your phone and data.</p></div></div>
        <label class="setting-row"><span><strong>Confirm sensitive actions</strong><small>Keep confirmation enabled for calls, messages, deletion and settings changes</small></span><input id="morex-confirm-actions" type="checkbox" checked></label>
        <p class="settings-footnote">Microphone input starts after you grant permission and tap the microphone. Continuous background wake-word listening requires the native Android app and a foreground service; this browser page cannot enable it by itself.</p>
      </section>`;
    const rate = target.querySelector("#morex-setting-rate");
    const output = target.querySelector("#morex-setting-rate-value");
    const voiceStatus = target.querySelector("#morex-male-voice-status");
    const autoSave = target.querySelector("#morex-auto-save");
    const confirm = target.querySelector("#morex-confirm-actions");
    const voicePrefsKey = "morexai_voice_preferences_v1";
    let stored = {}; try { stored = JSON.parse(localStorage.getItem(voicePrefsKey) || "{}"); } catch {}
    const voiceInfo = voice?.getPreferences?.();
    if (voiceStatus) {
      voiceStatus.textContent = voiceInfo?.maleVoiceAvailable
        ? `Male voice selected: ${voiceInfo.voiceName}`
        : "This device does not identify a male voice. MOOREX uses the available English voice at a lower pitch; install a male system voice for a true male voice.";
    }
    rate.addEventListener("input", () => { output.value = Number(rate.value).toFixed(1) + "×"; stored.rate = Number(rate.value); localStorage.setItem(voicePrefsKey, JSON.stringify(stored)); voice?.setRate(rate.value); });
    autoSave.checked = localStorage.getItem("morexai_auto_save") !== "false";
    autoSave.addEventListener("change", () => localStorage.setItem("morexai_auto_save", String(autoSave.checked)));
    confirm.checked = localStorage.getItem("morexai_confirm_actions") !== "false";
    confirm.addEventListener("change", () => localStorage.setItem("morexai_confirm_actions", String(confirm.checked)));
  }

  function renderToolPanel(target, name) {
    const actions = name === "vision"
      ? [["camera", "◉", "Take a photo", "Open the camera and ask MOOREX about what you see"],
         ["photo", "▧", "Choose a photo", "Pick a picture from your phone"],
         ["create", "✧", "Create an image", "Describe a picture and MOOREX will make it"]]
      : [["files", "▤", "Choose a PDF or text file", "PDF up to 5 MB · text files up to 400 KB"]];
    target.innerHTML = '<div class="vision-actions">' + actions.map(([id, icon, title, hint]) =>
      `<button type="button" class="vision-action" data-tool="${id}"><span aria-hidden="true">${icon}</span><strong>${title}</strong><small>${hint}</small></button>`).join("") + "</div>" +
      '<p class="settings-footnote">Files are sent to the online AI only when you press send. Camera access is asked by your phone and only opens when you tap Take a photo.</p>';
    target.querySelectorAll("[data-tool]").forEach((btn) => btn.addEventListener("click", async () => {
      const tool = btn.dataset.tool;
      if (tool === "create") {
        showPanel("assistant");
        input.value = "Create an image of ";
        input.focus(); input.setSelectionRange(input.value.length, input.value.length);
        return;
      }
      if (!window.MorexAttach) return;
      const count = await window.MorexAttach.pick(tool);
      if (count) { showPanel("assistant"); input.focus(); }
    }));
  }

  function showPanel(name) {
    const panel = panels[name] || panels.assistant;
    document.querySelectorAll("[data-panel]").forEach((button) => {
      button.classList.toggle("selected", button.dataset.panel === name);
    });

    const voiceSettings = document.getElementById("morex-voice-settings");
    voiceSettings?.classList.toggle("visible", name === "settings");

    let contentArea = byId("morex-subpanel-content");
    if (!contentArea) {
      contentArea = document.createElement("div");
      contentArea.id = "morex-subpanel-content";
      subpanel.appendChild(contentArea);
    }
    contentArea.innerHTML = "";

    if (name === "assistant") {
      subpanel.classList.add("hidden");
      document.querySelector(".workspace-grid")?.classList.remove("hidden");
      document.querySelector(".suggestion-section")?.classList.remove("hidden");
    } else {
      document.querySelector(".workspace-grid")?.classList.add("hidden");
      document.querySelector(".suggestion-section")?.classList.add("hidden");
      subpanel.classList.remove("hidden");
      byId("morex-subpanel-title").textContent = panel[0];
      byId("morex-subpanel-description").textContent = panel[1];

      if (name === "memory" && window.MorexMemoryUI) {
        window.MorexMemoryUI.renderMemory(contentArea);
      } else if (name === "history" && window.MorexMemoryUI) {
        window.MorexMemoryUI.renderHistory(contentArea);
      } else if (name === "settings") {
        renderAutomationSettings(contentArea);
      } else if (name === "vision" || name === "files") {
        renderToolPanel(contentArea, name);
      }
    }

    pageTitle.textContent = panel[0];
    sidebar?.classList.remove("open");
  }

  document.querySelectorAll("[data-panel]").forEach((button) => {
    button.addEventListener("click", () => showPanel(button.dataset.panel));
  });
  byId("morex-back-assistant")?.addEventListener("click", () => showPanel("assistant"));
  menuToggle?.addEventListener("click", () => sidebar?.classList.toggle("open"));

  document.querySelectorAll("[data-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      showPanel("assistant");
      input.value = button.dataset.prompt || "";
      input.focus();
    });
  });

  // Live backend status: the app is normally served by the same Node server as its API.
  async function refreshBackendStatus() {
    const card = document.querySelector(".connection-card");
    if (!card) return;
    const title = card.querySelector("strong");
    const detail = card.querySelector("small");
    const dot = card.querySelector(".connection-dot");
    try {
      const endpoint = (window.MOREXAI_API_URL || "").replace(/\/$/, "");
      const response = await fetch(endpoint + "/api/health", { cache: "no-store" });
      if (!response.ok) throw new Error("Backend unavailable");
      const status = await response.json();
      if (!status.ok) throw new Error("Backend unavailable");
      if (title) title.textContent = "AI backend connected";
      if (detail) detail.textContent = status.primaryConfigured ? (status.backupConfigured ? "Gemini primary · Groq backup" : "Gemini ready · no backup key") : "Backend online · API key needed";
      if (dot) { dot.style.background = status.primaryConfigured ? "#57d6a0" : "#e6b86c"; dot.style.boxShadow = status.primaryConfigured ? "0 0 9px rgba(87,214,160,.55)" : "0 0 9px rgba(230,184,108,.5)"; }
    } catch (_) {
      if (title) title.textContent = "AI backend not connected";
      if (detail) detail.textContent = "Check server deployment";
      if (dot) { dot.style.background = "#e6b86c"; dot.style.boxShadow = "0 0 9px rgba(230,184,108,.5)"; }
    }
  }
  refreshBackendStatus();
  window.setInterval(refreshBackendStatus, 30000);

  // Personal greeting if a preferred name is already stored
  if (welcomeTitle && window.MorexMemory) {
    const name = window.MorexMemory.getPreferredName();
    welcomeTitle.textContent = name ? `Welcome back, ${name}.` : "Welcome to MorexAI.";
  } else if (welcomeTitle) {
    welcomeTitle.textContent = "Welcome to MorexAI.";
  }

  window.MorexDashboard = { showPanel, clearConversation };
})();

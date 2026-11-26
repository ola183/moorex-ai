/* MorexAI — Powered by Ola Moore | Local Persistent Memory System
 * Siri-inspired personal memory. Everything stays on device.
 * User has full control: review, edit, delete, disable.
 */
"use strict";
(() => {
  const MEM_KEY     = "morexai_memories_v2";
  const HIST_KEY    = "morexai_conversations_v2";
  const PREF_KEY    = "morexai_preferences_v2";
  const SETTINGS_KEY = "morexai_memory_settings_v2";

  const byId = (id) => document.getElementById(id);

  // ---------- Low-level storage ----------
  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }
  function save(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  // ---------- Preferences (Siri-style personal profile) ----------
  function getPreferences() {
    return load(PREF_KEY, {
      preferredName: "",
      assistantName: "MorexAI",
      language: "en",
      theme: "dark",
      speakingStyle: "natural",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
    });
  }
  function setPreference(key, value) {
    const prefs = getPreferences();
    prefs[key] = value;
    save(PREF_KEY, prefs);
    return prefs;
  }

  // ---------- Memories ----------
  function getMemories() {
    return load(MEM_KEY, []);
  }
  function saveMemories(list) {
    save(MEM_KEY, list);
  }

  // ---------- Conversations ----------
  function getConversations() {
    return load(HIST_KEY, []);
  }
  function saveConversations(list) {
    save(HIST_KEY, list);
  }

  // ---------- Settings ----------
  function getSettings() {
    return load(SETTINGS_KEY, {
      memoryEnabled: true,
      historyEnabled: true,
      maxMemories: 300,
      maxConversations: 40
    });
  }
  function saveSettings(s) {
    save(SETTINGS_KEY, s);
  }

  // ---------- Public API ----------
  window.MorexMemory = {
    /* ---- Memories ---- */
    getAll() {
      return getMemories();
    },

    search(query) {
      const q = String(query || "").toLowerCase().trim();
      if (!q) return getMemories();
      return getMemories().filter(m =>
        m.content.toLowerCase().includes(q) ||
        (m.category || "").toLowerCase().includes(q) ||
        (m.tags || []).some(t => t.toLowerCase().includes(q))
      );
    },

    add(content, category = "general", tags = []) {
      const settings = getSettings();
      if (!settings.memoryEnabled) return null;

      const text = String(content).trim().slice(0, 600);
      if (!text) return null;

      // Avoid exact duplicates
      const existing = getMemories();
      if (existing.some(m => m.content.toLowerCase() === text.toLowerCase())) {
        return null; // already known
      }

      const item = {
        id: "mem_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
        content: text,
        category: category || "general",
        tags: Array.isArray(tags) ? tags : [],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        source: "user"
      };

      existing.unshift(item);
      while (existing.length > (settings.maxMemories || 300)) existing.pop();
      saveMemories(existing);
      return item;
    },

    update(id, content, category) {
      const list = getMemories();
      const idx = list.findIndex(m => m.id === id);
      if (idx === -1) return false;
      list[idx].content = String(content).trim().slice(0, 600);
      if (category) list[idx].category = category;
      list[idx].updated = new Date().toISOString();
      saveMemories(list);
      return true;
    },

    remove(id) {
      saveMemories(getMemories().filter(m => m.id !== id));
      return true;
    },

    clearAll() {
      saveMemories([]);
      return true;
    },

    /* ---- Preferences ---- */
    getPreferences,
    setPreference,

    getPreferredName() {
      return getPreferences().preferredName || "";
    },

    /* ---- Conversation History ---- */
    getConversations,
    saveConversation(title, messages) {
      const settings = getSettings();
      if (!settings.historyEnabled) return null;

      const list = getConversations();
      const entry = {
        id: "conv_" + Date.now(),
        title: (title || "Conversation").slice(0, 60),
        preview: (messages && messages[0]) ? String(messages[0]).slice(0, 120) : "",
        messageCount: Array.isArray(messages) ? messages.length : 0,
        messages: Array.isArray(messages) ? messages.slice(-30) : [], // keep last 30
        created: new Date().toISOString()
      };
      list.unshift(entry);
      while (list.length > (settings.maxConversations || 40)) list.pop();
      saveConversations(list);
      return entry;
    },

    clearHistory() {
      saveConversations([]);
    },

    /* ---- Settings ---- */
    getSettings,
    setEnabled(enabled) {
      const s = getSettings();
      s.memoryEnabled = !!enabled;
      saveSettings(s);
      return s;
    },
    setHistoryEnabled(enabled) {
      const s = getSettings();
      s.historyEnabled = !!enabled;
      saveSettings(s);
      return s;
    },

    /* ---- Siri-style helpers ---- */
    whatDoYouKnowAboutMe() {
      const prefs = getPreferences();
      const mems = getMemories();
      const parts = [];

      if (prefs.preferredName) {
        parts.push(`You prefer to be called ${prefs.preferredName}.`);
      }
      if (mems.length === 0) {
        parts.push("I don't have any other personal facts stored yet. You can tell me things to remember.");
      } else {
        parts.push(`I currently remember ${mems.length} thing${mems.length === 1 ? "" : "s"} about you:`);
        mems.slice(0, 8).forEach(m => {
          parts.push("• " + m.content);
        });
        if (mems.length > 8) parts.push(`…and ${mems.length - 8} more.`);
      }
      return parts.join("\n");
    },

    // Process natural language memory commands (used while AI backend is offline)
    processCommand(text) {
      const lower = String(text || "").toLowerCase().trim();

      // remember ...
      if (lower.startsWith("remember ") || lower.startsWith("remember:") || lower.startsWith("note that ")) {
        let fact = text.replace(/^(remember|note that)\s*:?\s*/i, "").trim();
        if (!fact) return { handled: true, reply: "What would you like me to remember?" };

        // Detect preference patterns
        let category = "general";
        if (/my name is|call me|i prefer to be called|i'm called/i.test(fact)) {
          category = "preference";
          const nameMatch = fact.match(/(?:my name is|call me|i prefer to be called|i'm called)\s+([A-Za-z\s\-']{1,40})/i);
          if (nameMatch) {
            setPreference("preferredName", nameMatch[1].trim());
          }
        } else if (/prefer|like|favourite|favorite|hate|don't like/i.test(fact)) {
          category = "preference";
        } else if (/project|deadline|meeting|work/i.test(fact)) {
          category = "project";
        } else if (/birthday|live in|from|family|age/i.test(fact)) {
          category = "personal";
        }

        const added = this.add(fact, category);
        if (!added) {
          return { handled: true, reply: "I already have that stored, or memory is currently disabled." };
        }
        return { handled: true, reply: `Got it. I'll remember that.` };
      }

      // forget ...
      if (lower.startsWith("forget ") || lower.startsWith("delete memory ")) {
        const query = text.replace(/^(forget|delete memory)\s+/i, "").trim();
        if (!query) return { handled: true, reply: "What should I forget?" };

        const matches = this.search(query);
        if (matches.length === 0) {
          return { handled: true, reply: "I couldn't find anything matching that." };
        }
        // Remove the most recent match
        this.remove(matches[0].id);
        return { handled: true, reply: `Okay, I've forgotten: "${matches[0].content}"` };
      }

      // what do you know / what do you remember
      if (/what do you (know|remember) about me|what have you remembered|tell me what you know/i.test(lower)) {
        return { handled: true, reply: this.whatDoYouKnowAboutMe() };
      }

      // clear all memory
      if (/clear (all )?memory|forget everything|wipe memory/i.test(lower)) {
        this.clearAll();
        return { handled: true, reply: "All personal memories have been cleared." };
      }

      return { handled: false };
    }
  };

  // ---------- UI Rendering ----------
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDate(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) +
        " · " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    } catch {
      return iso;
    }
  }

  const CATEGORY_LABELS = {
    general: "General",
    preference: "Preference",
    fact: "Fact",
    project: "Project",
    personal: "Personal"
  };

  function renderMemoryUI(container) {
    if (!container) return;
    const settings = getSettings();
    const memories = getMemories();
    const prefs = getPreferences();

    container.innerHTML = `
      <div class="memory-panel">
        <div class="memory-header">
          <div class="memory-status">
            <span class="memory-dot ${settings.memoryEnabled ? "on" : "off"}"></span>
            <span>Memory is <strong>${settings.memoryEnabled ? "ON" : "OFF"}</strong></span>
          </div>
          <label class="memory-toggle">
            <input type="checkbox" id="morex-memory-enabled" ${settings.memoryEnabled ? "checked" : ""}>
            <span>Enable memory</span>
          </label>
        </div>

        <p class="memory-privacy">
          All data stays on this device only — exactly like a personal assistant should work.
          You stay in full control. Review, edit or delete anything at any time.
        </p>

        ${prefs.preferredName ? `
          <div class="memory-pref-card">
            <span class="memory-cat">Preferred name</span>
            <strong>${escapeHtml(prefs.preferredName)}</strong>
          </div>
        ` : ""}

        <div class="memory-add">
          <h3>Tell MorexAI to remember something</h3>
          <textarea id="morex-memory-input" rows="2" maxlength="600"
            placeholder="e.g. My name is Ola. I prefer dark themes. Project deadline is next Friday."></textarea>
          <div class="memory-add-row">
            <select id="morex-memory-category">
              <option value="general">General</option>
              <option value="preference">Preference</option>
              <option value="fact">Fact</option>
              <option value="project">Project</option>
              <option value="personal">Personal</option>
            </select>
            <button type="button" class="memory-btn primary" id="morex-memory-add">Remember</button>
          </div>
        </div>

        <div class="memory-list-header">
          <h3>Stored memories <span id="morex-memory-count">(${memories.length})</span></h3>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button type="button" class="memory-btn" id="morex-memory-export" ${memories.length === 0 ? "disabled" : ""}>Export</button>
            <button type="button" class="memory-btn danger" id="morex-memory-clear" ${memories.length === 0 ? "disabled" : ""}>Clear all</button>
          </div>
        </div>

        <div class="memory-search-row">
          <input type="search" id="morex-memory-search" placeholder="Search memories…" autocomplete="off">
        </div>

        <div class="memory-list" id="morex-memory-list">
          ${renderMemoryItems(memories)}
        </div>
      </div>
    `;

    // Events
    byId("morex-memory-enabled")?.addEventListener("change", (e) => {
      window.MorexMemory.setEnabled(e.target.checked);
      renderMemoryUI(container);
    });

    byId("morex-memory-add")?.addEventListener("click", () => {
      const input = byId("morex-memory-input");
      const cat = byId("morex-memory-category");
      const text = input?.value.trim();
      if (!text) return;
      window.MorexMemory.add(text, cat?.value || "general");
      input.value = "";
      renderMemoryUI(container);
    });

    byId("morex-memory-clear")?.addEventListener("click", () => {
      if (confirm("Delete ALL stored memories? This cannot be undone.")) {
        window.MorexMemory.clearAll();
        renderMemoryUI(container);
      }
    });

    byId("morex-memory-export")?.addEventListener("click", () => {
      const data = {
        exportedAt: new Date().toISOString(),
        preferences: getPreferences(),
        memories: getMemories()
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "morexai-memory-export.json";
      a.click();
      URL.revokeObjectURL(url);
    });

    const searchInput = byId("morex-memory-search");
    searchInput?.addEventListener("input", () => {
      const results = window.MorexMemory.search(searchInput.value);
      const list = byId("morex-memory-list");
      if (list) list.innerHTML = renderMemoryItems(results);
      attachItemHandlers(container);
    });

    attachItemHandlers(container);
  }

  function renderMemoryItems(list) {
    if (!list || list.length === 0) {
      return `
        <div class="memory-empty">
          <p>No memories stored yet.</p>
          <small>Say “Remember my name is …” or add facts here. MorexAI will keep them for you.</small>
        </div>`;
    }
    return list.map(m => `
      <article class="memory-item" data-id="${m.id}">
        <div class="memory-item-top">
          <span class="memory-cat">${CATEGORY_LABELS[m.category] || m.category}</span>
          <span class="memory-date">${formatDate(m.updated || m.created)}</span>
        </div>
        <p class="memory-content">${escapeHtml(m.content)}</p>
        <div class="memory-item-actions">
          <button type="button" class="memory-btn small edit" data-action="edit">Edit</button>
          <button type="button" class="memory-btn small danger" data-action="delete">Delete</button>
        </div>
      </article>
    `).join("");
  }

  function attachItemHandlers(container) {
    container.querySelectorAll(".memory-item").forEach(item => {
      item.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const id = item.dataset.id;
        const action = btn.dataset.action;

        if (action === "delete") {
          if (confirm("Delete this memory?")) {
            window.MorexMemory.remove(id);
            renderMemoryUI(container);
          }
        }
        if (action === "edit") {
          const contentEl = item.querySelector(".memory-content");
          const current = contentEl?.textContent || "";
          const next = prompt("Edit memory:", current);
          if (next !== null && next.trim()) {
            window.MorexMemory.update(id, next.trim());
            renderMemoryUI(container);
          }
        }
      });
    });
  }

  function renderHistoryUI(container) {
    if (!container) return;
    const history = getConversations();
    const settings = getSettings();

    container.innerHTML = `
      <div class="history-panel">
        <div class="memory-header">
          <div class="memory-status">
            <span class="memory-dot ${settings.historyEnabled ? "on" : "off"}"></span>
            <span>History is <strong>${settings.historyEnabled ? "ON" : "OFF"}</strong></span>
          </div>
          <label class="memory-toggle">
            <input type="checkbox" id="morex-history-enabled" ${settings.historyEnabled ? "checked" : ""}>
            <span>Save conversations</span>
          </label>
        </div>

        <div class="memory-list-header">
          <h3>Conversation history <span>(${history.length})</span></h3>
          <button type="button" class="memory-btn danger" id="morex-history-clear" ${history.length === 0 ? "disabled" : ""}>Clear history</button>
        </div>
        <p class="memory-privacy">Local only. Full message history is kept for the last 30 messages of each conversation.</p>
        <div class="history-list">
          ${history.length === 0 ? `
            <div class="memory-empty">
              <p>No conversations saved yet.</p>
              <small>When you start a new chat or clear the current one, a snapshot is stored here.</small>
            </div>
          ` : history.map(h => `
            <article class="history-item">
              <strong>${escapeHtml(h.title)}</strong>
              <small>${formatDate(h.created)} · ${h.messageCount} messages</small>
              <p>${escapeHtml(h.preview || "")}</p>
            </article>
          `).join("")}
        </div>
      </div>
    `;

    byId("morex-history-enabled")?.addEventListener("change", (e) => {
      window.MorexMemory.setHistoryEnabled(e.target.checked);
      renderHistoryUI(container);
    });

    byId("morex-history-clear")?.addEventListener("click", () => {
      if (confirm("Clear all local conversation history?")) {
        window.MorexMemory.clearHistory();
        renderHistoryUI(container);
      }
    });
  }

  // Expose UI renderers
  window.MorexMemoryUI = {
    renderMemory: renderMemoryUI,
    renderHistory: renderHistoryUI
  };

  console.info("MorexAI local memory system ready.");
})();

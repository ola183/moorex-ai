/* MOOREX AI — first-entry account gate.
 * Accounts are local to this browser profile. Passwords are PBKDF2 hashes, never stored in plain text.
 * A production multi-device account system needs server-side authentication and a database.
 */
"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const gate = $("morex-auth-gate");
  const form = $("morex-auth-form");
  const nameInput = $("morex-auth-name");
  const passwordInput = $("morex-auth-password");
  const confirmInput = $("morex-auth-confirm");
  const confirmWrap = $("morex-confirm-password-wrap");
  const errorBox = $("morex-auth-error");
  const submitButton = $("morex-auth-submit");
  const switchButton = $("morex-auth-switch");
  const app = $("morex-app");
  const accountButton = $("morex-account-button");
  const USER_KEY = "morexai_local_accounts_v1";
  const SESSION_KEY = "morexai_active_local_account_v1";
  const ITERATIONS = 210000;
  let mode = "create";
  let users = readUsers();

  if (!gate || !form || !app) return;

  function readUsers() {
    try {
      const value = JSON.parse(localStorage.getItem(USER_KEY) || "[]");
      return Array.isArray(value) ? value.filter(u => u && typeof u.name === "string" && typeof u.hash === "string" && typeof u.salt === "string") : [];
    } catch {
      return [];
    }
  }

  function saveUsers() {
    localStorage.setItem(USER_KEY, JSON.stringify(users));
  }

  function toBase64(bytes) {
    let binary = "";
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }

  function fromBase64(value) {
    return Uint8Array.from(atob(value), ch => ch.charCodeAt(0));
  }

  async function derivePasswordHash(password, salt) {
    if (!window.crypto?.subtle || !window.crypto?.getRandomValues) {
      throw new Error("Secure password protection is unavailable in this browser. Open MOOREX over HTTPS or localhost.");
    }
    const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" }, keyMaterial, 256);
    return new Uint8Array(bits);
  }

  function sameBytes(a, b) {
    if (a.length !== b.length) return false;
    let difference = 0;
    for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
    return difference === 0;
  }

  function setError(message) {
    errorBox.textContent = message || "";
  }

  function switchMode(nextMode) {
    mode = nextMode;
    const creating = mode === "create";
    $("morex-auth-title").textContent = creating ? "Welcome to MOOREX" : "Sign in to MOOREX";
    $("morex-auth-intro").textContent = creating
      ? "Create your personal account to continue."
      : "Enter your name and password to open your assistant.";
    confirmWrap.hidden = !creating;
    confirmInput.required = creating;
    passwordInput.autocomplete = creating ? "new-password" : "current-password";
    submitButton.textContent = creating ? "Create account" : "Sign in";
    switchButton.textContent = creating ? "Already registered? Sign in" : "New here? Create an account";
    passwordInput.value = "";
    confirmInput.value = "";
    setError("");
  }

  function initials(name) {
    return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() || "").join("") || "MX";
  }

  function unlock(user) {
    sessionStorage.setItem(SESSION_KEY, user.name);
    document.body.classList.remove("auth-locked");
    gate.hidden = true;
    const safeName = user.name;
    const profileName = $("morex-user-name");
    const profileInitials = $("morex-profile-initials");
    if (profileName) profileName.textContent = safeName;
    if (profileInitials) profileInitials.textContent = initials(safeName);
    if (accountButton) accountButton.textContent = initials(safeName);
  }

  function lock() {
    sessionStorage.removeItem(SESSION_KEY);
    document.body.classList.add("auth-locked");
    gate.hidden = false;
    nameInput.value = "";
    passwordInput.value = "";
    confirmInput.value = "";
    switchMode(users.length ? "login" : "create");
    nameInput.focus();
  }

  switchButton.addEventListener("click", () => switchMode(mode === "create" ? "login" : "create"));
  accountButton?.addEventListener("click", lock);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setError("");
    submitButton.disabled = true;
    const name = nameInput.value.trim().replace(/\s+/g, " ");
    const password = passwordInput.value;
    try {
      if (name.length < 2 || name.length > 48) throw new Error("Enter a name between 2 and 48 characters.");
      if (password.length < 8) throw new Error("Use a password with at least 8 characters.");

      if (mode === "create") {
        if (password !== confirmInput.value) throw new Error("The passwords do not match.");
        if (users.some(user => user.name.toLowerCase() === name.toLowerCase())) throw new Error("That name already has an account on this browser. Sign in instead.");
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const hash = await derivePasswordHash(password, salt);
        const user = { name, salt: toBase64(salt), hash: toBase64(hash), iterations: ITERATIONS, createdAt: new Date().toISOString() };
        users.push(user);
        saveUsers();
        unlock(user);
      } else {
        const user = users.find(item => item.name.toLowerCase() === name.toLowerCase());
        if (!user) throw new Error("No account with that name exists on this browser. Create an account first.");
        const salt = fromBase64(user.salt);
        const candidate = await derivePasswordHash(password, salt);
        if (!sameBytes(candidate, fromBase64(user.hash))) throw new Error("The name or password is incorrect.");
        unlock(user);
      }
    } catch (error) {
      setError(error.message || "Could not verify this account. Please try again.");
    } finally {
      submitButton.disabled = false;
    }
  });

  const activeName = sessionStorage.getItem(SESSION_KEY);
  const activeUser = activeName && users.find(user => user.name === activeName);
  if (activeUser) unlock(activeUser);
  else {
    sessionStorage.removeItem(SESSION_KEY);
    switchMode(users.length ? "login" : "create");
    gate.hidden = false;
    document.body.classList.add("auth-locked");
  }
})();

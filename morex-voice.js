/* MOOREX AI — male-first speech output and browser microphone input.
 * Speech output is automatic for every completed assistant reply.
 * The Web Speech API exposes different voices on different devices; it cannot guarantee
 * a male voice unless the browser actually provides one with identifiable metadata.
 */
"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const startButton = $("morex-voice-start");
  const stopButton = $("morex-voice-stop");
  const stopAudioButton = $("morex-speech-stop");
  const testSpeechButton = $("morex-test-speech");
  const composerVoiceButton = $("morex-composer-voice");
  const input = $("morex-message-input");
  const messages = $("morex-chat-messages");
  const rateControl = $("morex-voice-rate");
  const rateValue = $("morex-voice-rate-value");
  const voiceSelect = $("morex-voice-select");

  if (!startButton || !stopButton || !stopAudioButton || !input || !messages) {
    console.error("MOOREX voice: required controls are missing.");
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  const synthesis = "speechSynthesis" in window ? window.speechSynthesis : null;
  const VOICE_PREFS_KEY = "morexai_voice_preferences_v1";
  const MALE_HINT = /\b(male|david|daniel|alex|fred|george|mark|james|guy|ryan|thomas|oliver|arthur|rishi|ravi|liam|aaron|christopher|andrew|brian|matthew|eric|jason|paul|michael|john|google uk english male|microsoft david|microsoft guy|microsoft mark|microsoft ryan)\b/i;
  const FEMALE_HINT = /female|zira|samantha|karen|susan|hazel|jenny|aria|moira|tessa|victoria|salli|joanna|kendra|kimberly|ivy|ava|allison|sarah|libby|sonia|natasha/i;

  let recognition = null;
  let isListening = false;
  let selectedVoice = null;
  let voices = [];
  let maleVoiceAvailable = false;
  let isSpeaking = false;
  let voicePrefs = {};
  try { voicePrefs = JSON.parse(localStorage.getItem(VOICE_PREFS_KEY) || "{}"); } catch { voicePrefs = {}; }
  const initialRate = Number.isFinite(Number(voicePrefs.rate)) ? Math.min(1.3, Math.max(0.7, Number(voicePrefs.rate))) : 1;
  if (rateControl) rateControl.value = String(initialRate);
  voicePrefs.autoSpeak = true; // All assistant replies are spoken; this is not an optional setting.

  function persistPrefs() {
    try { localStorage.setItem(VOICE_PREFS_KEY, JSON.stringify(voicePrefs)); } catch (error) { console.warn("MOOREX voice preferences could not be saved.", error); }
  }

  function setAvatarState(state) {
    if (window.MorexAIAvatar && typeof window.MorexAIAvatar.setState === "function") window.MorexAIAvatar.setState(state);
  }

  function addNotice(message, kind = "info") {
    const note = document.createElement("p");
    note.className = "voice-status-note";
    note.setAttribute("role", "status");
    note.dataset.kind = kind;
    note.textContent = message;
    messages.appendChild(note);
    messages.scrollTop = messages.scrollHeight;
  }

  function isClearlyMale(voice) {
    if (!voice) return false;
    const descriptor = `${voice.name || ""} ${voice.voiceURI || ""}`;
    if (voice.gender && String(voice.gender).toLowerCase() === "male") return true;
    return MALE_HINT.test(descriptor) && !FEMALE_HINT.test(descriptor);
  }

  function populateVoices() {
    if (!synthesis) return;
    voices = synthesis.getVoices();
    if (!voices.length) return;

    const savedMaleVoice = voices.find(voice => voice.voiceURI === voicePrefs.voiceURI && isClearlyMale(voice));
    const maleVoice = savedMaleVoice || voices.find(voice => isClearlyMale(voice) && /^en(?:-|$)/i.test(voice.lang)) || voices.find(isClearlyMale);
    maleVoiceAvailable = Boolean(maleVoice);

    if (maleVoice) {
      selectedVoice = maleVoice;
      voicePrefs.voiceURI = maleVoice.voiceURI;
    } else {
      // Choose an English voice as a device fallback and lower its pitch. This is not a guarantee of a male voice.
      selectedVoice = voices.find(voice => /^en(?:-|$)/i.test(voice.lang) && !FEMALE_HINT.test(voice.name || ""))
        || voices.find(voice => /^en(?:-|$)/i.test(voice.lang))
        || voices.find(voice => voice.default)
        || voices[0];
      voicePrefs.voiceURI = "";
    }

    if (voiceSelect) {
      voiceSelect.innerHTML = "";
      const option = document.createElement("option");
      option.value = selectedVoice?.voiceURI || "";
      option.textContent = selectedVoice ? `${selectedVoice.name} (${selectedVoice.lang})` : "Browser default";
      voiceSelect.appendChild(option);
      voiceSelect.value = option.value;
    }
    persistPrefs();
  }

  function setListening(active) {
    isListening = active;
    startButton.disabled = active || !recognition;
    stopButton.disabled = !active;
    startButton.classList.toggle("is-active", active);
    composerVoiceButton?.classList.toggle("is-active", active);
    if (active) setAvatarState("listening");
    else if (window.MorexAIAvatar?.state === "listening") setAvatarState("idle");
  }

  function speak(text) {
    if (!synthesis || !("SpeechSynthesisUtterance" in window)) {
      addNotice("This browser does not support spoken replies. The written answer is still available.", "warning");
      setAvatarState("idle");
      return;
    }
    const message = String(text || "").trim();
    if (!message) return;
    populateVoices();
    synthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = rateControl ? Number(rateControl.value) : initialRate;
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.pitch = maleVoiceAvailable ? 1 : 0.76;
    utterance.volume = 1;
    utterance.onstart = () => {
      isSpeaking = true;
      stopAudioButton.disabled = false;
      setAvatarState("speaking");
    };
    utterance.onend = () => {
      isSpeaking = false;
      stopAudioButton.disabled = true;
      if (!isListening) setAvatarState("idle");
    };
    utterance.onerror = (event) => {
      isSpeaking = false;
      stopAudioButton.disabled = true;
      if (!isListening) setAvatarState("idle");
      if (event.error !== "canceled" && event.error !== "interrupted") addNotice(`Spoken reply failed: ${event.error}.`, "warning");
    };
    synthesis.speak(utterance);
  }

  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = "en-NG";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      setListening(true);
      addNotice("MOOREX is listening. Speak now.");
    };
    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += transcript;
        else interimText += transcript;
      }
      if (interimText) input.value = interimText;
      if (finalText.trim()) {
        input.value = finalText.trim();
        $("morex-composer")?.requestSubmit();
      }
    };
    recognition.onerror = (event) => {
      const messagesByError = {
        "not-allowed": "Microphone permission was denied. Allow microphone access in your browser settings.",
        "service-not-allowed": "The browser speech service is blocked or unavailable.",
        "no-speech": "No speech was detected. Try again.",
        "audio-capture": "No usable microphone was found.",
        "network": "The browser speech recognition service reported a network error."
      };
      addNotice(messagesByError[event.error] || `Microphone error: ${event.error}.`, "warning");
      setListening(false);
      setAvatarState("error");
    };
    recognition.onend = () => setListening(false);
  } else {
    startButton.disabled = true;
    stopButton.disabled = true;
    if (composerVoiceButton) composerVoiceButton.disabled = true;
    addNotice("Voice input is not supported by this browser. You can still type messages.", "warning");
  }

  function startListening() {
    if (!recognition || isListening) return;
    try {
      if (synthesis) synthesis.cancel();
      recognition.start();
    } catch (error) {
      addNotice(`Could not start the microphone. Check permission and try again. ${error.message}`, "warning");
    }
  }

  startButton.addEventListener("click", startListening);
  composerVoiceButton?.addEventListener("click", startListening);
  testSpeechButton?.addEventListener("click", () => speak("Hello. I am MOOREX AI, powered by Ola Moore. My voice is ready."));

  stopButton.addEventListener("click", () => {
    if (recognition && isListening) recognition.stop();
    setListening(false);
    addNotice("Microphone listening stopped.");
  });

  stopAudioButton.addEventListener("click", () => {
    if (synthesis) synthesis.cancel();
    isSpeaking = false;
    stopAudioButton.disabled = true;
    if (!isListening) setAvatarState("idle");
  });

  rateControl?.addEventListener("input", () => {
    const rate = Number(rateControl.value);
    if (rateValue) rateValue.value = `${rate.toFixed(1)}×`;
    voicePrefs.rate = rate;
    persistPrefs();
  });

  if (synthesis) {
    populateVoices();
    synthesis.addEventListener?.("voiceschanged", populateVoices);
    synthesis.onvoiceschanged = populateVoices;
    stopAudioButton.disabled = false;
  } else stopAudioButton.disabled = true;

  window.addEventListener("pagehide", () => {
    if (recognition && isListening) recognition.abort();
    if (synthesis) synthesis.cancel();
  });

  window.MorexAIVoice = Object.freeze({
    get autoSpeak() { return true; },
    setAutoSpeak() { voicePrefs.autoSpeak = true; persistPrefs(); return true; },
    setVoiceURI(uri) {
      const candidate = voices.find(voice => voice.voiceURI === String(uri || "") && isClearlyMale(voice));
      if (candidate) { selectedVoice = candidate; voicePrefs.voiceURI = candidate.voiceURI; persistPrefs(); }
      return selectedVoice?.voiceURI || "";
    },
    setRate(rate) {
      voicePrefs.rate = Math.min(1.3, Math.max(0.7, Number(rate) || 1));
      if (rateControl) rateControl.value = String(voicePrefs.rate);
      if (rateValue) rateValue.value = `${voicePrefs.rate.toFixed(1)}×`;
      persistPrefs();
    },
    getPreferences() {
      return {
        autoSpeak: true,
        rate: Number(rateControl?.value || voicePrefs.rate || 1),
        voiceURI: selectedVoice?.voiceURI || "",
        voiceName: selectedVoice?.name || "Browser default",
        maleVoiceAvailable
      };
    },
    speakReply(text) { speak(text); },
    get supported() { return Boolean(recognition); },
    get listening() { return isListening; },
    get speaking() { return isSpeaking; },
    speak,
    stop() {
      if (recognition && isListening) recognition.stop();
      if (synthesis) synthesis.cancel();
      isSpeaking = false;
      setListening(false);
      stopAudioButton.disabled = true;
    }
  });

  if (!maleVoiceAvailable) {
    addNotice("No clearly identified male English voice was listed by this device. MOOREX will use the available English voice at a lower pitch; install/select a male system voice for a true male voice.", "warning");
  }
})();

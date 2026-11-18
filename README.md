# MOOREX AI — Powered by Ola Moore

This package contains the MOOREX AI browser assistant and its Node.js chat backend.

## Main features in this revision

- The supplied silver robotic head is used as the central avatar with its transparent background.
- The portrait is slightly larger and the app uses the same narrow, phone-width layout on mobile and desktop.
- The design contains no rings, halos, flashing decorations or avatar-light effects.
- The eye-colour overlay recolours only the existing eye pixels and changes colour gradually at random intervals. The rest of the head image remains unchanged.
- Completed assistant answers are automatically spoken. MOOREX selects an identifiable English male voice when the browser exposes one.
- A first-use account screen requires a name and password. Additional local accounts can be created on the same browser profile.
- Passwords are stored as PBKDF2-SHA-256 hashes with per-account random salts, not as readable passwords.
- Browser speech input, local memory, offline responses, conversation history, and the existing chat backend files are retained.

## First run and accounts

On first opening, create an account with a name and password of at least 8 characters. Later visits require sign-in. Use the initials/account button in the header to sign out.

**Important account limitation:** these accounts are stored only in the current browser profile on the current device. They do not sync between a phone and PC and are not a substitute for server-side multi-user authentication. A production release that supports accounts across devices needs a secure authentication API and a database. Passwords are never saved as plain text in this browser-only setup.

## Male voice behaviour

MOOREX automatically speaks each completed assistant answer. The browser's available voice list differs between Android, Windows, macOS and individual browsers. If a voice explicitly identified as male is available, MOOREX chooses it. If the device does not identify any male voice, it uses an English system voice with a lower pitch; this fallback cannot be guaranteed to sound male. For a reliably male voice on a particular device, install an English male text-to-speech voice in that device's speech settings.

## Run locally

1. Install Node.js.
2. Open a terminal in the `MorexAI/server` folder.
3. Run `npm install`.
4. Copy `.env.example` to `.env` and enter the API keys and settings required by your backend.
5. Run `npm start`.
6. Serve the `MorexAI` folder using a local web server or deploy it over HTTPS. The browser page's default backend URL is `http://localhost:8787`; change `window.MOREXAI_API_URL` in `more.html` when the backend is hosted elsewhere.

The browser page must be opened over HTTPS or localhost for secure browser features such as Web Crypto and microphone permission. Opening the HTML directly from a file manager may disable some features.

## Voice and camera limitations

Browser speech recognition and speech synthesis depend on the browser and operating system. Microphone input starts after the user taps Speak and grants permission. A true always-listening "Hey MOOREX" wake phrase, lock-screen operation, and continuous background listening require a native Android implementation and are not enabled by this web project.

The camera, file upload and some workspace panels remain planned features where the current UI labels them as not yet connected.

## Face motion, sidebar and typography (this revision)

- `js/morex-motion.js` animates the head automatically: it turns, tilts and nods on its own, blinks at random (sometimes twice), twitches the ears, and flares the ears while listening.
- When MOOREX speaks, the lower lip and jaw open and close in a talking rhythm with a dark mouth interior behind them, and the head nods slightly with the speech. The mouth closes when speaking stops.
- The eye colour layer is not touched by the motion code, so the automatic eye colour changes in `js/morex-eye-color.js` continue unchanged while the head moves. Eyelids are separate layers that only appear during a blink.
- Movement reacts to the assistant state: idle (wandering gaze), listening (tilt and ear flare), thinking (looks up and aside), speaking (talking mouth and nods), error (head shake).
- The sidebar is permanently visible on screens wider than 900px and opens from the menu button on phones and narrow windows.
- Text uses one consistent type scale with Orbitron for headings and labels and Exo 2 for body text (loaded from Google Fonts, with system fallbacks when offline). Small 8-9px labels were raised to a readable size.
- Visitors who enable "reduce motion" in their device settings get only blinking and talking, with much smaller head movement.
- The mouth, eyelids and ears are cut from the supplied head image (`assets/morex-lower-lip.png`, `morex-lid-*.png`, `morex-ear-*.png`, `morex-mouth-gap.png`), so the head looks unchanged when still.

## Single-screen layout (latest revision)

- The whole app now fits one screen with no page scrolling and no sideways scrolling. The head, title, chat box and the three quick-start buttons share the available height, and the chat messages scroll inside their own box.
- The thin line at the screen edge was the closed sidebar peeking in on phones and tablets. The closed menu is now completely hidden. Tap the menu button to open it, and tap outside it or press Escape to close it.
- On computers and wide tablets (wider than 900px) the sidebar stays permanently visible.
- On short screens, or while the keyboard is open, extras such as the byline, the mode label and the footnote are hidden so the chat box keeps enough room.

## Still body, Siri-style orb (latest revision)

- Only the head moves. The neck, collar and shoulders are a separate fixed layer (`assets/morex-body.png`); the head, ears, eyelids and mouth are the moving layer (`assets/morex-head.png` and friends). The bottom edge of the body fades into the page instead of ending in a hard line.
- Tap the glowing orb button in the top bar to open the Siri-style orb. MOOREX starts listening, and the orb shows the state: calm ripples while idle, live waves while listening, a turning arc while thinking, and a bigger waveform while speaking.
- The head stays sharp above the orb and reacts to the same state, so they work together: its mouth moves while it speaks, and its ears flare while it listens. Your words and MOOREX's replies appear as captions between the head and the orb.
- Tap the orb to stop listening or speaking. The X button or Escape closes it.
- `overlay.html` is the same orb as a separate page. Open it in a second window of the same browser and it mirrors and controls this app. It is also the page the native Android overlay would load later.
- The orb waves follow MOOREX's speaking rhythm, not the real microphone volume. Reading the real microphone level and showing the orb over other apps both need the native Android app.

## Attach button (photos, PDFs, text files)

- The Attach button in the message box now works. You can attach up to 3 files at a time, and you can also paste a screenshot into the message box.
- Photos are shrunk on the phone before sending. PDFs must be under 5 MB. Text files (txt, md, csv, json, code files) must be under 400 KB, and long ones are shortened.
- Text files are read on the device and added to your message. Photos and PDFs are sent to the AI backend, which passes them to Gemini. Send a file without typing anything and MOOREX will describe or summarize it.
- Reading files needs an internet connection and the running backend. The offline library cannot read files.
- Groq, the backup AI, cannot see photos or PDFs. If Gemini is down, MOOREX says so instead of guessing. Text files still work with Groq.
- You must restart the server (`node server.js` in the `server` folder) after updating, because `server.js` changed to accept attachments.

## Image & camera panel and image creation

- The Image & camera panel no longer says "not implemented". It has three buttons: Take a photo (opens the phone camera), Choose a photo, and Create an image. A photo you take or choose is attached to the message box, and you press send to ask MOOREX about it.
- The Files & documents panel now opens the file picker for PDFs and text files. Word (.docx) is still not supported.
- Image creation: type something like "Create an image of a golden lion", "draw a cat" or "/image sunset". MOOREX shows the picture in the chat with a Download image link.
- Image creation uses a Gemini image model through the server (`/api/image`). Set `GEMINI_IMAGE_MODEL` in `server/.env` (default `gemini-2.5-flash-image`; Google also documents `gemini-3.1-flash-image`). Whether your key may use image models, and how many images it allows, depends on your Google plan.
- Restart the server after updating (`node server.js` in the `server` folder).

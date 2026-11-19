# MOOREX.AI — clean deployment package

This package contains one Node/Express server and one canonical copy of each frontend file.

## Render settings
- Root Directory: leave blank (the repository root contains `package.json` and `server.js`)
- Build Command: `npm install`
- Start Command: `node server.js`
- Health Check Path: `/api/health`

## Environment variables
- `GEMINI_API_KEY`: required for Gemini chat and image generation
- `GROQ_API_KEY`: optional backup provider
- `GROQ_MODEL`: optional; defaults to `openai/gpt-oss-120b`
- `GEMINI_MODEL`: optional; defaults to `gemini-2.5-flash`
- `GEMINI_IMAGE_MODEL`: optional; defaults to `gemini-2.5-flash-image`

Keep API keys in Render environment variables only. Never place them in browser JavaScript or commit them to GitHub.

## Canonical file layout
- `more.html`, `overlay.html`, `server.js`, `package.json`, `render.yaml` at the project root
- `css/morex.css`
- `js/` contains the 14 frontend JavaScript modules, including `morex-image-generator.js`
- `assets/` contains the 15 avatar/image assets

No duplicate root-level copies of the JavaScript modules or image assets are included. Only `server.js` is included as the server entry point.

## Post-deployment checks
1. Open `/api/health` and confirm `ok: true`.
2. Open `/css/morex.css`, `/js/morex.js`, and `/assets/morex-head.png` and confirm they load.
3. Test chat and image generation separately. Image generation depends on Gemini model access, quota, and billing for the configured account.

The frontend uses same-origin `/api/chat`, `/api/image`, and `/api/health` requests.

# MOOREX.AI — clean deployment package

This package contains one Node/Express server and one canonical copy of each frontend file.

## Render settings
- Root Directory: leave blank (the repository root contains `package.json` and `server.js`)
- Build Command: `npm install`
- Start Command: `node server.js`
- Health Check Path: `/api/health`

## Environment variables
- `GEMINI_API_KEY`: Gemini chat (free key from Google AI Studio). Gemini does not make images on a free key.
- `GROQ_API_KEY`: optional backup chat provider
- `GROQ_MODEL`: optional; defaults to `openai/gpt-oss-120b`
- `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`: free image generation (see below)
- `GEMINI_MODEL`: leave EMPTY. The server asks Google which models exist today and picks one itself, so a retired model name can no longer break chat. Only set it if you want to force a specific model.
- `GEMINI_IMAGE_ENABLED`: leave unset. Set to `true` only if your Gemini key has billing, to use Gemini image models as an extra route.
- `POLLINATIONS_FALLBACK`: leave unset (keyless backup stays on). Set to `false` to turn it off.

## Free image generation (Cloudflare)
1. Create a free account at dash.cloudflare.com (no card).
2. Copy your **Account ID** (Workers & Pages overview page).
3. My Profile > API Tokens > Create Token, with the **Workers AI** permission. Copy the token.
4. In Render add `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`, then redeploy.
The free plan gives a daily allowance that resets at 00:00 UTC. If it runs out, or no Cloudflare key is set, the server tries the keyless Pollinations service, which is slower, rate limited and may be withdrawn at any time.

Keep API keys in Render environment variables only. Never place them in browser JavaScript or commit them to GitHub.

## Canonical file layout
- `more.html`, `overlay.html`, `server.js`, `morex-providers.js`, `package.json`, `render.yaml` at the project root
- `css/morex.css`
- `js/` contains the 14 frontend JavaScript modules, including `morex-image-generator.js`
- `assets/` contains the 15 avatar/image assets

No duplicate root-level copies of the JavaScript modules or image assets are included. Only `server.js` is included as the server entry point.

## Image generator
The generator is a workspace panel, not part of the avatar screen. Open it from the sidebar under Tools (Image generator), from Settings (Open image generator), or from Image & camera (Create an image). You can also type "create an image of ..." in the chat.

## Post-deployment checks
1. Open `/api/health` and confirm `ok: true`.
2. Open `/css/morex.css`, `/js/morex.js`, and `/assets/morex-head.png` and confirm they load.
3. Test chat and image generation separately. Open `/api/health` and check `imageProviders` to see which image routes are active.

The frontend uses same-origin `/api/chat`, `/api/image`, and `/api/health` requests.

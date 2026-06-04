# Chess On Ritual

On-chain chess with Ritual LLM analysis, served on Vercel.

## Project structure

```
pages/
  _document.tsx   fonts + HTML shell
  _app.tsx        minimal app wrapper
  index.tsx       chess game
  admin.tsx       OpenRouter key + model picker
package.json
tsconfig.json
next.config.js
vercel.json
```

## Local dev

```bash
npm install
npm run dev
# open http://localhost:3000
# admin  http://localhost:3000/admin
```

## Deploy to Vercel

```bash
npm i -g vercel
vercel          # follow prompts — framework auto-detected as Next.js
```

Or connect your GitHub repo in the Vercel dashboard — it deploys on every push.

## Settings flow

1. Visit `/admin`
2. Paste your [OpenRouter API key](https://openrouter.ai/keys)
3. Click **Load Models**, pick one, **Save Settings**
4. Return to `/` — the model pill in the header confirms it's active

Settings live in `localStorage` (same origin), so both pages share them automatically.

## Environment variables

None required. The OpenRouter key is stored client-side only.

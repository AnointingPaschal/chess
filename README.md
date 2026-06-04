# Chess On Ritual

On-chain chess with AI analysis, deployed on Vercel.

## Project structure

```
pages/
  _document.tsx     Google Fonts
  _app.tsx          Next.js wrapper
  index.tsx         Public chess game
  admin.tsx         Password-protected configuration panel
  api/
    llm.ts          AI proxy (API key stays server-side)
    auth.ts         Admin password check
    config.ts       Returns default model to client
package.json
tsconfig.json
next.config.js
vercel.json
```

## Environment variables

Set these in your Vercel project dashboard under **Settings → Environment Variables**:

| Variable | Required | Description |
|---|---|---|
| `ADMIN_PASSWORD` | ✅ | Password to access the admin panel |
| `OPENROUTER_API_KEY` | ✅ | Your AI provider API key |
| `DEFAULT_MODEL` | optional | Model used by all visitors (default: `anthropic/claude-sonnet-4-5`) |

> The API key is **never** sent to the browser. All AI calls are proxied through `/api/llm`.

## Changing the admin password

1. Go to Vercel dashboard → your project → **Settings → Environment Variables**
2. Edit `ADMIN_PASSWORD`
3. Click **Redeploy** (latest deployment → Redeploy)

## Local development

```bash
# Create .env.local with your variables
echo "ADMIN_PASSWORD=yourpassword" >> .env.local
echo "OPENROUTER_API_KEY=sk-or-..." >> .env.local
echo "DEFAULT_MODEL=anthropic/claude-sonnet-4-5" >> .env.local

npm install
npm run dev
# Game:  http://localhost:3000
# Admin: http://localhost:3000/admin
```

## Deploy

```bash
npm i -g vercel
vercel   # framework auto-detected as Next.js
```

Or connect to GitHub in the Vercel dashboard — deploys on every push.

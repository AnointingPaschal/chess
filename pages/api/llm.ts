import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { model, messages } = req.body as {
    model?: string
    messages: { role: string; content: string }[]
  }

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return res.status(503).json({ error: 'Service unavailable' })

  const activeModel =
    model || process.env.DEFAULT_MODEL || 'anthropic/claude-sonnet-4-5'

  try {
    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL ?? 'https://chess-ritual.vercel.app',
        'X-Title': 'Chess on Ritual',
      },
      body: JSON.stringify({ model: activeModel, messages, max_tokens: 700 }),
    })

    const data = await upstream.json()
    if (data.error) return res.status(400).json({ error: data.error.message ?? 'Upstream error' })
    return res.status(200).json({ content: data.choices[0].message.content as string })
  } catch {
    return res.status(500).json({ error: 'AI service error' })
  }
}

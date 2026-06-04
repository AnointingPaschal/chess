import type { NextApiRequest, NextApiResponse } from 'next'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { password } = req.body as { password?: string }
  const adminPassword = process.env.ADMIN_PASSWORD

  if (!adminPassword) return res.status(503).json({ error: 'Not configured' })
  if (!password || password !== adminPassword)
    return res.status(401).json({ error: 'Incorrect password' })

  return res.status(200).json({ ok: true })
}

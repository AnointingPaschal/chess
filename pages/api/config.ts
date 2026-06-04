import type { NextApiRequest, NextApiResponse } from 'next'

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  return res.status(200).json({
    defaultModel: process.env.DEFAULT_MODEL ?? 'anthropic/claude-sonnet-4-5',
  })
}

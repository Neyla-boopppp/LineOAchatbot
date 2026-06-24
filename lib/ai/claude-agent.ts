import Anthropic from '@anthropic-ai/sdk'

let client: Anthropic | null = null

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return client
}

function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) return fenced[1].trim()
  const obj = text.match(/\{[\s\S]*\}/)
  if (obj) return obj[0]
  return text
}

export async function runClaudeAgent(
  systemPrompt: string,
  userMessage: string,
  maxTokens = 4096
): Promise<string> {
  const anthropic = getClient()
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    })

    const block = message.content[0]
    if (block.type !== 'text') return '{}'
    return extractJSON(block.text)
  } catch (err) {
    console.error('[claude-agent] Error:', err)
    throw err
  }
}

export async function parseAgentOutput<T>(raw: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(raw) as T
  } catch {
    console.error('[claude-agent] JSON parse failed, raw:', raw.slice(0, 300))
    return fallback
  }
}

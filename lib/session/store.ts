import type { UserState } from '@/types/session'

const SESSION_TTL = 60 * 60 * 24 // 24 hours

// In-memory fallback for local dev (no KV credentials)
const mem = new Map<string, UserState>()
const useKV = !!process.env.KV_REST_API_URL

if (!useKV) {
  console.warn('[session] KV not configured (KV_REST_API_URL missing) — using in-memory store; sessions reset on every cold start')
}

export async function getState(userId: string): Promise<UserState | undefined> {
  if (!useKV) return mem.get(userId)
  const { kv } = await import('@vercel/kv')
  return (await kv.get<UserState>(`session:${userId}`)) ?? undefined
}

export async function setState(userId: string, state: UserState): Promise<void> {
  if (!useKV) { mem.set(userId, state); return }
  const { kv } = await import('@vercel/kv')
  await kv.set(`session:${userId}`, state, { ex: SESSION_TTL })
}

import { NextRequest, NextResponse } from 'next/server'
import { dispatch } from '@/lib/agents/jeab'

export const maxDuration = 300

export async function POST(req: NextRequest): Promise<NextResponse> {
  let request: string
  try {
    const body = await req.json() as { request?: string }
    request = body.request?.trim() ?? ''
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!request) {
    return NextResponse.json({ error: 'Missing "request" field' }, { status: 400 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured' }, { status: 500 })
  }

  try {
    const result = await dispatch(request)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[jeab/api] Pipeline error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

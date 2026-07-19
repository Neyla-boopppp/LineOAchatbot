import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { fetchJobs, clearCache } from '@/lib/data/sheet'
import { filterJobs, formatJobsForAI, isOpen } from '@/lib/data/job-search'

// เทียบ secret แบบ constant-time (กัน timing attack) — คืน false ถ้าความยาวต่างกัน
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// อ่าน secret ที่ client ส่งมา: x-admin-secret → Authorization: Bearer → ?key=
function extractProvidedSecret(req: Request, searchParams: URLSearchParams): string | null {
  const header = req.headers.get('x-admin-secret')
  if (header) return header
  const auth = req.headers.get('authorization')
  if (auth?.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim()
  return searchParams.get('key')
}

// Debug endpoint — ป้องกันด้วย ADMIN_API_SECRET (fail closed)
export async function GET(req: Request): Promise<NextResponse> {
  const { searchParams } = new URL(req.url)

  const expected = process.env.ADMIN_API_SECRET
  if (!expected) {
    // ไม่ตั้ง secret → ปิด endpoint ไว้ กันเผลอเปิดโล่งบน production
    return NextResponse.json({ error: 'Endpoint disabled: ADMIN_API_SECRET is not configured' }, { status: 503 })
  }

  const provided = extractProvidedSecret(req, searchParams)
  if (!provided || !secretMatches(provided, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const query = searchParams.get('q') ?? ''
  const refresh = searchParams.get('refresh') === '1'

  if (refresh) clearCache()

  const jobs = await fetchJobs()
  const matched = query ? filterJobs(jobs, query) : jobs
  const formatted = formatJobsForAI(matched)

  const statusGroups: Record<string, number> = {}
  for (const j of jobs) {
    statusGroups[j.status] = (statusGroups[j.status] ?? 0) + 1
  }

  return NextResponse.json({
    total: jobs.length,
    matched: matched.length,
    query,
    openCount: jobs.filter((j) => isOpen(j.status)).length,
    statusGroups,
    otherStatus: Array.from(new Set(jobs.map((j) => j.status).filter((s) => !isOpen(s) && s !== 'ปิดรับสมัคร' && s !== 'ปิดรับ'))),
    formattedForAI: formatted,
    jobs: matched.map((j) => ({
      id: j.id,
      brand: j.brand,
      jobTitle: j.jobTitle,
      branch: j.branch,
      status: j.status,
      statusHex: Buffer.from(j.status).toString('hex'),
    })),
  })
}

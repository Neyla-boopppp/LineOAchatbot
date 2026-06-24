import { NextResponse } from 'next/server'
import { fetchJobs, clearCache } from '@/lib/data/sheet'
import { filterJobs, formatJobsForAI, isOpen } from '@/lib/data/job-search'

// Debug endpoint — add authentication before production
export async function GET(req: Request): Promise<NextResponse> {
  const { searchParams } = new URL(req.url)
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

import type { JobListing } from '@/types/job'

export function isOpen(status: string): boolean {
  const s = status.trim().toLowerCase()
  return s.includes('เปิดรับ') || s === 'open' || s === 'เปิด'
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^฀-๿a-z0-9\s]/g, ' ')
}

function tokenize(text: string): string[] {
  return normalize(text).split(/\s+/).filter(Boolean)
}

function detectStatusIntent(userText: string): 'open' | 'closed' | 'any' {
  const t = normalize(userText)

  if (t.includes('เปิดรับสมัคร') || t.includes('เปิดรับ') || t.includes('เปิด')) {
    return 'open'
  }
  if (t.includes('ปิดรับสมัคร') || t.includes('ปิดรับ') || t.includes('ปิด')) {
    return 'closed'
  }
  return 'any'
}

function scoreRow(job: JobListing, tokens: string[]): number {
  let score = 0
  const brandNorm = normalize(job.brand)
  const titleNorm = normalize(job.jobTitle)
  const branchNorm = normalize(job.branch)

  for (const token of tokens) {
    if (token.length < 2) continue
    if (brandNorm.includes(token)) score += 2
    if (titleNorm.includes(token)) score += 2
    if (branchNorm.includes(token)) score += 2
  }
  return score
}

export function filterJobs(jobs: JobListing[], userText: string): JobListing[] {
  const tokens = tokenize(userText)
  const intent = detectStatusIntent(userText)

  let candidates: JobListing[]
  if (intent === 'open') {
    candidates = jobs.filter((j) => isOpen(j.status))
  } else if (intent === 'closed') {
    candidates = jobs.filter((j) => !isOpen(j.status))
  } else {
    candidates = jobs
  }

  if (!candidates.length) return []

  const STOP_WORDS = new Set(['มี', 'อะไร', 'บ้าง', 'ตำแหน่ง', 'รับสมัคร', 'สมัคร', 'เปิด', 'ปิด', 'ไหน', 'ที่', 'และ', 'หรือ', 'งาน', 'สาขา'])
  const hasSpecificKeyword = tokens.some((t) => t.length >= 2 && !STOP_WORDS.has(t))

  if (!hasSpecificKeyword) {
    return candidates
  }

  const isBranchListQuery = /สาขาไหน|สาขาใด|สาขาอะไร|มีสาขา|เปิดสาขา/.test(userText)

  const scored = candidates
    .map((job) => ({ job, score: scoreRow(job, tokens) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, isBranchListQuery ? 15 : 5)
    .map(({ job }) => job)

  return scored.length ? scored : candidates
}

export function formatJobsForAI(jobs: JobListing[]): string {
  if (!jobs.length) return '(ไม่มีข้อมูลตำแหน่งที่ตรงกับคำถาม)'

  const header = '| ID | แบรนด์ | ตำแหน่ง | สาขา | ประเภท | เงินเดือน | สถานะ |'
  const divider = '|---|---|---|---|---|---|---|'
  const rows = jobs.map(
    (j) =>
      `| ${j.id} | ${j.brand} | ${j.jobTitle} | ${j.branch} | ${j.jobType} | ${j.salary} | ${j.status} |`
  )
  return [header, divider, ...rows].join('\n')
}

export function formatJobDetail(job: JobListing): string {
  return [
    `[${job.id}] ${job.brand} — ${job.jobTitle}`,
    `สาขา: ${job.branch}`,
    `ประเภท: ${job.jobType}`,
    `เงินเดือน: ${job.salary}`,
    `สถานะ: ${job.status}`,
    job.description ? `หน้าที่: ${job.description}` : '',
    job.qualifications ? `คุณสมบัติ: ${job.qualifications}` : '',
    job.benefit ? `สวัสดิการ: ${job.benefit}` : '',
    job.documents ? `เอกสาร: ${job.documents}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

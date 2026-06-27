import type { JobListing } from '@/types/job'

export type { JobListing }

type Cache = {
  rows: JobListing[]
  expiredAt: number
}

let cache: Cache | null = null

const CACHE_TTL_MS = 15 * 60 * 1000 // 15 นาที — อัปเดต Sheet แล้วบอทเห็นภายใน 15 นาที

function nextRefreshAt(): number {
  return Date.now() + CACHE_TTL_MS
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      currentRow.push(current.trim())
      current = ''
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++
      currentRow.push(current.trim())
      if (currentRow.some((c) => c.trim())) rows.push(currentRow)
      currentRow = []
      current = ''
    } else {
      current += ch
    }
  }

  if (current.trim() || currentRow.length > 0) {
    currentRow.push(current.trim())
    if (currentRow.some((c) => c.trim())) rows.push(currentRow)
  }

  return rows
}

function findHeaderRow(rows: string[][]): number {
  return rows.findIndex(
    (row) => row.some((cell) => cell.toUpperCase() === 'ID')
  )
}

function mapToJobListing(headers: string[], cells: string[]): JobListing {
  const get = (key: string) => {
    const idx = headers.findIndex((h) => h.toUpperCase() === key.toUpperCase())
    return idx >= 0 ? (cells[idx] ?? '').trim() : ''
  }
  return {
    id: get('ID'),
    brand: get('Brand'),
    jobTitle: get('Job_Title'),
    branch: get('Branch'),
    jobType: get('Job_Type'),
    salary: get('Salary'),
    description: get('Description'),
    qualifications: get('Qualifications'),
    benefit: get('Benefit'),
    documents: get('เอกสาร'),
    status: get('Status'),
  }
}

const VALID_STATUSES = ['เปิดรับสมัคร', 'ปิดรับสมัคร', 'open', 'closed', 'เปิด', 'ปิด']

function isValidJobRow(j: JobListing): boolean {
  if (!j.id) return false
  const s = j.status.trim().toLowerCase()
  return VALID_STATUSES.some((v) => s.includes(v.toLowerCase()))
}

export async function fetchJobs(): Promise<JobListing[]> {
  if (cache && Date.now() < cache.expiredAt) {
    return cache.rows
  }

  const url = process.env.SHEET_CSV_URL
  if (!url) {
    console.error('[sheet] SHEET_CSV_URL is not set')
    return cache?.rows ?? []
  }

  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()

    const allRows = parseCSV(text)
    const headerIdx = findHeaderRow(allRows)
    if (headerIdx < 0) {
      console.error('[sheet] Cannot find header row with ID column')
      return cache?.rows ?? []
    }

    const headers = allRows[headerIdx]
    const rows = allRows
      .slice(headerIdx + 1)
      .filter((r) => r.some((c) => c.trim()))
      .map((r) => mapToJobListing(headers, r))
      .filter(isValidJobRow)

    cache = { rows, expiredAt: nextRefreshAt() }
    console.log(`[sheet] Loaded ${rows.length} jobs from Job_Vacancies, next refresh at ${new Date(cache.expiredAt).toISOString()}`)
    return rows
  } catch (err) {
    console.error('[sheet] Fetch failed:', err)
    return cache?.rows ?? []
  }
}

export function clearCache() {
  cache = null
  console.log('[sheet] Cache cleared manually')
}

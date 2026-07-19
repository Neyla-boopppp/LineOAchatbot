import { describe, expect, it } from 'vitest'
import { detectRichMenuIntent, parsePostbackIntent, READ_ONLY_INTENTS } from '../lib/line/menu'

describe('detectRichMenuIntent — ปุ่ม Rich Menu จริงทั้ง 6 ปุ่ม', () => {
  it.each([
    ['ตำแหน่งงานที่เปิดรับ', 'jobs'],
    ['สมัครงานออนไลน์', 'apply'],
    ['เช็คสาขาใกล้บ้านคุณ', 'branches'],
    ['คำถามที่พบบ่อย', 'faq'],
    ['สวัสดิการและผลตอบแทน', 'benefits'],
    ['ติดต่อเจ้าหน้าที่', 'contact'],
  ])('label "%s" → intent %s', (label, expected) => {
    expect(detectRichMenuIntent(label)).toBe(expected)
  })

  it('ยังรองรับ label เดิม "ตำแหน่งงานว่าง"', () => {
    expect(detectRichMenuIntent('ตำแหน่งงานว่าง')).toBe('jobs')
  })

  it('match แบบ normalize (เว้นวรรค/ตัวพิมพ์)', () => {
    expect(detectRichMenuIntent('  ตำแหน่ง งาน ที่เปิดรับ ')).toBe('jobs')
    expect(detectRichMenuIntent('FAQ')).toBe('faq')
  })

  it('ข้อความทั่วไปที่ไม่ใช่ปุ่ม → null (กัน false-positive)', () => {
    expect(detectRichMenuIntent('อยากสมัครงานตำแหน่งบาริสต้า')).toBeNull()
    expect(detectRichMenuIntent('สวัสดีครับ')).toBeNull()
  })
})

describe('READ_ONLY_INTENTS', () => {
  it('apply กับ contact ไม่ใช่ read-only (แตะ state)', () => {
    expect(READ_ONLY_INTENTS.has('apply')).toBe(false)
    expect(READ_ONLY_INTENTS.has('contact')).toBe(false)
  })
  it('jobs/docs/benefits/branches/faq เป็น read-only', () => {
    for (const i of ['jobs', 'docs', 'benefits', 'branches', 'faq'] as const) {
      expect(READ_ONLY_INTENTS.has(i)).toBe(true)
    }
  })
})

describe('parsePostbackIntent', () => {
  it.each([
    ['menu=jobs', 'jobs'],
    ['action=apply', 'apply'],
    ['branch_check', 'branches'],
    ['faq', 'faq'],
    ['contact_hr', 'contact'],
    [undefined, null],
    ['unknown', null],
  ])('data "%s" → %s', (data, expected) => {
    expect(parsePostbackIntent(data as string | undefined)).toBe(expected)
  })
})

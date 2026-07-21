import { describe, expect, it } from 'vitest'
import { detectRichMenuIntent, parsePostbackIntent, isSilentMenuText, READ_ONLY_INTENTS } from '../lib/line/menu'

describe('detectRichMenuIntent — ปุ่ม Rich Menu จริงทั้ง 6 ปุ่ม', () => {
  it.each([
    ['ตำแหน่งงานที่เปิดรับ', 'jobs'], // RM1 — ลูกค้าเลือกให้บอทตอบรายการงานเอง ไม่ใช้การ์ด
    ['สมัครงาน', 'apply'],
    ['เช็คสาขาใกล้บ้านคุณ', 'branches'],
    ['คำถามที่พบบ่อย', 'faq'],
    ['สวัสดิการและผลตอบแทน', 'perks'], // RM3 — ขึ้นการ์ดสิทธิเลย ไม่ถามแบรนด์/ตำแหน่งกลับ
    ['สวัสดิการตามตำแหน่ง', 'benefits'], // ปุ่มท้ายการ์ดสิทธิ → ดึงรายตำแหน่งจาก Sheet
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
    // ปุ่มเงียบก็ normalize เหมือนกัน
    expect(isSilentMenuText('  สมัคร งาน ออนไลน์ ')).toBe(true)
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

describe('Rich Menu ชุดใหม่ (v2)', () => {
  it.each([
    ['สิทธิที่จะได้รับ', 'perks'],
    ['สวัสดิการที่จะได้รับ', 'perks'],
    ['ทิ้งข้อความถึง HR', 'contact'],
    ['สอบถามเพิ่มเติม', 'contact'],
  ])('label ใหม่ "%s" → intent %s', (label, expected) => {
    expect(detectRichMenuIntent(label)).toBe(expected)
  })

  it('perks กับ benefits เป็นคนละ intent (การ์ดคงที่ vs ดึงจาก Sheet)', () => {
    expect(detectRichMenuIntent('สิทธิที่จะได้รับ')).toBe('perks')
    expect(detectRichMenuIntent('สวัสดิการตามตำแหน่ง')).toBe('benefits')
  })

  it('intent ใหม่ทั้งหมดเป็น read-only (ตอบได้แม้อยู่โหมด handover)', () => {
    for (const i of ['perks', 'faq_age', 'faq_parttime'] as const) {
      expect(READ_ONLY_INTENTS.has(i)).toBe(true)
    }
  })
})

describe('Quick Reply จากปุ่มคำถามที่พบบ่อย', () => {
  it.each([
    ['รับอายุเท่าไหร่?', 'faq_age'],
    ['รับพาร์ทไทม์ไหม?', 'faq_parttime'],
    ['สิทธิที่จะได้รับ', 'perks'],
    ['ใช้เอกสารอะไรบ้าง?', 'docs'],
    ['ตำแหน่งงานว่าง', 'jobs'], // ไม่ใช้ 'ตำแหน่งงานที่เปิดรับ' — ชนกับปุ่มเงียบ RM1
  ])('quick reply "%s" → intent %s', (text, expected) => {
    expect(detectRichMenuIntent(text)).toBe(expected)
  })
})

describe('isSilentMenuText — RM2 เป็นปุ่มเดียวที่ OA Manager ตอบเอง', () => {
  // ⚠️ action text ยืนยันจาก log แชตจริง 2026-07-21 ไม่ใช่ข้อความบนรูป Rich Menu
  it('RM2 สมัครงานออนไลน์ → บอทเงียบ ปล่อยให้ Card Message ขึ้น', () => {
    expect(isSilentMenuText('สมัครงานออนไลน์')).toBe(true)
    expect(detectRichMenuIntent('สมัครงานออนไลน์')).toBeNull()
  })

  it('RM1 ตำแหน่งงานที่เปิดรับ → บอทตอบรายการงานเอง (ลูกค้าเปลี่ยนใจ ไม่ใช้การ์ดแล้ว)', () => {
    expect(isSilentMenuText('ตำแหน่งงานที่เปิดรับ')).toBe(false)
    expect(detectRichMenuIntent('ตำแหน่งงานที่เปิดรับ')).toBe('jobs')
  })

  it('ปุ่มที่บอทต้องตอบ ไม่ถูกกลืนหายไป', () => {
    for (const label of ['ตำแหน่งงานที่เปิดรับ', 'สวัสดิการและผลตอบแทน', 'คำถามที่พบบ่อย', 'ติดต่อเจ้าหน้าที่']) {
      expect(isSilentMenuText(label)).toBe(false)
      expect(detectRichMenuIntent(label)).not.toBeNull()
    }
  })

  it('ผู้ใช้พิมพ์ "สมัครงาน" เองยังเข้า intent apply ได้', () => {
    expect(isSilentMenuText('สมัครงาน')).toBe(false)
    expect(detectRichMenuIntent('สมัครงาน')).toBe('apply')
    expect(detectRichMenuIntent('สมัครออนไลน์')).toBe('apply')
  })

  it('ข้อความทั่วไปไม่ถูกทำให้เงียบ (match ทั้งก้อนเท่านั้น)', () => {
    expect(isSilentMenuText('อยากสมัครงานครับ')).toBe(false)
    expect(isSilentMenuText('อยากสมัครงานออนไลน์ครับ')).toBe(false)
    expect(isSilentMenuText('ขอดูตำแหน่งงานที่เปิดรับหน่อยครับ')).toBe(false)
    expect(isSilentMenuText('สวัสดีค่ะ')).toBe(false)
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

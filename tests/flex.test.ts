import { describe, expect, it } from 'vitest'
import { buildPerksFlex, buildFaqQuickReply, FAQ_QUICK_ITEMS, PERKS_DETAIL_TEXT } from '../lib/line/flex'
import { detectRichMenuIntent } from '../lib/line/menu'

describe('buildPerksFlex — การ์ดสรุปสิทธิที่จะได้รับ', () => {
  const flex = buildPerksFlex()

  it('เป็น Flex Message ที่มี altText (LINE บังคับ)', () => {
    expect(flex.type).toBe('flex')
    expect(flex.altText.length).toBeGreaterThan(0)
    expect(flex.altText.length).toBeLessThanOrEqual(400)
  })

  it('ครบทั้ง 6 สิทธิตรงกับคอลัมน์ Benefit ใน Google Sheet', () => {
    const json = JSON.stringify(flex)
    for (const keyword of [
      'Service Charge',
      'ค่าอาหาร 910 บาท/เดือน',
      'เบี้ยขยัน 700 บาท/เดือน',
      'กองทุนสำรองเลี้ยงชีพ',
      'ประกันสังคม',
      'ยูนิฟอร์ม',
    ]) {
      expect(json).toContain(keyword)
    }
  })

  it('ไม่ระบุเงินเดือนในการ์ด (ตั้งใจให้ผู้สมัครถามเข้ามาเอง)', () => {
    expect(JSON.stringify(flex)).not.toContain('เงินเดือน')
  })

  it('ไม่มีสวัสดิการที่ Sheet ไม่ได้ระบุ (กันบอทแต่งข้อมูลเอง)', () => {
    const json = JSON.stringify(flex)
    for (const invented of ['Incentive', 'ส่วนลดค่าอาหาร', 'ประกันสุขภาพ', 'Uno Coffee']) {
      expect(json).not.toContain(invented)
    }
  })

  it('ปุ่มในการ์ดกดแล้วต่อเข้า flow สวัสดิการรายตำแหน่งได้จริง (ไม่เป็นปุ่มตาย)', () => {
    expect(detectRichMenuIntent(PERKS_DETAIL_TEXT)).toBe('benefits')
  })

  it('label ของปุ่มไม่เกิน 20 ตัวอักษรตามข้อจำกัดของ LINE', () => {
    const labels = JSON.stringify(flex).match(/"label":"([^"]*)"/g) ?? []
    expect(labels.length).toBeGreaterThan(0)
    for (const raw of labels) {
      const label = raw.replace(/^"label":"/, '').replace(/"$/, '')
      expect(label.length).toBeLessThanOrEqual(20)
    }
  })
})

describe('buildFaqQuickReply — ปุ่มกลมคำถามที่พบบ่อย', () => {
  const msg = buildFaqQuickReply('ทดสอบ')

  it('เป็นข้อความ text ที่แนบ quickReply มาด้วย', () => {
    expect(msg.type).toBe('text')
    expect(msg.text).toBe('ทดสอบ')
    expect(msg.quickReply?.items?.length).toBe(FAQ_QUICK_ITEMS.length)
  })

  it('จำนวนปุ่มไม่เกิน 13 ปุ่มตามข้อจำกัดของ LINE', () => {
    expect(FAQ_QUICK_ITEMS.length).toBeLessThanOrEqual(13)
  })

  it('label ทุกปุ่มไม่เกิน 20 ตัวอักษร', () => {
    for (const item of FAQ_QUICK_ITEMS) {
      expect(item.label.length).toBeLessThanOrEqual(20)
    }
  })

  it('ทุกปุ่มกดแล้วได้ intent จริง (ไม่มีปุ่มตาย)', () => {
    for (const item of FAQ_QUICK_ITEMS) {
      expect(detectRichMenuIntent(item.text)).not.toBeNull()
    }
  })
})

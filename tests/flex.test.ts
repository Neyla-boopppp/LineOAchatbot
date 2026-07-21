import { describe, expect, it } from 'vitest'
import {
  buildPerksFlex,
  buildFaqQuickReply,
  buildJobsFlex,
  buildBrandInterestText,
  FAQ_QUICK_ITEMS,
  PERKS_DETAIL_TEXT,
  type BrandJobGroup,
} from '../lib/line/flex'
import { detectRichMenuIntent, isSilentMenuText } from '../lib/line/menu'

// รูปทรงข้อมูลจริงจาก Sheet (log 2026-07-21)
const REAL_GROUPS: BrandJobGroup[] = [
  {
    brand: 'Khao So-i',
    branches: [
      { branch: 'เซนทรัลพระราม9 (Central Rama9)', positions: ['Restaurant Manager (ผู้จัดการ)', 'Supervisor (ซุปเปอร์ไวเซอร์)', 'Service Staff (พนักงานเสิร์ฟ เซอร์วิสบริการ)'] },
      { branch: 'เซนทรัลปิ่นเกล้า (Central Pinklao)', positions: ['Assistant Head Chef (ผู้ช่วยหัวหน้าเชฟ)'] },
      { branch: 'ไอคอนสยาม (ICONSIAM)', positions: ['Service Staff (พนักงานเสิร์ฟ เซอร์วิสบริการ)'] },
    ],
  },
  {
    brand: 'Potato Corner',
    branches: [
      { branch: 'เซนทรัล พระราม 2 (Central  Rama2(Fl.4))', positions: ['TM'] },
      { branch: 'โลตัส สุขุมวิท 50 (Lotus Sukhumvit 50)', positions: ['TM'] },
    ],
  },
]

describe('buildJobsFlex — carousel ตำแหน่งงานที่เปิดรับ (RM1)', () => {
  it('1 การ์ดต่อ 1 แบรนด์ พร้อม altText ที่ LINE บังคับ', () => {
    const flex = buildJobsFlex(REAL_GROUPS)!
    expect(flex.type).toBe('flex')
    expect(flex.contents.type).toBe('carousel')
    expect((flex.contents as { contents: unknown[] }).contents).toHaveLength(2)
    expect(flex.altText.length).toBeGreaterThan(0)
    expect(flex.altText.length).toBeLessThanOrEqual(400)
  })

  it('โชว์ครบทุกสาขาและตำแหน่งที่มีจริง', () => {
    const json = JSON.stringify(buildJobsFlex(REAL_GROUPS))
    for (const keyword of ['Khao So-i', 'Potato Corner', 'ไอคอนสยาม', 'Restaurant Manager', 'TM']) {
      expect(json).toContain(keyword)
    }
  })

  it('ไม่มีงานเปิดรับ → คืน null ให้ผู้เรียกตอบข้อความธรรมดาแทน (Flex ว่างส่งไม่ได้)', () => {
    expect(buildJobsFlex([])).toBeNull()
    expect(buildJobsFlex([{ brand: 'Uno Coffee', branches: [] }])).toBeNull()
  })

  it('เกิน 12 แบรนด์ → ตัดให้เหลือ 12 ตามลิมิต carousel ของ LINE', () => {
    const many: BrandJobGroup[] = Array.from({ length: 20 }, (_, i) => ({
      brand: `Brand ${i}`,
      branches: [{ branch: 'สาขา', positions: ['TM'] }],
    }))
    const contents = (buildJobsFlex(many)!.contents as { contents: unknown[] }).contents
    expect(contents).toHaveLength(12)
  })

  it('สาขา/ตำแหน่งเยอะเกิน → สรุปส่วนที่เกินแทนที่จะยัดจนการ์ดบวม', () => {
    const huge: BrandJobGroup[] = [{
      brand: 'Big Brand',
      branches: Array.from({ length: 15 }, (_, i) => ({
        branch: `สาขา ${i}`,
        positions: Array.from({ length: 10 }, (_, p) => `ตำแหน่ง ${p}`),
      })),
    }]
    const json = JSON.stringify(buildJobsFlex(huge))
    expect(json).toContain('และอีก 7 สาขา')     // 15 - 8
    expect(json).toContain('และอีก 4 ตำแหน่ง')  // 10 - 6
    expect(json.length).toBeLessThan(50_000)    // ลิมิตขนาด Flex ของ LINE
  })

  it('label ของปุ่มไม่เกิน 20 ตัวอักษรตามข้อจำกัดของ LINE', () => {
    const labels = JSON.stringify(buildJobsFlex(REAL_GROUPS)).match(/"label":"([^"]*)"/g) ?? []
    expect(labels.length).toBeGreaterThan(0)
    for (const raw of labels) {
      expect(raw.replace(/^"label":"/, '').replace(/"$/, '').length).toBeLessThanOrEqual(20)
    }
  })

  it('ปุ่ม "สนใจแบรนด์นี้" กดแล้วไม่ตาย — ไม่ถูกทำให้เงียบ และไม่ชน Rich Menu intent อื่น', () => {
    for (const group of REAL_GROUPS) {
      const text = buildBrandInterestText(group.brand)
      expect(JSON.stringify(buildJobsFlex(REAL_GROUPS))).toContain(text)
      // ต้องไม่โดน isSilentMenuText กลืน ไม่งั้นกดปุ่มแล้วบอทเงียบสนิท
      expect(isSilentMenuText(text)).toBe(false)
      // ไม่ match intent ไหนเลย = ไหลเข้า flow เก็บข้อมูล แล้วบอทถามตำแหน่ง/สาขาต่อ
      expect(detectRichMenuIntent(text)).toBeNull()
      expect(text).toContain(group.brand)
    }
  })
})

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

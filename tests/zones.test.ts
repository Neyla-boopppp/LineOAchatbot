import { describe, expect, it } from 'vitest'
import {
  ZONES,
  ZONE_IDS,
  detectZone,
  zoneLabel,
  zoneName,
  zonePostbackData,
  parseZonePostback,
  type ZoneId,
} from '../lib/line/zones'

describe('detectZone — จับชื่อสาขาเข้าโซน', () => {
  // ชื่อสาขาจริงจาก Sheet (log 2026-07-21) — รูปแบบคือ "ชื่อไทย (English (ชั้น))"
  const REAL_BRANCHES: [string, ZoneId][] = [
    ['เซนทรัลพระราม9 (Central Rama9)', 'east'],
    ['เซนทรัลปิ่นเกล้า (Central Pinklao)', 'thon'],
    ['ไอคอนสยาม (ICONSIAM)', 'thon'],
    ['เซนทรัล พระราม 2 (Central  Rama2(Fl.4))', 'thon'],
    ['โลตัส สุขุมวิท 50 (Lotus Sukhumvit 50)', 'east'],
  ]

  for (const [branch, expected] of REAL_BRANCHES) {
    it(`"${branch}" → ${expected}`, () => {
      expect(detectZone(branch)).toBe(expected)
    })
  }

  it('keyword ที่ยาวกว่าชนะ ไม่ใช่ลำดับโซน', () => {
    // ⚠️ เคสดักบั๊ก: "ไอคอนสยาม" มีคำว่า "สยาม" (โซนใจกลางเมือง) ซ่อนอยู่ข้างใน
    // ถ้าไล่ตามลำดับโซนแทนที่จะเทียบความยาว ไอคอนสยามจะหลุดไปอยู่ใจกลางเมือง
    expect(detectZone('ไอคอนสยาม')).toBe('thon')
    expect(detectZone('สยามพารากอน')).toBe('central')
  })

  it('สาขาที่ยังไม่รู้จัก → other (ต้องไม่หายไปจากรายการ)', () => {
    expect(detectZone('สาขาใหม่ที่ยังไม่มีในตาราง')).toBe('other')
    expect(detectZone('')).toBe('other')
  })

  it('ไม่สนใจตัวพิมพ์เล็ก-ใหญ่และช่องว่าง', () => {
    expect(detectZone('CENTRAL   RAMA 9')).toBe('east')
    expect(detectZone('lotus sukhumvit50')).toBe('east')
  })

  it('"สุขุมวิท50" ต้องเจาะจง ไม่ไปคว้าสาขาสุขุมวิทใจกลางเมือง', () => {
    expect(detectZone('เอ็มควอเทียร์ สุขุมวิท 35')).toBe('central')
  })
})

describe('ตาราง ZONES', () => {
  it('keyword ห้ามซ้ำข้ามโซน (ไม่งั้นผลลัพธ์จะขึ้นกับลำดับ)', () => {
    const all = ZONES.flatMap((z) => z.keywords)
    expect(new Set(all).size).toBe(all.length)
  })

  it('ทุกโซนมี label และ keyword อย่างน้อย 1 คำ', () => {
    for (const zone of ZONES) {
      expect(zone.label.length).toBeGreaterThan(0)
      expect(zone.keywords.length).toBeGreaterThan(0)
    }
  })

  it('label ทุกโซนไม่เกิน 20 ตัวอักษร (ลิมิต label ของ Quick Reply)', () => {
    for (const id of ZONE_IDS) {
      expect(zoneLabel(id).length).toBeLessThanOrEqual(20)
    }
  })

  it('จำนวนโซนไม่เกิน 13 ปุ่มตามลิมิต Quick Reply ของ LINE', () => {
    expect(ZONE_IDS.length).toBeLessThanOrEqual(13)
  })

  it('zoneName() ตัดอิโมจิออกให้แทรกในประโยคได้ ไม่กลายเป็นค่าว่าง', () => {
    expect(zoneName('thon')).toBe('ฝั่งธนบุรี')
    expect(zoneName('east')).toBe('กทม. ตะวันออก')
    for (const id of ZONE_IDS) {
      expect(zoneName(id).length).toBeGreaterThan(0)
      // อิโมจิทุกตัวที่ใช้อยู่นอกระนาบ BMP — เช็คจาก high surrogate ได้โดยไม่ต้องใช้ flag /u
      expect(zoneName(id)).not.toMatch(/[\uD800-\uDBFF]/)
    }
  })
})

describe('postback ของปุ่มโซน', () => {
  it('สร้างแล้วอ่านกลับได้ครบทุกโซน', () => {
    for (const id of ZONE_IDS) {
      expect(parseZonePostback(zonePostbackData(id))).toBe(id)
    }
  })

  it('data ที่ไม่ใช่ของโซน → null (ปล่อยให้ parsePostbackIntent จัดการต่อ)', () => {
    expect(parseZonePostback(undefined)).toBeNull()
    expect(parseZonePostback('')).toBeNull()
    expect(parseZonePostback('menu=jobs')).toBeNull()
    expect(parseZonePostback('menu=zone&zone=ดาวอังคาร')).toBeNull()
  })
})

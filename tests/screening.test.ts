import { describe, expect, it } from 'vitest'
import {
  FOREIGN_ELIGIBLE_BRAND,
  FAQ_MESSAGE,
  NON_THAI_BRAND_RULE,
  buildNonThaiWrongBrandMessage,
  isForeignEligibleBrand,
} from '../lib/session/screening'

describe('isForeignEligibleBrand — ต่างชาติรับเฉพาะ Khao So-i', () => {
  it('ผ่านสำหรับชื่อแบรนด์ที่ผู้ใช้/Sheet เขียนได้หลายแบบ', () => {
    // 'Khao So-i' คือรูปแบบที่ใช้จริงในคอลัมน์ Brand ของ Google Sheet
    for (const brand of ['Khao So-i', 'khao so-i', 'KhaoSoi', 'khao soi', 'ข้าวซอย', 'ร้านข้าวซอย']) {
      expect(isForeignEligibleBrand(brand)).toBe(true)
    }
  })

  it('ไม่ผ่านสำหรับแบรนด์อื่นในเครือ', () => {
    for (const brand of ['Potato Corner', 'potato corner', 'Uno Coffee']) {
      expect(isForeignEligibleBrand(brand)).toBe(false)
    }
  })

  it('ไม่ผ่านเมื่อยังไม่รู้แบรนด์ (กันเผลอปล่อยผ่าน)', () => {
    expect(isForeignEligibleBrand('')).toBe(false)
    expect(isForeignEligibleBrand(null)).toBe(false)
    expect(isForeignEligibleBrand(undefined)).toBe(false)
  })
})

describe('ข้อความแจ้งนโยบายผู้สมัครต่างชาติ', () => {
  it('ข้อความปฏิเสธระบุแบรนด์ที่สมัคร และชวนไป Khao So-i', () => {
    const msg = buildNonThaiWrongBrandMessage('Potato Corner')
    expect(msg).toContain('Potato Corner')
    expect(msg).toContain(FOREIGN_ELIGIBLE_BRAND)
  })

  it('ข้อความตอนยังไม่รู้แบรนด์ บอกกฎว่ารับเฉพาะ Khao So-i', () => {
    expect(NON_THAI_BRAND_RULE).toContain(FOREIGN_ELIGIBLE_BRAND)
  })

  it('FAQ ไม่ตอบว่า "รับทั้งคนไทยและต่างชาติ" อีกต่อไป', () => {
    expect(FAQ_MESSAGE).not.toContain('รับทั้งคนไทยและต่างชาติ')
    expect(FAQ_MESSAGE).toContain(FOREIGN_ELIGIBLE_BRAND)
  })
})

import type { ApplicationInfo, UserState } from '@/types/session'

export type { ApplicationInfo, UserState }
export { getState, setState } from './store'

export const WELCOME_MESSAGE = `สวัสดีค่ะ พี่ร็อคกี้ (Rockie) ทีมงานฝ่ายบุคคลของ Rocks group นะคะ 🐿️
สามารถสอบถามรายละเอียดงานเพิ่มเติม หรือสมัครงานได้เลยค่า 🫡

ถ้าอยากรู้ว่ามีแบรนด์ไหนเปิดรับสมัครตำแหน่งอะไรอยู่บ้าง สามารถกดเลือกดูข้อมูลจาก เมนูด้านล่างหน้าจอ (Rich Menu) ได้ทันทีเลยค่ะ👇🏻 หรือจะพิมพ์ส่งเข้ามาถามพี่ร็อคกี้ในแชทนี้ได้เลยนะคะ

⚠️โปรดระบุ⚠️
1. ชื่อแบรนด์ที่ต้องการสมัคร ✅
2. ตำแหน่งงานที่สนใจ ✅
3. สาขาที่สะดวก ✅

ขอบคุณที่สนใจงานของเราค่า 🥰`

export const NON_THAI_DOCS = `ถ้าไม่ใช่คนสัญชาติไทย รบกวนส่งเอกสารให้เจ้าหน้าที่ 4 อย่างนะคะ
1.วีซ่า
2.พาสปอร์ต
3.ใบอนุญาตทำงาน
4.smart card บัตรอนุญาตทำงาน`

export function buildSummaryMessage(brand: string, position: string, branch: string): string {
  return `ขอบคุณนะคะ 😊 พี่ร็อคกี้รับข้อมูลของคุณแล้วค่ะ

📋 สรุปข้อมูลการสมัคร:
🏢 แบรนด์: ${brand}
💼 ตำแหน่ง: ${position}
📍 สาขา: ${branch}`
}

export function buildMissingMessage(missing: string[]): string {
  return `ขอบคุณค่ะ 🙏 รบกวนขอข้อมูลเพิ่มเติมอีกนิดนึงนะคะ\nยังไม่ได้ระบุ ${missing.join(' และ ')} ค่ะ — ช่วยบอกพี่ร็อคกี้ด้วยได้เลยค่ะ 😊`
}

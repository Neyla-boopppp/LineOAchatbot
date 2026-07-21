// Flex Message / Quick Reply builders — pure module (ไม่พึ่ง LINE client / next)
// เพื่อทดสอบง่ายและ reuse ได้ เหมือน lib/line/menu.ts
//
// ⚠️ ข้อความในปุ่มทุกปุ่มต้อง match กับ lib/line/menu.ts ได้ (มีเทสผูกไว้ใน tests/flex.test.ts)
//    ถ้าแก้ข้อความปุ่มที่นี่ ต้องแก้ที่ menu.ts ด้วย ไม่งั้นปุ่มจะกดแล้วเงียบ

import type { messagingApi } from '@line/bot-sdk'

const BRAND_COLOR = '#E8A33D'
const TEXT_MUTED = '#8C8C8C'
const TEXT_MAIN = '#333333'

// ปุ่มท้ายการ์ดสิทธิ → ส่งข้อความเดียวกับปุ่ม Rich Menu "สวัสดิการและผลตอบแทน"
// เพื่อไหลเข้า intent 'benefits' เดิม (ดึงสวัสดิการรายตำแหน่งจาก Sheet)
export const PERKS_DETAIL_TEXT = 'สวัสดิการและผลตอบแทน'

// รายการสิทธิที่จะได้รับ
//
// ⚠️ แหล่งที่มา: คัดลอกจากคอลัมน์ `Benefit` ใน Google Sheet (ชีต Job_Vacancies) เมื่อ 2026-07-21
//    ห้ามแต่งตัวเลข/สวัสดิการเพิ่มเอง — ถ้า Sheet เปลี่ยน ต้องกลับมาแก้ที่นี่ด้วย
//    (ตอนคัดลอก คอลัมน์นี้มีข้อมูลเฉพาะแบรนด์ Khao So-i — Potato Corner ยังว่าง
//     จึงต้องไม่สื่อว่าทุกแบรนด์/ทุกตำแหน่งได้ครบทุกข้อ ดู caption ท้ายการ์ด)
//
// ไม่ใส่ "เงินเดือนเริ่มต้น" โดยตั้งใจ — ระบุไว้ในโพสรับสมัครแล้ว และอยากให้ผู้สมัครถามเข้ามาเอง
// เพื่อให้บอทตอบเป็นรายตำแหน่งจาก Sheet ได้ตรงกว่า
type Perk = { emoji: string; title: string; detail?: string }

const PERKS: Perk[] = [
  { emoji: '✨', title: 'Service Charge', detail: 'ตามผลประกอบการของร้าน' },
  { emoji: '🍚', title: 'ค่าอาหาร 910 บาท/เดือน' },
  { emoji: '💸', title: 'เบี้ยขยัน 700 บาท/เดือน', detail: 'กรณีไม่ขาด ลา มาสาย' },
  { emoji: '🏦', title: 'กองทุนสำรองเลี้ยงชีพ' },
  { emoji: '🏥', title: 'ประกันสังคม' },
  { emoji: '👕', title: 'ชุดยูนิฟอร์มพนักงาน' },
]

function perkRow(perk: Perk): messagingApi.FlexBox {
  // LINE ไม่รับ text ว่าง — ข้อไหนไม่มีคำขยายให้ตัดบรรทัดที่สองทิ้งไปเลย
  const lines: messagingApi.FlexComponent[] = [
    { type: 'text', text: perk.title, size: 'sm', weight: 'bold', color: TEXT_MAIN, wrap: true },
  ]
  if (perk.detail) {
    lines.push({ type: 'text', text: perk.detail, size: 'xs', color: TEXT_MUTED, wrap: true })
  }
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'md',
    contents: [
      { type: 'text', text: perk.emoji, size: 'lg', flex: 0 },
      {
        type: 'box',
        layout: 'vertical',
        spacing: 'none',
        contents: lines,
      },
    ],
  }
}

// Rich Menu "สิทธิที่จะได้รับ" — การ์ดสรุปสิ่งที่พนักงานจะได้รับแบบเน้นๆ
export function buildPerksFlex(): messagingApi.FlexMessage {
  return {
    type: 'flex',
    altText: 'สิทธิและสวัสดิการที่จะได้รับเมื่อร่วมงานกับ Rocks Group',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        paddingAll: 'lg',
        backgroundColor: BRAND_COLOR,
        contents: [
          { type: 'text', text: 'ร่วมงานกับ Rocks Group', size: 'xs', color: '#FFFFFFCC' },
          { type: 'text', text: 'ตัวอย่างสิทธิที่น้องๆ จะได้รับ ✨', size: 'lg', weight: 'bold', color: '#FFFFFF', wrap: true },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'lg',
        paddingAll: 'lg',
        contents: PERKS.map(perkRow),
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: 'lg',
        contents: [
          {
            type: 'button',
            style: 'primary',
            height: 'sm',
            color: BRAND_COLOR,
            action: { type: 'message', label: 'สวัสดิการตามตำแหน่ง', text: PERKS_DETAIL_TEXT },
          },
          {
            type: 'text',
            text: 'สวัสดิการต่างกันตามแบรนด์ ตำแหน่ง และสาขานะคะ\nอยากรู้ของตำแหน่งไหน ถามพี่ร็อคกี้ได้เลย 😊',
            size: 'xxs',
            color: TEXT_MUTED,
            wrap: true,
            align: 'center',
          },
        ],
      },
    },
  }
}

// คำถามยอดฮิตที่จะโชว์เป็นปุ่มกลม (Quick Reply)
// ข้อความ (text) ต้องตรงกับที่ detectRichMenuIntent() รู้จัก — label โชว์บนปุ่ม (LINE จำกัด 20 ตัวอักษร)
export const FAQ_QUICK_ITEMS: { label: string; text: string }[] = [
  { label: 'รับอายุเท่าไหร่?', text: 'รับอายุเท่าไหร่?' },
  { label: 'รับพาร์ทไทม์ไหม?', text: 'รับพาร์ทไทม์ไหม?' },
  { label: 'สิทธิที่จะได้รับ', text: 'สิทธิที่จะได้รับ' },
  { label: 'ใช้เอกสารอะไรบ้าง?', text: 'ใช้เอกสารอะไรบ้าง?' },
  { label: 'ตำแหน่งงานที่เปิดรับ', text: 'ตำแหน่งงานที่เปิดรับ' },
]

// Rich Menu "คำถามที่พบบ่อย" — ข้อความนำ + ปุ่มกลมให้กดเลือก
export function buildFaqQuickReply(text: string): messagingApi.TextMessage {
  return {
    type: 'text',
    text,
    quickReply: {
      items: FAQ_QUICK_ITEMS.map((item) => ({
        type: 'action',
        action: { type: 'message', label: item.label, text: item.text },
      })),
    },
  }
}

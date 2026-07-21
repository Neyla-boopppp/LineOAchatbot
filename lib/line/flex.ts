// Flex Message / Quick Reply builders — pure module (ไม่พึ่ง LINE client / next)
// เพื่อทดสอบง่ายและ reuse ได้ เหมือน lib/line/menu.ts
//
// ⚠️ ข้อความในปุ่มทุกปุ่มต้อง match กับ lib/line/menu.ts ได้ (มีเทสผูกไว้ใน tests/flex.test.ts)
//    ถ้าแก้ข้อความปุ่มที่นี่ ต้องแก้ที่ menu.ts ด้วย ไม่งั้นปุ่มจะกดแล้วเงียบ

import type { messagingApi } from '@line/bot-sdk'
import { APPLY_ONLINE_TEXT } from './menu'

const BRAND_COLOR = '#E8A33D'
const TEXT_MUTED = '#8C8C8C'
const TEXT_MAIN = '#333333'

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
      // ไม่มีปุ่มโดยตั้งใจ — ลูกค้าเลือกให้โชว์สวัสดิการกว้าง ๆ พอ ไม่ต้องเจาะรายตำแหน่ง
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: 'lg',
        contents: [
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

// ── Rich Menu "ตำแหน่งงานที่เปิดรับ" (RM1) — carousel 1 การ์ดต่อ 1 แบรนด์ ──
//
// ข้อจำกัดของ LINE ที่ต้องกันไว้ (เกินแล้ว LINE ตีกลับทั้งข้อความ ผู้ใช้จะเห็นบอทเงียบ):
//   • carousel ได้ไม่เกิน 12 bubble → cap ที่ MAX_BRANDS
//   • Flex ทั้งก้อนต้องไม่เกิน 50KB → cap สาขา/ตำแหน่งต่อการ์ด แล้วสรุปส่วนที่เกินเป็นบรรทัดเดียว
//   • label ของปุ่มยาวได้ไม่เกิน 20 ตัวอักษร
const MAX_BRANDS = 12
const MAX_BRANCHES_PER_BRAND = 8
const MAX_POSITIONS_PER_BRANCH = 6

export type BrandJobGroup = {
  brand: string
  branches: { branch: string; positions: string[] }[]
}

// ── โลโก้แบรนด์บนหัวการ์ด ──
//
// LINE ฝังไฟล์รูปลง Flex ไม่ได้ ต้องเป็น URL https สาธารณะเท่านั้น
// ไฟล์จึงอยู่ใน public/brands/ แล้วเสิร์ฟผ่านโดเมน production
// (ตั้ง NEXT_PUBLIC_BASE_URL ทับได้ เผื่อวันหน้าเปลี่ยนโดเมน)
const BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL ?? 'https://lineoa-chatbot.vercel.app').replace(/\/$/, '')

// สีพื้นต้องตรงกับพื้นหลังที่ติดมากับไฟล์โลโก้ เพราะใช้ aspectMode 'fit'
// (โลโก้แต่ละแบรนด์สัดส่วนไม่เท่ากัน ถ้าใช้ 'cover' โลโก้แนวยาวอย่าง Potato Corner จะโดนครอบตัด)
const BRAND_LOGOS: { match: string; file: string; background: string }[] = [
  { match: 'khaosoi', file: 'khao-so-i.png', background: '#5E4620' },
  { match: 'potatocorner', file: 'potato-corner.png', background: '#FFFFFF' },
  { match: 'uno', file: 'uno-coffee.png', background: '#E8E3C8' },
]

function brandLogo(brand: string): { url: string; background: string } | null {
  const n = brand.toLowerCase().replace(/[-\s!]+/g, '')
  const hit = BRAND_LOGOS.find((logo) => n.includes(logo.match))
  return hit ? { url: `${BASE_URL}/brands/${hit.file}`, background: hit.background } : null
}

// ปุ่มท้ายการ์ดแต่ละแบรนด์ → ส่งชื่อแบรนด์เข้า flow เก็บข้อมูลปกติ
// (ไม่ match Rich Menu intent ใด ๆ จึงไหลไป extractApplicationInfo แล้วถามตำแหน่ง/สาขาต่อ)
export function buildBrandInterestText(brand: string): string {
  return `สนใจสมัคร ${brand}`
}

// 1 สาขา = 1 กล่อง (ตำแหน่งชิดใต้ชื่อสาขา) — ระยะห่างระหว่างสาขาคุมที่กล่องนอก
// ถ้าปล่อยเป็น text เรียงกันเฉยๆ spacing ของ body จะดันทุกบรรทัดห่างเท่ากัน อ่านแล้วไม่จับกลุ่ม
function branchBlock(branch: string, positions: string[]): messagingApi.FlexBox {
  const shown = positions.slice(0, MAX_POSITIONS_PER_BRANCH)
  const rest = positions.length - shown.length
  const lines: messagingApi.FlexComponent[] = [
    { type: 'text', text: `📍 ${branch}`, size: 'sm', weight: 'bold', color: TEXT_MAIN, wrap: true },
  ]
  for (const position of shown) {
    lines.push({ type: 'text', text: `• ${position}`, size: 'xs', color: TEXT_MUTED, wrap: true })
  }
  if (rest > 0) {
    lines.push({ type: 'text', text: `• และอีก ${rest} ตำแหน่ง`, size: 'xs', color: TEXT_MUTED, wrap: true })
  }
  return { type: 'box', layout: 'vertical', spacing: 'none', contents: lines }
}

function brandBubble(group: BrandJobGroup): messagingApi.FlexBubble {
  const branches = group.branches.slice(0, MAX_BRANCHES_PER_BRAND)
  const hiddenBranches = group.branches.length - branches.length
  const totalPositions = group.branches.reduce((sum, b) => sum + b.positions.length, 0)

  const body: messagingApi.FlexComponent[] = branches.map((b) => branchBlock(b.branch, b.positions))
  if (hiddenBranches > 0) {
    body.push({ type: 'text', text: `และอีก ${hiddenBranches} สาขา`, size: 'xs', color: TEXT_MUTED, wrap: true })
  }

  const logo = brandLogo(group.brand)

  return {
    type: 'bubble',
    // แบรนด์ที่ยังไม่มีไฟล์โลโก้ → ไม่ใส่ hero ไปเลย (การ์ดยังใช้ได้ปกติ ไม่ขึ้นรูปเสีย)
    ...(logo && {
      hero: {
        type: 'image' as const,
        url: logo.url,
        size: 'full' as const,
        aspectRatio: '20:13',
        aspectMode: 'fit' as const,
        backgroundColor: logo.background,
      },
    }),
    header: {
      type: 'box',
      layout: 'vertical',
      paddingAll: 'lg',
      backgroundColor: BRAND_COLOR,
      contents: [
        { type: 'text', text: 'ตำแหน่งงานที่เปิดรับ', size: 'xs', color: '#FFFFFFCC' },
        { type: 'text', text: group.brand, size: 'lg', weight: 'bold', color: '#FFFFFF', wrap: true },
        { type: 'text', text: `${totalPositions} ตำแหน่ง`, size: 'xs', color: '#FFFFFFCC' },
      ],
    },
    body: { type: 'box', layout: 'vertical', spacing: 'md', paddingAll: 'lg', contents: body },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      paddingAll: 'lg',
      contents: [
        // เข้า flow บอท — เก็บบริบทแบรนด์ไว้ แล้วบอทถามตำแหน่ง/สาขาต่อ
        {
          type: 'button',
          style: 'primary',
          height: 'sm',
          color: BRAND_COLOR,
          action: { type: 'message', label: 'สนใจแบรนด์นี้', text: buildBrandInterestText(group.brand) },
        },
        // เลียนแบบการกดปุ่ม RM2 — บอทเงียบ แล้ว OA Manager เด้งการ์ดสมัครงานขึ้นมา
        // (ปุ่ม Flex สลับ Rich Menu เองไม่ได้ ดูคอมเมนต์ที่ APPLY_ONLINE_TEXT ใน menu.ts)
        {
          type: 'button',
          style: 'secondary',
          height: 'sm',
          action: { type: 'message', label: 'สมัครงานออนไลน์', text: APPLY_ONLINE_TEXT },
        },
      ],
    },
  }
}

// คืน null เมื่อไม่มีงานเปิดรับ — ให้ผู้เรียกตอบเป็นข้อความธรรมดาแทน (Flex ที่ไม่มี bubble ส่งไม่ได้)
export function buildJobsFlex(groups: BrandJobGroup[]): messagingApi.FlexMessage | null {
  const usable = groups.filter((g) => g.branches.length > 0).slice(0, MAX_BRANDS)
  if (usable.length === 0) return null

  const brandNames = usable.map((g) => g.brand).join(', ')
  return {
    type: 'flex',
    // altText โผล่ใน notification และประวัติแชต — ต้องอ่านรู้เรื่องโดยไม่ต้องเปิดการ์ด
    altText: `ตำแหน่งงานที่เปิดรับของ ${brandNames}`.slice(0, 400),
    contents: { type: 'carousel', contents: usable.map(brandBubble) },
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

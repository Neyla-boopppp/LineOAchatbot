// Rich Menu intent detection — ปุ่มเมนูส่ง label เป็นข้อความ (message action) เข้ามา
// แยกออกมาเป็น pure module (ไม่พึ่ง LINE SDK / next) เพื่อทดสอบง่ายและ reuse ได้

export type MenuIntent =
  | 'jobs'
  | 'docs'
  | 'contact'
  | 'benefits'
  | 'apply'
  | 'branches'
  | 'faq'
  | 'perks'        // Rich Menu ใหม่: การ์ดสรุปสิทธิที่จะได้รับ (Flex คงที่)
  | 'faq_age'      // Quick Reply: รับอายุเท่าไหร่
  | 'faq_parttime' // Quick Reply: รับพาร์ทไทม์ไหม

// ข้อความที่ปุ่ม Rich Menu (message action) อาจส่งมา — รับหลายรูปคำ (label form + keyword form)
// match แบบ normalize ทั้งข้อความ จึงปลอดภัยจาก false-positive (ผู้ใช้ต้องพิมพ์ตรงเป๊ะ)
// หมายเหตุ: 'ตำแหน่งงานที่เปิดรับ' ถูกย้ายไป SILENT_MENU_TEXTS แล้ว (RM1 — OA Manager ตอบด้วยการ์ด)
const RICH_MENU_JOBS_TEXTS = ['ตำแหน่งงานว่าง', 'ตำแหน่งงานว่างด่วน', 'งานว่างด่วน', 'ตำแหน่งที่เปิดรับ']
const RICH_MENU_DOCS_TEXTS = ['เอกสารที่จำเป็นต้องใช้ในการสมัคร', 'เอกสารจำเป็น', 'เอกสารที่จำเป็น']
const RICH_MENU_CONTACT_TEXTS = [
  'ติดต่อเจ้าหน้าที่', 'คุยกับเจ้าหน้าที่', 'ติดต่อ hr',
  // Rich Menu ชุดใหม่ (คาดการณ์ — แก้ให้ตรงกับ LINE OA Manager เมื่อสรุป label จริง)
  'ทิ้งข้อความถึง hr', 'ทิ้งข้อความไว้', 'สอบถามเพิ่มเติม', 'คุยกับพี่ hr',
]
// สวัสดิการรายตำแหน่ง (ดึงจากคอลัมน์ Benefit ใน Sheet) — ต้องรู้แบรนด์+ตำแหน่งก่อนถึงตอบได้
// หมายเหตุ: 'สวัสดิการและผลตอบแทน' ย้ายไป RICH_MENU_PERKS_TEXTS แล้ว (RM3 ให้ขึ้นการ์ดเลย ไม่ถามกลับ)
// 'สวัสดิการตามตำแหน่ง' = ข้อความจากปุ่มท้ายการ์ดสิทธิ (PERKS_DETAIL_TEXT ใน lib/line/flex.ts)
const RICH_MENU_BENEFITS_TEXTS = ['สวัสดิการตามตำแหน่ง', 'สวัสดิการและสิทธิประโยชน์', 'สวัสดิการ', 'ผลตอบแทน', 'สวัสดิการ/ผลตอบแทน']
// หมายเหตุ: 'สมัครงานออนไลน์' ถูกย้ายไป SILENT_MENU_TEXTS แล้ว (RM2 — OA Manager ตอบด้วยการ์ด)
// เหลือไว้เฉพาะรูปคำที่ผู้ใช้พิมพ์เอง ไม่ใช่ label ของปุ่ม Rich Menu
const RICH_MENU_APPLY_TEXTS = ['สมัครงาน', 'สมัครออนไลน์']
const RICH_MENU_BRANCHES_TEXTS = ['เช็คสาขาใกล้บ้านคุณ', 'เช็คสาขาใกล้บ้าน', 'เช็คสาขา', 'สาขาใกล้บ้าน']
const RICH_MENU_FAQ_TEXTS = ['คำถามที่พบบ่อย', 'คำถามที่พบบอย', 'faq', 'ถาม-ตอบ', 'คำถามยอดฮิต']

// RM3 → การ์ดสรุปสิทธิที่จะได้รับ (คนละอันกับ 'benefits' ที่ดึงรายตำแหน่งจาก Sheet)
// 'สวัสดิการและผลตอบแทน' = action text จริงของปุ่ม RM3 (ยืนยันจาก log จริง 2026-07-21)
const RICH_MENU_PERKS_TEXTS = ['สวัสดิการและผลตอบแทน', 'สิทธิที่จะได้รับ', 'สวัสดิการที่จะได้รับ', 'ทำงานกับเราได้อะไรบ้าง', 'สิ่งที่จะได้รับ']

// Quick Reply จากปุ่ม "คำถามที่พบบ่อย" — ต้องตรงกับ FAQ_QUICK_ITEMS ใน lib/line/flex.ts
const FAQ_AGE_TEXTS = ['รับอายุเท่าไหร่?', 'รับอายุเท่าไหร่', 'อายุเท่าไหร่รับสมัคร', 'รับสมัครอายุเท่าไหร่']
const FAQ_PARTTIME_TEXTS = ['รับพาร์ทไทม์ไหม?', 'รับพาร์ทไทม์ไหม', 'รับพาร์ทไทม์', 'มีพาร์ทไทม์ไหม', 'part-time']
const FAQ_DOCS_TEXTS = ['ใช้เอกสารอะไรบ้าง?', 'ใช้เอกสารอะไรบ้าง']

// ── ปุ่มที่ LINE OA Manager ตอบเอง (Card Message / Pop-up ลิงก์สมัคร) ──
// บอทต้องเงียบสนิท ไม่งั้นผู้ใช้จะเห็นข้อความบอทซ้อนการ์ดของ OA Manager
//
// ⚠️ บทเรียนสำคัญ: **ข้อความบนรูป Rich Menu ≠ action text ที่ปุ่มส่งจริง**
//    ปุ่ม RM1 รูปเขียนว่า "ค้นหาตำแหน่งงาน" แต่ส่งข้อความว่า 'ตำแหน่งงานที่เปิดรับ'
//    ห้ามเดาจาก Rich Menu.png — ต้องดูจาก log แชตจริงเท่านั้น
//    (ค่าด้านล่างยืนยันจาก log แชตจริงแล้ว 2026-07-21)
const SILENT_MENU_TEXTS = [
  'ตำแหน่งงานที่เปิดรับ', // RM1 (รูปเขียน "ค้นหาตำแหน่งงาน")
  'สมัครงานออนไลน์',      // RM2
]

// intent ที่อ่านอย่างเดียว (ไม่แตะ state) — ทำงานได้แม้อยู่โหมด handover
export const READ_ONLY_INTENTS: ReadonlySet<MenuIntent> = new Set<MenuIntent>([
  'jobs', 'docs', 'benefits', 'branches', 'faq', 'perks', 'faq_age', 'faq_parttime',
])

function normalizeMenu(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '')
}

// ปุ่มที่ OA Manager ตอบเอง → บอทต้องเงียบ (เช็คก่อน detectRichMenuIntent เสมอ)
export function isSilentMenuText(text: string): boolean {
  const n = normalizeMenu(text)
  return SILENT_MENU_TEXTS.some((t) => normalizeMenu(t) === n)
}

// match ข้อความทั้งก้อนกับชุดคำของปุ่ม (normalize) — คืน intent หรือ null
export function detectRichMenuIntent(text: string): MenuIntent | null {
  const n = normalizeMenu(text)
  if (FAQ_AGE_TEXTS.some((t) => normalizeMenu(t) === n)) return 'faq_age'
  if (FAQ_PARTTIME_TEXTS.some((t) => normalizeMenu(t) === n)) return 'faq_parttime'
  if (FAQ_DOCS_TEXTS.some((t) => normalizeMenu(t) === n)) return 'docs'
  if (RICH_MENU_PERKS_TEXTS.some((t) => normalizeMenu(t) === n)) return 'perks'
  if (RICH_MENU_JOBS_TEXTS.some((t) => normalizeMenu(t) === n)) return 'jobs'
  if (RICH_MENU_DOCS_TEXTS.some((t) => normalizeMenu(t) === n)) return 'docs'
  if (RICH_MENU_BENEFITS_TEXTS.some((t) => normalizeMenu(t) === n)) return 'benefits'
  if (RICH_MENU_APPLY_TEXTS.some((t) => normalizeMenu(t) === n)) return 'apply'
  if (RICH_MENU_BRANCHES_TEXTS.some((t) => normalizeMenu(t) === n)) return 'branches'
  if (RICH_MENU_FAQ_TEXTS.some((t) => normalizeMenu(t) === n)) return 'faq'
  if (RICH_MENU_CONTACT_TEXTS.some((t) => normalizeMenu(t) === n)) return 'contact'
  return null
}

// แปลง postback data → intent (เผื่ออนาคตเปลี่ยน Rich Menu เป็น postback action เช่น data="menu=jobs")
export function parsePostbackIntent(data: string | undefined): MenuIntent | null {
  if (!data) return null
  const d = data.toLowerCase()
  if (d.includes('job')) return 'jobs'
  if (d.includes('doc')) return 'docs'
  if (d.includes('perk')) return 'perks'
  if (d.includes('benefit') || d.includes('welfare')) return 'benefits'
  if (d.includes('apply') || d.includes('สมัคร')) return 'apply'
  if (d.includes('branch') || d.includes('สาขา')) return 'branches'
  if (d.includes('faq')) return 'faq'
  if (d.includes('contact') || d.includes('hr') || d.includes('staff')) return 'contact'
  return null
}

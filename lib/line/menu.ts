// Rich Menu intent detection — ปุ่มเมนูส่ง label เป็นข้อความ (message action) เข้ามา
// แยกออกมาเป็น pure module (ไม่พึ่ง LINE SDK / next) เพื่อทดสอบง่ายและ reuse ได้

export type MenuIntent = 'jobs' | 'docs' | 'contact' | 'benefits' | 'apply' | 'branches' | 'faq'

// ข้อความที่ปุ่ม Rich Menu (message action) อาจส่งมา — รับหลายรูปคำ (label form + keyword form)
// match แบบ normalize ทั้งข้อความ จึงปลอดภัยจาก false-positive (ผู้ใช้ต้องพิมพ์ตรงเป๊ะ)
const RICH_MENU_JOBS_TEXTS = ['ตำแหน่งงานว่าง', 'ตำแหน่งงานว่างด่วน', 'งานว่างด่วน', 'ตำแหน่งงานที่เปิดรับ', 'ตำแหน่งที่เปิดรับ']
const RICH_MENU_DOCS_TEXTS = ['เอกสารที่จำเป็นต้องใช้ในการสมัคร', 'เอกสารจำเป็น', 'เอกสารที่จำเป็น']
const RICH_MENU_CONTACT_TEXTS = ['ติดต่อเจ้าหน้าที่', 'คุยกับเจ้าหน้าที่', 'ติดต่อ hr']
const RICH_MENU_BENEFITS_TEXTS = ['สวัสดิการและผลตอบแทน', 'สวัสดิการและสิทธิประโยชน์', 'สวัสดิการ', 'ผลตอบแทน', 'สวัสดิการ/ผลตอบแทน']
const RICH_MENU_APPLY_TEXTS = ['สมัครงานออนไลน์', 'สมัครงาน', 'สมัครออนไลน์']
const RICH_MENU_BRANCHES_TEXTS = ['เช็คสาขาใกล้บ้านคุณ', 'เช็คสาขาใกล้บ้าน', 'เช็คสาขา', 'สาขาใกล้บ้าน']
const RICH_MENU_FAQ_TEXTS = ['คำถามที่พบบ่อย', 'คำถามที่พบบอย', 'faq']

// intent ที่อ่านอย่างเดียว (ไม่แตะ state) — ทำงานได้แม้อยู่โหมด handover
export const READ_ONLY_INTENTS: ReadonlySet<MenuIntent> = new Set<MenuIntent>(['jobs', 'docs', 'benefits', 'branches', 'faq'])

function normalizeMenu(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '')
}

// match ข้อความทั้งก้อนกับชุดคำของปุ่ม (normalize) — คืน intent หรือ null
export function detectRichMenuIntent(text: string): MenuIntent | null {
  const n = normalizeMenu(text)
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
  if (d.includes('benefit') || d.includes('welfare')) return 'benefits'
  if (d.includes('apply') || d.includes('สมัคร')) return 'apply'
  if (d.includes('branch') || d.includes('สาขา')) return 'branches'
  if (d.includes('faq')) return 'faq'
  if (d.includes('contact') || d.includes('hr') || d.includes('staff')) return 'contact'
  return null
}

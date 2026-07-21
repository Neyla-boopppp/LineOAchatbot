// จับสาขาเข้า "โซน" สำหรับ Rich Menu "เช็คสาขาใกล้บ้านคุณ"
// pure module (ไม่พึ่ง LINE SDK / next) เพื่อทดสอบง่าย — แบบเดียวกับ lib/line/menu.ts
//
// ⚠️ ทำไมต้องเดาจากชื่อสาขา: Sheet (types/job.ts) มีแค่คอลัมน์ `Branch` เป็นชื่อสาขา
//    ไม่มีที่อยู่ ไม่มีพิกัด lat/lng จึงคำนวณระยะทางจริงไม่ได้ ต้องจัดกลุ่มเป็นย่านแทน
//    ถ้าวันหน้าเพิ่มคอลัมน์พิกัดใน Sheet ค่อยเปลี่ยนไปเรียงตามระยะทางจริงได้

export type ZoneId = 'thon' | 'central' | 'east' | 'north' | 'peri' | 'other'

export type Zone = { id: Exclude<ZoneId, 'other'>; label: string; keywords: string[] }

// label ยาวได้ไม่เกิน 20 ตัวอักษร (ลิมิต label ของ Quick Reply) — มีเทสคุมไว้
// keyword ห้ามซ้ำข้ามโซน ไม่งั้นผลลัพธ์จะขึ้นกับลำดับ (มีเทสคุมเช่นกัน)
export const ZONES: Zone[] = [
  {
    id: 'thon',
    label: '🌉 ฝั่งธนบุรี',
    keywords: [
      'ปิ่นเกล้า', 'pinklao', 'ไอคอนสยาม', 'iconsiam', 'พระราม2', 'rama2',
      'บางแค', 'bangkae', 'ท่าพระ', 'thaphra', 'เพชรเกษม', 'phetkasem',
      'ราชพฤกษ์', 'ratchaphruek', 'ตลาดพลู', 'จรัญ',
    ],
  },
  {
    id: 'central',
    label: '🏙️ ใจกลางเมือง',
    keywords: [
      'สยาม', 'siam', 'พารากอน', 'paragon', 'mbk', 'ชิดลม', 'chidlom',
      'ราชประสงค์', 'เซ็นทรัลเวิลด์', 'centralworld', 'สีลม', 'silom',
      'สาทร', 'sathorn', 'อโศก', 'asok', 'terminal21', 'ทองหล่อ', 'thonglor',
      'เอกมัย', 'ekkamai', 'เอ็มควอเทียร์', 'emquartier', 'เอ็มโพเรียม', 'emporium',
      'พร้อมพงษ์', 'phromphong', 'เพลินจิต', 'ploenchit', 'ปทุมวัน',
    ],
  },
  {
    id: 'east',
    label: '🌇 กทม. ตะวันออก',
    keywords: [
      'พระราม9', 'rama9', 'รัชดา', 'ratchada', 'บางนา', 'bangna',
      'อ่อนนุช', 'onnut', 'อุดมสุข', 'udomsuk', 'สุขุมวิท50', 'sukhumvit50',
      'ศรีนครินทร์', 'srinakarin', 'ซีคอน', 'seacon', 'รามคำแหง', 'ramkhamhaeng',
      'มีนบุรี', 'minburi', 'แฟชั่นไอส์แลนด์', 'fashionisland',
    ],
  },
  {
    id: 'north',
    label: '🌆 กทม. เหนือ',
    keywords: [
      'จตุจักร', 'chatuchak', 'ลาดพร้าว', 'ladprao', 'แจ้งวัฒนะ', 'chaengwattana',
      'ดอนเมือง', 'donmuang', 'หลักสี่', 'laksi', 'เกษตร', 'kaset',
      'รัชโยธิน', 'ratchayothin', 'วงศ์สว่าง',
    ],
  },
  {
    id: 'peri',
    label: '🚉 ปริมณฑล',
    keywords: [
      'นนทบุรี', 'nonthaburi', 'ปทุมธานี', 'pathumthani', 'รังสิต', 'rangsit',
      'สมุทรปราการ', 'samutprakan', 'บางใหญ่', 'bangyai', 'แคราย', 'khaerai',
      'งามวงศ์วาน', 'ngamwongwan', 'บางพลี', 'bangphli', 'สำโรง', 'samrong',
      'ศาลายา', 'salaya',
    ],
  },
]

export const OTHER_ZONE_LABEL = '🗺️ พื้นที่อื่น ๆ'

// ลำดับที่จะโชว์ปุ่ม — 'other' อยู่ท้ายสุดเสมอ
export const ZONE_IDS: ZoneId[] = [...ZONES.map((z) => z.id), 'other']

// label มีอิโมจินำหน้าเพื่อให้ปุ่มกวาดตาเจอง่าย
export function zoneLabel(id: ZoneId): string {
  return ZONES.find((z) => z.id === id)?.label ?? OTHER_ZONE_LABEL
}

// ชื่อโซนแบบไม่มีอิโมจิ — ใช้ตอนแทรกในประโยค ("สาขาในโซนฝั่งธนบุรี")
export function zoneName(id: ZoneId): string {
  return zoneLabel(id).replace(/^\S+\s*/, '')
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '')
}

// จับชื่อสาขา → โซน โดยใช้กติกา "keyword ที่ยาวที่สุดชนะ" (ลอกแพตเทิร์นจาก
// detectPositionSynonym() ใน app/api/webhook/route.ts) ไม่ใช่ไล่ตามลำดับโซน
//
// ⚠️ จำเป็นจริง ๆ: 'ไอคอนสยาม (ICONSIAM)' มีคำว่า 'สยาม' ของโซนใจกลางเมืองซ่อนอยู่ข้างใน
//    ถ้าไล่ตามลำดับ ไอคอนสยามจะหลุดไปอยู่ผิดฝั่งแม่น้ำ
export function detectZone(branch: string): ZoneId {
  const n = normalize(branch)
  if (!n) return 'other'

  let best: { id: ZoneId; len: number } | null = null
  for (const zone of ZONES) {
    for (const keyword of zone.keywords) {
      const k = normalize(keyword)
      if (n.includes(k) && (!best || k.length > best.len)) {
        best = { id: zone.id, len: k.length }
      }
    }
  }
  return best?.id ?? 'other'
}

// ── postback ของปุ่มโซน ──
// ใช้ postback ไม่ใช่ message action เพื่อไม่ให้ชื่อโซนไปชนกับ intent ข้อความ/flow AI
const ZONE_POSTBACK_PREFIX = 'menu=zone&zone='

export function zonePostbackData(id: ZoneId): string {
  return `${ZONE_POSTBACK_PREFIX}${id}`
}

// คืน null เมื่อไม่ใช่ postback ของโซน — ให้ parsePostbackIntent() จัดการต่อ
export function parseZonePostback(data: string | undefined): ZoneId | null {
  if (!data) return null
  const value = new URLSearchParams(data).get('zone')
  if (!value) return null
  return ZONE_IDS.includes(value as ZoneId) ? (value as ZoneId) : null
}

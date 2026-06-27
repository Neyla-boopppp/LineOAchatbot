import Groq from 'groq-sdk'

const DEFAULT_REPLY = 'คำถามนี้ขอส่งต่อให้ HR ดูแลค่ะ กรุณารอสักครู่นะคะ 😊'
const NOT_IN_DATA = '__NOT_IN_DATA__'

let client: Groq | null = null

function getClient(): Groq {
  if (!client) {
    client = new Groq({ apiKey: process.env.GROQ_API_KEY })
  }
  return client
}

const SYSTEM_PROMPT_TEMPLATE = `<role>
คุณคือพี่ร็อคกี้ (Rockie) พนักงาน HR ของบริษัท Rocksgroup ดูแลแบรนด์ Potato Corner, Khao So-i และ Uno Coffee
</role>

<database_rules>
⚠️ กฎเหล็กในการใช้ฐานข้อมูล — ต้องปฏิบัติตามทุกข้อก่อนตอบคำถามทุกครั้ง:

ขั้นที่ 1 — สแกนทุกแถวในตาราง <jobs> ตั้งแต่ต้นจนจบก่อนสรุปผล
  • อ่านคอลัมน์ "ตำแหน่ง" และ "สาขา" ทุกแถวอย่างละเอียด
  • ค้นหาแบบ case-insensitive และ partial match เช่น ผู้ใช้พิมพ์ "service" ให้ match กับ "Service Staff"

ขั้นที่ 2 — ห้ามปฏิเสธว่าไม่มีข้อมูลหากพบแถวที่ตรงกัน
  • ถ้าพบตำแหน่งที่ผู้ใช้ถามในตาราง ไม่ว่าจะสะกดต่างกันเล็กน้อย → ต้องดึงข้อมูลแถวนั้นมาตอบทันที
  • ห้ามคิดเองหรือตัดสินว่า "ไม่มีข้อมูล" โดยไม่ได้ scan ทุกแถวจริงๆ

ขั้นที่ 3 — ใช้เฉพาะข้อมูลจากตาราง ห้ามแต่งเติม
  • ชื่อตำแหน่ง ชื่อสาขา เงินเดือน สถานะ — ต้องคงไว้ตรงตามที่ปรากฏในตาราง ห้ามเปลี่ยนแม้แต่ตัวเดียว
  • ถ้าค้นหาทุกแถวแล้วไม่พบข้อมูลที่ตรงกับคำถามจริงๆ → ตอบว่า "${NOT_IN_DATA}" เท่านั้น
</database_rules>

<constraints>
- เมื่อกล่าวถึงตำแหน่งใดๆ ให้ระบุชื่อสาขาควบคู่เสมอ เช่น "Service Staff สาขาไอคอนสยาม"
- ถ้า <jobs> มีหลายตำแหน่งในสาขาเดียวกัน (เช่น TM และ Senior TM สาขาสยาม) และสถานะเหมือนกันทั้งหมด → ให้สรุปรวมเป็น 1-2 ประโยคเท่านั้น เช่น "ขณะนี้ตำแหน่ง TM และ Senior TM สาขาสยาม ปิดรับสมัครทั้งหมดค่ะ" ห้ามอธิบายแยกทีละบรรทัด
- ถ้า <jobs> มีหลายสาขาที่แตกต่างกัน หรือสถานะต่างกัน → แสดงแยกตามสาขา ทีละบรรทัด
- ห้ามระบุเงินเดือนในคำตอบ ถ้าผู้สมัครไม่ได้ถามเรื่องเงินเดือนโดยตรง
- ถ้าผู้ใช้ทักทายหรือพูดคุยทั่วไป (เช่น "สวัสดี", "ขอบคุณ", "โอเค", "ดีมากค่ะ") → ตอบรับอย่างสุภาพเป็นกันเองและถามต่อว่า "มีข้อมูลส่วนไหนให้พี่ร็อคกี้ช่วยตรวจสอบไหมคะ?" ห้ามปฏิเสธหรือส่งต่อ HR ทันที
- ถ้าคำถามไม่เกี่ยวกับการสมัครงานของ Rocksgroup เลย (เช่น ข่าวสาร, สูตรอาหาร, ความรู้ทั่วไป) → ตอบสุภาพว่าไม่สามารถช่วยได้ และแนะนำให้กลับมาถามเรื่องสมัครงานแทน
- ใช้ภาษาเป็นกันเอง สุภาพ มืออาชีพ ใส่ emoji เล็กน้อย
- ตอบตรงประเด็น ไม่อ้อมค้อม ไม่ใช้ markdown
</constraints>

<rich_menu_rules>
=== การจัดการ Intent จาก Rich Menu ===
หากผู้ใช้พิมพ์คีย์เวิร์ดที่มาจากปุ่ม Rich Menu ให้ตอบกลับตามกฎนี้เท่านั้น:

1. หากผู้ใช้พิมพ์: "ตำแหน่งงานว่าง"
   Action: ให้ตรวจสอบฐานข้อมูล และสรุปแบรนด์หรือตำแหน่งที่กำลัง "เปิดรับสมัคร" มาแสดงให้ลูกค้าดูอย่างเป็นระเบียบและน่าอ่าน
2. หากผู้ใช้พิมพ์: "เอกสารที่จำเป็นต้องใช้ในการสมัคร"
   Action: ให้ตอบกลับด้วยรูปแบบข้อความนี้ทันที:
   "ถ้าเป็นคนสัญชาติไทยเตรียมเอกสารตามนี้นะคะ 😊
   1. รูปถ่าย
   2. สำเนาบัตรประชาชน
   3. สำเนาทะเบียนบ้าน
   4. สำเนาวุฒิ
   5. Book Bank ธนาคารกสิกรไทย

   แต่ถ้าไม่ใช่คนสัญชาติไทย รบกวนเตรียมเอกสารให้เจ้าหน้าที่ 4 อย่างนะคะ
   1. วีซ่า
   2. พาสปอร์ต
   3. ใบอนุญาตทำงาน
   4. Smart card บัตรอนุญาตทำงาน"
</rich_menu_rules>

<output_format>ภาษาไทย ไม่ใช้ markdown</output_format>`

export async function generateReply(
  jobsText: string,
  question: string
): Promise<string | null> {
  const groq = getClient()
  const systemPrompt = `${SYSTEM_PROMPT_TEMPLATE}\n<jobs>\n${jobsText}\n</jobs>`

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1024,
      temperature: 0.1,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `<question>${question}</question>` },
      ],
    })

    const choice = completion.choices[0]
    const finishReason = choice?.finish_reason
    const reply = choice?.message?.content?.trim() ?? ''

    console.log('[groq:pass1]', {
      question,
      finish_reason: finishReason,
      prompt_tokens: completion.usage?.prompt_tokens,
      completion_tokens: completion.usage?.completion_tokens,
    })

    if (finishReason === 'length') {
      console.warn('[groq:pass1] MAX_TOKENS reached → using default reply')
      return DEFAULT_REPLY
    }

    if (reply.includes(NOT_IN_DATA)) {
      return null
    }

    return reply || null
  } catch (err) {
    console.error('[groq:pass1] Error:', err)
    return DEFAULT_REPLY
  }
}

export async function doubleCheck(
  jobsText: string,
  question: string,
  answer: string
): Promise<boolean> {
  const groq = getClient()

  const prompt = `สแกนทุกแถวในตาราง <jobs> ก่อน แล้วตรวจสอบว่า <answer> ผ่านเกณฑ์ทุกข้อหรือไม่:
1. ใช้ข้อมูลจาก <jobs> เท่านั้น ไม่มีข้อมูลแต่งเติม
2. ชื่อสาขา ตำแหน่ง เงินเดือน สถานะ ตรงกับ <jobs> ทุกตัว ไม่มีการเปลี่ยนแปลง
3. ตอบตรงประเด็นกับ <question>
4. ถ้าตาราง <jobs> มีแถวที่ตรงกับคำถาม แต่ <answer> บอกว่าไม่มีข้อมูล → NOT_OK ทันที

<question>${question}</question>
<answer>${answer}</answer>
<jobs>
${jobsText}
</jobs>

ตอบด้วย OK หรือ NOT_OK เท่านั้น`

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 10,
      temperature: 0,
      messages: [
        { role: 'system', content: 'คุณคือผู้ตรวจสอบความถูกต้องของคำตอบ ตอบด้วย OK หรือ NOT_OK เท่านั้น' },
        { role: 'user', content: prompt },
      ],
    })

    const result = completion.choices[0]?.message?.content?.trim() ?? ''
    const passed = result.toUpperCase().includes('OK') && !result.toUpperCase().includes('NOT_OK')

    console.log('[groq:pass2]', { result, passed })
    return passed
  } catch (err) {
    console.error('[groq:pass2] Error:', err)
    return false
  }
}

export type ExtractedInfo = {
  brand: string | null
  position: string | null
  branch: string | null
}

export type KnownJobValues = {
  branches?: string[]
  positions?: string[]
}

export async function extractApplicationInfo(text: string, known?: KnownJobValues, history?: string[]): Promise<ExtractedInfo> {
  const groq = getClient()

  const knownHint =
    known && (known.branches?.length || known.positions?.length)
      ? `\nชื่อที่มีในระบบจริง (ให้ map ชื่อที่ผู้ใช้พิมพ์ไปหาชื่อในรายการนี้ที่ใกล้เคียงที่สุด แม้จะเป็นคนละภาษา):
${known.branches?.length ? `สาขา: ${known.branches.join(', ')}` : ''}
${known.positions?.length ? `ตำแหน่ง: ${known.positions.join(', ')}` : ''}`
      : ''

  const historyHint = history?.length
    ? `\nบริบทการสนทนาก่อนหน้า (ข้อความล่าสุดของผู้ใช้):\n${history.map((h, i) => `${i + 1}. ${h}`).join('\n')}`
    : ''

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 150,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `แบรนด์ที่มีในระบบ: Potato Corner, Khao So-i, Uno Coffee
ดึงข้อมูลจากข้อความผู้สมัครงาน ตอบ JSON เท่านั้น:
{"brand": "ชื่อแบรนด์หรือ null", "position": "ตำแหน่งงานหรือ null", "branch": "ชื่อสาขาเท่านั้นหรือ null"}
กฎสำคัญ:
- branch: ตัดคำนำหน้าอย่าง "สาขา" ออก เช่น "สาขาไอคอนสยาม" → "ไอคอนสยาม"
- position: ถ้ามีรายการตำแหน่งให้ไว้ด้านล่าง ให้คืนชื่อจากรายการนั้นเท่านั้น ห้ามแต่งเพิ่มหรือแปล
- ถ้าไม่มีข้อมูลในข้อความปัจจุบัน ให้ดูจากบริบทก่อนหน้า (ถ้ามี)
- ถ้าไม่มีข้อมูลให้ใส่ null${knownHint}${historyHint}`,
        },
        { role: 'user', content: text },
      ],
    })

    const raw = completion.choices[0]?.message?.content?.trim() ?? '{}'
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const clean = (v: unknown): string | null =>
      v && typeof v === 'string' && v.toLowerCase() !== 'null' ? v.trim() : null

    console.log('[groq:extract]', { text, parsed })
    return {
      brand: clean(parsed.brand),
      position: clean(parsed.position),
      branch: clean(parsed.branch),
    }
  } catch (err) {
    console.error('[groq:extract] Error:', err)
    return { brand: null, position: null, branch: null }
  }
}

// Map ชื่อสาขาที่ผู้ใช้พิมพ์ (อาจเป็นภาษาไทย) ไปหาชื่อสาขาที่มีใน Sheet จริง
export async function resolveBranchName(
  userInput: string,
  knownBranches: string[]
): Promise<string | null> {
  if (!knownBranches.length) return null
  const groq = getClient()
  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 60,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `รายชื่อสาขาในระบบ (คัดลอกชื่อจากรายการนี้เท่านั้น ห้ามแต่งเพิ่ม):
${knownBranches.map((b, i) => `${i + 1}. ${b}`).join('\n')}

ผู้ใช้พิมพ์ชื่อสาขา ให้เลือกสาขาจากรายการข้างบนที่ตรงกับที่ผู้ใช้หมายถึงที่สุด (แม้จะสะกดต่างกันหรือเป็นคนละภาษา)
ถ้าไม่มีสาขาที่ตรงในรายการ → ตอบ NOT_FOUND เท่านั้น
ตอบด้วยชื่อสาขาจากรายการ คัดลอกมาทั้งคำรวมวงเล็บ`,
        },
        { role: 'user', content: userInput },
      ],
    })
    const result = completion.choices[0]?.message?.content?.trim() ?? ''
    console.log('[groq:resolveBranch]', { userInput, result })
    if (!result || result.toUpperCase().includes('NOT_FOUND')) return null

    const norm = (s: string) => s.toLowerCase().replace(/[-\s()]+/g, '')
    // ดึงส่วน English ออกจากวงเล็บ เช่น "ไอคอนสยาม (ICONSIAM)" → "ICONSIAM"
    const englishPart = (s: string) => { const m = s.match(/\(([^)]+)\)/); return m ? m[1] : s }

    // 1. exact case-insensitive
    const exact = knownBranches.find((b) => b.toLowerCase() === result.toLowerCase())
    if (exact) return exact

    // 2. normalize ทั้งคำ (ตัด space/hyphen/วงเล็บ)
    const byNorm = knownBranches.find((b) => norm(b) === norm(result))
    if (byNorm) return byNorm

    // 3. match กับส่วน English ในวงเล็บ ("ไอคอนสยาม (ICONSIAM)" vs Groq คืน "ICONSIAM")
    const byEnglish = knownBranches.find((b) => norm(englishPart(b)) === norm(result))
    if (byEnglish) return byEnglish

    // 4. partial match ทั้งสองทิศทาง
    const byPartial = knownBranches.find((b) =>
      norm(b).includes(norm(result)) || norm(result).includes(norm(b)) ||
      norm(englishPart(b)).includes(norm(result)) || norm(result).includes(norm(englishPart(b)))
    )
    return byPartial ?? null
  } catch (err) {
    console.error('[groq:resolveBranch] Error:', err)
    return null
  }
}

export type ScreeningResult = {
  isThai: boolean | null
  age: number | null
}

export async function extractScreeningInfo(text: string): Promise<ScreeningResult> {
  const groq = getClient()
  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 80,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `ดึงข้อมูลจากข้อความ ตอบ JSON เท่านั้น:
{"isThai": true/false/null, "age": number/null}
- isThai: true ถ้าสัญชาติไทย, false ถ้าไม่ใช่ไทย, null ถ้าไม่ระบุ
- age: อายุเป็นตัวเลข, null ถ้าไม่ระบุ`,
        },
        { role: 'user', content: text },
      ],
    })
    const raw = completion.choices[0]?.message?.content?.trim() ?? '{}'
    const parsed = JSON.parse(raw) as Record<string, unknown>
    console.log('[groq:screening]', { text, parsed })
    return {
      isThai: typeof parsed.isThai === 'boolean' ? parsed.isThai : null,
      age: typeof parsed.age === 'number' ? parsed.age : null,
    }
  } catch (err) {
    console.error('[groq:screening] Error:', err)
    return { isThai: null, age: null }
  }
}

export { DEFAULT_REPLY }

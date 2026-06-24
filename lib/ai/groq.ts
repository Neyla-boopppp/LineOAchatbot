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
คุณคือพี่ร็อคกี้ (Rockie) พนักงาน HR ของบริษัท Rocksgroup
ดูแลแบรนด์ Potato Corner, Khao-So-i และ Uno Coffee
</role>
<constraints>
- ตอบโดยใช้ข้อมูลใน <jobs> เท่านั้น ห้ามแต่งเติมหรือสมมติข้อมูลที่ไม่มีใน <jobs>
- ห้ามเปลี่ยนชื่อตำแหน่ง ชื่อสาขา เงินเดือน หรือสถานะไม่ว่ากรณีใดๆ
- เมื่อกล่าวถึงตำแหน่งใดๆ ให้ระบุชื่อสาขาควบคู่เสมอ เช่น "Head Chef สาขาไอคอนสยาม"
- ถ้า <jobs> มีหลายตำแหน่ง ให้แสดงทุกรายการใน <jobs> ครบถ้วนทุกตำแหน่ง ห้ามข้าม ห้ามสรุปรวม แม้จะมีหลายรายการ
- เรียงรายการแบบ "ชื่อตำแหน่ง สาขาXXX" ทีละบรรทัด
- ถ้าข้อมูลใน <jobs> ไม่เพียงพอตอบคำถาม → ตอบว่า "${NOT_IN_DATA}" เท่านั้น ไม่ต้องเพิ่มข้อความอื่น
- ห้ามระบุเงินเดือนในคำตอบ ถ้าผู้สมัครไม่ได้ถามเรื่องเงินเดือนโดยตรง
- ถ้าคำถามไม่เกี่ยวกับงานหรือการสมัครงานของ Rocks Group → ตอบสุภาพว่าไม่สามารถช่วยได้ และแนะนำให้กลับมาถามเรื่องสมัครงานแทน
- ใช้ภาษาเป็นกันเอง สุภาพ มืออาชีพ ใส่ emoji เล็กน้อย
- ตอบตรงประเด็น ไม่อ้อมค้อม ไม่ใช้ markdown
</constraints>
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
      temperature: 0.7,
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

  const prompt = `ตรวจสอบว่าคำตอบต่อไปนี้ผ่านเกณฑ์ทุกข้อหรือไม่:
1. ใช้ข้อมูลจาก <jobs> เท่านั้น ไม่มีข้อมูลแต่งเติม
2. ชื่อสาขา ตำแหน่ง เงินเดือน สถานะ ตรงกับ <jobs> ทุกตัว ไม่มีการเปลี่ยนแปลง
3. ตอบตรงประเด็นกับ <question>

<question>${question}</question>
<answer>${answer}</answer>
<jobs>${jobsText}</jobs>

ตอบด้วย OK หรือ NOT_OK เท่านั้น`

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 10,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
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

export async function extractApplicationInfo(text: string): Promise<ExtractedInfo> {
  const groq = getClient()
  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 150,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `แบรนด์ที่มีในระบบ: Potato Corner, Khao-So-i, Uno Coffee
ดึงข้อมูลจากข้อความผู้สมัครงาน ตอบ JSON เท่านั้น:
{"brand": "ชื่อแบรนด์หรือ null", "position": "ตำแหน่งงานหรือ null", "branch": "สาขาหรือ null"}
ถ้าไม่มีข้อมูลให้ใส่ null`,
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

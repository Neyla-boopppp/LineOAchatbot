import { beforeEach, describe, expect, it, vi } from 'vitest'

const { constructorOptions, generateContent } = vi.hoisted(() => ({
  constructorOptions: [] as unknown[],
  generateContent: vi.fn(),
}))

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    constructor(options: unknown) {
      constructorOptions.push(options)
    }

    models = { generateContent }
  },
}))

import {
  DEFAULT_REPLY,
  doubleCheck,
  extractApplicationInfo,
  extractScreeningInfo,
  generateReply,
  isRetriableError,
  resolveBranchName,
} from '../lib/ai/chatbot-ai'

// error จริงที่เจอบน production 2026-07-21 — Gemini คืน 503 รัวๆ ตอน 21:17-21:18
const GEMINI_503 = Object.assign(
  new Error('{"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.","status":"UNAVAILABLE"}}'),
  { status: 503 },
)

describe('isRetriableError — แยก error ชั่วคราวออกจาก error ถาวร', () => {
  it('503 UNAVAILABLE จาก Gemini (เคสจริงบน production) → retry ได้', () => {
    expect(isRetriableError(GEMINI_503)).toBe(true)
  })

  it('รู้จัก 429 / RESOURCE_EXHAUSTED / OVERLOADED', () => {
    expect(isRetriableError({ status: 429 })).toBe(true)
    expect(isRetriableError(new Error('RESOURCE_EXHAUSTED: quota'))).toBe(true)
    expect(isRetriableError(new Error('model is OVERLOADED'))).toBe(true)
  })

  it('error ถาวรไม่ retry (กันหน่วงเวลาเปล่าจน reply token หมดอายุ)', () => {
    expect(isRetriableError({ status: 400, message: 'Invalid argument' })).toBe(false)
    expect(isRetriableError(new Error('bad request'))).toBe(false)
    expect(isRetriableError(null)).toBe(false)
  })
})

describe('generateWithRetry — Gemini ล่มชั่วคราวต้องไม่ทำให้บอทเงียบ', () => {
  beforeEach(() => {
    generateContent.mockReset()
    process.env.GEMINI_API_KEY = 'test-key'
  })

  it('เจอ 503 แล้วลองใหม่จนสำเร็จ', async () => {
    generateContent
      .mockRejectedValueOnce(GEMINI_503)
      .mockResolvedValueOnce({ text: JSON.stringify({ brand: 'Khao So-i', position: null, branch: null }) })

    const result = await extractApplicationInfo('แบรนด์ Khao Soi')

    expect(generateContent).toHaveBeenCalledTimes(2)
    expect(result.brand).toBe('Khao So-i')
    expect(result.failed).toBeUndefined()
  })

  it('503 ทุกครั้ง → ตั้ง failed:true ไม่ใช่คืน null เฉยๆ (กันบอทตอบ "ยังไม่ได้ระบุแบรนด์")', async () => {
    generateContent.mockRejectedValue(GEMINI_503)

    const result = await extractApplicationInfo('แบรนด์ Khao Soi ตำแหน่งล้างจาน')

    expect(generateContent).toHaveBeenCalledTimes(3) // ครั้งแรก + retry 2
    expect(result.failed).toBe(true)
    expect(result.brand).toBeNull()
  })

  it('error ถาวรไม่ retry', async () => {
    generateContent.mockRejectedValue(new Error('bad request'))

    const result = await extractApplicationInfo('ทดสอบ')

    expect(generateContent).toHaveBeenCalledTimes(1)
    expect(result.failed).toBe(true)
  })
})

describe('Gemini Developer API configuration', () => {
  beforeEach(() => {
    vi.resetModules()
    generateContent.mockReset()
    constructorOptions.length = 0
    delete process.env.GEMINI_API_KEY
    delete process.env.GOOGLE_API_KEY
    delete process.env.GOOGLE_GENAI_USE_VERTEXAI
  })

  it('uses a trimmed Gemini Developer API key and disables Vertex AI explicitly', async () => {
    process.env.GEMINI_API_KEY = '  developer-api-key  '
    generateContent.mockResolvedValue({ text: 'grounded reply' })

    const { generateReply } = await import('../lib/ai/chatbot-ai')

    await expect(generateReply('| jobs |', 'question')).resolves.toBe('grounded reply')
    expect(constructorOptions).toEqual([{ apiKey: 'developer-api-key', vertexai: false }])
  })

  it.each(['missing', 'blank'])('does not use ambient credentials when GEMINI_API_KEY is %s', async (state) => {
    if (state === 'blank') process.env.GEMINI_API_KEY = '   '
    process.env.GOOGLE_API_KEY = 'ambient-google-api-key'
    process.env.GOOGLE_GENAI_USE_VERTEXAI = 'true'

    const { DEFAULT_REPLY, generateReply } = await import('../lib/ai/chatbot-ai')

    await expect(generateReply('| jobs |', 'question')).resolves.toBe(DEFAULT_REPLY)
    expect(constructorOptions).toEqual([])
    expect(generateContent).not.toHaveBeenCalled()
  })
})

describe('Gemini chatbot adapter', () => {
  beforeEach(() => {
    generateContent.mockReset()
    process.env.GEMINI_API_KEY = 'test-key'
  })

  it('returns the grounded natural-language reply', async () => {
    generateContent.mockResolvedValue({
      text: 'เธ•เธญเธเธเธตเนเน€เธเธดเธ”เธฃเธฑเธเธชเธกเธฑเธเธฃเธญเธขเธนเนเธเนเธฐ',
      candidates: [{ finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
    })

    await expect(generateReply('| job data |', 'เน€เธเธดเธ”เธฃเธฑเธเนเธซเธก')).resolves.toBe(
      'เธ•เธญเธเธเธตเนเน€เธเธดเธ”เธฃเธฑเธเธชเธกเธฑเธเธฃเธญเธขเธนเนเธเนเธฐ',
    )
    expect(generateContent).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gemini-3.5-flash',
      contents: '<question>เน€เธเธดเธ”เธฃเธฑเธเนเธซเธก</question>',
      config: expect.objectContaining({ temperature: 0.1, maxOutputTokens: 1024 }),
    }))
  })

  it('returns null for the not-in-data marker', async () => {
    generateContent.mockResolvedValue({ text: '__NOT_IN_DATA__', candidates: [{ finishReason: 'STOP' }] })
    await expect(generateReply('(เนเธกเนเธกเธตเธเนเธญเธกเธนเธฅ)', 'เธ–เธฒเธกเธเนเธญเธกเธนเธฅเธ—เธตเนเนเธกเนเธกเธต')).resolves.toBeNull()
  })

  it('returns the existing fallback when reply generation fails', async () => {
    generateContent.mockRejectedValue(new Error('provider unavailable'))
    await expect(generateReply('| jobs |', 'เธเธณเธ–เธฒเธก')).resolves.toBe(DEFAULT_REPLY)
  })

  it.each([
    ['OK', true],
    [' ok ', true],
    ['NOT_OK', false],
    ['OK เน€เธเธฃเธฒเธฐเธเนเธญเธกเธนเธฅเธ•เธฃเธ', false],
  ])('accepts only an exact OK verification result: %s', async (text, expected) => {
    generateContent.mockResolvedValue({ text })
    await expect(doubleCheck('| jobs |', 'เธเธณเธ–เธฒเธก', 'เธเธณเธ•เธญเธ')).resolves.toBe(expected)
  })

  it('extracts application data using JSON response configuration', async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({ brand: 'Potato Corner', position: 'TM', branch: 'ICONSIAM' }),
    })

    await expect(extractApplicationInfo('เธชเธกเธฑเธเธฃ TM เธ—เธตเนเนเธญเธเธญเธเธชเธขเธฒเธก')).resolves.toEqual({
      brand: 'Potato Corner',
      position: 'TM',
      branch: 'ICONSIAM',
    })
    expect(generateContent).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({
        responseMimeType: 'application/json',
        responseJsonSchema: expect.objectContaining({ type: 'object' }),
      }),
    }))
  })

  it('returns null application fields when structured output is invalid', async () => {
    generateContent.mockResolvedValue({ text: '{invalid-json' })
    await expect(extractApplicationInfo('เธเนเธญเธเธงเธฒเธก')).resolves.toEqual({
      brand: null,
      position: null,
      branch: null,
      // JSON พังก็คือ "อ่านข้อความผู้ใช้ไม่ได้" เหมือนกัน — ต้องขอให้พิมพ์ใหม่
      // ไม่ใช่ไปตอบ "ยังไม่ได้ระบุแบรนด์" ทั้งที่ผู้ใช้อาจบอกมาครบแล้ว
      failed: true,
    })
  })

  it('accepts only a branch value present in the application list', async () => {
    generateContent.mockResolvedValue({ text: 'เนเธญเธเธญเธเธชเธขเธฒเธก (ICONSIAM)' })
    await expect(resolveBranchName('เนเธญเธเธญเธ', [
      'เนเธญเธเธญเธเธชเธขเธฒเธก (ICONSIAM)',
      'เธชเธขเธฒเธกเธเธฒเธฃเธฒเธเธญเธ',
    ])).resolves.toBe('เนเธญเธเธญเธเธชเธขเธฒเธก (ICONSIAM)')
  })

  it('extracts screening data using JSON response configuration', async () => {
    generateContent.mockResolvedValue({ text: JSON.stringify({ isThai: true, age: 25 }) })
    await expect(extractScreeningInfo('เนเธ—เธข เธญเธฒเธขเธธ 25')).resolves.toEqual({ isThai: true, age: 25 })
  })

  it('fails closed when verification throws', async () => {
    generateContent.mockRejectedValue(new Error('provider unavailable'))
    await expect(doubleCheck('| jobs |', 'เธเธณเธ–เธฒเธก', 'เธเธณเธ•เธญเธ')).resolves.toBe(false)
  })
})

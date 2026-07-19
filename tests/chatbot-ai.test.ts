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
  resolveBranchName,
} from '../lib/ai/chatbot-ai'

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

  it('retries on a transient 429 and returns the eventual reply', async () => {
    const err = Object.assign(new Error('429 RESOURCE_EXHAUSTED'), { status: 429 })
    generateContent
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({ text: 'recovered reply', candidates: [{ finishReason: 'STOP' }] })

    await expect(generateReply('| jobs |', 'question')).resolves.toBe('recovered reply')
    expect(generateContent).toHaveBeenCalledTimes(2)
  })

  it('does not retry non-retriable errors (e.g. 400)', async () => {
    generateContent.mockRejectedValue(Object.assign(new Error('400 INVALID_ARGUMENT'), { status: 400 }))

    await expect(generateReply('| jobs |', 'question')).resolves.toBe(DEFAULT_REPLY)
    expect(generateContent).toHaveBeenCalledTimes(1)
  })

  it('fails closed when verification throws', async () => {
    generateContent.mockRejectedValue(new Error('provider unavailable'))
    await expect(doubleCheck('| jobs |', 'เธเธณเธ–เธฒเธก', 'เธเธณเธ•เธญเธ')).resolves.toBe(false)
  })
})

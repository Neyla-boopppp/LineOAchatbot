import { beforeEach, describe, expect, it, vi } from 'vitest'

const { generateContent } = vi.hoisted(() => ({
  generateContent: vi.fn(),
}))

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
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
      model: 'gemini-2.5-flash',
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

  it('fails closed when verification throws', async () => {
    generateContent.mockRejectedValue(new Error('provider unavailable'))
    await expect(doubleCheck('| jobs |', 'เธเธณเธ–เธฒเธก', 'เธเธณเธ•เธญเธ')).resolves.toBe(false)
  })
})

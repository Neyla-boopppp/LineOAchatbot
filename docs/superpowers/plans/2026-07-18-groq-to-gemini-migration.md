# Groq to Gemini Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Groq with Gemini for every production LINE OA chatbot AI operation without changing the webhook, state machine, prompts, return contracts, or the Anthropic-powered Jeeb Team.

**Architecture:** Add a provider-neutral `lib/ai/chatbot-ai.ts` boundary that preserves the current exports while implementing them with the official `@google/genai` SDK and stable `gemini-2.5-flash`. Validate the adapter with mocked unit tests, switch the webhook import only after the adapter passes, then remove Groq and update configuration documentation.

**Tech Stack:** Next.js 14.2, TypeScript 5 strict mode, `@google/genai`, Gemini Developer API, Vitest, npm

## Global Constraints

- Use the stable model identifier `gemini-2.5-flash`; do not use preview, experimental, or `latest` aliases.
- Read the chatbot credential only from `GEMINI_API_KEY`.
- Do not change chatbot prompts, public function signatures, webhook routing, session state, screening logic, handover behavior, HR notifications, or Google Sheet behavior.
- Do not change `lib/ai/claude-agent.ts`, `lib/agents/**`, or `ANTHROPIC_API_KEY` behavior.
- Do not add provider switching, Groq fallback, retries, grounding, tools, file search, or live API tests.
- Verification must not call Gemini, LINE, Google Sheet, Vercel, or Anthropic.
- Do not rewrite or commit the local `.env`; only update `.env.example` and documentation.

---

## File Map

- Create `lib/ai/chatbot-ai.ts`: provider-neutral chatbot AI API implemented with Gemini.
- Create `tests/chatbot-ai.test.ts`: mocked behavioral contract tests for all five Gemini-backed operations.
- Modify `app/api/webhook/route.ts`: switch one import from `@/lib/ai/groq` to `@/lib/ai/chatbot-ai`.
- Delete `lib/ai/groq.ts`: remove the obsolete provider-specific implementation after cutover.
- Modify `package.json`: add `@google/genai` and Vitest, add the test script, remove `groq-sdk` after cutover.
- Modify `package-lock.json`: generated only by npm install/uninstall commands.
- Modify `.env.example`: replace `GROQ_API_KEY` with `GEMINI_API_KEY`.
- Modify `PROJECT_SUMMARY.md`: identify Gemini as the chatbot provider and update the file map and environment variable table.

---

### Task 1: Add and test the provider-neutral Gemini adapter

**Files:**
- Create: `lib/ai/chatbot-ai.ts`
- Create: `tests/chatbot-ai.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `process.env.GEMINI_API_KEY`; `GoogleGenAI.models.generateContent()` from `@google/genai`.
- Produces: `generateReply(jobsText: string, question: string): Promise<string | null>`.
- Produces: `doubleCheck(jobsText: string, question: string, answer: string): Promise<boolean>`.
- Produces: `extractApplicationInfo(text: string, known?: KnownJobValues, history?: string[]): Promise<ExtractedInfo>`.
- Produces: `resolveBranchName(userInput: string, knownBranches: string[]): Promise<string | null>`.
- Produces: `extractScreeningInfo(text: string): Promise<ScreeningResult>`.
- Produces: named exports `DEFAULT_REPLY`, `KnownJobValues`, `ExtractedInfo`, and `ScreeningResult` compatible with `lib/ai/groq.ts`.

- [ ] **Step 1: Install the Gemini SDK and test runner while keeping Groq temporarily**

Run:

```powershell
npm install @google/genai
npm install --save-dev vitest
```

Modify the `scripts` block in `package.json` to contain:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "test": "vitest run"
}
```

Expected: `@google/genai` appears in `dependencies`, `vitest` appears in `devDependencies`, `groq-sdk` remains installed until Task 2, and `package-lock.json` is updated by npm.

- [ ] **Step 2: Write the failing adapter contract tests**

Create `tests/chatbot-ai.test.ts`:

```ts
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
      text: 'ตอนนี้เปิดรับสมัครอยู่ค่ะ',
      candidates: [{ finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
    })

    await expect(generateReply('| job data |', 'เปิดรับไหม')).resolves.toBe(
      'ตอนนี้เปิดรับสมัครอยู่ค่ะ',
    )
    expect(generateContent).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gemini-2.5-flash',
      contents: '<question>เปิดรับไหม</question>',
      config: expect.objectContaining({ temperature: 0.1, maxOutputTokens: 1024 }),
    }))
  })

  it('returns null for the not-in-data marker', async () => {
    generateContent.mockResolvedValue({ text: '__NOT_IN_DATA__', candidates: [{ finishReason: 'STOP' }] })
    await expect(generateReply('(ไม่มีข้อมูล)', 'ถามข้อมูลที่ไม่มี')).resolves.toBeNull()
  })

  it('returns the existing fallback when reply generation fails', async () => {
    generateContent.mockRejectedValue(new Error('provider unavailable'))
    await expect(generateReply('| jobs |', 'คำถาม')).resolves.toBe(DEFAULT_REPLY)
  })

  it.each([
    ['OK', true],
    [' ok ', true],
    ['NOT_OK', false],
    ['OK เพราะข้อมูลตรง', false],
  ])('accepts only an exact OK verification result: %s', async (text, expected) => {
    generateContent.mockResolvedValue({ text })
    await expect(doubleCheck('| jobs |', 'คำถาม', 'คำตอบ')).resolves.toBe(expected)
  })

  it('extracts application data using JSON response configuration', async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({ brand: 'Potato Corner', position: 'TM', branch: 'ICONSIAM' }),
    })

    await expect(extractApplicationInfo('สมัคร TM ที่ไอคอนสยาม')).resolves.toEqual({
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
    await expect(extractApplicationInfo('ข้อความ')).resolves.toEqual({
      brand: null,
      position: null,
      branch: null,
    })
  })

  it('accepts only a branch value present in the application list', async () => {
    generateContent.mockResolvedValue({ text: 'ไอคอนสยาม (ICONSIAM)' })
    await expect(resolveBranchName('ไอคอน', [
      'ไอคอนสยาม (ICONSIAM)',
      'สยามพารากอน',
    ])).resolves.toBe('ไอคอนสยาม (ICONSIAM)')
  })

  it('extracts screening data using JSON response configuration', async () => {
    generateContent.mockResolvedValue({ text: JSON.stringify({ isThai: true, age: 25 }) })
    await expect(extractScreeningInfo('ไทย อายุ 25')).resolves.toEqual({ isThai: true, age: 25 })
  })

  it('fails closed when verification throws', async () => {
    generateContent.mockRejectedValue(new Error('provider unavailable'))
    await expect(doubleCheck('| jobs |', 'คำถาม', 'คำตอบ')).resolves.toBe(false)
  })
})
```

- [ ] **Step 3: Run the test to verify that the missing adapter fails**

Run:

```powershell
npm test -- tests/chatbot-ai.test.ts
```

Expected: FAIL because `../lib/ai/chatbot-ai` does not exist.

- [ ] **Step 4: Create the Gemini adapter by preserving prompts and contracts**

Create `lib/ai/chatbot-ai.ts` by copying `lib/ai/groq.ts` and applying these exact provider-boundary changes while leaving `SYSTEM_PROMPT_TEMPLATE`, `ExtractedInfo`, `KnownJobValues`, `ScreeningResult`, prompt text, branch normalization, and exported signatures unchanged.

Replace the import, constants, and client factory at the top with:

```ts
import { GoogleGenAI } from '@google/genai'

const DEFAULT_REPLY = 'คำถามนี้ขอส่งต่อให้ HR ดูแลค่ะ กรุณารอสักครู่นะคะ 😊'
const NOT_IN_DATA = '__NOT_IN_DATA__'
const MODEL = 'gemini-2.5-flash'

let client: GoogleGenAI | null = null

function getClient(): GoogleGenAI {
  if (!client) {
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  }
  return client
}

function responseText(response: { text?: string }): string {
  return response.text?.trim() ?? ''
}
```

Replace the Groq call in `generateReply` with:

```ts
const response = await getClient().models.generateContent({
  model: MODEL,
  contents: `<question>${question}</question>`,
  config: {
    systemInstruction: `${SYSTEM_PROMPT_TEMPLATE}\n<jobs>\n${jobsText}\n</jobs>`,
    maxOutputTokens: 1024,
    temperature: 0.1,
    thinkingConfig: { thinkingBudget: 0 },
  },
})

const finishReason = response.candidates?.[0]?.finishReason
const reply = responseText(response)
console.log('[chatbot-ai:reply]', {
  finish_reason: finishReason,
  prompt_tokens: response.usageMetadata?.promptTokenCount,
  completion_tokens: response.usageMetadata?.candidatesTokenCount,
})

if (finishReason === 'MAX_TOKENS') return DEFAULT_REPLY
if (reply.includes(NOT_IN_DATA)) return null
return reply || null
```

Do not log `question` or other user text in the new usage log. Preserve the existing `catch` return value, but rename its prefix to `[chatbot-ai:reply]`.

Replace the Groq call and result parsing in `doubleCheck` with:

```ts
const response = await getClient().models.generateContent({
  model: MODEL,
  contents: prompt,
  config: {
    systemInstruction: 'คุณคือผู้ตรวจสอบความถูกต้องของคำตอบ ตอบด้วย OK หรือ NOT_OK เท่านั้น',
    maxOutputTokens: 10,
    temperature: 0,
    thinkingConfig: { thinkingBudget: 0 },
  },
})

const result = responseText(response).toUpperCase()
const passed = result === 'OK'
console.log('[chatbot-ai:verify]', { result, passed })
return passed
```

Keep the current `catch` behavior of returning `false` and rename its log prefix to `[chatbot-ai:verify]`.

Use this schema in the existing `extractApplicationInfo` prompt call:

```ts
const response = await getClient().models.generateContent({
  model: MODEL,
  contents: text,
  config: {
    systemInstruction: `แบรนด์ที่มีในระบบ: Potato Corner, Khao So-i, Uno Coffee
ดึงข้อมูลจากข้อความผู้สมัครงาน ตอบ JSON เท่านั้น:
{"brand": "ชื่อแบรนด์หรือ null", "position": "ตำแหน่งงานหรือ null", "branch": "ชื่อสาขาเท่านั้นหรือ null"}
กฎสำคัญ:
- branch: ตัดคำนำหน้าอย่าง "สาขา" ออก เช่น "สาขาไอคอนสยาม" → "ไอคอนสยาม"
- position: ถ้ามีรายการตำแหน่งให้ไว้ด้านล่าง ให้คืนชื่อจากรายการนั้นเท่านั้น ห้ามแต่งเพิ่มหรือแปล
- ถ้าไม่มีข้อมูลในข้อความปัจจุบัน ให้ดูจากบริบทก่อนหน้า (ถ้ามี)
- ถ้าไม่มีข้อมูลให้ใส่ null${knownHint}${historyHint}`,
    maxOutputTokens: 150,
    temperature: 0,
    thinkingConfig: { thinkingBudget: 0 },
    responseMimeType: 'application/json',
    responseJsonSchema: {
      type: 'object',
      properties: {
        brand: { type: ['string', 'null'] },
        position: { type: ['string', 'null'] },
        branch: { type: ['string', 'null'] },
      },
      required: ['brand', 'position', 'branch'],
      additionalProperties: false,
    },
  },
})
const parsed = JSON.parse(responseText(response) || '{}') as Record<string, unknown>
```

Keep the existing `clean` function and null fallback. Replace the success log with `console.log('[chatbot-ai:extract]', { hasBrand: !!clean(parsed.brand), hasPosition: !!clean(parsed.position), hasBranch: !!clean(parsed.branch) })` so raw applicant text is not logged.

Replace the Groq call inside `resolveBranchName` with:

```ts
const response = await getClient().models.generateContent({
  model: MODEL,
  contents: userInput,
  config: {
    systemInstruction: `รายชื่อสาขาในระบบ (คัดลอกชื่อจากรายการนี้เท่านั้น ห้ามแต่งเพิ่ม):
${knownBranches.map((b, i) => `${i + 1}. ${b}`).join('\n')}

ผู้ใช้พิมพ์ชื่อสาขา ให้เลือกสาขาจากรายการข้างบนที่ตรงกับที่ผู้ใช้หมายถึงที่สุด (แม้จะสะกดต่างกันหรือเป็นคนละภาษา)
ถ้าไม่มีสาขาที่ตรงในรายการ → ตอบ NOT_FOUND เท่านั้น
ตอบด้วยชื่อสาขาจากรายการ คัดลอกมาทั้งคำรวมวงเล็บ`,
    maxOutputTokens: 60,
    temperature: 0,
    thinkingConfig: { thinkingBudget: 0 },
  },
})
const result = responseText(response)
console.log('[chatbot-ai:resolve-branch]', { matched: !!result && !result.toUpperCase().includes('NOT_FOUND') })
```

Keep the current `NOT_FOUND`, exact, normalized, parenthetical-English, partial-match, and `null` fallback logic unchanged.

Use this call in `extractScreeningInfo`:

```ts
const response = await getClient().models.generateContent({
  model: MODEL,
  contents: text,
  config: {
    systemInstruction: `ดึงข้อมูลจากข้อความ ตอบ JSON เท่านั้น:
{"isThai": true/false/null, "age": number/null}
- isThai: true ถ้าสัญชาติไทย, false ถ้าไม่ใช่ไทย, null ถ้าไม่ระบุ
- age: อายุเป็นตัวเลข, null ถ้าไม่ระบุ`,
    maxOutputTokens: 80,
    temperature: 0,
    thinkingConfig: { thinkingBudget: 0 },
    responseMimeType: 'application/json',
    responseJsonSchema: {
      type: 'object',
      properties: {
        isThai: { type: ['boolean', 'null'] },
        age: { type: ['number', 'null'] },
      },
      required: ['isThai', 'age'],
      additionalProperties: false,
    },
  },
})
const parsed = JSON.parse(responseText(response) || '{}') as Record<string, unknown>
console.log('[chatbot-ai:screening]', {
  hasNationality: typeof parsed.isThai === 'boolean',
  hasAge: typeof parsed.age === 'number',
})
```

Keep the current runtime type checks and `{ isThai: null, age: null }` fallback unchanged. Rename every remaining `[groq:*]` log prefix in the copied module to the corresponding `[chatbot-ai:*]` operation.

- [ ] **Step 5: Run the adapter tests**

Run:

```powershell
npm test -- tests/chatbot-ai.test.ts
```

Expected: 12 test cases PASS and no external request occurs because `@google/genai` is mocked.

- [ ] **Step 6: Type-check both old and new providers during the temporary overlap**

Run:

```powershell
npx tsc --noEmit --incremental false
```

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 7: Commit the tested adapter without switching production yet**

```powershell
git add package.json package-lock.json lib/ai/chatbot-ai.ts tests/chatbot-ai.test.ts
git commit -m "feat: add Gemini chatbot adapter"
```

Expected: one commit containing the isolated adapter, tests, and additive dependencies; production still imports Groq.

---

### Task 2: Cut the production webhook over to Gemini and remove Groq

**Files:**
- Modify: `app/api/webhook/route.ts:5`
- Delete: `lib/ai/groq.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: the exports created in Task 1 from `@/lib/ai/chatbot-ai`.
- Produces: the unchanged webhook handler using Gemini through the provider-neutral boundary.

- [ ] **Step 1: Add a source-level regression assertion before cutover**

Run:

```powershell
rg -n "@/lib/ai/groq|groq-sdk|GROQ_API_KEY" app lib package.json
```

Expected: matches in `app/api/webhook/route.ts`, `lib/ai/groq.ts`, and `package.json`. Save this output in the execution notes; it is the failing precondition the cutover must eliminate.

- [ ] **Step 2: Switch the webhook import only**

Change line 5 of `app/api/webhook/route.ts` from:

```ts
import { generateReply, doubleCheck, DEFAULT_REPLY, extractApplicationInfo, extractScreeningInfo, resolveBranchName, type KnownJobValues } from '@/lib/ai/groq'
```

to:

```ts
import { generateReply, doubleCheck, DEFAULT_REPLY, extractApplicationInfo, extractScreeningInfo, resolveBranchName, type KnownJobValues } from '@/lib/ai/chatbot-ai'
```

- [ ] **Step 3: Remove the obsolete provider and dependency**

Delete `lib/ai/groq.ts`, then run:

```powershell
npm uninstall groq-sdk
```

Expected: `groq-sdk` is absent from `package.json` and `package-lock.json`; `@google/genai` remains in `dependencies`.

- [ ] **Step 4: Verify the source-level regression assertion passes**

Run:

```powershell
$matches = rg -n "@/lib/ai/groq|groq-sdk|GROQ_API_KEY" app lib package.json
if ($LASTEXITCODE -eq 0) { $matches; throw 'Groq production reference remains' }
```

Expected: exit code 0 from the PowerShell block with no printed matches.

- [ ] **Step 5: Run unit tests and TypeScript**

Run:

```powershell
npm test
npx tsc --noEmit --incremental false
```

Expected: all tests PASS and TypeScript exits with code 0.

- [ ] **Step 6: Commit the production cutover**

```powershell
git add app/api/webhook/route.ts lib/ai/groq.ts package.json package-lock.json
git commit -m "refactor: switch chatbot from Groq to Gemini"
```

Expected: one commit switching the sole production caller, deleting the old provider, and removing the Groq dependency.

---

### Task 3: Update environment and project documentation

**Files:**
- Modify: `.env.example:5-6`
- Modify: `PROJECT_SUMMARY.md:32,49,137,161`

**Interfaces:**
- Consumes: `GEMINI_API_KEY` and `lib/ai/chatbot-ai.ts` created in Tasks 1–2.
- Produces: accurate operator documentation without exposing or changing local credentials.

- [ ] **Step 1: Verify documentation still describes Groq before editing**

Run:

```powershell
rg -n "Groq|GROQ_API_KEY|lib/ai/groq" .env.example PROJECT_SUMMARY.md
```

Expected: matches describing the previous chatbot provider, key, module path, and free-tier warning.

- [ ] **Step 2: Update `.env.example`**

Replace:

```dotenv
# Groq AI (free tier) — used by LINE OA chatbot — https://console.groq.com
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

with:

```dotenv
# Google Gemini API — used by LINE OA chatbot — https://aistudio.google.com/app/apikey
GEMINI_API_KEY=AIza_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Do not modify `.env`.

- [ ] **Step 3: Update `PROJECT_SUMMARY.md` terminology and paths**

Apply these exact replacements:

```text
| AI (บอท) | Groq SDK — `llama-3.3-70b-versatile` |
| AI (บอท) | Google Gemini API — `gemini-2.5-flash` |

lib/ai/groq.ts              ← Groq: generateReply, doubleCheck, extract*, resolveBranchName
lib/ai/chatbot-ai.ts        ← Gemini: generateReply, doubleCheck, extract*, resolveBranchName

| `GROQ_API_KEY` | AI ตัวบอท (Groq) |
| `GEMINI_API_KEY` | AI ตัวบอท (Google Gemini) |

- [ ] Groq เป็น free tier — ระวัง rate limit ช่วง traffic สูง
- [ ] Gemini API — ตรวจสอบ quota, rate limit และ billing ของ Google AI Studio ให้เหมาะกับ traffic
```

- [ ] **Step 4: Verify configuration references are complete and secrets remain untracked**

Run:

```powershell
rg -n "Gemini|GEMINI_API_KEY|chatbot-ai" .env.example PROJECT_SUMMARY.md lib/ai/chatbot-ai.ts
$old = rg -n "Groq|GROQ_API_KEY|lib/ai/groq|groq-sdk" -g '!node_modules/**' -g '!.next/**' -g '!.git/**' -g '!docs/superpowers/**' .
if ($LASTEXITCODE -eq 0) { $old; throw 'Stale Groq reference remains outside historical design and plan documents' }
git ls-files --error-unmatch .env 2>$null
if ($LASTEXITCODE -eq 0) { throw '.env must not be tracked' }
```

Expected: Gemini references are printed, no stale Groq reference exists outside the historical spec/plan, and `.env` is not tracked.

- [ ] **Step 5: Commit the documentation update**

```powershell
git add .env.example PROJECT_SUMMARY.md
git commit -m "docs: document Gemini chatbot configuration"
```

Expected: one documentation-only commit; `.env` remains untracked and unchanged.

---

### Task 4: Run final non-network verification and review the migration

**Files:**
- Review only: all files changed in Tasks 1–3

**Interfaces:**
- Consumes: the complete migration from Tasks 1–3.
- Produces: evidence that tests, types, lint, build, source scans, and Git hygiene satisfy the approved design.

- [ ] **Step 1: Run the automated adapter tests**

```powershell
npm test
```

Expected: all Vitest tests PASS; the SDK mock prevents external Gemini calls.

- [ ] **Step 2: Run strict TypeScript checking without writing incremental artifacts**

```powershell
npx tsc --noEmit --incremental false
```

Expected: exit code 0 and no TypeScript diagnostics.

- [ ] **Step 3: Run ESLint**

```powershell
npm run lint
```

Expected: exit code 0 with no ESLint errors.

- [ ] **Step 4: Run the production build**

```powershell
npm run build
```

Expected: Next.js production build succeeds. No live AI call occurs because the client is lazy and no route is invoked during build.

- [ ] **Step 5: Run the final source and dependency scans**

```powershell
$old = rg -n "@/lib/ai/groq|groq-sdk|GROQ_API_KEY" app lib package.json package-lock.json .env.example PROJECT_SUMMARY.md
if ($LASTEXITCODE -eq 0) { $old; throw 'Groq runtime/config reference remains' }
rg -n "@google/genai|gemini-2.5-flash|GEMINI_API_KEY" lib package.json package-lock.json .env.example PROJECT_SUMMARY.md
```

Expected: no Groq runtime/config matches; Gemini SDK, model, and environment references are present.

- [ ] **Step 6: Review the complete diff and repository state**

```powershell
git diff origin/main...HEAD --check
git diff origin/main...HEAD --stat
git status --short --branch
```

Expected: no whitespace errors; only approved migration, tests, docs, spec, and plan files appear; branch is ahead of `origin/main`; working tree is clean.

- [ ] **Step 7: Record the operator handoff without pushing or deploying**

Report that the operator must set `GEMINI_API_KEY` locally and in the Vercel project before deployment. Include test, type-check, lint, build, and scan outcomes. Do not push to `Neyla-boopppp/LineOAchatbot`, deploy to Vercel, or make a live Gemini request unless the user separately authorizes it.

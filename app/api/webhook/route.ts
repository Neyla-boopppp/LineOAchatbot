import { NextRequest, NextResponse } from 'next/server'
import { messagingApi, webhook, validateSignature } from '@line/bot-sdk'
import { fetchJobs } from '@/lib/data/sheet'
import { filterJobs, formatJobsForAI, isOpen } from '@/lib/data/job-search'
import { generateReply, doubleCheck, DEFAULT_REPLY, extractApplicationInfo, extractScreeningInfo, resolveBranchName, type KnownJobValues } from '@/lib/ai/chatbot-ai'
import { notifyHrGroup, notifyHrApplicant, notifyHrHandover } from '@/lib/line/notify'
import { getState, setState, WELCOME_MESSAGE, NON_THAI_DOCS, NON_THAI_BRAND_RULE, isForeignEligibleBrand, buildNonThaiWrongBrandMessage, APPLY_PROMPT, FAQ_INTRO, FAQ_AGE_ANSWER, FAQ_PARTTIME_FALLBACK, BENEFIT_ASK, BENEFIT_ASK_HANDOVER, AI_UNAVAILABLE, buildSummaryMessage, buildMissingMessage, type UserState } from '@/lib/session/screening'
import { detectRichMenuIntent, parsePostbackIntent, isSilentMenuText, READ_ONLY_INTENTS, type MenuIntent } from '@/lib/line/menu'
import { buildPerksFlex, buildFaqQuickReply } from '@/lib/line/flex'

export const maxDuration = 30

const DEFAULT_MESSAGE = 'คำถามนี้ขอส่งต่อให้ HR ดูแลค่ะ กรุณารอสักครู่นะคะ 😊'

const DOCS_MESSAGE = `ถ้าเป็นคนสัญชาติไทยเตรียมเอกสารตามนี้นะคะ 😊
1. รูปถ่าย
2. สำเนาบัตรประชาชน
3. สำเนาทะเบียนบ้าน
4. สำเนาวุฒิ
5. Book Bank ธนาคารกสิกรไทย

แต่ถ้าไม่ใช่คนสัญชาติไทย รบกวนเตรียมเอกสารให้เจ้าหน้าที่ 4 อย่างนะคะ
1. วีซ่า
2. พาสปอร์ต
3. ใบอนุญาตทำงาน
4. Smart card บัตรอนุญาตทำงาน

หมายเหตุ: ผู้สมัครต่างชาติ ทางเรารับเฉพาะแบรนด์ Khao So-i เท่านั้นนะคะ 🙏`

const HANDOVER_MESSAGE = `หากน้อง ๆ มีข้อสงสัยเพิ่มเติม ทิ้งข้อความไว้ตรงนี้ได้เลยนะคะ
พี่ ๆ HR จะรีบมาตอบกลับในเวลาทำการค่ะ 💛

(ระหว่างนี้ถ้าอยากกลับมาคุยกับพี่ร็อคกี้ (บอท) พิมพ์ "คุยกับบอท" ได้ทุกเมื่อนะคะ)`

// แปลงคำเรียกตำแหน่งภาษาไทยหลวมๆ → ชื่อตำแหน่งอังกฤษที่ใช้จริงใน Sheet
const positionSynonyms: Record<string, string[]> = {
  'steward': ['พนักงานล้างจาน', 'ล้างจาน', 'สจ๊วต', 'ล้างถ้วย'],
  'service staff': ['บริการ', 'พนักงานเสิร์ฟ', 'เสิร์ฟ', 'ต้อนรับ', 'หน้าร้าน'],
  'tl': ['หัวหน้างาน', 'ผู้จัดการสาขา', 'หัวหน้า', 'หัวหน้าทีม'],
  'tm': ['พนักงานทั่วไป', 'ทีมงาน'],
}

let lineClient: messagingApi.MessagingApiClient | null = null

function getLineClient(): messagingApi.MessagingApiClient {
  if (!lineClient) {
    lineClient = new messagingApi.MessagingApiClient({
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '',
    })
  }
  return lineClient
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const signature = req.headers.get('x-line-signature') ?? ''
  const body = await req.text()

  const isValid = validateSignature(
    body,
    process.env.LINE_CHANNEL_SECRET ?? '',
    signature
  )
  if (!isValid) {
    console.warn('[webhook] Invalid signature')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let events: webhook.Event[]
  try {
    const parsed = JSON.parse(body) as webhook.CallbackRequest
    events = parsed.events ?? []

  } catch {
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 })
  }

  await Promise.all(events.map(handleEvent)).catch((err) =>
    console.error('[webhook] Unhandled error:', err)
  )

  return NextResponse.json({ status: 'ok' })
}

// ดำเนินการตาม Rich Menu intent — ใช้ร่วมกันทั้ง text action และ postback
async function runMenuAction(
  intent: MenuIntent,
  replyToken: string,
  userId: string | undefined,
  displayName: string,
  state: UserState | undefined,
): Promise<void> {
  if (intent === 'docs') {
    await sendReply(replyToken, DOCS_MESSAGE)
    return
  }
  if (intent === 'jobs') {
    await sendReply(replyToken, await buildJobsListReply())
    return
  }
  if (intent === 'faq') {
    // Rich Menu ชุดใหม่ — โชว์ปุ่มกลม Quick Reply ให้กดเลือกคำถาม (FAQ_MESSAGE เดิมเป็น fallback)
    await sendReply(replyToken, buildFaqQuickReply(FAQ_INTRO))
    return
  }
  if (intent === 'faq_age') {
    await sendReply(replyToken, FAQ_AGE_ANSWER)
    return
  }
  if (intent === 'faq_parttime') {
    await sendReply(replyToken, await buildPartTimeReply())
    return
  }
  if (intent === 'perks') {
    await sendReply(replyToken, buildPerksFlex())
    return
  }
  if (intent === 'branches') {
    await sendReply(replyToken, await buildBranchesReply())
    return
  }
  if (intent === 'benefits') {
    // รู้แบรนด์+ตำแหน่งแล้ว → ตอบสวัสดิการทันที; ยังไม่รู้ → จำบริบทไว้แล้วถามต่อ (#3)
    // ในโหมด handover ไม่แตะ state (กันหลุดออกจาก handover) — ตอบข้อมูลอย่างเดียว
    if (state?.brand && state?.position) {
      await sendReply(replyToken, await buildBenefitsReply(state))
    } else if (state?.phase === 'handover') {
      // ห้ามถามกลับตอน handover — ตั้ง state รอคำตอบไม่ได้ ผู้ใช้จะตอบแล้วเจอบอทเงียบ
      await sendReply(replyToken, BENEFIT_ASK_HANDOVER)
    } else {
      if (userId) {
        await setState(userId, { phase: 'awaiting_benefit_info', brand: state?.brand, position: state?.position, branch: state?.branch, history: state?.history })
      }
      await sendReply(replyToken, BENEFIT_ASK)
    }
    return
  }
  if (intent === 'apply') {
    // เริ่มขั้นตอนสมัคร — รีเซ็ตเป็น collecting_info (คง history) แล้วชวนระบุข้อมูล
    if (userId) await setState(userId, { phase: 'collecting_info', history: state?.history })
    await sendReply(replyToken, APPLY_PROMPT)
    return
  }
  // contact → เข้าสู่โหมด handover + แจ้ง HR
  if (userId) await setState(userId, { phase: 'handover' })
  await notifyHrHandover(displayName, { brand: state?.brand, position: state?.position, branch: state?.branch }).catch(() => {})
  await sendReply(replyToken, HANDOVER_MESSAGE)
}

// Follow event (กดเพิ่มเพื่อน / ปลดบล็อกแล้วแอดใหม่) — ทักทาย + แนะนำตัวทันที
// ตั้ง state เริ่มต้นเป็น collecting_info เพื่อไม่ให้ WELCOME_MESSAGE ถูกส่งซ้ำตอนพิมพ์ข้อความแรก
async function handleFollow(event: webhook.FollowEvent): Promise<void> {
  const replyToken = event.replyToken
  if (!replyToken) return
  const userId = 'source' in event ? (event.source as webhook.UserSource).userId : undefined
  if (userId) await setState(userId, { phase: 'collecting_info' })
  await sendReply(replyToken, WELCOME_MESSAGE)
}

// Postback event (เผื่อ Rich Menu ใช้ postback action ในอนาคต) — map ไป intent เดียวกับ text
async function handlePostback(event: webhook.PostbackEvent): Promise<void> {
  const replyToken = event.replyToken
  if (!replyToken) return
  const intent = parsePostbackIntent(event.postback?.data)
  if (!intent) return

  const userId = 'source' in event ? (event.source as webhook.UserSource).userId : undefined
  const state = userId ? await getState(userId) : undefined
  let displayName = 'ไม่ทราบชื่อ'
  try {
    if (userId) displayName = (await getLineClient().getProfile(userId)).displayName
  } catch {}

  await runMenuAction(intent, replyToken, userId, displayName, state)
}

// รับเฉพาะแชต 1:1 (source.type === 'user') — กันข้อความจากกลุ่ม/ห้อง (เช่น กลุ่ม HR)
// ไม่ให้บอทเผลอตอบกลับเข้ากลุ่มเวลา HR พิมพ์คุยกัน
function isUserSource(event: webhook.Event): boolean {
  return 'source' in event && event.source?.type === 'user'
}

async function handleEvent(event: webhook.Event): Promise<void> {
  if (!isUserSource(event)) return

  if (event.type === 'follow') {
    await handleFollow(event as webhook.FollowEvent)
    return
  }
  if (event.type === 'postback') {
    await handlePostback(event as webhook.PostbackEvent)
    return
  }
  if (event.type !== 'message') return

  const replyToken = (event as webhook.MessageEvent).replyToken
  if (!replyToken) return

  const userId = 'source' in event ? (event.source as webhook.UserSource).userId : undefined
  const state = userId ? await getState(userId) : undefined

  if (event.message.type !== 'text') {
    // แจ้ง HR เมื่อผู้สมัครส่ง รูป/วิดีโอ/ไฟล์ (อาจเป็นเอกสารสมัครงาน) ในทุกเฟส
    // ไม่นับสติกเกอร์/ตำแหน่ง/เสียง เพื่อไม่ให้ HR โดนสแปม
    const isDocLike =
      event.message.type === 'image' ||
      event.message.type === 'video' ||
      event.message.type === 'file'

    if (isDocLike) {
      let displayName = 'ไม่ทราบชื่อ'
      try {
        if (userId) displayName = (await getLineClient().getProfile(userId)).displayName
      } catch {}

      await notifyHrApplicant(
        displayName,
        state?.brand,
        state?.position,
        state?.branch,
        'ผู้สมัครส่งเอกสารมาแล้ว รบกวน HR เข้าไปเช็กในแชตด้วยนะคะ',
      ).catch(() => {})

      // เฟสรอเอกสาร (ต่างชาติ) → ถือว่าส่งเอกสารแล้ว คืนสู่ collecting_info
      if (state?.phase === 'awaiting_documents' && userId) {
        await setState(userId, { phase: 'collecting_info' })
      }

      // ตอบรับผู้สมัคร — ยกเว้นโหมด handover ที่บอทควรเงียบ (ปล่อยให้ HR คุยเอง)
      if (state?.phase !== 'handover') {
        await sendReply(replyToken, 'ได้รับรูป/เอกสารแล้วนะคะ 🙏 ทีม HR จะเข้าไปตรวจสอบและติดต่อกลับเร็วๆ นี้ค่ะ 😊')
      }
    }
    return
  }

  const userText = (event.message as webhook.TextMessageContent).text?.trim()
  if (!userText) return

  let displayName = 'ไม่ทราบชื่อ'
  try {
    if (userId) {
      const profile = await getLineClient().getProfile(userId)
      displayName = profile.displayName
    }
  } catch {}

  // ── ปุ่มที่ LINE OA Manager ตอบเอง (การ์ดแบรนด์ / Pop-up ลิงก์สมัคร) — บอทเงียบสนิท ──
  // ต้องเช็คก่อนทุกอย่าง ไม่แตะ state ไม่แจ้ง HR กันข้อความบอทซ้อนการ์ดของ OA Manager
  if (isSilentMenuText(userText)) return

  const menuIntent = detectRichMenuIntent(userText)

  // ── Rich Menu (อ่านข้อมูล): ทำงานได้เสมอ แม้อยู่ในโหมด handover — return ก่อนแตะ state จึงไม่ออกจาก handover ──
  if (menuIntent && READ_ONLY_INTENTS.has(menuIntent)) {
    await runMenuAction(menuIntent, replyToken, userId, displayName, state)
    return
  }

  // ── Rich Menu: สมัครงานออนไลน์ → เจตนาชัดว่าอยากใช้บอท จึงพาออกจาก handover ได้ (มาก่อน handover check) ──
  if (menuIntent === 'apply') {
    await runMenuAction('apply', replyToken, userId, displayName, state)
    return
  }

  // ── Handover Mode ──
  // - พิมพ์ keyword "คุยกับบอท" → ออกจากโหมด กลับมาใช้ระบบอัตโนมัติ
  // - นอกนั้น → forward ข้อความเข้ากลุ่ม HR (บอทไม่ตอบเอง) + เตือน "อยู่โหมดเจ้าหน้าที่" ครั้งเดียว กันผู้ใช้งง
  if (state?.phase === 'handover') {
    if (looksLikeResumeBot(userText)) {
      if (userId) await setState(userId, { phase: 'collecting_info' })
      await sendReply(replyToken, 'กลับมาคุยกับพี่ร็อคกี้แล้วนะคะ 😊 มีอะไรให้ช่วยตรวจสอบไหมคะ? (แบรนด์ / ตำแหน่ง / สาขา)')
      return
    }
    await notifyHrGroup(displayName, userText).catch(() => {})
    if (!state.hintSent) {
      if (userId) await setState(userId, { phase: 'handover', brand: state.brand, position: state.position, branch: state.branch, hintSent: true })
      await sendReply(replyToken, 'ตอนนี้กำลังรอเจ้าหน้าที่ HR เข้ามาดูแลอยู่นะคะ 🙏 ข้อความของคุณถูกส่งให้ทีมงานแล้วค่ะ\n(ถ้าต้องการกลับมาคุยกับพี่ร็อคกี้ (บอท) พิมพ์ "คุยกับบอท" ได้เลยนะคะ)')
    }
    return
  }

  // ── "คุยกับบอท" ตอนที่ไม่ได้อยู่ handover แล้ว ──
  // เดิมตกไปเข้า flow ปกติ → ถูกส่งให้ LLM ตีความ แล้วตอบ "ยังไม่ได้ระบุแบรนด์..." ซึ่งงงมาก
  // ตอบให้ชัดว่าคุยกับบอทอยู่แล้ว โดยไม่แตะ state
  if (looksLikeResumeBot(userText)) {
    await sendReply(replyToken, 'คุยกับพี่ร็อคกี้อยู่แล้วนะคะ 😊 มีอะไรให้ช่วยตรวจสอบไหมคะ? (แบรนด์ / ตำแหน่ง / สาขา)')
    return
  }

  // ── Rich Menu: ติดต่อเจ้าหน้าที่ → เข้าสู่โหมด handover — แตะ state จึงมาหลัง handover check ──
  if (menuIntent === 'contact') {
    await runMenuAction('contact', replyToken, userId, displayName, state)
    return
  }

  // ── History: เก็บ 4 ข้อความล่าสุดของผู้ใช้เพื่อส่งเป็น context ──
  const prevHistory = state?.history ?? []
  const updatedHistory = [...prevHistory, userText].slice(-4)

  // ── Change Intent: จับ intent "เปลี่ยน" ก่อน phase logic ──
  const changeTarget = state ? detectChangeIntent(userText) : null
  if (changeTarget) {
    let newState: Parameters<typeof setState>[1]
    let changeMsg: string
    if (changeTarget === 'all' || changeTarget === 'brand') {
      newState = { phase: 'collecting_info', history: updatedHistory }
      changeMsg = 'ได้เลยค่ะ 😊 เริ่มใหม่เลยนะคะ รบกวนระบุแบรนด์ ตำแหน่ง และสาขาที่ต้องการสมัครค่ะ'
    } else if (changeTarget === 'position') {
      newState = { phase: 'collecting_info', brand: state!.brand, history: updatedHistory }
      changeMsg = `ได้เลยค่ะ 😊${state!.brand ? ` (${state!.brand})` : ''} ระบุตำแหน่งงานที่ต้องการสมัครใหม่ได้เลยค่ะ`
    } else {
      newState = { phase: 'collecting_info', brand: state!.brand, position: state!.position, history: updatedHistory }
      const hint = [state!.position, state!.brand].filter(Boolean).join(' ของ ')
      changeMsg = `ได้เลยค่ะ 😊${hint ? ` (${hint})` : ''} ระบุสาขาที่สะดวกใหม่ได้เลยค่ะ`
    }
    if (userId) await setState(userId, newState)
    await sendReply(replyToken, changeMsg)
    return
  }

  // ── Small Talk: ทักทายทั่วไป — ตอบเป็นกันเอง ไม่เปลี่ยน state ไม่แจ้ง HR ──
  if (state && looksLikeSmallTalk(userText)) {
    await sendReply(replyToken, 'สวัสดีค่ะ 😊 ดีใจที่ได้คุยด้วยนะคะ มีข้อมูลส่วนไหนให้พี่ร็อคกี้ช่วยตรวจสอบไหมคะ?')
    return
  }

  const FOLLOW_UP_Q = 'ก่อนอื่นขอสอบถามข้อมูลเบื้องต้นก่อนนะคะ 😊 สัญชาติอะไร อายุเท่าไหร่ เพศอะไรคะ?'
  let replyText: string | string[]

  if (!state) {
    if (userId) await setState(userId, { phase: 'collecting_info' })
    replyText = WELCOME_MESSAGE
  } else if (state.phase === 'collecting_info') {
    // fetch jobs ก่อน เพื่อส่งชื่อสาขา/ตำแหน่งจริงจาก Sheet ให้ LLM map ได้ถูกต้อง
    const jobs = await fetchJobs()

    // กรอง known values ตาม brand ที่รู้อยู่แล้ว (ถ้ายังไม่รู้ → ส่งทั้งหมด แต่จำกัด 40 รายการ)
    const brandFilter = state.brand
    const jobsForContext = brandFilter
      ? jobs.filter((j) => j.brand.toLowerCase().includes(brandFilter.toLowerCase()))
      : jobs
    const known: KnownJobValues = {
      branches: Array.from(new Set(jobsForContext.map((j) => j.branch))).slice(0, 40),
      positions: Array.from(new Set(jobsForContext.map((j) => j.jobTitle))).slice(0, 50),
    }

    const extracted = await extractApplicationInfo(userText, known, updatedHistory)

    // Gemini ล่ม (429/503) → อ่านข้อความผู้ใช้ไม่ได้เลย ห้ามเขียนทับ state และห้ามตอบ
    // "ยังไม่ได้ระบุแบรนด์..." เพราะผู้ใช้อาจบอกมาครบแล้ว แค่ระบบอ่านไม่ออก
    if (extracted.failed) {
      await sendReply(replyToken, AI_UNAVAILABLE)
      return
    }

    const brand = extracted.brand ?? state.brand
    // Synonym mapping: คำไทยหลวมๆ (เช่น "พนักงานล้างจาน") → ชื่อตำแหน่งอังกฤษในระบบ ("steward")
    // ทำก่อน filter และให้มาก่อนผล LLM เพื่อกัน hallucination (เช่น แมปผิดเป็น "Runner")
    const synonymPosition = detectPositionSynonym(userText)
    const position = synonymPosition ?? extracted.position ?? state.position
    const branch = extracted.branch ?? state.branch

    if (userId) await setState(userId, { phase: 'collecting_info', brand, position, branch, history: updatedHistory })

    const missing: string[] = []
    if (!brand) missing.push('ชื่อแบรนด์ที่ต้องการสมัคร')
    if (!position) missing.push('ตำแหน่งงานที่สนใจ')
    if (!branch) missing.push('สาขาที่สะดวก')

    const nothingExtracted = extracted.brand === null && extracted.position === null && extracted.branch === null

    if (nothingExtracted && !looksLikeQuestion(userText) && missing.length === 0) return

    // ── Browse Intent: ผู้ใช้ถามว่ามีตำแหน่งไหนเปิดรับ ──
    // ให้ browse มาก่อนเสมอเมื่อผู้ใช้ถามแบบกว้าง — ไม่ให้ position เก่าจาก history/state มา block
    // (เดิมมี guard !extracted.position ทำให้คำถาม browse หลุดไปค้นหาตำแหน่งเก่า → ตอบผิด)
    const browseBrand = extracted.brand ?? state.brand
    if (looksLikeBrowseIntent(userText)) {
      const normStr = (s: string) => s.toLowerCase().replace(/[-\s]+/g, '')
      if (browseBrand) {
        const openJobs = jobs.filter(
          (j) => normStr(j.brand).includes(normStr(browseBrand)) && isOpen(j.status)
        )
        const uniquePositions = Array.from(new Set(openJobs.map((j) => j.jobTitle)))
        // browse = เริ่มเลือกใหม่ → เก็บแค่ brand ล้าง position/branch เก่าออก กัน state ค้าง
        if (userId) await setState(userId, { phase: 'collecting_info', brand: browseBrand, history: updatedHistory })
        if (uniquePositions.length === 0) {
          replyText = `ขณะนี้ ${browseBrand} ยังไม่มีตำแหน่งที่เปิดรับสมัครค่ะ 😔 หากต้องการสอบถามเพิ่มเติม พี่ร็อคกี้ยินดีช่วยเสมอนะคะ`
        } else {
          const posList = uniquePositions.map((p) => `• ${p}`).join('\n')
          replyText = `ตอนนี้ ${browseBrand} เปิดรับสมัครตำแหน่งเหล่านี้อยู่ค่ะ 😊\n\n${posList}\n\nสนใจตำแหน่งไหน บอกพี่ร็อคกี้ได้เลยนะคะ`
        }
      } else {
        // ยังไม่รู้แบรนด์ → แสดงตำแหน่งงานว่างทั้งหมด (จัดกลุ่ม แบรนด์ → สาขา) แทนการส่งต่อ HR
        if (userId) await setState(userId, { phase: 'collecting_info', history: updatedHistory })
        replyText = await buildJobsListReply()
      }
    } else if (missing.length === 0) {
      // Step 1: filter เฉพาะ brand + position (ยังไม่กรอง branch เพราะชื่ออาจต่างภาษา)
      const normStr = (s: string) => s.toLowerCase().replace(/[-\s]+/g, '')
      const byBrandPos = jobs.filter((j) => {
        const normBrand = normStr(j.brand)
        const normTitle = normStr(j.jobTitle)
        const normBrandQuery = normStr(brand!)
        const normPosQuery = normStr(position!)
        return (
          normBrand.includes(normBrandQuery) &&
          (normTitle.includes(normPosQuery) || normPosQuery.includes(normTitle))
        )
      })

      // ── P3: กันการเลือกตำแหน่ง "หัวหน้า" ให้เงียบๆ เมื่อผู้ใช้ขอพนักงานทั่วไป ──
      // "พนักงานล้างจาน" อาจ match ทั้ง "Steward" และ "Head Steward" — เดิมเลือก [0] เงียบๆ
      // ถ้าไม่ตรงชื่อเป๊ะ + ผู้ใช้ไม่ได้ขอตำแหน่งระดับหัวหน้า → ตัดตำแหน่งหัวหน้าออกก่อน
      // ถ้ายังเหลือหลายตำแหน่งระดับเดียวกัน → ถามให้เลือก ไม่เดา
      const SENIOR_RE = /head|senior|lead|supervisor|หัวหน้า|ผู้จัดการ|ผจก|ซูเปอร์ไวเซอร์|ซุปเปอร์ไวเซอร์/i
      const distinctTitles = Array.from(new Set(byBrandPos.map((j) => j.jobTitle)))
      // ผู้ใช้พิมพ์ชื่อตำแหน่งจริงกลับมา (เช่น เลือกจากรายการ disambiguation) → match ตรงตัว
      // เลือกชื่อที่ยาวสุดก่อน เพื่อให้ "Head Steward" ชนะ "Steward" กันวน loop
      const textTitleMatch = distinctTitles
        .filter((t) => normStr(userText).includes(normStr(t)))
        .sort((a, b) => b.length - a.length)[0]
      const exactTitle = textTitleMatch ?? distinctTitles.find((t) => normStr(t) === normStr(position!))
      // ผู้ใช้ตั้งใจขอตำแหน่งหัวหน้า — เช็คทั้งข้อความปัจจุบัน และ position ที่ resolve แล้ว (จาก state)
      // กัน loop: เทิร์นถัดมาที่พิมพ์แค่สาขา (ไม่มีคำว่าหัวหน้า) จะได้ไม่ถูกถามยืนยันซ้ำ
      const userAskedSenior = SENIOR_RE.test(userText) || SENIOR_RE.test(position ?? '')
      let candidateTitles = distinctTitles
      if (!exactTitle && distinctTitles.length > 1 && !userAskedSenior) {
        const baseTitles = distinctTitles.filter((t) => !SENIOR_RE.test(t))
        if (baseTitles.length > 0) candidateTitles = baseTitles
      }
      // #4: ผู้ใช้ขอตำแหน่งทั่วไป แต่ที่ match มีแต่ระดับหัวหน้าล้วน → ห้าม auto-pick ให้ถามยืนยันก่อน
      const seniorOnly = !exactTitle && !userAskedSenior && byBrandPos.length > 0 && distinctTitles.every((t) => SENIOR_RE.test(t))
      const chosenTitle = exactTitle ?? (!seniorOnly && candidateTitles.length === 1 ? candidateTitles[0] : null)

      if (byBrandPos.length === 0) {
        // #2: ไม่พบตำแหน่ง — แทนที่จะให้ตัน ลิสต์ตำแหน่งที่แบรนด์นั้นเปิดรับจริงให้เลือก
        //     เก็บ brand ไว้ ล้าง position + history กัน context เก่าปนคำถามถัดไป
        if (userId) await setState(userId, { phase: 'collecting_info', brand })
        const openTitles = Array.from(new Set(
          jobs.filter((j) => normStr(j.brand).includes(normStr(brand!)) && isOpen(j.status)).map((j) => j.jobTitle)
        ))
        if (openTitles.length > 0) {
          const list = openTitles.map((t) => `• ${t}`).join('\n')
          replyText = `ขออภัยค่ะ ไม่พบตำแหน่ง "${position!}" สำหรับ ${brand!} ค่ะ 😊\nตอนนี้ ${brand!} เปิดรับตำแหน่งเหล่านี้อยู่ค่ะ:\n\n${list}\n\nสนใจตำแหน่งไหน พิมพ์บอกพี่ร็อคกี้ได้เลยนะคะ`
        } else {
          replyText = `ขออภัยค่ะ ขณะนี้ ${brand!} ยังไม่มีตำแหน่งที่เปิดรับสมัครค่ะ 😔\nลองดูแบรนด์อื่นจากปุ่ม "ตำแหน่งงานที่เปิดรับ" ในเมนูด้านล่างได้เลยนะคะ`
        }
      } else if (seniorOnly) {
        // #4: มีแต่ตำแหน่งระดับหัวหน้า — ถามยืนยันแทนการเลือกให้เงียบๆ (เก็บ brand, ล้าง position)
        if (userId) await setState(userId, { phase: 'collecting_info', brand })
        const titleList = distinctTitles.map((t) => `• ${t}`).join('\n')
        replyText = `ตำแหน่ง "${position!}" ของ ${brand!} ตอนนี้เปิดรับเฉพาะระดับหัวหน้าค่ะ 😊\n\n${titleList}\n\nสนใจตำแหน่งนี้ไหมคะ? ถ้าสนใจพิมพ์ชื่อตำแหน่งมาได้เลยค่ะ`
      } else if (chosenTitle === null) {
        // P3: ยังกำกวมหลายตำแหน่งระดับเดียวกัน — ถามให้เลือก (เก็บ brand, ล้าง position/history)
        if (userId) await setState(userId, { phase: 'collecting_info', brand })
        const titleList = candidateTitles.map((t) => `• ${t}`).join('\n')
        replyText = `${brand} มีหลายตำแหน่งที่ใกล้เคียงกับ "${position!}" ค่ะ 😊 สนใจตำแหน่งไหนคะ?\n\n${titleList}\n\nพิมพ์ชื่อตำแหน่งที่ต้องการมาได้เลยนะคะ`
      } else {
        // ตำแหน่งชัดแล้ว — ใช้ชื่อจริงจาก Sheet (กัน hallucination) และกรองเฉพาะตำแหน่งนั้น
        const displayPosition = chosenTitle
        const jobsForTitle = byBrandPos.filter((j) => j.jobTitle === chosenTitle)

        // Step 2: resolve branch — LLM map ชื่อที่ผู้ใช้พิมพ์ → ชื่อจริงใน Sheet
        const knownBranchesForPos = Array.from(new Set(jobsForTitle.map((j) => j.branch)))
        const resolvedBranch = await resolveBranchName(branch!, knownBranchesForPos)

        if (!resolvedBranch) {
          // ไม่มีสาขานี้ในระบบ — เก็บ brand+position (ชื่อจริง) ไว้ ให้ผู้สมัครระบุสาขาใหม่
          if (userId) await setState(userId, { phase: 'collecting_info', brand, position: displayPosition })
          replyText = [
            buildSummaryMessage(brand!, displayPosition, branch!),
            `ขออภัยค่ะ ไม่มีสาขา "${branch!}" สำหรับตำแหน่ง ${displayPosition} ค่ะ\nสาขาที่เปิดให้บริการ:\n${formatBranchList(knownBranchesForPos)}\n\nระบุสาขาที่สะดวกได้เลยนะคะ 😊`,
          ]
        } else {
          // Step 3: ได้ชื่อสาขาจริงแล้ว — match และตรวจสถานะ
          const matched = jobsForTitle.filter((j) => j.branch === resolvedBranch)
          const header = buildSummaryMessage(brand!, displayPosition, resolvedBranch)
          const jobIsOpen = matched.some((j) => isOpen(j.status))
          const jobsText = formatJobsForAI(matched)
          const jobInfo = await generateReply(
            jobsText,
            `ตำแหน่ง ${displayPosition} สาขา ${resolvedBranch} ของ ${brand!} เปิดรับสมัครหรือปิดรับสมัครอยู่คะ?`
          )

          const statusMsg =
            jobInfo && jobInfo !== DEFAULT_REPLY
              ? jobInfo
              : jobIsOpen
              ? 'ตอนนี้เปิดรับสมัครอยู่ค่ะ 🎉'
              : 'ตอนนี้ปิดรับสมัครชั่วคราวค่ะ'

          const firstMsg = `${header}\n\n${statusMsg}`

          if (jobIsOpen) {
            // P4: เก็บ position เป็นชื่อจริงจาก Sheet เพื่อความคงเส้นคงวาในเทิร์นถัดไป
            if (userId) await setState(userId, { phase: 'awaiting_screening', brand, position: displayPosition, branch: resolvedBranch, history: updatedHistory })
            replyText = [firstMsg, FOLLOW_UP_Q]
          } else {
            if (userId) await setState(userId, { phase: 'collecting_info', brand, position: displayPosition, history: updatedHistory })
            const openBranches = Array.from(new Set(
              jobsForTitle
                .filter((j) => isOpen(j.status) && j.branch !== resolvedBranch)
                .map((j) => j.branch)
            ))
            const altMsg = openBranches.length > 0
              ? `✅ สาขาที่ยังเปิดรับสมัคร ${displayPosition} อยู่ตอนนี้:\n${formatBranchList(openBranches)}`
              : 'ขณะนี้ตำแหน่งนี้ยังไม่มีสาขาอื่นที่เปิดรับสมัครค่ะ สนใจตำแหน่งอื่นไหมคะ?'
            replyText = [firstMsg, altMsg]
          }
        }
      }
    } else if (nothingExtracted && looksLikeQuestion(userText)) {
      replyText = await buildReply(userText, displayName)
    } else {
      replyText = buildMissingMessage(missing)
    }
  } else if (state.phase === 'awaiting_screening') {
    const screening = await extractScreeningInfo(userText)
    const replies: string[] = []

    const ageRejected = screening.age !== null && (screening.age < 19 || screening.age > 35)
    if (screening.age !== null && screening.age < 19) {
      replies.push('ทางเราจะรับอายุ 19 ปีบริบูรณ์ขึ้นไปค่ะ')
    }
    if (screening.age !== null && screening.age > 35) {
      replies.push('ทางเราจะรับถึงอายุ 35 ปีค่ะ')
    }

    // ลำดับการตัดสิน — แต่ละกรณีจบในตัวเอง ไม่วนกลับไปถาม "สัญชาติ อายุ เพศ" ซ้ำ
    if (screening.isThai === null && !ageRejected) {
      // ยังไม่ระบุสัญชาติ และอายุยังไม่ติดเงื่อนไข → ถามเฉพาะสัญชาติ คง phase เดิม
      replies.push('รบกวนระบุสัญชาติด้วยนะคะ 😊 (เช่น ไทย หรือ ต่างชาติ)')
      replyText = replies
    } else if (screening.isThai === false && !isForeignEligibleBrand(state.brand)) {
      // ต่างชาติ + แบรนด์ที่รับเฉพาะคนไทย → ปฏิเสธอย่างสุภาพแล้วชวนไป Khao So-i
      // ถ้ายังไม่รู้แบรนด์ ให้บอกกฎก่อน จะได้ไม่ให้ผู้สมัครเสียเวลากรอกข้อมูลเพิ่ม
      replies.push(state.brand ? buildNonThaiWrongBrandMessage(state.brand) : NON_THAI_BRAND_RULE)
      if (userId) await setState(userId, { phase: 'collecting_info' })
      replyText = replies
    } else if (screening.isThai === false) {
      // ต่างชาติ + Khao So-i → แจ้งเอกสาร 4 อย่าง แล้วเปลี่ยน state ไปรอรับเอกสาร (จบ ไม่ถามซ้ำ)
      replies.push(NON_THAI_DOCS)
      if (userId) await setState(userId, { phase: 'awaiting_documents', brand: state.brand, position: state.position, branch: state.branch })
      replyText = replies
    } else if (ageRejected) {
      // อายุไม่ตรงเกณฑ์ (สัญชาติไทย/ไม่ระบุ) → แจ้ง HR เตรียมพิจารณา แล้วจบ ไม่ถามซ้ำ
      await notifyHrApplicant(displayName, state.brand, state.position, state.branch, 'ผู้สมัครอายุไม่ตรงเกณฑ์ที่กำหนด รบกวน HR พิจารณาเพิ่มเติมค่ะ').catch(() => {})
      if (userId) await setState(userId, { phase: 'collecting_info' })
      replyText = replies
    } else {
      // ผ่านเกณฑ์ครบ (สัญชาติไทย + อายุ 19-35) → แจ้ง HR เตรียมติดต่อกลับ
      await notifyHrApplicant(displayName, state.brand, state.position, state.branch).catch(() => {})
      if (userId) await setState(userId, { phase: 'collecting_info' })
      replyText = 'ขอบคุณค่ะ 😊 ทีม HR จะติดต่อกลับหาคุณเร็วๆ นี้นะคะ หากมีคำถามเพิ่มเติม สามารถสอบถามพี่ร็อคกี้ได้เลยค่ะ'
    }
  } else if (state.phase === 'awaiting_documents') {
    if (userId) await setState(userId, { phase: 'collecting_info' })
    await notifyHrApplicant(displayName, state.brand, state.position, state.branch, 'ผู้สมัครส่งเอกสารแล้ว รบกวน HR เข้าไปคุยต่อด้วยนะคะ').catch(() => {})
    replyText = 'ขอบคุณค่ะ 😊 ทีม HR ได้รับข้อมูลแล้ว จะติดต่อกลับหาคุณเร็วๆ นี้นะคะ'
  } else if (state.phase === 'awaiting_benefit_info') {
    // #3: ผู้ใช้กด "สวัสดิการ" ตอนยังไม่รู้แบรนด์/ตำแหน่ง → เก็บบริบทมาถามต่อจนครบแล้วตอบสวัสดิการ
    const jobs = await fetchJobs()
    const brandFilter = state.brand
    const jobsForContext = brandFilter
      ? jobs.filter((j) => j.brand.toLowerCase().includes(brandFilter.toLowerCase()))
      : jobs
    const known: KnownJobValues = {
      branches: Array.from(new Set(jobsForContext.map((j) => j.branch))).slice(0, 40),
      positions: Array.from(new Set(jobsForContext.map((j) => j.jobTitle))).slice(0, 50),
    }
    const extracted = await extractApplicationInfo(userText, known, updatedHistory)
    if (extracted.failed) {
      await sendReply(replyToken, AI_UNAVAILABLE)
      return
    }
    const synonymPosition = detectPositionSynonym(userText)
    const brand = extracted.brand ?? state.brand
    const position = synonymPosition ?? extracted.position ?? state.position

    if (brand && position) {
      // ครบแล้ว → ตอบสวัสดิการ แล้วกลับสู่ collecting_info (ล้าง pending benefit)
      if (userId) await setState(userId, { phase: 'collecting_info', brand, position, branch: state.branch, history: updatedHistory })
      replyText = await buildBenefitsReply({ phase: 'collecting_info', brand, position, branch: state.branch })
    } else {
      // ยังขาด → ถามเฉพาะช่องที่ขาด คงอยู่ awaiting_benefit_info (จำบริบทต่อ)
      if (userId) await setState(userId, { phase: 'awaiting_benefit_info', brand, position, branch: state.branch, history: updatedHistory })
      const needBrand = !brand
      replyText = needBrand
        ? 'ได้เลยค่ะ 😊 สนใจสวัสดิการของแบรนด์ไหนคะ? (Potato Corner / Khao So-i / Uno Coffee)'
        : `ได้เลยค่ะ 😊 ${brand} ตำแหน่งไหนที่อยากรู้สวัสดิการคะ? พิมพ์ชื่อตำแหน่งมาได้เลยค่ะ`
    }
  } else {
    // Safety net: state 'ready' ที่อาจค้างอยู่ → reset แล้วตอบเหมือน flow ใหม่
    if (state?.phase === 'ready' && userId) await setState(userId, { phase: 'collecting_info' })
    replyText = await buildReply(userText, displayName)
  }

  await sendReply(replyToken, replyText)
}

// ตอบเรื่องสวัสดิการ — ดึงจากคอลัมน์ Benefit ใน Sheet (ข้อมูลจริง ไม่แต่งเอง)
// รู้ตำแหน่ง/แบรนด์จาก state → ตอบเจาะจง; ไม่รู้ → ชวนระบุตำแหน่งก่อน
async function buildBenefitsReply(state: UserState | undefined): Promise<string> {
  if (state?.brand && state?.position) {
    const jobs = await fetchJobs()
    const normStr = (s: string) => s.toLowerCase().replace(/[-\s]+/g, '')
    const matched = jobs.filter(
      (j) =>
        normStr(j.brand).includes(normStr(state.brand!)) &&
        (normStr(j.jobTitle).includes(normStr(state.position!)) ||
          normStr(state.position!).includes(normStr(j.jobTitle)))
    )
    const withBenefit = matched.find((j) => j.benefit?.trim())
    if (withBenefit) {
      const salaryLine = withBenefit.salary?.trim() ? `\n\n💰 เงินเดือน: ${withBenefit.salary}` : ''
      return `สวัสดิการของตำแหน่ง ${withBenefit.jobTitle} (${withBenefit.brand}) ค่ะ 😊\n\n${withBenefit.benefit}${salaryLine}`
    }
  }
  return 'สวัสดิการและผลตอบแทนจะแตกต่างกันไปตามตำแหน่งและแบรนด์ค่ะ 😊\nบอกพี่ร็อคกี้ได้เลยว่าสนใจแบรนด์ไหน ตำแหน่งอะไร เดี๋ยวดึงรายละเอียดสวัสดิการมาให้ค่ะ 🫡'
}

async function buildJobsListReply(): Promise<string> {
  const jobs = await fetchJobs()
  const openJobs = jobs.filter((j) => isOpen(j.status))

  if (openJobs.length === 0) {
    return 'ขณะนี้ยังไม่มีตำแหน่งที่เปิดรับสมัครค่ะ 😔 หากมีข่าวสารจะรีบแจ้งนะคะ'
  }

  // brand → branch → positions[] (จัดกลุ่มตามแบรนด์ก่อน แล้วย่อยตามสาขา, คงลำดับที่พบ)
  const brandOrder: string[] = []
  const byBrand: Record<string, { branchOrder: string[]; byBranch: Record<string, string[]> }> = {}
  for (const job of openJobs) {
    if (!byBrand[job.brand]) { byBrand[job.brand] = { branchOrder: [], byBranch: {} }; brandOrder.push(job.brand) }
    const brandData = byBrand[job.brand]
    if (!brandData.byBranch[job.branch]) { brandData.byBranch[job.branch] = []; brandData.branchOrder.push(job.branch) }
    if (!brandData.byBranch[job.branch].includes(job.jobTitle)) brandData.byBranch[job.branch].push(job.jobTitle)
  }

  // แต่ละแบรนด์เป็น 1 block — ภายในแยกตามสาขา แล้วไล่ตำแหน่งเป็น bullet
  // เว้น 1 บรรทัดว่างคั่นระหว่าง block ให้อ่านง่ายใน LINE
  const brandBlocks = brandOrder.map((brand) => {
    const { branchOrder, byBranch } = byBrand[brand]
    const branchBlocks = branchOrder
      .map((branch) => {
        const bullets = byBranch[branch].map((position) => `• ตำแหน่ง ${position}`).join('\n')
        return `📍 สาขา ${branch}\n${bullets}`
      })
      .join('\n\n')
    return `🏢 แบรนด์ ${brand}:\n${branchBlocks}`
  })

  const header = 'อัปเดตตำแหน่งงานว่างของ Rocks Group ประจำวันนี้ค่ะ 🚀'
  const cta = '👇 สนใจอยากสมัครแบรนด์ไหน ตำแหน่งอะไร และสาขาไหน พิมพ์บอกพี่ร็อคกี้มาได้เลยนะคะ 😊'

  return `${header}\n\n${brandBlocks.join('\n\n')}\n\n${cta}`
}

// ปุ่ม Rich Menu "เช็คสาขาใกล้บ้านคุณ" — ลิสต์สาขาที่มีตำแหน่งเปิดจริง จัดกลุ่มตามแบรนด์
async function buildBranchesReply(): Promise<string> {
  const jobs = await fetchJobs()
  const openJobs = jobs.filter((j) => isOpen(j.status))

  if (openJobs.length === 0) {
    return 'ขณะนี้ยังไม่มีสาขาที่เปิดรับสมัครค่ะ 😔 หากมีข่าวสารจะรีบแจ้งนะคะ'
  }

  // brand → branches[] (คงลำดับที่พบ, ไม่ซ้ำ)
  const brandOrder: string[] = []
  const byBrand: Record<string, string[]> = {}
  for (const job of openJobs) {
    if (!byBrand[job.brand]) { byBrand[job.brand] = []; brandOrder.push(job.brand) }
    if (!byBrand[job.brand].includes(job.branch)) byBrand[job.brand].push(job.branch)
  }

  const blocks = brandOrder.map((brand) => {
    const bullets = byBrand[brand].map((branch) => `📍 ${branch}`).join('\n')
    return `🏢 แบรนด์ ${brand}:\n${bullets}`
  })

  const header = 'สาขาที่กำลังเปิดรับสมัครอยู่ตอนนี้ค่ะ 🗺️'
  const cta = '👇 สะดวกสาขาไหน หรืออยู่ย่านไหน พิมพ์บอกพี่ร็อคกี้ได้เลยนะคะ เดี๋ยวเช็กตำแหน่งที่เปิดในสาขานั้นให้ค่ะ 😊'

  return `${header}\n\n${blocks.join('\n\n')}\n\n${cta}`
}

// Quick Reply "รับพาร์ทไทม์ไหม?" — ตอบจากคอลัมน์ Job_Type ใน Sheet (ข้อมูลจริง ไม่แต่งเอง)
async function buildPartTimeReply(): Promise<string> {
  const jobs = await fetchJobs()
  const openJobs = jobs.filter((j) => isOpen(j.status))
  const isPartTime = (t: string) => /part[-\s]?time|พาร์?ท[-\s]?ไทม์|พาทไทม์|รายวัน|ชั่วคราว/i.test(t)

  const partTimeJobs = openJobs.filter((j) => isPartTime(j.jobType))
  if (partTimeJobs.length === 0) {
    // ไม่มีข้อมูลประเภทงาน หรือไม่มีพาร์ทไทม์เปิดอยู่ — ไม่ฟันธงว่า "ไม่รับ" เพราะ Sheet อาจไม่ได้ระบุ
    const hasJobType = openJobs.some((j) => j.jobType?.trim())
    if (!hasJobType) return FAQ_PARTTIME_FALLBACK
    return `ตอนนี้ตำแหน่งที่เปิดรับอยู่ยังไม่มีที่ระบุว่าเป็นพาร์ทไทม์ค่ะ 😊
แต่ประเภทงานอาจเปลี่ยนตามสาขา บอกพี่ร็อคกี้ได้เลยว่าสนใจแบรนด์ไหน สาขาไหน เดี๋ยวเช็กให้อีกทีค่ะ 🫡`
  }

  // brand → ตำแหน่ง[] (ไม่ซ้ำ, คงลำดับที่พบ)
  const brandOrder: string[] = []
  const byBrand: Record<string, string[]> = {}
  for (const job of partTimeJobs) {
    if (!byBrand[job.brand]) { byBrand[job.brand] = []; brandOrder.push(job.brand) }
    if (!byBrand[job.brand].includes(job.jobTitle)) byBrand[job.brand].push(job.jobTitle)
  }
  const blocks = brandOrder.map((brand) => {
    const bullets = byBrand[brand].map((title) => `• ${title}`).join('\n')
    return `🏢 ${brand}:\n${bullets}`
  })

  return `รับพาร์ทไทม์ค่ะ 🎉 ตอนนี้เปิดรับตำแหน่งเหล่านี้อยู่ค่ะ\n\n${blocks.join('\n\n')}\n\n👇 สนใจตำแหน่งไหน สาขาไหน พิมพ์บอกพี่ร็อคกี้ได้เลยนะคะ 😊`
}

// ตรวจจับคำเรียกตำแหน่งภาษาไทยจากข้อความผู้ใช้ → คืนชื่อตำแหน่งอังกฤษที่เป็น key
// - ทั้งข้อความตรงกับ synonym/key เป๊ะ → คืนทันที (มั่นใจสุด)
// - ถ้าเจอ synonym เป็นส่วนหนึ่งของข้อความ → เลือก match ที่ "ยาวที่สุด" (เจาะจงสุด)
//   เพื่อให้ผลคงที่ ไม่ขึ้นกับลำดับ key เช่น "หัวหน้า" vs "หน้าร้าน" ที่อาจชนกัน
function detectPositionSynonym(text: string): string | null {
  const normalized = text.toLowerCase().trim()
  let best: { canonical: string; len: number } | null = null

  for (const [canonical, synonyms] of Object.entries(positionSynonyms)) {
    if (normalized === canonical) return canonical
    for (const syn of synonyms) {
      const s = syn.toLowerCase().trim()
      if (normalized === s) return canonical
      if (normalized.includes(s) && (!best || s.length > best.len)) {
        best = { canonical, len: s.length }
      }
    }
  }
  return best?.canonical ?? null
}

// จัดรูปแบบรายชื่อสาขาให้อ่านง่าย — bullet, จำกัดจำนวนบรรทัด, ปิดท้ายชวนดู Rich Menu
function formatBranchList(branches: string[], limit = 8): string {
  const unique = Array.from(new Set(branches))
  const bullets = unique.slice(0, limit).map((b) => `• ${b}`).join('\n')
  return `${bullets}\n...หรือตรวจสอบสาขาที่เปิดรับเพิ่มเติมได้จาก Rich Menu ด้านล่างได้เลยค่ะ 😊`
}

function detectChangeIntent(text: string): 'all' | 'brand' | 'position' | 'branch' | null {
  if (/เปลี่ยนใจ|เริ่มใหม่|ขอเริ่มใหม่|ยกเลิก/.test(text)) return 'all'
  if (/เปลี่ยนแบรนด์|เปลี่ยนบริษัท/.test(text)) return 'brand'
  if (/เปลี่ยนตำแหน่ง|เปลี่ยนงาน|อยากเปลี่ยนตำแหน่ง|ขอเปลี่ยนตำแหน่ง/.test(text)) return 'position'
  if (/เปลี่ยนสาขา|อยากเปลี่ยนสาขา|ขอเปลี่ยนสาขา/.test(text)) return 'branch'
  return null
}

function looksLikeBrowseIntent(text: string): boolean {
  return /มีอะไรว่าง|ว่างไหม|ว่างบ้าง|รับสมัครอะไร|รับอะไรบ้าง|มีตำแหน่งไหน|มีตำแหน่งอะไร|ตำแหน่งอะไร|ตำแหน่งไหน|ตำแหน่งว่าง|ตำแหน่งที่เปิด|ตำแหน่งเปิดรับ|ตำแหน่งงานที่เปิด|ตำแหน่งที่ว่าง|งานที่เปิดรับ|มีงานไหม|มีงานอะไร|งานอะไรว่าง|งานอะไรบ้าง|เปิดรับอะไร|เปิดรับตำแหน่งอะไร|เปิดรับสมัครอะไร|มีอะไรบ้าง|รับตำแหน่งอะไร|สมัครงานอะไร/.test(text)
}

// ผู้สมัครพิมพ์เพื่อขอออกจากโหมด handover กลับมาใช้บอท
function looksLikeResumeBot(text: string): boolean {
  return /คุยกับบอท|กลับมาคุยกับบอท|กลับไปใช้บอท|ใช้บอทต่อ|คุยกับร็อคกี้|กลับไปคุยกับบอท/.test(text)
}

function looksLikeSmallTalk(text: string): boolean {
  const t = text.trim()
  return /^(สวัสดี|หวัดดี|ดีจ้า|ดีครับ|ดีค่ะ|ดีนะ|hi\b|hello\b|hey\b|ฮัลโหล|ว่าไง|เป็นยังไงบ้าง|โอเค|โอเคค่ะ|โอเคครับ|oke|ok\b|ขอบคุณ|ขอบใจ|เยี่ยม|เจ๋ง|ดีมาก|555+|ฮ่าฮ่า|ขำ|ฮาฮา|ได้ครับ|ได้ค่ะ|ได้เลย|รับทราบ|ทราบแล้ว|เข้าใจแล้ว|โอเคเลย)/i.test(t)
}

function looksLikeQuestion(text: string): boolean {
  return /[?？]/.test(text) ||
    ['ไหม', 'มั้ย', 'อะไร', 'เท่าไหร่', 'ที่ไหน', 'ยังไง', 'อย่างไร', 'ได้บ้าง', 'บ้างไหม', 'หรือเปล่า', 'หรือไม่', 'มีไหม', 'รับไหม'].some((kw) => text.includes(kw))
}

async function buildReply(userText: string, displayName: string): Promise<string> {
  const jobs = await fetchJobs()
  const matched = filterJobs(jobs, userText)

  if (!matched.length) {
    console.log('[webhook] No jobs matched, sending default')
    await notifyHrGroup(displayName, userText).catch(() => {})
    return DEFAULT_MESSAGE
  }

  const jobsText = formatJobsForAI(matched)

  const answer = await generateReply(jobsText, userText)
  if (!answer || answer === DEFAULT_REPLY) {
    await notifyHrGroup(displayName, userText).catch(() => {})
    return DEFAULT_MESSAGE
  }

  const ok = await doubleCheck(jobsText, userText, answer)
  if (!ok) {
    console.warn('[webhook] Double-check failed, sending default')
    await notifyHrGroup(displayName, userText).catch(() => {})
    return DEFAULT_MESSAGE
  }

  return answer
}

// รับได้ทั้งข้อความธรรมดา (string) และ message object สำเร็จรูป (Flex / Quick Reply)
type ReplyItem = string | messagingApi.Message

async function sendReply(replyToken: string, items: ReplyItem | ReplyItem[]): Promise<void> {
  const messages = (Array.isArray(items) ? items : [items]).map((item) =>
    typeof item === 'string' ? ({ type: 'text' as const, text: item }) : item
  )
  try {
    await getLineClient().replyMessage({ replyToken, messages })
  } catch (err) {
    console.error('[webhook] Failed to send reply:', err)
  }
}

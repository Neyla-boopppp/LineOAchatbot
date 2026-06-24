import { NextRequest, NextResponse } from 'next/server'
import { messagingApi, webhook, validateSignature } from '@line/bot-sdk'
import { fetchJobs } from '@/lib/data/sheet'
import { filterJobs, formatJobsForAI, isOpen } from '@/lib/data/job-search'
import { generateReply, doubleCheck, DEFAULT_REPLY, extractApplicationInfo, extractScreeningInfo } from '@/lib/ai/groq'
import { notifyHrGroup, notifyHrApplicant } from '@/lib/line/notify'
import { getState, setState, WELCOME_MESSAGE, NON_THAI_DOCS, buildSummaryMessage, buildMissingMessage } from '@/lib/session/screening'

export const maxDuration = 30

const DEFAULT_MESSAGE = 'คำถามนี้ขอส่งต่อให้ HR ดูแลค่ะ กรุณารอสักครู่นะคะ 😊'

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

  Promise.all(events.map(handleEvent)).catch((err) =>
    console.error('[webhook] Unhandled error:', err)
  )

  return NextResponse.json({ status: 'ok' })
}

async function handleEvent(event: webhook.Event): Promise<void> {
  if (event.type !== 'message') return

  const replyToken = (event as webhook.MessageEvent).replyToken
  if (!replyToken) return

  const userId = 'source' in event ? (event.source as webhook.UserSource).userId : undefined
  const state = userId ? await getState(userId) : undefined

  if (event.message.type !== 'text') {
    if (state?.phase === 'awaiting_documents') {
      let displayName = 'ไม่ทราบชื่อ'
      try {
        if (userId) displayName = (await getLineClient().getProfile(userId)).displayName
      } catch {}
      if (userId) await setState(userId, { phase: 'ready', brand: state.brand, position: state.position, branch: state.branch })
      notifyHrApplicant(displayName, state.brand, state.position, state.branch, 'ผู้สมัครส่งเอกสารแล้ว รบกวน HR เข้าไปคุยต่อด้วยนะคะ').catch(() => {})
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

  const FOLLOW_UP_Q = 'ก่อนอื่นขอสอบถามข้อมูลเบื้องต้นก่อนนะคะ 😊 สัญชาติอะไร อายุเท่าไหร่ เพศอะไรคะ?'
  let replyText: string | string[]

  if (!state) {
    if (userId) await setState(userId, { phase: 'collecting_info' })
    replyText = WELCOME_MESSAGE
  } else if (state.phase === 'collecting_info') {
    const extracted = await extractApplicationInfo(userText)
    const brand = extracted.brand ?? state.brand
    const position = extracted.position ?? state.position
    const branch = extracted.branch ?? state.branch

    if (userId) await setState(userId, { phase: 'collecting_info', brand, position, branch })

    const missing: string[] = []
    if (!brand) missing.push('ชื่อแบรนด์ที่ต้องการสมัคร')
    if (!position) missing.push('ตำแหน่งงานที่สนใจ')
    if (!branch) missing.push('สาขาที่สะดวก')

    const nothingExtracted = extracted.brand === null && extracted.position === null && extracted.branch === null

    if (nothingExtracted && !looksLikeQuestion(userText) && missing.length === 0) return

    if (missing.length === 0) {
      const header = buildSummaryMessage(brand!, position!, branch!)
      const jobs = await fetchJobs()
      const matched = filterJobs(jobs, `${brand} ${position} ${branch}`)

      const jobIsOpen = matched.length > 0 && matched.some((j) => isOpen(j.status))

      let jobInfo: string | null = null
      if (matched.length > 0) {
        const jobsText = formatJobsForAI(matched)
        jobInfo = await generateReply(jobsText, `ตำแหน่ง ${position!} สาขา ${branch!} ของ ${brand!} เปิดรับสมัครหรือปิดรับสมัครอยู่คะ?`)
      }

      const firstMsg =
        jobInfo && jobInfo !== DEFAULT_REPLY
          ? `${header}\n\n${jobInfo}`
          : `${header}\n\nทางทีมงานจะรีบตรวจสอบข้อมูลและติดต่อกลับไปโดยเร็วที่สุดเลยค่ะ 🙏`

      if (jobIsOpen) {
        if (userId) await setState(userId, { phase: 'awaiting_screening', brand, position, branch })
        replyText = [firstMsg, FOLLOW_UP_Q]
      } else {
        if (userId) await setState(userId, { phase: 'collecting_info' })
        replyText = [firstMsg, 'สนใจตำแหน่งอื่นหรือสาขาอื่นไหมคะ']
      }
    } else if (nothingExtracted && looksLikeQuestion(userText)) {
      replyText = await buildReply(userText, displayName)
    } else {
      replyText = buildMissingMessage(missing)
    }
  } else if (state.phase === 'awaiting_screening') {
    const screening = await extractScreeningInfo(userText)
    const replies: string[] = []

    if (screening.age !== null && screening.age < 19) {
      replies.push('ทางเราจะรับอายุ 19 ปีบริบูรณ์ขึ้นไปค่ะ')
    }

    if (screening.age !== null && screening.age > 35) {
      replies.push('ทางเราจะรับถึงอายุ 35 ปีค่ะ')
    }

    if (screening.isThai === false) {
      replies.push(NON_THAI_DOCS)
    }

    if (screening.isThai === false) {
      if (userId) await setState(userId, { phase: 'awaiting_documents', brand: state.brand, position: state.position, branch: state.branch })
    } else {
      if (userId) await setState(userId, { phase: 'ready', brand: state.brand, position: state.position, branch: state.branch })
    }

    if (replies.length === 0) {
      notifyHrApplicant(displayName, state.brand, state.position, state.branch).catch(() => {})
      replyText = 'ขอบคุณค่ะ 😊 ทีม HR จะติดต่อกลับหาคุณเร็วๆ นี้นะคะ หากมีคำถามเพิ่มเติม สามารถสอบถามพี่ร็อคกี้ได้เลยค่ะ'
    } else {
      replyText = replies
    }
  } else if (state.phase === 'awaiting_documents') {
    if (userId) await setState(userId, { phase: 'ready', brand: state.brand, position: state.position, branch: state.branch })
    notifyHrApplicant(displayName, state.brand, state.position, state.branch, 'ผู้สมัครส่งเอกสารแล้ว รบกวน HR เข้าไปคุยต่อด้วยนะคะ').catch(() => {})
    return
  } else {
    replyText = await buildReply(userText, displayName)
  }

  await sendReply(replyToken, replyText)
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
    notifyHrGroup(displayName, userText).catch(() => {})
    return DEFAULT_MESSAGE
  }

  const jobsText = formatJobsForAI(matched)

  const answer = await generateReply(jobsText, userText)
  if (!answer || answer === DEFAULT_REPLY) {
    notifyHrGroup(displayName, userText).catch(() => {})
    return DEFAULT_MESSAGE
  }

  const ok = await doubleCheck(jobsText, userText, answer)
  if (!ok) {
    console.warn('[webhook] Double-check failed, sending default')
    notifyHrGroup(displayName, userText).catch(() => {})
    return DEFAULT_MESSAGE
  }

  return answer
}

async function sendReply(replyToken: string, texts: string | string[]): Promise<void> {
  const messages = (Array.isArray(texts) ? texts : [texts]).map((text) => ({
    type: 'text' as const,
    text,
  }))
  try {
    await getLineClient().replyMessage({ replyToken, messages })
  } catch (err) {
    console.error('[webhook] Failed to send reply:', err)
  }
}

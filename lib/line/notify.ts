import { messagingApi } from '@line/bot-sdk'

let lineClient: messagingApi.MessagingApiClient | null = null

function getClient(): messagingApi.MessagingApiClient {
  if (!lineClient) {
    lineClient = new messagingApi.MessagingApiClient({
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '',
    })
  }
  return lineClient
}

export async function notifyHrGroup(
  displayName: string,
  question: string
): Promise<void> {
  const groupId = process.env.HR_LINE_GROUP_ID
  if (!groupId) {
    console.warn('[line-notify] HR_LINE_GROUP_ID is not set, skipping notify')
    return
  }

  const message = `🔔 มีคำถามจากผู้สมัคร\nชื่อ: ${displayName}\nคำถาม: ${question}`

  try {
    const client = getClient()
    await client.pushMessage({
      to: groupId,
      messages: [{ type: 'text', text: message }],
    })
    console.log('[line-notify] Notified HR group for:', displayName)
  } catch (err) {
    console.error('[line-notify] Failed to notify HR group:', err)
  }
}

export async function notifyHrHandover(
  displayName: string,
  context?: { brand?: string; position?: string; branch?: string }
): Promise<void> {
  const groupId = process.env.HR_LINE_GROUP_ID
  if (!groupId) {
    console.warn('[line-notify] HR_LINE_GROUP_ID is not set, skipping notify')
    return
  }

  const brandLine = context?.brand ? `\n🏢 แบรนด์: ${context.brand}` : ''
  const posLine = context?.position ? `\n💼 ตำแหน่ง: ${context.position}` : ''
  const branchLine = context?.branch ? `\n📍 สาขา: ${context.branch}` : ''
  const message = `🤝 ผู้สมัครต้องการติดต่อเจ้าหน้าที่โดยตรงค่ะ\nชื่อ: ${displayName}${brandLine}${posLine}${branchLine}\n\nรบกวนทีม HR เข้าไปดูแลด้วยนะคะ 😊`

  try {
    const client = getClient()
    await client.pushMessage({
      to: groupId,
      messages: [{ type: 'text', text: message }],
    })
    console.log('[line-notify] Notified HR group — handover:', displayName)
  } catch (err) {
    console.error('[line-notify] Failed to notify HR group (handover):', err)
  }
}

export async function notifyHrApplicant(
  displayName: string,
  brand: string | undefined,
  position: string | undefined,
  branch: string | undefined,
  note?: string,
): Promise<void> {
  const groupId = process.env.HR_LINE_GROUP_ID
  if (!groupId) {
    console.warn('[line-notify] HR_LINE_GROUP_ID is not set, skipping notify')
    return
  }

  const header = note
    ? `📎 ${note}`
    : '🙋 มีผู้สมัครใหม่รอการติดต่อกลับค่ะ'

  const message = `${header}\nชื่อ: ${displayName}\n🏢 แบรนด์: ${brand ?? '-'}\n💼 ตำแหน่ง: ${position ?? '-'}\n📍 สาขา: ${branch ?? '-'}`

  try {
    const client = getClient()
    await client.pushMessage({
      to: groupId,
      messages: [{ type: 'text', text: message }],
    })
    console.log('[line-notify] Notified HR group — applicant:', displayName, note ?? 'new')
  } catch (err) {
    console.error('[line-notify] Failed to notify HR group:', err)
  }
}

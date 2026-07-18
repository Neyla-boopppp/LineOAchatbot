# สรุปโปรเจค — Rocksgroup LINE OA Chatbot ("พี่ร็อคกี้")

> เอกสารสรุปภาพรวมระบบ สำหรับผู้ดูแลและนักพัฒนา
> อัปเดตล่าสุด: 2026-07-17

---

## 1. ภาพรวม (Overview)

LINE Official Account chatbot สำหรับงาน **HR / รับสมัครงาน** ของ Rocksgroup ดูแล 3 แบรนด์:
**Potato Corner, Khao So-i, Uno Coffee**

บอทมีตัวตนคือ **"พี่ร็อคกี้" (Rockie)** ทำหน้าที่:
- ตอบคำถามตำแหน่งงานว่างจาก Google Sheet (แบบ real-time พร้อม cache)
- เก็บข้อมูลผู้สมัคร (แบรนด์ / ตำแหน่ง / สาขา) แบบ conversational
- คัดกรองเบื้องต้น (สัญชาติ / อายุ 19–35)
- แจ้งทีม HR ผ่าน LINE Group เมื่อมีผู้สมัครใหม่ / ส่งเอกสาร / ขอคุยกับเจ้าหน้าที่
- รองรับ Rich Menu (ตำแหน่งงานว่าง / เอกสารที่ต้องใช้ / ติดต่อเจ้าหน้าที่)
- โหมด Handover ส่งต่อให้ HR ตอบเองได้

> **หมายเหตุ:** โปรเจคนี้มี **2 ระบบแยกกัน** — (A) ตัวบอท LINE ที่ใช้งานจริง และ (B) ระบบ Multi-Agent "Jeeb Team" (เครื่องมือช่วยพัฒนา ไม่เกี่ยวกับ runtime ของบอท) ดูหัวข้อ 7

---

## 2. Tech Stack

| ส่วน | เทคโนโลยี |
|---|---|
| Framework | Next.js 14 (App Router) + TypeScript |
| Hosting | Vercel (Serverless Functions) |
| LINE | `@line/bot-sdk` v11 (Messaging API) |
| AI (บอท) | Google Gemini API — `gemini-2.5-flash` |
| AI (Jeeb Team) | Anthropic Claude — `@anthropic-ai/sdk` |
| ฐานข้อมูลงาน | Google Sheet (publish เป็น CSV) |
| Session store | Vercel KV (fallback in-memory) |

---

## 3. โครงสร้างไฟล์ (Structure)

```
app/
  api/
    webhook/route.ts      ← หัวใจหลัก: รับ LINE webhook + flow ทั้งหมด
    jeab/route.ts         ← endpoint ของ Jeeb Team (dev tool)
    admin/jobs/route.ts   ← debug endpoint ดู/รีเฟรช Sheet (⚠️ ยังไม่มี auth)
  layout.tsx, page.tsx
lib/
  ai/chatbot-ai.ts        ← Gemini: generateReply, doubleCheck, extract*, resolveBranchName
  ai/claude-agent.ts      ← wrapper เรียก Claude (Jeeb Team)
  data/sheet.ts           ← ดึง + parse CSV + cache 15 นาที
  data/job-search.ts      ← filter/score/format ตำแหน่งงาน
  line/notify.ts          ← push แจ้งเตือนเข้ากลุ่ม HR
  session/screening.ts    ← ข้อความ template + re-export state
  session/store.ts        ← getState/setState (KV / in-memory)
  agents/                 ← Jeeb Team: jeab, job, jarb, jetaime, jub, jib, jan
types/                    ← job.ts, session.ts, agent.ts
docs/                     ← WORKFLOW.md + สเปกราย agent
```

---

## 4. Flow การทำงานของบอท (Webhook)

จุดเข้า: `POST /api/webhook` ([app/api/webhook/route.ts](app/api/webhook/route.ts))

1. **ตรวจ signature** (`validateSignature`) — ปฏิเสธถ้าไม่ถูกต้อง (401)
2. รับเฉพาะแชต 1:1 (`source.type === 'user'`) — กันข้อความจากกลุ่ม HR
3. **Rich Menu intent** (match ข้อความแบบ normalize):
   - `ตำแหน่งงานว่าง` → `buildJobsListReply()` (แบรนด์ → สาขา → bullet ตำแหน่ง)
   - `เอกสารที่จำเป็น...` → ข้อความ template
   - `ติดต่อเจ้าหน้าที่` → เข้าโหมด handover + แจ้ง HR
4. **Handover mode** → forward ข้อความเข้ากลุ่ม HR (บอทเงียบ) จนกว่าจะพิมพ์ "คุยกับบอท"
5. **State machine** ตาม `phase` (ดูหัวข้อ 5)
6. รูป/วิดีโอ/ไฟล์ → แจ้ง HR ว่าผู้สมัครส่งเอกสาร

### AI สองชั้น (กัน hallucination)
- **Pass 1** `generateReply` — ตอบจากตาราง `<jobs>` เท่านั้น, คืน `__NOT_IN_DATA__` ถ้าไม่พบ
- **Pass 2** `doubleCheck` — ตรวจว่าคำตอบตรงกับข้อมูลจริง (OK / NOT_OK)
- **Synonym mapping** ([route.ts](app/api/webhook/route.ts) `positionSynonyms`) — แปลงคำไทยหลวมๆ ("ล้างจาน" → "steward") ก่อนส่ง LLM

---

## 5. State Machine (Session Phases)

เก็บใน Vercel KV key `session:<userId>` (TTL 24 ชม.) — [types/session.ts](types/session.ts)

| Phase | ความหมาย |
|---|---|
| `collecting_info` | กำลังเก็บ แบรนด์ / ตำแหน่ง / สาขา |
| `awaiting_screening` | ผ่านขั้นตำแหน่งเปิดรับ → ถามสัญชาติ/อายุ/เพศ |
| `awaiting_documents` | ต่างชาติ → รอเอกสาร 4 อย่าง |
| `handover` | ส่งต่อให้ HR ตอบเอง |
| `ready` | (legacy) มี safety-net reset |

**เกณฑ์คัดกรอง:** อายุ 19–35 ปี · คนไทยผ่านเข้าแจ้ง HR · ต่างชาติต้องส่งวีซ่า/พาสปอร์ต/ใบอนุญาตทำงาน/smart card

---

## 6. แหล่งข้อมูลงาน (Google Sheet)

- ดึงผ่าน `SHEET_CSV_URL` (published CSV) — [lib/data/sheet.ts](lib/data/sheet.ts)
- Cache ใน memory **15 นาที** → แก้ Sheet แล้วบอทเห็นภายใน 15 นาที
- คอลัมน์: `ID, Brand, Job_Title, Branch, Job_Type, Salary, Description, Qualifications, Benefit, เอกสาร, Status`
- สถานะที่ถือว่า "เปิด": มีคำว่า `เปิดรับ` / `open` / `เปิด`
- Debug: `GET /api/admin/jobs?q=<คำค้น>&refresh=1` (⚠️ **ควรเพิ่ม auth ก่อน production**)

---

## 7. Jeeb Team — ระบบ Multi-Agent (Dev Tool)

**แยกจาก runtime ของบอท** เป็นเครื่องมือช่วยพัฒนา ขับด้วย Claude — [lib/agents/jeab.ts](lib/agents/jeab.ts)

จุดเข้า `POST /api/jeab` { "request": "..." } → `dispatch()` classify เป็น route แล้ววิ่ง pipeline:

| Agent | บทบาท |
|---|---|
| **Jeab** | Orchestrator — จัดเส้นทาง + สังเคราะห์ผล |
| Job | กลยุทธ์การตลาด / funnel / CRM |
| Jarb | ออกแบบ flow / UX / copy / Rich Menu |
| Jetaime | แปลง brief → technical spec / schema / FSM |
| Jub | เขียนโค้ด LINE / API / Flex Message |
| Jib | QA + **VETO** (block pipeline ได้) |
| Jan | Final delivery gate (polish ก่อนส่ง) |

Routes: `marketing`, `flow_design`, `code`, `flex_message`, `qa`, `debug`, `compliance`

---

## 8. Environment Variables

ดู [.env.example](.env.example) — ค่าที่ต้องตั้ง:

| Variable | ใช้ทำอะไร |
|---|---|
| `LINE_CHANNEL_ACCESS_TOKEN` / `LINE_CHANNEL_SECRET` | LINE Messaging API |
| `GEMINI_API_KEY` | AI ตัวบอท (Google Gemini) |
| `ANTHROPIC_API_KEY` | Jeeb Team (Claude) |
| `SHEET_CSV_URL` | ฐานข้อมูลตำแหน่งงาน (CSV) |
| `HR_LINE_GROUP_ID` | กลุ่ม LINE ทีม HR (รับแจ้งเตือน) |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Vercel KV session (ถ้าไม่ใส่ → in-memory, หายทุก cold start) |

---

## 9. คำสั่งพัฒนา (Scripts)

```bash
npm run dev     # รัน local (next dev)
npm run build   # build production
npm run start   # รัน production build
npm run lint    # ESLint
```

---

## 10. จุดที่ควรระวัง / TODO

- [ ] `/api/admin/jobs` ยังไม่มี authentication — ควรเพิ่มก่อน production
- [ ] ถ้าไม่ตั้ง Vercel KV → session เก็บ in-memory จะหายทุก cold start (serverless)
- [ ] Cache Sheet 15 นาที — การอัปเดตงานด่วนจะดีเลย์สูงสุด 15 นาที
- [ ] Gemini API — ตรวจสอบ quota, rate limit และ billing ของ Google AI Studio ให้เหมาะกับ traffic

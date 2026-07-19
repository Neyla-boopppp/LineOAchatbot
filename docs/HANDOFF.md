# Handoff — Rocksgroup LINE OA Chatbot ("พี่ร็อคกี้")

> เอกสารส่งต่องาน สรุปสิ่งที่ทำล่าสุด สถานะปัจจุบัน และสิ่งที่ต้องทำต่อ
> อัปเดตล่าสุด: 2026-07-19

---

## 1. สถานะปัจจุบัน (TL;DR)

- ✅ **บอทใช้งานจริงบน production** — Vercel auto-deploy จาก `main` (repo: `Neyla-boopppp/LineOAchatbot`)
- ✅ **AI ของบอทย้ายจาก Groq → Google Gemini free tier** เรียบร้อย (model `gemini-3.5-flash`)
- ✅ ตั้ง `GEMINI_API_KEY` ทั้ง local และ Vercel แล้ว (ยืนยันว่าบอทตอบด้วย Gemini ได้จริง)
- ✅ แก้ปัญหา flow/คุณภาพคำตอบ 5 จุด (P1–P5) จากการทดสอบจริง

**เหตุผลที่เลือก Gemini free:** งบจำกัด ต้องฟรี รองรับ ~600–700 ผู้สมัคร/เดือน — Gemini free tier รับ volume ได้ดีกว่า Groq (Groq ตัน token/วันเร็วกว่า) และเก่งภาษาไทย + JSON extraction กว่า ดู [PROJECT_SUMMARY.md](../PROJECT_SUMMARY.md) §10 สำหรับ trade-off เรื่อง PDPA

---

## 2. สิ่งที่ทำใน session ล่าสุด (ไล่ตาม commit)

| Commit | เรื่อง |
|---|---|
| `d101fda` (PR #1) | ย้าย AI จาก Groq → Gemini (adapter `lib/ai/chatbot-ai.ts` + tests) |
| `bb40af2` (PR #2) | เปลี่ยน model เป็น `gemini-3.5-flash` |
| `3c02149` | เพิ่มข้อความ PDPA consent + เก็บ Groq key เป็น fallback ใน `.env.example` |
| `ab146b6` | **P1** browse intent + **P2** ปุ่มสวัสดิการ |
| `c6687c0` | **P3** disambiguation ตำแหน่ง + **P4** state hygiene + **P5** จูน extraction |

### รายละเอียดการแก้ P1–P5 (จาก log ทดสอบจริง)

- **P1 — Browse "แบรนด์ X มีตำแหน่งอะไรบ้าง":** ขยาย `looksLikeBrowseIntent`, ให้ browse มาก่อนไม่ให้ position เก่า block, ถ้าไม่รู้แบรนด์ → โชว์งานทั้งหมด (แทนการเด้ง HR) — `app/api/webhook/route.ts`
- **P2 — ปุ่ม "สวัสดิการและผลตอบแทน":** เพิ่ม Rich Menu intent `benefits` ตอบจากคอลัมน์ `Benefit` ใน Sheet จริง
- **P3 — ตำแหน่งกำกวม:** "ล้างจาน" ที่ match ทั้ง Steward + Head Steward → ตัดตำแหน่งหัวหน้าออกก่อน / ถามให้เลือก แทนการเดา
- **P4 — state ค้าง:** ตอน not-found/ถามเลือก เก็บแบรนด์ ล้าง position + history กัน context เก่าปน
- **P5 — จูน Gemini:** prompt ยึดข้อความปัจจุบันก่อน history + เปิด thinking budget เล็กน้อยเฉพาะ `extractApplicationInfo` (512) และ `resolveBranchName` (256) — `lib/ai/chatbot-ai.ts`

---

## 3. Environment / Config ที่ต้องมี

ตั้งบน **Vercel project** (ตัวที่ LINE webhook ชี้ไป) และ local `.env`:

| Variable | ใช้ทำอะไร | สถานะ |
|---|---|---|
| `LINE_CHANNEL_ACCESS_TOKEN` / `LINE_CHANNEL_SECRET` | LINE Messaging API | ตั้งแล้ว |
| `GEMINI_API_KEY` | AI ของบอท (Gemini) | ✅ ตั้งแล้ว |
| `ANTHROPIC_API_KEY` | Jeeb Team (dev tool, แยกจาก runtime บอท) | — |
| `SHEET_CSV_URL` | ฐานข้อมูลตำแหน่งงาน (CSV) | ตั้งแล้ว |
| `HR_LINE_GROUP_ID` | กลุ่ม LINE ทีม HR (รับแจ้งเตือน) | ตั้งแล้ว |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Vercel KV (session) | ⚠️ ถ้าไม่ตั้ง → in-memory หายทุก cold start |
| `GROQ_API_KEY` | (เลิกใช้แล้ว) เก็บ comment ไว้ใน `.env.example` เป็น fallback | ไม่ถูกใช้ในโค้ด |

> ⚠️ มี **2 Vercel projects** ต่อกับ repo นี้ (`lineoa-chatbot` และ `line-o-achatbot`) — ทั้งคู่ deploy สำเร็จ ควรยืนยันว่าตั้ง `GEMINI_API_KEY` ในตัวที่ webhook ใช้จริง และพิจารณาลบตัวที่ไม่ใช้กันสับสน

---

## 4. วิธี verify / test / deploy

```powershell
# ⚠️ PowerShell block npm.ps1 — ใช้ npm.cmd / npx.cmd แทน
npm.cmd test                              # Vitest (mock, ไม่ยิง network) — ควรผ่าน 15/15
npx.cmd tsc --noEmit --incremental false  # type-check — exit 0
npm.cmd run lint                          # ESLint — no errors
npm.cmd run build                         # Next.js production build
```

**Deploy:** push `main` → Vercel auto-deploy. เช็คสถานะ deploy ได้จาก GitHub commit status หรือ Vercel dashboard

**เทสต์บนบอทจริง (เคสที่เคยพลาด):**
1. `"Potato Corner มีตำแหน่งอะไรเปิดรับบ้าง"` → ควรลิสต์ตำแหน่ง (ไม่เด้ง HR)
2. `"มีตำแหน่งอะไรบ้าง"` (ไม่บอกแบรนด์) → โชว์งานทั้งหมด
3. กดปุ่ม **สวัสดิการและผลตอบแทน** → ตอบเรื่องสวัสดิการ
4. `"Potato Corner พนักงานล้างจาน ไอคอนสยาม"` → ได้ Steward (ไม่ใช่ Head Steward) หรือถามให้เลือก
5. หลัง "ไม่พบตำแหน่ง" → พิมพ์ใหม่ ไม่วนกลับตำแหน่งเก่า

---

## 5. สิ่งที่ต้องจับตา / ยังไม่ได้ทำ (TODO)

- [ ] **P5 quota/latency:** thinking budget ทำให้ตอบช้าลง ~1-2 วิ และกิน token เพิ่ม — ถ้าเจอ **429** หรือช้าเกิน ลด/ปิดที่ `thinkingConfig.thinkingBudget` ใน `lib/ai/chatbot-ai.ts` (ตั้งเป็น 0 = ปิด)
- [ ] **`gemini-3.5-flash` free quota:** ยืนยัน RPD/TPM ของ free tier ให้พอกับ ~450–500 calls/วัน ถ้าไม่พอ → สลับ Flash รุ่น RPD สูงกว่า หรือลด call ต่อข้อความ (ตัด `doubleCheck` / ลดขนาดตาราง jobs)
- [ ] **PDPA:** Gemini free tier — Google เทรนข้อมูลที่ส่งเข้าไป มีข้อความแจ้งผู้สมัครแล้ว แต่ถ้าต้องเข้มงวด → อัปเกรด Gemini paid (ไม่เทรน) หรือกลับ Groq ดู PROJECT_SUMMARY §10
- [ ] `/api/admin/jobs` ยังไม่มี authentication — ควรเพิ่มก่อนใช้จริงหนักๆ
- [ ] ตั้ง Vercel KV (ถ้ายังไม่ได้ตั้ง) — ไม่งั้น session หายทุก cold start
- [ ] Cache Sheet 15 นาที — งานด่วนดีเลย์สูงสุด 15 นาที
- [ ] พิจารณาลบ Vercel project ที่ไม่ใช้ (เหลือตัวเดียว)

---

## 6. วิธี rollback กลับไป Groq (ถ้าจำเป็น)

Gemini free มีปัญหา (quota/คุณภาพ) → กู้ Groq ได้จาก git history:
- โค้ด Groq เดิม (`lib/ai/groq.ts` + `groq-sdk`) อยู่ครบใน branch `feature/gemini-migration` และ commit ก่อน `d101fda`
- ต้อง: กู้ `lib/ai/groq.ts`, `npm install groq-sdk`, เปลี่ยน import ใน `app/api/webhook/route.ts` กลับเป็น `@/lib/ai/groq`, ตั้ง `GROQ_API_KEY`
- **แค่มี key อย่างเดียวกลับมาใช้ไม่ได้** ต้องกู้โค้ดด้วย

---

## 7. โครงสร้าง/ไฟล์สำคัญ

- `app/api/webhook/route.ts` — หัวใจ flow บอท (Rich Menu, browse, state machine, screening)
- `lib/ai/chatbot-ai.ts` — Gemini adapter (generateReply, doubleCheck, extract*, resolveBranch) + จุดปรับ model/thinking
- `lib/session/screening.ts` — ข้อความ template + `WELCOME_MESSAGE` (มี PDPA notice)
- `lib/data/sheet.ts` / `job-search.ts` — ดึง+parse CSV / filter+format งาน
- `docs/superpowers/plans|specs/` — แผน+สเปกการ migration
- ดูภาพรวมทั้งหมดที่ [PROJECT_SUMMARY.md](../PROJECT_SUMMARY.md)

> **หมายเหตุ:** "Jeeb Team" (`lib/agents/**`, `/api/jeab`) เป็น dev tool แยกต่างหาก ขับด้วย Claude — ไม่เกี่ยวกับ runtime บอทที่ผู้สมัครคุยด้วย

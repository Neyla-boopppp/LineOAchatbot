# HANDOFF — Rocksgroup LINE OA Bot ("พี่ร็อคกี้")

> อัปเดต: 2026-07-19 · ผู้ส่งต่อ: session ปรับปรุงคุณภาพการตอบ + follow greeting
> อ่านคู่กับ `PROJECT_SUMMARY.md` (ภาพรวมระบบ) และ `CLAUDE.md`

---

## ⚠️ สิ่งที่ต้องรู้ก่อนทำต่อ (สำคัญสุด)

1. ~~**Production ล้ำหน้า `main` อยู่**~~ → **แก้แล้ว 2026-07-21**: push `fix/bot-reply-quality`
   ขึ้น origin + merge เข้า `main` เรียบร้อย ตอนนี้ `main` = `fix/bot-reply-quality` = production
   ที่ commit `f96a7c5`
2. **⚠️ โปรเจกต์ผูก Git integration อยู่ — push `main` = deploy production อัตโนมัติ**
   (ค้นพบ 2026-07-21: มี alias `lineoa-chatbot-git-main-neyla-s-projects.vercel.app` และการ push
   main ครั้งนี้ trigger production deploy ทันที) ข้อมูลเดิมที่เขียนว่า "deploy ผ่าน CLI เท่านั้น
   ไม่ผูก git" **ไม่ถูกต้อง** → ห้าม push main เว้นแต่ตั้งใจจะ deploy จริง
3. **Deploy ด้วย Vercel CLI ก็ยังใช้ได้** — `npx vercel --prod --yes` deploy จาก working tree
   ปัจจุบัน (ไม่ผูกกับ branch/commit)
4. LINE webhook ชี้ **production URL ตายตัว** → preview deploy จะไม่ได้รับ event จริงจาก LINE

---

## 🔒 จุดสำรอง / Rollback (ตั้งไว้ 2026-07-21 ก่อนปรับ Rich Menu ชุดใหม่)

| | |
|---|---|
| Git tag ตัวที่บอทตอบดี | `v1-stable-bot` → commit `f96a7c5` (push ขึ้น origin แล้ว) |
| Branch สำรอง | `origin/fix/bot-reply-quality` และ `origin/main` (ทั้งคู่ = `f96a7c5`) |
| Production deployment ตอนนี้ | `dpl_5HuG125X9rFD3NBUv3Mr3mgA2t4S` |
| URL ตรงของ deployment นั้น | https://lineoa-chatbot-7dqpgq7aa-neyla-s-projects.vercel.app |
| สถานะตอนจด | ● Ready · target production · `GET /` → 200 · `POST /api/webhook` (ไม่มี signature) → 401 |

**วิธีกู้คืน**
```bash
# กู้โค้ด
git checkout v1-stable-bot

# กู้ production ทันที (ไม่ต้อง build ใหม่)
npx vercel rollback https://lineoa-chatbot-7dqpgq7aa-neyla-s-projects.vercel.app
```

---

## Deployment

| | |
|---|---|
| Production URL | https://lineoa-chatbot.vercel.app |
| Vercel project | `lineoa-chatbot` (team `neyla-s-projects`) — linked ใน `.vercel/` |
| วิธี deploy | `cd "line oa chatbot" && npx vercel --prod --yes` |
| ดู log | `npx vercel logs https://lineoa-chatbot.vercel.app` |
| Health check | `GET /` → 200 · `POST /api/webhook` (ไม่มี signature) → 401 |
| Session store | Vercel KV (Upstash) ต่อจริงแล้ว — state persist 24 ชม. |

---

## งานที่ทำใน session นี้

### A) Reply quality + follow greeting — branch `fix/bot-reply-quality`
**สถานะ: ✅ deploy production แล้ว · ❌ ยังไม่ push/merge เข้า main**

3 commits:
- `e48e1d6` — รู้จักปุ่ม Rich Menu ครบ (แยก logic เป็น `lib/line/menu.ts`), ไม่ตัน (หาไม่เจอ →
  ลิสต์ตำแหน่งที่เปิด), จำบริบทสวัสดิการ (phase `awaiting_benefit_info`), ถามยืนยันตำแหน่งหัวหน้า
- `09a6cf6` — แก้ loop ตำแหน่งหัวหน้า (เช็ค senior จาก position ใน state ด้วย) + handover UX
  (เตือนครั้งเดียวผ่าน `hintSent`, ปุ่ม "สมัครงานออนไลน์" พาออกจาก handover)
- `b3c4f42` — `handleFollow`: ทักทาย `WELCOME_MESSAGE` ทันทีตอนแอดเพื่อน + ตั้ง state กัน welcome ซ้ำ

ไฟล์หลัก: `app/api/webhook/route.ts`, `lib/line/menu.ts` (ใหม่), `lib/session/screening.ts`,
`types/session.ts`, `tests/menu.test.ts` (ใหม่)

### B) Pre-production hardening — branch `chore/pre-production-hardening`
**สถานะ: ✅ push origin แล้ว · ❌ ยังไม่เปิด PR · ❌ ยังไม่ deploy (ไม่ได้อยู่ใน production)**

- Auth ให้ `/api/admin/jobs` ด้วย `ADMIN_API_SECRET` (constant-time, fail closed)
- Gemini retry เมื่อเจอ 429/503 (`generateWithRetry`)
- KV fallback warning log
> ⚠️ ถ้าจะเอา branch นี้ขึ้น production **ต้องตั้ง `ADMIN_API_SECRET` ใน Vercel env ก่อน**
> ไม่งั้น `/api/admin/jobs` จะคืน 503 (มี secret อยู่ใน `.env` local แล้ว)

---

## TODO ค้าง (เรียงความสำคัญ)

1. **จัดระเบียบ git** — push `fix/bot-reply-quality` + merge เข้า `main` ให้ตรง production
   (ตอนนี้ main ตามหลังของจริง)
2. **เปิด PR + ตัดสินใจ deploy** `chore/pre-production-hardening` (พร้อมตั้ง `ADMIN_API_SECRET`
   ใน Vercel env)
3. **ทดสอบจริงบน LINE** ฟีเจอร์ใหม่: ทักทายตอนแอด, ตำแหน่งหัวหน้าไม่วน loop, handover เตือนครั้งเดียว
4. (จาก PROJECT_SUMMARY §10) ยังค้าง: PDPA / Gemini paid tier, quota RPD free-tier

---

## เช็คก่อน merge/deploy ทุกครั้ง
```bash
cd "line oa chatbot"
npm test            # ปัจจุบัน 33 tests
npx tsc --noEmit
npm run lint
npm run build
```

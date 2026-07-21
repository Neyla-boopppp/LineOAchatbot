# HANDOFF — Rocksgroup LINE OA Bot ("พี่ร็อคกี้")

> อัปเดต: 2026-07-21 (รอบที่ 2) · ผู้ส่งต่อ: session แก้การ์ดสิทธิ + นโยบายผู้สมัครต่างชาติ
> อ่านคู่กับ `PROJECT_SUMMARY.md` (ภาพรวมระบบ) และ `CLAUDE.md`

---

## 🚩 มาทำต่อตรงนี้ (อ่านก่อนเพื่อน)

**อยู่ branch `feat/rich-menu-v2`** — verify ผ่านครบ (67 tests · tsc · lint · build)
**แต่ยังไม่ deploy production** — production ยังรันตัวเดิมที่บอทตอบดีอยู่ (`f96a7c5`) ปลอดภัยดี

### 🔴 ยังไม่ deploy = อาการที่ลูกค้าเจอยังไม่หาย

`f96a7c5` (production ตอนนี้) **ไม่มี `isSilentMenuText()` เลย** — ฟีเจอร์ "ปุ่มเงียบ" เพิ่งเพิ่ม
ใน `b795ac8` บน branch นี้ แปลว่ากดปุ่ม RM1/RM2 บน production ยังไงบอทก็ตอบข้อความทับการ์ด
**ต้อง merge `feat/rich-menu-v2` → `main` ถึงจะหาย** (push main = deploy prod อัตโนมัติ)

### ✅ label ปุ่ม RM1/RM2 — ยืนยันแล้ว 2026-07-21

ลูกค้ายืนยัน label จริงของ 2 ปุ่มที่ OA Manager ต้องตอบด้วยการ์ด (ดู `Rich Menu.png`):

| ตัวแปร | ปุ่ม | ค่าจริงที่ใส่แล้ว | สถานะ |
|---|---|---|---|
| `SILENT_MENU_TEXTS` | RM1 ค้นหาตำแหน่งงาน + RM2 สมัครงานออนไลน์ (**บอทต้องเงียบ**) | `ค้นหาตำแหน่งงาน`, `สมัครงานออนไลน์` | ✅ ยืนยันแล้ว |
| `RICH_MENU_PERKS_TEXTS` | RM3 สิทธิที่จะได้รับ → การ์ด Flex | `สิทธิที่จะได้รับ` | ⚠️ ยังเดา (ดูด้านล่าง) |
| `RICH_MENU_BRANCHES_TEXTS` | RM4 สาขาใกล้บ้าน | `เช็คสาขาใกล้บ้านคุณ` | ✅ ตรงรูป |
| `RICH_MENU_FAQ_TEXTS` | RM5 คำถามที่พบบ่อย → Quick Reply | `คำถามที่พบบ่อย` | ⚠️ ยังเดา (ดูด้านล่าง) |
| `RICH_MENU_CONTACT_TEXTS` | RM6 ติดต่อเจ้าหน้าที่ → handover | `ติดต่อเจ้าหน้าที่` | ✅ ตรงรูป |

> ⚠️ `'สมัครงานออนไลน์'` ถูก **ถอดออกจาก `RICH_MENU_APPLY_TEXTS`** แล้ว ไม่งั้นบอทจะดักไปตอบ
> `APPLY_PROMPT` ทับการ์ด — intent `apply` ยังเรียกได้จากคำที่ผู้ใช้พิมพ์เอง (`สมัครงาน` / `สมัครออนไลน์`)

### ⚠️ ปุ่มที่ยังต้องยืนยัน label (จาก `Rich Menu.png`)

- **RM5** บนรูปเขียน `คำถามที่พบบ่อย (FAQ)` แต่อาร์เรย์มีแค่ `คำถามที่พบบ่อย` กับ `faq`
  → ถ้า action text มีวงเล็บจริง **กดแล้วบอทเงียบ** ต้องเพิ่มสตริงเข้าไป
- **RM3** บนรูปเขียนแค่ `สวัสดิการ` ซึ่ง match `RICH_MENU_BENEFITS_TEXTS` → เข้า intent `benefits`
  (ถามแบรนด์/ตำแหน่งก่อน) **ไม่ใช่** การ์ด `perks` ที่ออกแบบไว้ — ต้องเคลียร์ว่าจะเอาแบบไหน

### 🚀 ขั้นตอน deploy

```bash
cd "line oa chatbot"
npm test && npx tsc --noEmit && npm run lint && npm run build
npx vercel --prod --yes        # หรือ merge เข้า main (git integration จะ deploy เอง)
```

จากนั้นทดสอบจริงบน LINE:
1. กด **ค้นหาตำแหน่งงาน** → บอทต้องไม่ตอบอะไรเลย
2. กด **สมัครงานออนไลน์** → บอทต้องไม่ตอบอะไรเลย
3. พิมพ์ `สมัครงาน` เอง → ยังต้องได้ `APPLY_PROMPT`
4. กด RM4 / RM6 → ต้องตอบเหมือนเดิม
5. ฝั่ง OA Manager: ตั้ง keyword auto-response ให้ตรงข้อความ 2 อันนี้ + เปิด
   "ข้อความตอบกลับอัตโนมัติ" คู่กับ webhook ไม่งั้นกดแล้วจะไม่มีอะไรขึ้นเลย

### 📌 ค้างอยู่ (ไม่บล็อก deploy)

- **ถาม HR:** สวัสดิการในการ์ด RM3 ใช้กับ **Potato Corner** ด้วยไหม? (Sheet มี `Benefit`
  เฉพาะ Khao So-i — ดูหัวข้อ D)
- **ยังไม่แจ้ง HR ตอนปฏิเสธผู้สมัครต่างชาติ** ที่สมัครแบรนด์อื่น (ดูหัวข้อ E) — ลูกค้ายังไม่ได้ขอ
- RM4 สาขาใกล้บ้าน (Location action) ยังเลื่อนอยู่ — ดู TODO ข้อ 4

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

## งานที่ทำใน session 2026-07-21 (ล่าสุด)

### 0) สำรองตัวที่บอทตอบดีแล้ว
**สถานะ: ✅ เสร็จ** — ดูตาราง Rollback ด้านบน (tag `v1-stable-bot`)
ระหว่างทางค้นพบว่าโปรเจกต์ **ผูก Git integration** อยู่ (push main = deploy prod) ซึ่งขัดกับ
ที่เอกสารเดิมเขียนไว้ → แก้ข้อ 2 ด้านบนแล้ว

### C) รองรับ Rich Menu ชุดใหม่ — branch `feat/rich-menu-v2`
**สถานะ: ✅ โค้ดเสร็จ + verify ผ่านครบ · ✅ push origin · ❌ ยังไม่ deploy · ❌ ยังไม่เปิด PR**

commit `b795ac8` — verify: `npm test` 59 passed (เดิม 33), `tsc` ผ่าน, `lint` ผ่าน, `build` ผ่าน

| ส่วน | ไฟล์ | สิ่งที่ทำ |
|---|---|---|
| ชั้นส่งข้อความ | `app/api/webhook/route.ts` | `sendReply()` รับ `messagingApi.Message` ได้แล้ว (Flex/Quick Reply) — call site เดิมไม่ต้องแก้ |
| Builder ใหม่ | `lib/line/flex.ts` (ใหม่) | `buildPerksFlex()` การ์ดสิทธิ 5 ข้อ + `buildFaqQuickReply()` ปุ่มกลม 5 ปุ่ม |
| ปุ่มที่ OA Manager ตอบเอง | `lib/line/menu.ts` | `isSilentMenuText()` — เช็คก่อนทุกอย่างใน `handleEvent` แล้ว `return` ทันที ไม่แตะ state ไม่แจ้ง HR |
| การ์ดสิทธิ | menu + flex | intent `perks` (การ์ดคงที่) **แยกจาก** `benefits` เดิม (ดึงรายตำแหน่งจาก Sheet) — ปุ่มท้ายการ์ดพากลับเข้า `benefits` |
| FAQ | route + `screening.ts` | intent `faq` → Quick Reply · `faq_age` ตอบ 19–35 ปี (ตรงเกณฑ์คัดกรองจริงในโค้ด) |
| พาร์ทไทม์ | `route.ts` `buildPartTimeReply()` | อ่านคอลัมน์ `Job_Type` จาก Sheet จริง — ถ้า Sheet ไม่ระบุ **ไม่ฟันธงว่า "ไม่รับ"** แต่ชวนคุยต่อ |
| ทิ้งข้อความถึง HR | `route.ts` | `HANDOVER_MESSAGE` โทนพี่-น้องตาม brief คงทางออก `"คุยกับบอท"` ไว้ (เป็นทางเดียวที่ออกจาก handover ได้) |

**การตัดสินใจเรื่องขอบเขต (ตกลงกับลูกค้าแล้ว):**
- Rich menu 1 (การ์ดแบรนด์) + Rich menu 2 (pop-up ลิงก์สมัครแยกแบรนด์) → **LINE OA Manager ทำเอง**
  บอทต้องเงียบสนิท ห้ามตอบซ้อน
- Rich menu 4 (สาขาใกล้บ้าน + Location action) → **เลื่อนไปรอบหน้า** ยังไม่ได้ทำ
  ปุ่ม `เช็คสาขาใกล้บ้านคุณ` ยังทำงานแบบเดิม (ลิสต์สาขาที่เปิดรับ) — ดู TODO ข้อ 4
- Rich Menu สร้างใน OA Manager → เป็น **text action** จับปุ่มจาก label ข้อความเท่านั้น
  (`parsePostbackIntent` มีอยู่แล้วเผื่ออนาคต แต่ยังไม่ได้ใช้จริง)

**กันปุ่มตาย:** `tests/flex.test.ts` assert ว่าทุกปุ่มใน Flex/Quick Reply เมื่อกดแล้ว
`detectRichMenuIntent()` ต้องแปลงกลับเป็น intent ได้จริง → ถ้าใครแก้ข้อความปุ่มฝั่งเดียวเทสจะแดงทันที

### D) แก้การ์ด "สิทธิที่จะได้รับ" ให้ตรง Google Sheet — branch `feat/rich-menu-v2`
**สถานะ: ✅ เสร็จ + verify ผ่านครบ (60 tests, tsc, lint, build)**

ดึง CSV จาก `SHEET_CSV_URL` มาตรวจจริง (816 แถว) พบว่า `PERKS` เดิมใน `lib/line/flex.ts`
**แต่งขึ้นเองเกือบทั้งใบ** ไม่ตรงกับคอลัมน์ `Benefit` ใน Sheet → แทนด้วยของจริงทั้งหมด

| เดิม (ผิด) | ใหม่ (ตาม Sheet) |
|---|---|
| เงินเดือนเริ่มต้น | **ตัดทิ้ง** — ลูกค้าสั่งไม่ให้ใส่ (มีในโพสหางานแล้ว อยากให้ผู้สมัครถามเอง) |
| Incentive ยอดขายร้าน | Service Charge (ตามผลประกอบการ) |
| ส่วนลดค่าอาหารในเครือ | ค่าอาหาร **910 บาท/เดือน** |
| ประกัน**สุขภาพ** | ประกัน**สังคม** |
| ยูนิฟอร์มฟรี (ไม่หักประกันชุด) | ชุดยูนิฟอร์มพนักงาน |
| อ้างถึง **Uno Coffee** | ตัดทิ้ง — Sheet มีแค่ Khao So-i + Potato Corner |
| — | เพิ่ม **เบี้ยขยัน 700 บาท/เดือน** + **กองทุนสำรองเลี้ยงชีพ** |

- `perkRow()` รองรับข้อที่ไม่มีคำขยายแล้ว (LINE ไม่รับ `text` ว่าง)
- เทสใหม่ใน `tests/flex.test.ts` **ล็อกไว้ 2 ชั้น**: การ์ดต้องไม่มีคำว่า `เงินเดือน`
  และต้องไม่มีสวัสดิการที่ Sheet ไม่ได้ระบุ (`Incentive`, `ประกันสุขภาพ`, `Uno Coffee`) →
  ถ้า session หน้าเผลอแต่งข้อมูลกลับเข้ามา เทสจะแดงทันที

> ⚠️ **ข้อควรระวัง:** คอลัมน์ `Benefit` มีข้อมูลเฉพาะ **Khao So-i (60 แถว)** —
> **Potato Corner ว่างทั้ง 756 แถว** การ์ดจึงเขียนเป็น "ตัวอย่างสิทธิ" + caption ว่าต่างกัน
> ตามแบรนด์/ตำแหน่ง/สาขา **ต้องไปยืนยันกับ HR ว่าสวัสดิการชุดนี้ใช้กับ Potato Corner ด้วยไหม**

### E) นโยบายผู้สมัครต่างชาติ — รับเฉพาะ Khao So-i — branch `feat/rich-menu-v2`
**สถานะ: ✅ เสร็จ + verify ผ่านครบ (66 tests, tsc, lint, build)**

ลูกค้าสั่งเพิ่ม 2026-07-21: **ผู้สมัครที่ไม่ใช่สัญชาติไทย รับเฉพาะแบรนด์ Khao So-i เท่านั้น**
แบรนด์อื่น (Potato Corner / Uno Coffee) รับเฉพาะสัญชาติไทย

| จุด | ไฟล์ | สิ่งที่ทำ |
|---|---|---|
| แหล่งความจริงเดียว | `lib/session/screening.ts` | `FOREIGN_ELIGIBLE_BRAND` + `isForeignEligibleBrand()` (match ยืดหยุ่น: `Khao So-i` / `khaosoi` / `ข้าวซอย`) |
| ข้อความปฏิเสธ | `lib/session/screening.ts` | `buildNonThaiWrongBrandMessage(brand)` — ปฏิเสธสุภาพ + ชวนไป Khao So-i |
| ยังไม่รู้แบรนด์ | `lib/session/screening.ts` | `NON_THAI_BRAND_RULE` — บอกกฎก่อน ไม่ให้ผู้สมัครเสียเวลากรอกต่อ |
| จุดตัดสิน | `route.ts` phase `awaiting_screening` | แตกเคส `isThai === false` เป็น 2 ทาง: Khao So-i → `awaiting_documents` เหมือนเดิม · แบรนด์อื่น → ปฏิเสธ + กลับ `collecting_info` |
| FAQ | `screening.ts` `FAQ_MESSAGE` | เดิมตอบ "รับทั้งคนไทยและต่างชาติ" → แก้เป็นกฎใหม่ |
| ปุ่มเอกสาร | `route.ts` `DOCS_MESSAGE` | เติมหมายเหตุท้ายข้อความ |
| กัน LLM ตอบขัดกฎ | `lib/ai/chatbot-ai.ts` | เพิ่มใน `<constraints>` + แก้ template ข้อ 2 ใน `<rich_menu_rules>` |

เทสใหม่ `tests/screening.test.ts` — ครอบคลุมการสะกดแบรนด์หลายแบบ, แบรนด์อื่นต้องไม่ผ่าน,
brand ว่าง/null ต้องไม่ผ่าน (กันเผลอปล่อยผ่าน) และ FAQ ต้องไม่มีคำว่า "รับทั้งคนไทยและต่างชาติ"

> 💡 **ไม่ได้แจ้ง HR ตอนปฏิเสธ** — ถ้าอยากให้ HR รู้ว่ามีต่างชาติสมัครแบรนด์อื่นเข้ามา
> เพิ่ม `notifyHrApplicant()` ในเคสนั้นได้ (ยังไม่ได้ทำ เพราะลูกค้าไม่ได้ขอ)

---

## งานจาก session ก่อน (2026-07-19)

### A) Reply quality + follow greeting — branch `fix/bot-reply-quality`
**สถานะ: ✅ deploy production แล้ว · ✅ push + merge เข้า main แล้ว (2026-07-21)**

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

1. **[บล็อกอยู่] ขอ label จริงของปุ่ม Rich Menu ทั้ง 6** → แก้ `lib/line/menu.ts` + เทส
2. ~~ขอตัวเลขสิทธิประโยชน์จริง~~ ✅ **เสร็จแล้ว** (ดูหัวข้อ D) — เหลือแค่ยืนยันกับ HR ว่า
   สวัสดิการชุดนี้ครอบคลุม **Potato Corner** ด้วยไหม (Sheet ยังว่าง)
3. **Deploy `feat/rich-menu-v2`** เมื่อข้อ 1 เสร็จ แล้วทดสอบจริงบน LINE (เช็กลิสต์ด้านล่าง)
4. **Rich menu 4 — สาขาใกล้บ้าน (Location action)** ที่เลื่อนไว้
   ต้องตัดสินใจก่อนว่าจะเอาพิกัดจากไหน: (ก) เติมคอลัมน์ `Lat`/`Lng` ใน Google Sheet แล้วคำนวณ
   Haversine เอง — แม่นสุด · (ข) geocode ชื่อสาขาผ่าน Google API แล้ว cache · (ค) ให้ HR ดูหมุด
   แล้วตอบเอง (ทำได้ทันที ไม่ต้องมีพิกัด) — **ตอนนี้ Sheet ยังไม่มีคอลัมน์พิกัดเลย**
5. **เปิด PR + ตัดสินใจ deploy** `chore/pre-production-hardening` (ต้องตั้ง `ADMIN_API_SECRET`
   ใน Vercel env ก่อน ไม่งั้น `/api/admin/jobs` คืน 503)
6. **ทดสอบจริงบน LINE** ของ session ก่อน: ทักทายตอนแอด, ตำแหน่งหัวหน้าไม่วน loop, handover เตือนครั้งเดียว
7. (จาก PROJECT_SUMMARY §10) ยังค้าง: PDPA / Gemini paid tier, quota RPD free-tier

---

## เช็คก่อน merge/deploy ทุกครั้ง
```bash
cd "line oa chatbot"
npm test            # ปัจจุบัน 66 tests
npx tsc --noEmit
npm run lint
npm run build
```

## เช็กลิสต์ทดสอบจริงบน LINE (หลัง deploy `feat/rich-menu-v2`)

> preview deploy ไม่ได้รับ event จาก LINE ต้อง deploy production เท่านั้นถึงจะทดสอบได้

1. กดปุ่ม **การ์ดแบรนด์** และ **ลิงก์สมัคร** → ต้องเห็นเฉพาะการ์ดของ OA Manager
   **ไม่มีข้อความบอทซ้อน**
2. กดปุ่ม **สิทธิที่จะได้รับ** → เห็นการ์ด Flex 5 ข้อ → กดปุ่มในการ์ด → ต่อเข้าสวัสดิการรายตำแหน่งจาก Sheet
3. กดปุ่ม **คำถามที่พบบ่อย** → เห็นปุ่มกลม 5 ปุ่ม → กดแต่ละปุ่มได้คำตอบตรง (อายุตอบ 19–35)
4. กดปุ่ม **ทิ้งข้อความถึง HR** → เข้า handover, ข้อความ forward เข้ากลุ่ม HR,
   พิมพ์ `"คุยกับบอท"` ออกจากโหมดได้
5. **การ์ดสิทธิ (RM3)** — ตัวเลขต้องตรง Sheet: ค่าอาหาร **910** / เบี้ยขยัน **700**
   และ **ต้องไม่มีเงินเดือน** ในการ์ด
6. **นโยบายต่างชาติ** — ทดสอบ 3 เคส:
   - ต่างชาติ + **Khao So-i** → ขอเอกสาร 4 อย่าง
   - ต่างชาติ + **Potato Corner** → ปฏิเสธสุภาพ + ชวนไป Khao So-i (ห้ามขอเอกสาร)
   - กด FAQ "รับต่างชาติไหม" → ต้องบอกว่ารับเฉพาะ Khao So-i (ห้ามตอบ "รับทั้งคนไทยและต่างชาติ")
7. **Regression** — flow สมัครงานเดิมยังครบ: แบรนด์ → ตำแหน่ง → สาขา → คัดกรองอายุ/สัญชาติ
8. **Regression** — ทักทายตอนกดเพิ่มเพื่อนใหม่ยังทำงาน

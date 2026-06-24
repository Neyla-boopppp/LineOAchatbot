# Jeeb Team — Workflow Design

---

## ภาพรวมทีม (Team Overview)

| Agent | บทบาท | ตำแหน่งใน Pipeline |
|---|---|---|
| **Jeab** | Orchestrator / หัวหน้าทีม | ควบคุมทุก stage |
| **Job** | Marketing & Funnel Strategist | Stage 1 — Strategy |
| **Jarb** | Conversation Designer & UI Architect | Stage 2 — Design |
| **Jetaime** | System Analyst & Data Architect | Stage 3 — Tech Spec |
| **Jub** | LINE Developer & System Architect | Stage 4 — Build |
| **Jib** | QA & Data Gatekeeper | Stage 5 — QA Gate |
| **Jan** | Support Specialist & Output Double-Checker | Stage 6 — Final Gate |

---

## Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER REQUEST                             │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  JEAB — Orchestrator                                            │
│  1. Receive & Parse    → อ่านคำสั่ง, อัปเดต State Object       │
│  2. Identify & Route   → เลือก agent ที่ถูกต้อง               │
│  3. Delegate           → ส่งงานพร้อม State Object              │
│  4. Synthesize         → รวมผล, สรุปให้ User                   │
└──────────────┬──────────────────────────────────────────────────┘
               │
               │ [Stage 1 — Strategy]
               ▼
┌──────────────────────────┐
│  JOB                     │
│  Marketing Funnel Design │
│  Tagging Matrix          │
│  Segmentation Model      │
│  KPI Targets             │
└──────┬───────────────────┘
       │
       │  handoff_to_jarb: Design Brief
       │  handoff_to_jub:  Technical Spec (ถ้ามี)
       │
       │ [Stage 2 — Design]        ┌─────────────────────┐
       └──────────────────────────►│  JARB               │
                                   │  Conversation Flow   │
                                   │  Rich Menu Layout    │
                                   │  Copywriting         │
                                   │  UX Blueprint        │
                                   └──────┬──────────────┘
                                          │
                                          │  handoff_to_jub: Design Blueprint
                                          │
                                          │ [Stage 3 — Tech Spec]
                                          ▼
                          ┌──────────────────────────────┐
                          │  JETAIME                     │
                          │  Requirement Technicalization│
                          │  Data Schema / Dictionary    │
                          │  FSM State Transitions       │
                          │  API Contracts               │
                          │  Session & Idempotency Spec  │
                          └────────┬─────────────────────┘
                                   │
                     ┌─────────────┴──────────────┐
                     │                            │
                     │ handoff_to_jub             │ handoff_to_jib
                     │ (Implementation Blueprint) │ (Logic Boundaries)
                     │                            │
                     ▼ [Stage 4 — Build]          │
        ┌────────────────────────┐                │
        │  JUB                  │                │
        │  Webhook Engineering  │                │
        │  JSON Payload Build   │                │
        │  LIFF Architecture    │                │
        │  Security & Queue     │                │
        └────────────┬──────────┘                │
                     │                            │
                     │ output: code / JSON         │
                     │                            │
                     └────────────┬───────────────┘
                                  │
                                  │ [Stage 5 — QA Gate]
                                  ▼
                     ┌────────────────────────────┐
                     │  JIB  🔒 GATE              │
                     │  Functional QA             │
                     │  Blueprint Validation      │
                     │  PDPA/GDPR Compliance      │
                     │  Security & Injection Test │
                     └────────────┬───────────────┘
                                  │
                    ┌─────────────┴──────────────┐
                    │                            │
              gate_decision                gate_decision
                 PASS ✅                    BLOCK 🚫
                    │                            │
                    │                            ▼
                    │               ┌────────────────────────┐
                    │               │  JEAB routes back to:  │
                    │               │  Jub / Jarb / Jetaime  │
                    │               │  to fix & resubmit     │
                    │               └────────────────────────┘
                    │
                    │ [Stage 6 — Final Gate]
                    ▼
        ┌───────────────────────────────┐
        │  JAN  ✨ FINAL GATE           │
        │  Factual Cross-Reference      │
        │  Placeholder Sanitization     │
        │  Link Integrity Check         │
        │  Tone & Brand Alignment       │
        │  Customer Friction Assessment │
        └──────────────┬────────────────┘
                       │
          ┌────────────┴────────────┐
          │                        │
    APPROVED ✅               REJECTED ❌
          │                        │
          │                        ▼
          │           ┌────────────────────────┐
          │           │  JEAB routes back to:  │
          │           │  specific agent to fix  │
          │           └────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                   PRODUCTION / CUSTOMER                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Routing Matrix — Jeab ส่งงานให้ใครเมื่อไหร่

| ประเภทคำสั่งจาก User | Stage เริ่มต้น | Flow |
|---|---|---|
| "วางแผนการตลาด / campaign" | Job | Job → Jarb → Jetaime → Jub → Jib → Jan |
| "ออกแบบ flow บทสนทนา" | Jarb | Jarb → Jetaime → Jub → Jib → Jan |
| "เขียนโค้ด / สร้าง webhook" | Jub | Jub → Jib → Jan |
| "สร้าง Flex Message JSON" | Jarb + Jub | Jarb → Jub (parallel) → Jib → Jan |
| "ตรวจสอบระบบ / QA" | Jib | Jib → Jan |
| "แก้บัค / debug" | Jub + Jetaime | Jetaime → Jub → Jib → Jan |
| "ตรวจ compliance / PDPA" | Jib | Jib (standalone) → รายงาน |

---

## Gate Logic — เงื่อนไขการผ่าน/ไม่ผ่านแต่ละ Gate

### Jib Gate (QA)
```
IF   critical bug OR PDPA infraction found
THEN gate_decision = BLOCK
     → Jeab routes back to responsible agent
     → agent fixes → resubmit to Jib

IF   no critical issues
THEN gate_decision = PASS
     → Jeab routes to Jan
```

### Jan Gate (Final)
```
IF   catastrophic deviation OR broken links OR unresolved placeholders
THEN delivery_decision = REJECTED
     → Jan issues Discrepancy List
     → Jeab routes back to responsible agent

IF   all checks pass (after polish applied)
THEN delivery_decision = APPROVED
     → Jeab delivers to User / Production
```

---

## Parallel vs Sequential Decision

| สถานการณ์ | โหมด | เหตุผล |
|---|---|---|
| Job + Jarb ทำงานในคำสั่งเดียวกัน | **Parallel** | ทั้งคู่ไม่มี dependency กัน |
| Jetaime รอ Jarb ก่อน | **Sequential** | Jetaime ต้องใช้ output ของ Jarb |
| Jub รอ Jetaime ก่อน | **Sequential** | Jub ต้องมี spec ก่อนเขียนโค้ด |
| Jib ตรวจ Jub + Jarb พร้อมกัน | **Parallel** | ตรวจได้อิสระต่อกัน |
| Jan รอ Jib ก่อน | **Sequential** | Jan ทำงานหลัง Jib PASS เท่านั้น |

---

## Error & Fallback Protocol (ของ Jeab)

```
Agent ล้มเหลว หรือส่ง status: "failed"
          │
          ▼
    Retry ครั้งที่ 1
    ส่งงานกลับ agent เดิม + context เพิ่มเติม
          │
          ▼ ยังล้มเหลว
    Retry ครั้งที่ 2
    เปลี่ยน agent สำรอง (ถ้ามี)
          │
          ▼ ยังล้มเหลว
    Escalate → หยุด pipeline
    แจ้ง User ทันที พร้อมระบุจุดที่ติดขัด
```

---

## Shared State Object — ข้อมูลที่ Jeab ส่งต่อทุก stage

```json
{
  "session_id": "<uuid>",
  "user_intent": "<สิ่งที่ user ต้องการ>",
  "task_queue": ["<งานที่รอทำ>"],
  "in_progress": ["<งานที่กำลังทำ>"],
  "completed_tasks": ["<งานที่เสร็จ>"],
  "pending_results": {
    "Job": "...",
    "Jarb": "...",
    "Jetaime": "...",
    "Jub": "...",
    "Jib": "...",
    "Jan": "..."
  },
  "errors": [],
  "context_notes": "<บริบทสำคัญที่ต้องส่งต่อ>"
}
```

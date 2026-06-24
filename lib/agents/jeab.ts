import { runClaudeAgent, parseAgentOutput } from '@/lib/ai/claude-agent'
import { runJob } from './job'
import { runJarb } from './jarb'
import { runJetaime } from './jetaime'
import { runJub } from './jub'
import { runJib } from './jib'
import { runJan } from './jan'
import type {
  AgentName,
  AgentTask,
  OrchestratorState,
  JeabResponse,
  PipelineStep,
  JobOutput,
  JarbOutput,
  JetaimeOutput,
  JubOutput,
  JibOutput,
  JanOutput,
} from '@/types/agent'

// ─── Route Types ────────────────────────────────────────────────────────────

type RouteKey =
  | 'marketing'
  | 'flow_design'
  | 'code'
  | 'flex_message'
  | 'qa'
  | 'debug'
  | 'compliance'

// ─── Router ─────────────────────────────────────────────────────────────────

const ROUTER_PROMPT = `You are Jeab, Orchestrator of Jeeb Team. Classify the user request into exactly one route key.

Routes:
- "marketing"    → วางแผนการตลาด, campaign, funnel, broadcast, segmentation, CRM, loyalty, กลยุทธ์การตลาด
- "flow_design"  → ออกแบบ flow, บทสนทนา, UX, user journey, wireframe, copy, conversation design
- "code"         → เขียนโค้ด, webhook, API, backend, implement feature, สร้างระบบ, Next.js
- "flex_message" → Flex Message, Rich Menu, carousel, UI component, JSON payload, LINE UI
- "qa"           → QA, testing, ตรวจสอบระบบ, ทดสอบ, test, validate
- "debug"        → แก้บัค, debug, fix bug, error, ปัญหาระบบ, root cause
- "compliance"   → PDPA, compliance, privacy, data protection, กฎหมายข้อมูล, audit

Respond ONLY with valid JSON:
{"route": "<route_key>", "reason": "<one sentence in Thai>"}`

async function detectRoute(intent: string): Promise<{ route: RouteKey; reason: string }> {
  const raw = await runClaudeAgent(ROUTER_PROMPT, intent, 256)
  return parseAgentOutput<{ route: RouteKey; reason: string }>(raw, { route: 'code', reason: 'default fallback' })
}

// ─── State Helpers ───────────────────────────────────────────────────────────

export function createState(userIntent: string): OrchestratorState {
  return {
    session_id: crypto.randomUUID(),
    user_intent: userIntent,
    task_queue: [],
    in_progress: [],
    completed_tasks: [],
    pending_results: {},
    errors: [],
    context_notes: '',
  }
}

function makeTask(
  assigned: AgentName,
  taskType: string,
  requirements: string,
  state: OrchestratorState,
  upstream: Partial<Record<AgentName, string>> = {}
): AgentTask {
  return {
    task_id: crypto.randomUUID(),
    assigned_to: assigned,
    task_type: taskType,
    priority: 'high',
    context: {
      user_intent: state.user_intent,
      upstream_results: upstream,
      relevant_state: {},
    },
    requirements,
    constraints: [],
    expected_output_format: 'json',
  }
}

function stepFrom<T extends { status: string }>(agent: AgentName, output: T, summary: string): PipelineStep {
  return {
    agent,
    status: output.status as PipelineStep['status'],
    summary,
  }
}

// ─── Pipeline Executors ──────────────────────────────────────────────────────

async function runQaGate(
  jibTask: AgentTask,
  state: OrchestratorState,
  pipeline: PipelineStep[]
): Promise<{ jib: JibOutput; blocked: boolean }> {
  state.in_progress.push('jib')
  const jib = await runJib(jibTask)
  state.in_progress = state.in_progress.filter((x) => x !== 'jib')
  state.completed_tasks.push('jib')
  state.pending_results.jib = jib.result.content

  pipeline.push({ agent: 'jib', status: jib.status, summary: `QA Gate: ${jib.gate_decision}`, gate: jib.gate_decision })

  if (jib.gate_decision === 'BLOCK') {
    state.errors.push(`Jib BLOCK: ${jib.veto_reason}`)
    return { jib, blocked: true }
  }
  return { jib, blocked: false }
}

async function runFinalGate(
  asset: string,
  jibDecision: string,
  state: OrchestratorState,
  pipeline: PipelineStep[]
): Promise<JanOutput> {
  const janTask = makeTask('jan', 'final_verification', asset, state, {
    jib: `gate_decision: ${jibDecision}`,
  })
  state.in_progress.push('jan')
  const jan = await runJan(janTask)
  state.in_progress = state.in_progress.filter((x) => x !== 'jan')
  state.completed_tasks.push('jan')
  state.pending_results.jan = jan.result.final_output_block

  pipeline.push({
    agent: 'jan',
    status: jan.status,
    summary: `Final Gate: ${jan.delivery_decision}`,
  })
  return jan
}

// ─── Route Pipelines ─────────────────────────────────────────────────────────

async function pipelineMarketing(state: OrchestratorState): Promise<{ pipeline: PipelineStep[]; output: string }> {
  const pipeline: PipelineStep[] = []

  // Stage 1: Job (strategy)
  state.in_progress.push('job')
  const jobTask = makeTask('job', 'funnel_design', state.user_intent, state)
  const job: JobOutput = await runJob(jobTask)
  state.in_progress = state.in_progress.filter((x) => x !== 'job')
  state.completed_tasks.push('job')
  state.pending_results.job = job.result.content
  pipeline.push(stepFrom('job', job, `Strategy: ${job.result.type}`))
  if (job.status === 'failed') return { pipeline, output: `Job failed: ${job.follow_up_detail}` }

  // Stage 2: Jarb (design) — parallel candidate but we run sequential for safety
  state.in_progress.push('jarb')
  const jarbTask = makeTask('jarb', 'flow_design', job.result.handoff_to_jarb, state, { job: job.result.content })
  const jarb: JarbOutput = await runJarb(jarbTask)
  state.in_progress = state.in_progress.filter((x) => x !== 'jarb')
  state.completed_tasks.push('jarb')
  state.pending_results.jarb = jarb.result.content
  pipeline.push(stepFrom('jarb', jarb, `Design: ${jarb.result.type}`))

  // Stage 3: Jetaime (tech spec)
  state.in_progress.push('jetaime')
  const jetaimeTask = makeTask('jetaime', 'requirement_technicalization', jarb.result.handoff_notes, state, {
    job: job.result.handoff_to_jub,
    jarb: jarb.result.content,
  })
  const jetaime: JetaimeOutput = await runJetaime(jetaimeTask)
  state.in_progress = state.in_progress.filter((x) => x !== 'jetaime')
  state.completed_tasks.push('jetaime')
  state.pending_results.jetaime = jetaime.result.content
  pipeline.push(stepFrom('jetaime', jetaime, `Tech Spec: ${jetaime.result.type}`))

  // Stage 4: Jub (build)
  state.in_progress.push('jub')
  const jubTask = makeTask('jub', 'code_generation', jetaime.result.handoff_to_jub, state, {
    jetaime: jetaime.result.content,
    jarb: jarb.result.handoff_notes,
  })
  const jub: JubOutput = await runJub(jubTask)
  state.in_progress = state.in_progress.filter((x) => x !== 'jub')
  state.completed_tasks.push('jub')
  state.pending_results.jub = jub.result.content
  pipeline.push(stepFrom('jub', jub, `Build: ${jub.result.type} (${jub.result.language})`))

  // Stage 5: Jib (QA gate)
  const jibTask = makeTask('jib', 'full_release_check', jub.result.content, state, {
    jub: jub.result.content,
    jarb: jarb.result.content,
    jetaime: jetaime.result.handoff_to_jib,
  })
  const { jib, blocked } = await runQaGate(jibTask, state, pipeline)
  if (blocked) return { pipeline, output: `Pipeline BLOCKED by Jib: ${jib.veto_reason}` }

  // Stage 6: Jan (final gate)
  const asset = `${job.result.content}\n\n---\n${jub.result.content}`
  const jan = await runFinalGate(asset, jib.gate_decision, state, pipeline)
  return { pipeline, output: jan.result.final_output_block }
}

async function pipelineFlowDesign(state: OrchestratorState): Promise<{ pipeline: PipelineStep[]; output: string }> {
  const pipeline: PipelineStep[] = []

  state.in_progress.push('jarb')
  const jarbTask = makeTask('jarb', 'flow_design', state.user_intent, state)
  const jarb: JarbOutput = await runJarb(jarbTask)
  state.in_progress = state.in_progress.filter((x) => x !== 'jarb')
  state.completed_tasks.push('jarb')
  state.pending_results.jarb = jarb.result.content
  pipeline.push(stepFrom('jarb', jarb, `Design: ${jarb.result.type}`))
  if (jarb.status === 'failed') return { pipeline, output: `Jarb failed: ${jarb.follow_up_detail}` }

  state.in_progress.push('jetaime')
  const jetaimeTask = makeTask('jetaime', 'requirement_technicalization', jarb.result.handoff_notes, state, { jarb: jarb.result.content })
  const jetaime: JetaimeOutput = await runJetaime(jetaimeTask)
  state.in_progress = state.in_progress.filter((x) => x !== 'jetaime')
  state.completed_tasks.push('jetaime')
  state.pending_results.jetaime = jetaime.result.content
  pipeline.push(stepFrom('jetaime', jetaime, `Tech Spec: ${jetaime.result.type}`))

  state.in_progress.push('jub')
  const jubTask = makeTask('jub', 'code_generation', jetaime.result.handoff_to_jub, state, { jetaime: jetaime.result.content })
  const jub: JubOutput = await runJub(jubTask)
  state.in_progress = state.in_progress.filter((x) => x !== 'jub')
  state.completed_tasks.push('jub')
  state.pending_results.jub = jub.result.content
  pipeline.push(stepFrom('jub', jub, `Build: ${jub.result.language}`))

  const jibTask = makeTask('jib', 'blueprint_validation', jub.result.content, state, {
    jub: jub.result.content,
    jarb: jarb.result.content,
    jetaime: jetaime.result.handoff_to_jib,
  })
  const { jib, blocked } = await runQaGate(jibTask, state, pipeline)
  if (blocked) return { pipeline, output: `Pipeline BLOCKED by Jib: ${jib.veto_reason}` }

  const jan = await runFinalGate(jub.result.content, jib.gate_decision, state, pipeline)
  return { pipeline, output: jan.result.final_output_block }
}

async function pipelineCode(state: OrchestratorState): Promise<{ pipeline: PipelineStep[]; output: string }> {
  const pipeline: PipelineStep[] = []

  state.in_progress.push('jub')
  const jubTask = makeTask('jub', 'code_generation', state.user_intent, state)
  const jub: JubOutput = await runJub(jubTask)
  state.in_progress = state.in_progress.filter((x) => x !== 'jub')
  state.completed_tasks.push('jub')
  state.pending_results.jub = jub.result.content
  pipeline.push(stepFrom('jub', jub, `Build: ${jub.result.type} (${jub.result.language})`))
  if (jub.status === 'failed') return { pipeline, output: `Jub failed: ${jub.follow_up_detail}` }

  const jibTask = makeTask('jib', 'functional_qa', jub.result.content, state, { jub: jub.result.content })
  const { jib, blocked } = await runQaGate(jibTask, state, pipeline)
  if (blocked) return { pipeline, output: `Pipeline BLOCKED by Jib: ${jib.veto_reason}` }

  const jan = await runFinalGate(jub.result.content, jib.gate_decision, state, pipeline)
  return { pipeline, output: jan.result.final_output_block }
}

async function pipelineFlexMessage(state: OrchestratorState): Promise<{ pipeline: PipelineStep[]; output: string }> {
  const pipeline: PipelineStep[] = []

  // Jarb designs, Jub builds — can be parallelized (spec says parallel here)
  state.in_progress.push('jarb', 'jub')
  const [jarb, jub]: [JarbOutput, JubOutput] = await Promise.all([
    runJarb(makeTask('jarb', 'flex_message', state.user_intent, state)),
    runJub(makeTask('jub', 'ui_payload', state.user_intent, state)),
  ])
  state.in_progress = []
  state.completed_tasks.push('jarb', 'jub')
  state.pending_results.jarb = jarb.result.content
  state.pending_results.jub = jub.result.content
  pipeline.push(stepFrom('jarb', jarb, `Design: ${jarb.result.type}`))
  pipeline.push(stepFrom('jub', jub, `Build: ${jub.result.type}`))

  const jibTask = makeTask('jib', 'blueprint_validation', jub.result.content, state, {
    jub: jub.result.content,
    jarb: jarb.result.content,
  })
  const { jib, blocked } = await runQaGate(jibTask, state, pipeline)
  if (blocked) return { pipeline, output: `Pipeline BLOCKED by Jib: ${jib.veto_reason}` }

  const jan = await runFinalGate(jub.result.content, jib.gate_decision, state, pipeline)
  return { pipeline, output: jan.result.final_output_block }
}

async function pipelineQA(state: OrchestratorState): Promise<{ pipeline: PipelineStep[]; output: string }> {
  const pipeline: PipelineStep[] = []

  const jibTask = makeTask('jib', 'full_release_check', state.user_intent, state)
  const { jib, blocked } = await runQaGate(jibTask, state, pipeline)
  if (blocked) return { pipeline, output: `Pipeline BLOCKED by Jib: ${jib.veto_reason}\n\n${jib.result.content}` }

  const jan = await runFinalGate(jib.result.content, jib.gate_decision, state, pipeline)
  return { pipeline, output: jan.result.final_output_block }
}

async function pipelineDebug(state: OrchestratorState): Promise<{ pipeline: PipelineStep[]; output: string }> {
  const pipeline: PipelineStep[] = []

  state.in_progress.push('jetaime')
  const jetaime: JetaimeOutput = await runJetaime(makeTask('jetaime', 'requirement_technicalization', state.user_intent, state))
  state.in_progress = state.in_progress.filter((x) => x !== 'jetaime')
  state.completed_tasks.push('jetaime')
  state.pending_results.jetaime = jetaime.result.content
  pipeline.push(stepFrom('jetaime', jetaime, `Root Cause Analysis: ${jetaime.result.type}`))

  state.in_progress.push('jub')
  const jub: JubOutput = await runJub(makeTask('jub', 'debugging', jetaime.result.handoff_to_jub, state, { jetaime: jetaime.result.content }))
  state.in_progress = state.in_progress.filter((x) => x !== 'jub')
  state.completed_tasks.push('jub')
  state.pending_results.jub = jub.result.content
  pipeline.push(stepFrom('jub', jub, `Fix: ${jub.result.language}`))

  const jibTask = makeTask('jib', 'functional_qa', jub.result.content, state, {
    jub: jub.result.content,
    jetaime: jetaime.result.handoff_to_jib,
  })
  const { jib, blocked } = await runQaGate(jibTask, state, pipeline)
  if (blocked) return { pipeline, output: `Pipeline BLOCKED by Jib: ${jib.veto_reason}` }

  const jan = await runFinalGate(jub.result.content, jib.gate_decision, state, pipeline)
  return { pipeline, output: jan.result.final_output_block }
}

async function pipelineCompliance(state: OrchestratorState): Promise<{ pipeline: PipelineStep[]; output: string }> {
  const pipeline: PipelineStep[] = []
  const jibTask = makeTask('jib', 'compliance_audit', state.user_intent, state)
  const { jib } = await runQaGate(jibTask, state, pipeline)
  return { pipeline, output: jib.result.content }
}

// ─── Main Dispatch ───────────────────────────────────────────────────────────

export async function dispatch(userIntent: string): Promise<JeabResponse> {
  const state = createState(userIntent)

  const { route, reason } = await detectRoute(userIntent)
  state.context_notes = `Route: ${route} — ${reason}`

  let result: { pipeline: PipelineStep[]; output: string }

  try {
    switch (route) {
      case 'marketing':    result = await pipelineMarketing(state); break
      case 'flow_design':  result = await pipelineFlowDesign(state); break
      case 'flex_message': result = await pipelineFlexMessage(state); break
      case 'qa':           result = await pipelineQA(state); break
      case 'debug':        result = await pipelineDebug(state); break
      case 'compliance':   result = await pipelineCompliance(state); break
      case 'code':
      default:             result = await pipelineCode(state); break
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    state.errors.push(msg)
    result = { pipeline: [], output: `Pipeline error: ${msg}` }
  }

  return {
    session_id: state.session_id,
    user_intent: userIntent,
    route,
    pipeline: result.pipeline,
    final_output: result.output,
    state,
  }
}

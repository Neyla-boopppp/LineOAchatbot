export type AgentName = 'jeab' | 'jub' | 'jarb' | 'job' | 'jetaime' | 'jib' | 'jan'
export type AgentStatus = 'success' | 'partial' | 'failed'
export type GateDecision = 'PASS' | 'BLOCK' | 'CONDITIONAL_PASS'
export type DeliveryDecision = 'APPROVED' | 'REJECTED'
export type Priority = 'high' | 'medium' | 'low'

export type OrchestratorState = {
  session_id: string
  user_intent: string
  task_queue: string[]
  in_progress: string[]
  completed_tasks: string[]
  pending_results: Partial<Record<AgentName, string>>
  errors: string[]
  context_notes: string
}

export type AgentTask = {
  task_id: string
  assigned_to: AgentName
  task_type: string
  priority: Priority
  context: {
    user_intent: string
    upstream_results: Partial<Record<AgentName, string>>
    relevant_state: Record<string, unknown>
  }
  requirements: string
  constraints: string[]
  expected_output_format: string
}

export type BaseAgentOutput = {
  task_id: string
  agent: AgentName
  status: AgentStatus
  errors: string[]
  follow_up_needed: boolean
  follow_up_detail: string
}

export type JobOutput = BaseAgentOutput & {
  result: {
    type: string
    content: string
    kpi_targets: { open_rate: string; ctr: string; block_rate_max: string }
    handoff_to_jarb: string
    handoff_to_jub: string
  }
}

export type JarbOutput = BaseAgentOutput & {
  result: {
    type: string
    content: string
    handoff_notes: string
    design_rationale: string
  }
}

export type JetaimeOutput = BaseAgentOutput & {
  result: {
    type: string
    content: string
    handoff_to_jub: string
    handoff_to_jib: string
  }
  design_conflicts: Array<{ source: string; conflict: string; resolution: string }>
}

export type JubOutput = BaseAgentOutput & {
  result: {
    type: string
    content: string
    language: string
    notes: string
  }
}

export type JibOutput = BaseAgentOutput & {
  gate_decision: GateDecision
  result: {
    type: string
    content: string
    issues: Array<{
      id: string
      severity: string
      category: string
      steps_to_reproduce: string
      actual_result: string
      expected_result: string
      assigned_to_fix: string
    }>
    pass_count: number
    fail_count: number
    blocked_count: number
  }
  veto_active: boolean
  veto_reason: string
}

export type JanOutput = BaseAgentOutput & {
  delivery_decision: DeliveryDecision
  result: {
    type: string
    final_output_block: string
    modification_summary: Array<{ category: string; change: string; reason: string }>
  }
  rejection_detail: {
    active: boolean
    discrepancy_list: string[]
    return_to_agent: string
  }
}

export type PipelineStep = {
  agent: AgentName
  status: AgentStatus
  summary: string
  gate?: GateDecision
}

export type JeabResponse = {
  session_id: string
  user_intent: string
  route: string
  pipeline: PipelineStep[]
  final_output: string
  state: OrchestratorState
}

export type AgentResult<T = unknown> = {
  success: boolean
  data?: T
  error?: string
}

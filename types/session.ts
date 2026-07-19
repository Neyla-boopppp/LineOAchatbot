export type ApplicationInfo = {
  brand?: string
  position?: string
  branch?: string
  history?: string[]  // last 4 user messages for context
}

export type UserState =
  | ({ phase: 'collecting_info' } & ApplicationInfo)
  | ({ phase: 'awaiting_screening' } & ApplicationInfo)
  | ({ phase: 'awaiting_documents' } & ApplicationInfo)
  | ({ phase: 'awaiting_benefit_info' } & ApplicationInfo)
  | ({ phase: 'ready' } & ApplicationInfo)
  | ({ phase: 'handover' } & ApplicationInfo)

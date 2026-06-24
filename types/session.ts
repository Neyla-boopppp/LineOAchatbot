export type ApplicationInfo = {
  brand?: string
  position?: string
  branch?: string
}

export type UserState =
  | ({ phase: 'collecting_info' } & ApplicationInfo)
  | ({ phase: 'awaiting_screening' } & ApplicationInfo)
  | ({ phase: 'awaiting_documents' } & ApplicationInfo)
  | ({ phase: 'ready' } & ApplicationInfo)

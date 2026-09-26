import { RepairStatus } from '../models/index.ts'

// Keys are the existing API values; labels and CSS identifiers are shared by all views.
export const repairStatusPresentation = {
  [RepairStatus.RECEIVED]: { label: 'Received', modifier: 'received' },
  [RepairStatus.IN_PROGRESS]: { label: 'In repair', modifier: 'in-progress' },
  [RepairStatus.COMPLETED]: { label: 'Completed', modifier: 'completed' },
} as const satisfies Record<RepairStatus, { label: string; modifier: string }>

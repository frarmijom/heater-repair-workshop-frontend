export enum RepairStatus {
  RECEIVED = 'received',
  IN_REPAIR = 'in_repair',
  COMPLETED = 'completed',
}

export interface RepairOrder {
  id: number
  customerName: string
  customerPhone: string
  heaterBrand: string
  heaterModel: string
  reportedIssue: string
  status: RepairStatus
  receivedAt: string
  completedAt?: string
}

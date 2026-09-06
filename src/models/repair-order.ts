export enum RepairStatus {
  RECEIVED = 'RECEIVED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

export interface RepairOrder {
  id: string
  customerName: string
  customerContact: string
  heaterBrand: string
  heaterModel: string
  reportedIssue: string
  diagnosis: string | null
  status: RepairStatus
  receivedAt: string
  completedAt: string | null
}

export type CreateRepairOrderPayload = Pick<
  RepairOrder,
  | 'customerName'
  | 'customerContact'
  | 'heaterBrand'
  | 'heaterModel'
  | 'reportedIssue'
>

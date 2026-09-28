import type { ServiceType } from './service-type.ts'

export enum WorkOrderStatus {
  RECEIVED = 'RECEIVED',
  DIAGNOSIS = 'DIAGNOSIS',
  WAITING_CUSTOMER = 'WAITING_CUSTOMER',
  WAITING_PARTS = 'WAITING_PARTS',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  NOT_APPROVED = 'NOT_APPROVED',
}

export interface WorkOrder {
  id: string
  customerName: string
  customerContact: string
  heaterBrand: string
  heaterModel: string
  serviceType: ServiceType
  reportedIssue: string
  diagnosis: string | null
  status: WorkOrderStatus
  receivedAt: string
  completedAt: string | null
  lifecycleVersion: 'LEGACY' | 'V1'
  legacyStatus: WorkOrderStatus | null
  customerDecision: 'APPROVED' | 'REJECTED' | null
}

export type CreateWorkOrderPayload = Pick<
  WorkOrder,
  | 'customerName'
  | 'customerContact'
  | 'heaterBrand'
  | 'heaterModel'
  | 'serviceType'
  | 'reportedIssue'
>

import type { ServiceType } from './service-type.ts'

export enum WorkOrderStatus {
  RECEIVED = 'RECEIVED', DIAGNOSIS = 'DIAGNOSIS', WAITING_CUSTOMER = 'WAITING_CUSTOMER',
  WAITING_PARTS = 'WAITING_PARTS', IN_PROGRESS = 'IN_PROGRESS', COMPLETED = 'COMPLETED', NOT_APPROVED = 'NOT_APPROVED',
}

export interface WorkOrderEquipment {
  id: string
  brand: string
  model: string
  capacity: string | null
  serialNumber: string | null
  notes: string | null
  position: number
}

export interface CreateWorkOrderEquipmentPayload {
  brand: string
  model: string
  capacity: string | null
  serialNumber: string | null
  notes: string | null
  position: number
}

export interface WorkOrder {
  id: string
  customerName: string
  customerContact: string
  /** Transitional compatibility fields. Prefer equipments. */
  heaterBrand: string
  heaterModel: string
  equipments?: WorkOrderEquipment[]
  serviceType: ServiceType
  reportedIssue: string
  diagnosis: string | null
  status: WorkOrderStatus
  receivedAt: string
  completedAt: string | null
  lifecycleVersion?: 'LEGACY' | 'V1'
  legacyStatus?: WorkOrderStatus | null
  customerDecision?: 'APPROVED' | 'REJECTED' | null
}

export interface CreateWorkOrderPayload {
  customerName: string
  customerContact: string
  heaterBrand: string
  heaterModel: string
  equipments: CreateWorkOrderEquipmentPayload[]
  serviceType: ServiceType
  reportedIssue: string
}

export function workOrderEquipments(order: WorkOrder): readonly WorkOrderEquipment[] {
  if (order.equipments?.length) return [...order.equipments].sort((a, b) => a.position - b.position)
  return [{ id: `${order.id}-legacy-equipment`, brand: order.heaterBrand, model: order.heaterModel,
    capacity: null, serialNumber: null, notes: null, position: 1 }]
}

export function workOrderEquipmentSummary(order: WorkOrder): string {
  const equipments = workOrderEquipments(order)
  const first = equipments[0]!
  return equipments.length === 1 ? `${first.brand} ${first.model}` : `${first.brand} ${first.model} +${equipments.length - 1}`
}

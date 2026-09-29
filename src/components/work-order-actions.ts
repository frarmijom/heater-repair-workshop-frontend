import { ServiceType, WorkOrderStatus, type WorkOrder } from '../models/index.ts'

export const workOrderActions = {
  'diagnosis/begin': 'Iniciar diagnóstico',
  diagnosis: 'Guardar diagnóstico',
  'diagnosis/complete': 'Finalizar diagnóstico',
  approve: 'Aprobar reparación',
  reject: 'No aprobar reparación',
  'waiting-parts': 'Esperar repuestos',
  start: 'Iniciar trabajo',
  complete: 'Completar trabajo',
} as const
export type WorkOrderAction = keyof typeof workOrderActions

export function availableWorkOrderActions(order: WorkOrder): WorkOrderAction[] {
  const repair = order.serviceType === ServiceType.REPAIR
  switch (order.status) {
    case WorkOrderStatus.RECEIVED: return repair ? ['diagnosis/begin'] : ['start', 'waiting-parts']
    case WorkOrderStatus.DIAGNOSIS: return repair ? ['diagnosis', ...(order.diagnosis ? ['diagnosis/complete' as const] : [])] : []
    case WorkOrderStatus.WAITING_CUSTOMER: return repair ? ['approve', 'reject'] : []
    case WorkOrderStatus.WAITING_PARTS: return !repair || order.customerDecision === 'APPROVED' ? ['start'] : []
    case WorkOrderStatus.IN_PROGRESS: return ['complete']
    default: return []
  }
}

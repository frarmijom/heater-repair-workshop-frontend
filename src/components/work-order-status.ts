import { WorkOrderStatus } from '../models/index.ts'

// Keys are the existing API values; labels and CSS identifiers are shared by all views.
export const workOrderStatusPresentation = {
  [WorkOrderStatus.RECEIVED]: { label: 'Recibidas', modifier: 'received' },
  [WorkOrderStatus.DIAGNOSIS]: { label: 'En diagnóstico', modifier: 'diagnosis' },
  [WorkOrderStatus.WAITING_CUSTOMER]: { label: 'Esperando al cliente', modifier: 'waiting-customer' },
  [WorkOrderStatus.WAITING_PARTS]: { label: 'Esperando repuestos', modifier: 'waiting-parts' },
  [WorkOrderStatus.IN_PROGRESS]: { label: 'En ejecución', modifier: 'in-progress' },
  [WorkOrderStatus.COMPLETED]: { label: 'Completadas', modifier: 'completed' },
  [WorkOrderStatus.NOT_APPROVED]: { label: 'No aprobadas', modifier: 'not-approved' },
} as const satisfies Record<WorkOrderStatus, { label: string; modifier: string }>

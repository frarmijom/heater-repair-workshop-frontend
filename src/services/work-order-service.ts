import type { WorkOrder } from '../models/index.ts'
import type { WorkOrderFormPayload } from '../components/work-order-form.ts'

import { apiRequest as request } from './api.ts'

export async function loadWorkOrders(): Promise<WorkOrder[]> {
  return request<WorkOrder[]>('/work-orders')
}

export async function createWorkOrder(
  payload: WorkOrderFormPayload,
): Promise<WorkOrder> {
  return request<WorkOrder>('/work-orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function performWorkOrderAction(
  id: string, action: import('../components/work-order-actions.ts').WorkOrderAction,
  payload?: { diagnosis: string } | { partsAvailable: boolean },
): Promise<WorkOrder> {
  return request<WorkOrder>(`/work-orders/${encodeURIComponent(id)}/${action}`, {
    method: 'PATCH',
    ...(payload ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {}),
  })
}

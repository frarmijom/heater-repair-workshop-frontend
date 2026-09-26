import type { RepairOrder } from '../models/index.ts'
import type { RepairOrderFormPayload } from '../components/repair-order-form.ts'

import { apiRequest as request } from './api.ts'

export async function loadRepairOrders(): Promise<RepairOrder[]> {
  return request<RepairOrder[]>('/repair-orders')
}

export async function createRepairOrder(
  payload: RepairOrderFormPayload,
): Promise<RepairOrder> {
  return request<RepairOrder>('/repair-orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function startRepairOrder(
  id: string,
  diagnosis: string,
): Promise<RepairOrder> {
  return request<RepairOrder>(`/repair-orders/${encodeURIComponent(id)}/start`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ diagnosis }),
  })
}

export async function completeRepairOrder(id: string): Promise<RepairOrder> {
  return request<RepairOrder>(
    `/repair-orders/${encodeURIComponent(id)}/complete`,
    { method: 'PATCH' },
  )
}

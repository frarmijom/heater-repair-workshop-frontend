import type { RepairOrder } from '../models/index.ts'
import type { RepairOrderFormPayload } from '../components/repair-order-form.ts'

const API_BASE_URL = (
  import.meta.env.VITE_API_URL || '/api'
).replace(/\/$/, '')

interface ApiErrorResponse {
  message?: unknown
  validationErrors?: unknown
}

function formatValidationErrors(value: unknown): string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return ''
  }

  return Object.values(value)
    .filter((message): message is string => typeof message === 'string')
    .join(' ')
}

async function createApiError(response: Response): Promise<Error> {
  const fallbackMessage = `The server returned HTTP ${response.status}.`

  try {
    const body = (await response.json()) as ApiErrorResponse
    const message =
      typeof body.message === 'string' ? body.message : fallbackMessage
    const validationDetails = formatValidationErrors(body.validationErrors)
    return new Error(validationDetails ? `${message} ${validationDetails}` : message)
  } catch {
    return new Error(fallbackMessage)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, init)
  } catch {
    throw new Error(
      'The workshop API is unavailable. Check the backend connection.',
    )
  }

  if (!response.ok) {
    throw await createApiError(response)
  }

  try {
    return (await response.json()) as T
  } catch {
    throw new Error('The workshop API returned an invalid JSON response.')
  }
}

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

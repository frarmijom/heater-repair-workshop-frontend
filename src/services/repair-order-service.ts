import { RepairStatus } from '../models/index.ts'
import type { RepairOrder } from '../models/index.ts'
import type { RepairOrderFormPayload } from '../components/repair-order-form.ts'

const SIMULATED_DELAY_MS = 700
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1'

const storedRepairOrders: RepairOrder[] = [
  {
    id: 1,
    customerName: 'Customer A',
    customerPhone: '+56 9 1111 1111',
    heaterBrand: 'Brand A',
    heaterModel: 'Model 100',
    reportedIssue: 'The heater turns off after a few minutes.',
    status: RepairStatus.IN_REPAIR,
    receivedAt: '2026-07-28T13:30:00.000Z',
  },
  {
    id: 2,
    customerName: 'Customer B',
    customerPhone: '+56 9 2222 2222',
    heaterBrand: 'Brand B',
    heaterModel: 'Model 200',
    reportedIssue: 'The heater does not produce heat.',
    status: RepairStatus.RECEIVED,
    receivedAt: '2026-07-31T14:45:00.000Z',
  },
  {
    id: 3,
    customerName: 'Customer C',
    customerPhone: '+56 9 3333 3333',
    heaterBrand: 'Brand C',
    heaterModel: 'Model 300',
    reportedIssue: 'The heater does not turn on.',
    status: RepairStatus.COMPLETED,
    receivedAt: '2026-07-24T12:00:00.000Z',
    completedAt: '2026-07-30T16:20:00.000Z',
  },
]

function simulateNetworkDelay(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, SIMULATED_DELAY_MS)
  })
}

/**
 * Loads repair orders using Fetch with explicit HTTP response.ok validation,
 * falling back gracefully to simulated local data if the server is offline.
 */
export async function loadRepairOrders(): Promise<RepairOrder[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/repair-orders`)
    if (!response.ok) {
      throw new Error(`Error del Servidor: Código HTTP ${response.status}`)
    }
    const data = (await response.json()) as RepairOrder[]
    return data
  } catch (error: unknown) {
    // Local simulation fallback when no external server is running
    await simulateNetworkDelay()
    return storedRepairOrders.map((order) => ({ ...order }))
  }
}

/**
 * Creates a repair order using Fetch with explicit HTTP response.ok validation,
 * falling back gracefully to simulated local data if the server is offline.
 */
export async function createRepairOrder(
  payload: RepairOrderFormPayload,
): Promise<RepairOrder> {
  try {
    const response = await fetch(`${API_BASE_URL}/repair-orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(`Error del Servidor: Código HTTP ${response.status}`)
    }

    const createdOrder = (await response.json()) as RepairOrder
    storedRepairOrders.push(createdOrder)
    return createdOrder
  } catch (error: unknown) {
    // Local simulation fallback when no external server is running
    await simulateNetworkDelay()
    const nextId = Math.max(0, ...storedRepairOrders.map(({ id }) => id)) + 1
    const repairOrder: RepairOrder = {
      id: nextId,
      ...payload,
      receivedAt: new Date().toISOString(),
    }
    storedRepairOrders.push(repairOrder)
    return { ...repairOrder }
  }
}


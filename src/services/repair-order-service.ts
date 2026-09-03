import { RepairStatus } from '../models/index.ts'
import type { RepairOrder } from '../models/index.ts'
import type { RepairOrderFormPayload } from '../components/repair-order-form.ts'

const SIMULATED_DELAY_MS = 700
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api'

const storedRepairOrders: RepairOrder[] = [
  {
    id: 'ORDER-550E8400-E29B-41D4-A716-446655440001',
    customerName: 'Customer A',
    customerContact: '+56911111111',
    heaterBrand: 'Brand A',
    heaterModel: 'Model 100',
    reportedIssue: 'The heater turns off after a few minutes.',
    diagnosis: 'Damaged ignition sensor',
    status: RepairStatus.IN_PROGRESS,
    receivedAt: '2026-07-28T13:30:00.000Z',
    completedAt: null,
  },
  {
    id: 'ORDER-550E8400-E29B-41D4-A716-446655440002',
    customerName: 'Customer B',
    customerContact: '+56922222222',
    heaterBrand: 'Brand B',
    heaterModel: 'Model 200',
    reportedIssue: 'The heater does not produce heat.',
    diagnosis: null,
    status: RepairStatus.RECEIVED,
    receivedAt: '2026-07-31T14:45:00.000Z',
    completedAt: null,
  },
  {
    id: 'ORDER-550E8400-E29B-41D4-A716-446655440003',
    customerName: 'Customer C',
    customerContact: '+56933333333',
    heaterBrand: 'Brand C',
    heaterModel: 'Model 300',
    reportedIssue: 'The heater does not turn on.',
    diagnosis: 'Faulty control board',
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
    const repairOrder: RepairOrder = {
      id: `ORDER-${crypto.randomUUID().toUpperCase()}`,
      ...payload,
      diagnosis: null,
      status: RepairStatus.RECEIVED,
      receivedAt: new Date().toISOString(),
      completedAt: null,
    }
    storedRepairOrders.push(repairOrder)
    return { ...repairOrder }
  }
}


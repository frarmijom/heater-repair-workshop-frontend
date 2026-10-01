// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { clearCsrf } from '../src/services/api.ts'
import { loadWorkOrderEquipmentServices, replaceWorkOrderEquipmentServices } from '../src/services/work-order-service.ts'
import { generateWorkOrderDetailHtml } from '../src/components/work-order-detail.ts'
import { ServiceType, WorkOrderStatus, type WorkOrder } from '../src/models/index.ts'

beforeEach(() => clearCsrf())

it('renders an independent planned-services surface for every equipment', () => {
  const order: WorkOrder = {
    id: 'ORDER-1', customerName: 'Cliente', customerContact: '123', heaterBrand: 'Bosch', heaterModel: 'Legacy',
    equipments: [
      { id: 'eq-1', brand: 'Bosch', model: 'A', capacity: null, serialNumber: null, notes: null, position: 1 },
      { id: 'eq-2', brand: 'Junkers', model: 'B', capacity: null, serialNumber: null, notes: null, position: 2 },
    ],
    serviceType: ServiceType.REPAIR, reportedIssue: 'Falla', diagnosis: null, status: WorkOrderStatus.RECEIVED,
    receivedAt: '2026-09-30T12:00:00Z', completedAt: null,
  }
  const root = document.createElement('div')
  root.innerHTML = generateWorkOrderDetailHtml(order)
  expect(root.querySelectorAll('[data-equipment-services]')).toHaveLength(2)
  expect(root.querySelector('[data-equipment-services="eq-1"]')).not.toBeNull()
  expect(root.querySelector('[data-equipment-services="eq-2"]')).not.toBeNull()
  expect(root.querySelectorAll('[data-equipment-services-edit]')).toHaveLength(2)
})

it('loads and replaces service assignments through the equipment-scoped API', async () => {
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    if (url === '/api/auth/csrf') return new Response(JSON.stringify({ headerName: 'X-CSRF-TOKEN', token: 'token' }), { status: 200 })
    if (url === '/api/work-orders/order%201/equipments/eq%2F1/services' && (init.method ?? 'GET') === 'GET') {
      return new Response(JSON.stringify([{ serviceId: 'service-1' }]), { status: 200 })
    }
    if (url === '/api/work-orders/order%201/equipments/eq%2F1/services' && init.method === 'PUT') {
      expect(JSON.parse(init.body as string)).toEqual({ serviceIds: ['service-2'] })
      expect(new Headers(init.headers).get('X-CSRF-TOKEN')).toBe('token')
      return new Response(JSON.stringify([{ serviceId: 'service-2' }]), { status: 200 })
    }
    throw new Error(`Unexpected URL: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  await expect(loadWorkOrderEquipmentServices('order 1', 'eq/1')).resolves.toEqual([{ serviceId: 'service-1' }])
  await expect(replaceWorkOrderEquipmentServices('order 1', 'eq/1', ['service-2'])).resolves.toEqual([{ serviceId: 'service-2' }])
  vi.unstubAllGlobals()
})

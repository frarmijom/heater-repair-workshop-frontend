// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { clearCsrf } from '../src/services/api.ts'
import { createWorkOrderV2 } from '../src/services/work-order-service.ts'
import type { CreateWorkOrderV2Payload } from '../src/models/index.ts'

beforeEach(() => {
  clearCsrf()
  vi.unstubAllGlobals()
})

it('creates a V2 work order through the dedicated endpoint', async () => {
  const payload: CreateWorkOrderV2Payload = {
    customerName: 'Cliente V2',
    customerContact: '+56911112222',
    equipments: [
      {
        type: 'CALEFONT',
        brand: 'Bosch',
        model: 'Therm 5600',
        capacity: '10 L',
        serialNumber: 'SN-001',
        notes: 'Equipo principal',
        position: 1,
        intakeRoute: 'DIAGNOSIS_REQUIRED',
        reportedIssue: 'No enciende',
      },
      {
        type: 'CALEFONT',
        brand: 'Junkers',
        model: 'WR11',
        capacity: null,
        serialNumber: null,
        notes: null,
        position: 2,
        intakeRoute: 'DIRECT_SERVICE',
        reportedIssue: null,
      },
    ],
  }

  const response = {
    id: 'order-v2',
    customerName: payload.customerName,
    customerContact: payload.customerContact,
    heaterBrand: null,
    heaterModel: null,
    equipments: [],
    serviceType: null,
    reportedIssue: null,
    diagnosis: null,
    status: null,
    receivedAt: '2026-10-03T12:00:00Z',
    completedAt: null,
    lifecycleVersion: 'V2',
    legacyStatus: null,
    customerDecision: null,
  }

  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    if (url === '/api/auth/csrf') return new Response(JSON.stringify({ headerName: 'X-CSRF-TOKEN', token: 'token' }), { status: 200 })
    if (url === '/api/work-orders/v2' && init.method === 'POST') {
      expect(JSON.parse(init.body as string)).toEqual(payload)
      expect(new Headers(init.headers).get('X-CSRF-TOKEN')).toBe('token')
      return new Response(JSON.stringify(response), { status: 201 })
    }
    throw new Error(`Unexpected URL: ${url}`)
  })

  vi.stubGlobal('fetch', fetchMock)

  await expect(createWorkOrderV2(payload)).resolves.toEqual(response)
  expect(fetchMock).toHaveBeenCalledTimes(2)

  vi.unstubAllGlobals()
})

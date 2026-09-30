// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { ServiceType, WorkOrderStatus, type WorkOrder } from '../src/models/index.ts'
import { generateWorkOrderFormHtml, setupWorkOrderForm } from '../src/components/work-order-form.ts'
import { generateWorkOrderDetailHtml } from '../src/components/work-order-detail.ts'
import { generateWorkOrderResultsHtml } from '../src/components/work-order-results.ts'

it('creates one work order with multiple ordered equipments', async () => {
  document.body.innerHTML = generateWorkOrderFormHtml()
  const create = vi.fn().mockResolvedValue(undefined)
  setupWorkOrderForm(document.body, create)
  document.querySelector<HTMLInputElement>('[name="customerName"]')!.value = 'Cliente'
  document.querySelector<HTMLInputElement>('[name="customerContact"]')!.value = '12345678'
  document.querySelector<HTMLInputElement>('[name="heaterBrand"]')!.value = 'Junkers'
  document.querySelector<HTMLInputElement>('[name="heaterModel"]')!.value = 'WR11'
  document.querySelector<HTMLTextAreaElement>('[name="reportedIssue"]')!.value = 'No enciende'
  document.querySelector<HTMLButtonElement>('#add-equipment')!.click()
  const second = document.querySelector<HTMLElement>('[data-equipment-index="1"]')!
  second.querySelector<HTMLInputElement>('[data-equipment-field="brand"]')!.value = 'Mademsa'
  second.querySelector<HTMLInputElement>('[data-equipment-field="model"]')!.value = 'Vitality 10'
  second.querySelector<HTMLInputElement>('[data-equipment-field="capacity"]')!.value = '10 L'
  second.querySelector<HTMLInputElement>('[data-equipment-field="serialNumber"]')!.value = 'SN-2'
  second.querySelector<HTMLTextAreaElement>('[data-equipment-field="notes"]')!.value = 'Segundo equipo'
  document.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }))
  await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1))
  expect(create.mock.calls[0]![0].equipments).toEqual([
    { brand: 'Junkers', model: 'WR11', capacity: null, serialNumber: null, notes: null, position: 1 },
    { brand: 'Mademsa', model: 'Vitality 10', capacity: '10 L', serialNumber: 'SN-2', notes: 'Segundo equipo', position: 2 },
  ])
})

it('requires brand and model for every equipment and allows removing added equipments', () => {
  document.body.innerHTML = generateWorkOrderFormHtml()
  const create = vi.fn().mockResolvedValue(undefined)
  setupWorkOrderForm(document.body, create)
  document.querySelector<HTMLButtonElement>('#add-equipment')!.click()
  expect(document.querySelectorAll('[data-equipment-index]')).toHaveLength(2)
  document.querySelector<HTMLButtonElement>('[data-remove-equipment]')!.click()
  expect(document.querySelectorAll('[data-equipment-index]')).toHaveLength(1)
})

it('renders all equipments in detail and summarizes multiple equipments in results', () => {
  const order: WorkOrder = {
    id: 'ORDER-1', customerName: 'Cliente', customerContact: '+56912345678', heaterBrand: 'Junkers', heaterModel: 'WR11',
    equipments: [
      { id: 'e1', brand: 'Junkers', model: 'WR11', capacity: '11 L', serialNumber: null, notes: null, position: 1 },
      { id: 'e2', brand: 'Mademsa', model: 'Vitality 10', capacity: '10 L', serialNumber: 'SN-2', notes: 'Segundo equipo', position: 2 },
    ], serviceType: ServiceType.REPAIR, reportedIssue: 'No enciende', diagnosis: null, status: WorkOrderStatus.RECEIVED,
    receivedAt: '2026-09-30T12:00:00Z', completedAt: null, lifecycleVersion: 'V1', legacyStatus: null, customerDecision: null,
  }
  const detail = document.createElement('div'); detail.innerHTML = generateWorkOrderDetailHtml(order)
  expect(detail.querySelectorAll('.work-order-detail__equipment')).toHaveLength(2)
  expect(detail.textContent).toContain('Mademsa'); expect(detail.textContent).toContain('SN-2'); expect(detail.textContent).toContain('Segundo equipo')
  const results = document.createElement('div'); results.innerHTML = generateWorkOrderResultsHtml([order])
  expect(results.textContent).toContain('Junkers WR11 +1')
})

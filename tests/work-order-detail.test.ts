// @vitest-environment jsdom
import { ServiceType } from '../src/models/index.ts'
import { describe, expect, it } from 'vitest'
import { generateWorkOrderDetailHtml } from '../src/components/work-order-detail.ts'
import { WorkOrderStatus } from '../src/models/index.ts'
import type { WorkOrder } from '../src/models/index.ts'
import { formatWorkOrderDate, formatWorkOrderDateTime } from '../src/formatters/work-order-time.ts'

const order: WorkOrder = { id: 'id-1', customerName: 'Customer', customerContact: '+56912345678',
  heaterBrand: 'Brand', heaterModel: 'Model', serviceType: ServiceType.REPAIR, reportedIssue: 'No heat', diagnosis: null,
  lifecycleVersion: 'V1', legacyStatus: null, customerDecision: null,
  status: WorkOrderStatus.RECEIVED, receivedAt: '2026-09-26T12:00:00Z', completedAt: null }
function render(repair: WorkOrder | undefined) {
  const root = document.createElement('div')
  root.innerHTML = generateWorkOrderDetailHtml(repair)
  return root
}
describe('repair detail and factual lifecycle', () => {
  it.each(Object.values(WorkOrderStatus))('shows the actual %s without fabricating optional history', status => {
    const root = render({ ...order, status })
    expect(root.querySelectorAll('[aria-current="step"]')).toHaveLength(1)
    expect(root.querySelector('[aria-current="step"]')?.getAttribute('data-stage')).toBe(status)
    expect(root.querySelector('[data-reached]')).toBeNull()
    expect(root.textContent).not.toContain('Invalid Date')
  })
  it('shows actual information and an explicitly labelled diagnosis input', () => {
    const root = render({ ...order, status: WorkOrderStatus.DIAGNOSIS })
    for (const value of [order.id, order.customerName, order.customerContact, order.heaterBrand, order.heaterModel, order.reportedIssue]) expect(root.textContent).toContain(value)
    expect(root.querySelector('label')?.getAttribute('for')).toBe('work-order-diagnosis')
    expect(root.querySelector('textarea')?.required).toBe(true)
    expect(root.textContent).not.toContain('Orden cerrada.')
    expect(root.textContent).toContain('Siguientes acciones: Guardar diagnóstico')
    expect(root.querySelector('.work-order-detail__information')?.textContent).not.toContain('Diagnosis')
    expect(render({ ...order, status: WorkOrderStatus.IN_PROGRESS, diagnosis: 'Replace valve' }).textContent).toContain('Replace valve')
  })
  it.each([null, undefined, '', 'invalid'])('omits unavailable dates safely: %s', value => {
    const root = render({ ...order, status: WorkOrderStatus.COMPLETED, receivedAt: value as unknown as string, completedAt: value as unknown as string })
    expect(root.querySelectorAll('small')).toHaveLength(0)
    expect(root.textContent).not.toContain('Invalid Date')
  })
  it('escapes every user-controlled text field', () => {
    const text = '<img src=x onerror=alert(1)>'
    const root = render({ ...order, id: text, customerName: text, customerContact: text, heaterBrand: text,
      heaterModel: text, reportedIssue: text, diagnosis: text })
    expect(root.querySelector('img')).toBeNull()
    expect(root.textContent?.split(text)).toHaveLength(8)
  })
  it('shows a safe missing-order message and a return link', () => {
    const root = render(undefined)
    expect(root.textContent).toContain('Orden de trabajo no encontrada')
    expect(root.querySelector('a')?.getAttribute('href')).toBe('#work-orders')
    expect(root.querySelector('button')).toBeNull()
  })
})

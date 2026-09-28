// @vitest-environment jsdom
import { ServiceType } from '../src/models/index.ts'
import { describe, expect, it } from 'vitest'
import { generateWorkOrderResultsHtml } from '../src/components/work-order-results.ts'
import { WorkOrderStatus, type WorkOrder } from '../src/models/index.ts'
import { workOrderStatusPresentation } from '../src/components/work-order-status.ts'
import { formatWorkOrderDateTime } from '../src/formatters/work-order-time.ts'

const order: WorkOrder = { id: 'order-1', customerName: 'Cliente', customerContact: '+56911112222',
  heaterBrand: 'Bosch', heaterModel: 'Therm', serviceType: ServiceType.REPAIR, reportedIssue: 'No enciende', diagnosis: null,
  status: WorkOrderStatus.RECEIVED, receivedAt: '2026-09-26T12:00:00Z', completedAt: null }
const render = (orders: WorkOrder[]) => {
  const root = document.createElement('div')
  root.innerHTML = generateWorkOrderResultsHtml(orders)
  return root
}

describe('repair query results', () => {
  it.each(Object.values(WorkOrderStatus))('renders real fields and shared %s presentation in an accessible table', status => {
    const root = render([{ ...order, status }])
    expect(root.querySelector('table')?.getAttribute('aria-labelledby')).toBe('work-order-results-title')
    expect([...root.querySelectorAll('thead th[scope="col"]')].map(node => node.textContent))
      .toEqual(['Orden / Servicio', 'Cliente', 'Equipo', 'Estado', 'Ingreso', 'Acción'])
    expect(root.querySelector('tbody th[scope="row"] > span')?.textContent).toBe('#order-1')
    for (const text of [order.customerName, order.heaterBrand, order.heaterModel, formatWorkOrderDateTime(order.receivedAt, 'es-CL')!]) expect(root.textContent).toContain(text)
    expect(root.querySelector('.work-order-card__status')?.textContent).toBe(workOrderStatusPresentation[status].label)
    const link = root.querySelector<HTMLAnchorElement>('a')!
    expect(link.getAttribute('href')).toBe('#work-orders/order-1')
    expect(link.tabIndex).toBe(0)
    expect(link.textContent).toBe('Ver detalle de la orden de trabajo #order-1')
  })
  it('escapes API fields and identifiers and encodes detail URLs', () => {
    const text = '<img src=x onerror=alert(1)>/#'
    const root = render([{ ...order, id: text, customerName: text, heaterBrand: text, heaterModel: text, receivedAt: 'invalid' }])
    expect(root.querySelector('img, script')).toBeNull()
    expect(root.querySelector('tr[data-order-id]')?.getAttribute('data-order-id')).toBe(text)
    expect(root.querySelector('a')?.getAttribute('href')).toBe(`#work-orders/${encodeURIComponent(text)}`)
    expect(root.textContent).toContain('Fecha no disponible')
    expect(root.textContent).not.toContain('Invalid Date')
  })
  it('has an explicit zero-results state without inventing rows', () => {
    const root = render([])
    expect(root.querySelector('table, a')).toBeNull()
    expect(root.querySelector('[role="status"]')?.textContent).toBe('No se encontraron órdenes de trabajo')
  })
})

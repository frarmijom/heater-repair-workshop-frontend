// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { generateRepairResultsHtml } from '../src/components/repair-results.ts'
import { RepairStatus, type RepairOrder } from '../src/models/index.ts'
import { repairStatusPresentation } from '../src/components/repair-status.ts'
import { formatRepairDateTime } from '../src/formatters/repair-time.ts'

const order: RepairOrder = { id: 'order-1', customerName: 'Cliente', customerContact: '+56911112222',
  heaterBrand: 'Bosch', heaterModel: 'Therm', reportedIssue: 'No enciende', diagnosis: null,
  status: RepairStatus.RECEIVED, receivedAt: '2026-09-26T12:00:00Z', completedAt: null }
const render = (orders: RepairOrder[]) => {
  const root = document.createElement('div')
  root.innerHTML = generateRepairResultsHtml(orders)
  return root
}

describe('repair query results', () => {
  it.each(Object.values(RepairStatus))('renders real fields and shared %s presentation in an accessible table', status => {
    const root = render([{ ...order, status }])
    expect(root.querySelector('table')?.getAttribute('aria-labelledby')).toBe('repair-results-title')
    expect([...root.querySelectorAll('thead th[scope="col"]')].map(node => node.textContent))
      .toEqual(['Orden', 'Cliente', 'Equipo', 'Estado', 'Ingreso', 'Acción'])
    expect(root.querySelector('tbody th[scope="row"]')?.textContent).toBe('#order-1')
    for (const text of [order.customerName, order.heaterBrand, order.heaterModel, formatRepairDateTime(order.receivedAt, 'es-CL')!]) expect(root.textContent).toContain(text)
    expect(root.querySelector('.repair-card__status')?.textContent).toBe(repairStatusPresentation[status].label)
    const link = root.querySelector<HTMLAnchorElement>('a')!
    expect(link.getAttribute('href')).toBe('#repairs/order-1')
    expect(link.tabIndex).toBe(0)
    expect(link.textContent).toBe('Ver detalle de la reparación #order-1')
  })
  it('escapes API fields and identifiers and encodes detail URLs', () => {
    const text = '<img src=x onerror=alert(1)>/#'
    const root = render([{ ...order, id: text, customerName: text, heaterBrand: text, heaterModel: text, receivedAt: 'invalid' }])
    expect(root.querySelector('img, script')).toBeNull()
    expect(root.querySelector('tr[data-order-id]')?.getAttribute('data-order-id')).toBe(text)
    expect(root.querySelector('a')?.getAttribute('href')).toBe(`#repairs/${encodeURIComponent(text)}`)
    expect(root.textContent).toContain('Fecha no disponible')
    expect(root.textContent).not.toContain('Invalid Date')
  })
  it('has an explicit zero-results state without inventing rows', () => {
    const root = render([])
    expect(root.querySelector('table, a')).toBeNull()
    expect(root.querySelector('[role="status"]')?.textContent).toBe('No se encontraron reparaciones')
  })
})

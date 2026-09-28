// @vitest-environment jsdom
import { ServiceType } from '../src/models/index.ts'
import { describe, expect, it } from 'vitest'
import { WorkOrderStatus } from '../src/models/index.ts'
import type { WorkOrder } from '../src/models/index.ts'
import { workOrderStatusPresentation } from '../src/components/work-order-status.ts'
import { generateWorkOrderDetailHtml } from '../src/components/work-order-detail.ts'
import { generateWorkOrderCardHtml } from '../src/components/work-order-card.ts'
import { generateWorkOrderFiltersHtml, isWorkOrderFilter } from '../src/components/work-order-filters.ts'
import { generateWorkshopMonitorHtml } from '../src/components/workshop-monitor.ts'
import { formatWorkOrderDate, formatWorkOrderDateTime } from '../src/formatters/work-order-time.ts'

function order(status: WorkOrderStatus): WorkOrder {
  return {
    id: 'ORDER-550E8400-E29B-41D4-A716-446655440001', customerName: 'Test customer',
    customerContact: '+56911112222', heaterBrand: 'Bosch', heaterModel: 'Therm',
    serviceType: ServiceType.REPAIR, reportedIssue: 'Turns off', diagnosis: status === WorkOrderStatus.RECEIVED ? null : 'Damaged sensor',
    status, receivedAt: '2026-09-24T12:15:00Z',
    completedAt: status === WorkOrderStatus.COMPLETED ? '2026-09-26T13:45:00Z' : null,
  }
}
function render(html: string): HTMLDivElement {
  const container = document.createElement('div')
  container.innerHTML = html
  return container
}

const cases = [
  { status: WorkOrderStatus.RECEIVED, label: 'Recibidas', modifier: 'received', action: 'diagnosis/begin' },
  { status: WorkOrderStatus.IN_PROGRESS, label: 'En ejecución', modifier: 'in-progress', action: 'complete' },
  { status: WorkOrderStatus.COMPLETED, label: 'Completadas', modifier: 'completed', action: null },
]

describe('canonical repair status presentation', () => {
  it('contains exactly the seven backend states', () => {
    expect(Object.keys(workOrderStatusPresentation)).toEqual(Object.values(WorkOrderStatus))
    expect(isWorkOrderFilter('DIAGNOSIS')).toBe(true)
    expect(isWorkOrderFilter('READY')).toBe(false)
  })

  it.each(cases)('renders $status consistently without changing its valid action', ({ status, label, modifier, action }) => {
    expect(workOrderStatusPresentation[status]).toEqual({ label, modifier })
    const card = render(generateWorkOrderCardHtml(order(status)))
    expect(card.querySelector('.work-order-card__status')!.textContent!.trim()).toBe(label)
    expect(card.querySelector(`.work-order-card--${modifier}`)).not.toBeNull()
    expect(card.querySelector(`.work-order-card__status--${modifier}`)).not.toBeNull()
    expect(card.querySelector('button')?.getAttribute('data-work-order-action') ?? null).toBe(action)

    const detail = render(generateWorkOrderDetailHtml(order(status)))
    expect(detail.querySelector('.work-order-card__status')!.textContent).toBe(label)
    expect(detail.querySelector(`[data-stage="${status}"] strong`)!.textContent).toBe(label)
    expect(detail.querySelector('[aria-current="step"]')!.getAttribute('data-stage')).toBe(status)

    const filters = render(generateWorkOrderFiltersHtml([order(status)]))
    const filter = filters.querySelector(`[data-work-order-status="${status}"]`)!
    expect(filter.querySelector('span')!.textContent).toBe(label)
    expect(filter.querySelector('strong')!.textContent).toBe('1')
    expect(isWorkOrderFilter(status)).toBe(true)

    const overview = render(generateWorkshopMonitorHtml([order(status)]))
    const item = [...overview.querySelectorAll('.dashboard-distribution li')].find(node => node.textContent?.includes(label))!
    expect(item.querySelector('strong')!.textContent).toBe('1')
    expect(overview.querySelector('.dashboard-state-summary')!.textContent).toContain(label)
  })

  it('preserves the All filter, counts and zero-order overview', () => {
    const orders = cases.map(({ status }) => order(status))
    const filters = render(generateWorkOrderFiltersHtml(orders))
    expect(filters.querySelector('[data-work-order-status="all"] strong')!.textContent).toBe('3')
    expect(filters.querySelector('[data-work-order-status="all"]')!.getAttribute('aria-pressed')).toBe('true')
    const overview = render(generateWorkshopMonitorHtml([]))
    expect([...overview.querySelectorAll('.dashboard-summary__metrics dd')].map(node => node.textContent)).toEqual(Array(6).fill('0'))
  })
})

describe('work queue item data', () => {
  it('shows the real identifier, heater, customer and reported information', () => {
    const repair = order(WorkOrderStatus.IN_PROGRESS)
    const item = render(generateWorkOrderCardHtml(repair))
    expect(item.querySelector('.work-order-card__id')?.textContent).toBe(`Orden de trabajo #${repair.id}`)
    expect(item.querySelector('h3')?.textContent).toBe(`${repair.heaterBrand} ${repair.heaterModel}`)
    expect(item.querySelector('.work-order-card__customer')?.textContent).toContain(repair.customerName)
    expect(item.querySelector('.work-order-card__customer')?.textContent).toContain(repair.customerContact)
    expect(item.querySelector('.work-order-card__issue')?.textContent).toContain(repair.reportedIssue)
    expect(item.querySelector('.work-order-card__diagnosis')?.textContent).toContain(repair.diagnosis)
    expect(item.querySelector('button')?.textContent).toBe('Completar trabajo')
    expect(render(generateWorkOrderCardHtml(order(WorkOrderStatus.RECEIVED))).querySelector('button')?.textContent).toBe('Iniciar diagnóstico')
  })

  it('renders API text as text, including the order identifier', () => {
    const text = '<img src=x onerror=alert(1)>'
    const item = render(generateWorkOrderCardHtml({ ...order(WorkOrderStatus.RECEIVED), id: text, heaterBrand: text,
      heaterModel: text, customerName: text, customerContact: text, reportedIssue: text, diagnosis: text }))
    expect(item.querySelector('img')).toBeNull()
    expect(item.querySelector('.work-order-card__id')?.textContent).toBe(`Orden de trabajo #${text}`)
    expect(item.querySelector('button')?.getAttribute('data-work-order-id')).toBe(text)
  })
})

describe('cards consume shared repair date formatting', () => {
  it('preserves local reception date/time and completion date', () => {
    const repair = order(WorkOrderStatus.COMPLETED)
    const card = render(generateWorkOrderCardHtml(repair))
    expect([...card.querySelectorAll('.work-order-card__dates dd')].map(node => node.textContent)).toEqual([
      formatWorkOrderDateTime(repair.receivedAt), formatWorkOrderDate(repair.completedAt),
    ])
  })

  it.each([null, '', 'not-a-timestamp'])('omits unavailable completion dates (%s)', timestamp => {
    const card = render(generateWorkOrderCardHtml({ ...order(WorkOrderStatus.COMPLETED), completedAt: timestamp }))
    expect(card.querySelectorAll('.work-order-card__dates dd')).toHaveLength(1)
    expect(card.textContent).not.toContain('Invalid Date')
  })

  it('handles an absent completion timestamp without inventing a date', () => {
    const repair = order(WorkOrderStatus.COMPLETED)
    Reflect.deleteProperty(repair, 'completedAt')
    const card = render(generateWorkOrderCardHtml(repair))
    expect(card.querySelectorAll('.work-order-card__dates dd')).toHaveLength(1)
    expect(card.textContent).not.toContain('Invalid Date')
  })

  it('uses an explicit fallback for an invalid reception timestamp', () => {
    const card = render(generateWorkOrderCardHtml({ ...order(WorkOrderStatus.RECEIVED), receivedAt: 'invalid' }))
    expect(card.querySelector('.work-order-card__dates dd')!.textContent).toBe('Fecha no disponible')
    expect(card.textContent).not.toContain('Invalid Date')
  })
})

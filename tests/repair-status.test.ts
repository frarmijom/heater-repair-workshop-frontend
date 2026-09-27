// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { RepairStatus } from '../src/models/index.ts'
import type { RepairOrder } from '../src/models/index.ts'
import { dashboardCategories } from '../src/dashboard/dashboard-data.ts'
import { repairStatusPresentation } from '../src/components/repair-status.ts'
import { generateRepairDetailHtml } from '../src/components/repair-detail.ts'
import { generateRepairOrderCardHtml } from '../src/components/repair-order-card.ts'
import { generateRepairOrderFiltersHtml, isRepairOrderFilter } from '../src/components/repair-order-filters.ts'
import { generateWorkshopMonitorHtml } from '../src/components/workshop-monitor.ts'
import { formatRepairDate, formatRepairDateTime } from '../src/formatters/repair-time.ts'

function order(status: RepairStatus): RepairOrder {
  return {
    id: 'ORDER-550E8400-E29B-41D4-A716-446655440001', customerName: 'Test customer',
    customerContact: '+56911112222', heaterBrand: 'Bosch', heaterModel: 'Therm',
    reportedIssue: 'Turns off', diagnosis: status === RepairStatus.RECEIVED ? null : 'Damaged sensor',
    status, receivedAt: '2026-09-24T12:15:00Z',
    completedAt: status === RepairStatus.COMPLETED ? '2026-09-26T13:45:00Z' : null,
  }
}
function render(html: string): HTMLDivElement {
  const container = document.createElement('div')
  container.innerHTML = html
  return container
}

const cases = [
  { status: RepairStatus.RECEIVED, label: 'Recibidas', modifier: 'received', action: 'start' },
  { status: RepairStatus.IN_PROGRESS, label: 'En reparación', modifier: 'in-progress', action: 'complete' },
  { status: RepairStatus.COMPLETED, label: 'Completadas', modifier: 'completed', action: null },
]

describe('canonical repair status presentation', () => {
  it('contains exactly the three backend states', () => {
    expect(Object.keys(repairStatusPresentation)).toEqual(Object.values(RepairStatus))
    expect(isRepairOrderFilter('DIAGNOSIS')).toBe(false)
    expect(isRepairOrderFilter('READY')).toBe(false)
  })

  it.each(cases)('renders $status consistently without changing its valid action', ({ status, label, modifier, action }) => {
    expect(repairStatusPresentation[status]).toEqual({ label, modifier })
    const card = render(generateRepairOrderCardHtml(order(status)))
    expect(card.querySelector('.repair-card__status')!.textContent!.trim()).toBe(label)
    expect(card.querySelector(`.repair-card--${modifier}`)).not.toBeNull()
    expect(card.querySelector(`.repair-card__status--${modifier}`)).not.toBeNull()
    expect(card.querySelector('button')?.getAttribute('data-repair-action') ?? null).toBe(action)

    const detail = render(generateRepairDetailHtml(order(status)))
    expect(detail.querySelector('.repair-card__status')!.textContent).toBe(label)
    expect(detail.querySelector(`[data-stage="${status}"] strong`)!.textContent).toBe(label)
    expect(detail.querySelector('[aria-current="step"]')!.getAttribute('data-stage')).toBe(status)

    const filters = render(generateRepairOrderFiltersHtml([order(status)]))
    const filter = filters.querySelector(`[data-repair-status="${status}"]`)!
    expect(filter.querySelector('span')!.textContent).toBe(label)
    expect(filter.querySelector('strong')!.textContent).toBe('1')
    expect(isRepairOrderFilter(status)).toBe(true)

    const overview = render(generateWorkshopMonitorHtml([order(status)]))
    const metric = overview.querySelector(`.dashboard-metric--${modifier}`)!
    expect(metric.querySelector('dt')!.firstChild?.textContent).toBe(dashboardCategories.find(category => category.status === status)!.label)
    expect(overview.querySelector('.dashboard-distribution')!.textContent).toContain(label)
    expect(metric.querySelector('dd')!.textContent).toBe('1')
  })

  it('preserves the All filter, counts and zero-order overview', () => {
    const orders = cases.map(({ status }) => order(status))
    const filters = render(generateRepairOrderFiltersHtml(orders))
    expect(filters.querySelector('[data-repair-status="all"] strong')!.textContent).toBe('3')
    expect(filters.querySelector('[data-repair-status="all"]')!.getAttribute('aria-pressed')).toBe('true')
    const overview = render(generateWorkshopMonitorHtml([]))
    expect([...overview.querySelectorAll('dd, .dashboard-summary__total strong')].map(node => node.textContent)).toEqual(['0', '0', '0', '0'])
  })
})

describe('work queue item data', () => {
  it('shows the real identifier, heater, customer and reported information', () => {
    const repair = order(RepairStatus.IN_PROGRESS)
    const item = render(generateRepairOrderCardHtml(repair))
    expect(item.querySelector('.repair-card__id')?.textContent).toBe(`Reparación #${repair.id}`)
    expect(item.querySelector('h3')?.textContent).toBe(`${repair.heaterBrand} ${repair.heaterModel}`)
    expect(item.querySelector('.repair-card__customer')?.textContent).toContain(repair.customerName)
    expect(item.querySelector('.repair-card__customer')?.textContent).toContain(repair.customerContact)
    expect(item.querySelector('.repair-card__issue')?.textContent).toContain(repair.reportedIssue)
    expect(item.querySelector('.repair-card__diagnosis')?.textContent).toContain(repair.diagnosis)
    expect(item.querySelector('button')?.textContent).toBe('Completar reparación')
    expect(render(generateRepairOrderCardHtml(order(RepairStatus.RECEIVED))).querySelector('button')?.textContent).toBe('Iniciar reparación')
  })

  it('renders API text as text, including the order identifier', () => {
    const text = '<img src=x onerror=alert(1)>'
    const item = render(generateRepairOrderCardHtml({ ...order(RepairStatus.RECEIVED), id: text, heaterBrand: text,
      heaterModel: text, customerName: text, customerContact: text, reportedIssue: text, diagnosis: text }))
    expect(item.querySelector('img')).toBeNull()
    expect(item.querySelector('.repair-card__id')?.textContent).toBe(`Reparación #${text}`)
    expect(item.querySelector('button')?.getAttribute('data-repair-order-id')).toBe(text)
  })
})

describe('cards consume shared repair date formatting', () => {
  it('preserves local reception date/time and completion date', () => {
    const repair = order(RepairStatus.COMPLETED)
    const card = render(generateRepairOrderCardHtml(repair))
    expect([...card.querySelectorAll('.repair-card__dates dd')].map(node => node.textContent)).toEqual([
      formatRepairDateTime(repair.receivedAt), formatRepairDate(repair.completedAt),
    ])
  })

  it.each([null, '', 'not-a-timestamp'])('omits unavailable completion dates (%s)', timestamp => {
    const card = render(generateRepairOrderCardHtml({ ...order(RepairStatus.COMPLETED), completedAt: timestamp }))
    expect(card.querySelectorAll('.repair-card__dates dd')).toHaveLength(1)
    expect(card.textContent).not.toContain('Invalid Date')
  })

  it('handles an absent completion timestamp without inventing a date', () => {
    const repair = order(RepairStatus.COMPLETED)
    Reflect.deleteProperty(repair, 'completedAt')
    const card = render(generateRepairOrderCardHtml(repair))
    expect(card.querySelectorAll('.repair-card__dates dd')).toHaveLength(1)
    expect(card.textContent).not.toContain('Invalid Date')
  })

  it('uses an explicit fallback for an invalid reception timestamp', () => {
    const card = render(generateRepairOrderCardHtml({ ...order(RepairStatus.RECEIVED), receivedAt: 'invalid' }))
    expect(card.querySelector('.repair-card__dates dd')!.textContent).toBe('Fecha no disponible')
    expect(card.textContent).not.toContain('Invalid Date')
  })
})

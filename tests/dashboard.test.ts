// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { generateWorkshopMonitorHtml } from '../src/components/workshop-monitor.ts'
import { dashboardCategories, summarizeDashboard, weeklyReceptions } from '../src/dashboard/dashboard-data.ts'
import { RepairStatus } from '../src/models/index.ts'
import type { RepairOrder } from '../src/models/index.ts'

function orders(...statuses: RepairStatus[]): RepairOrder[] {
  return statuses.map((status, index) => ({
    id: String(index), customerName: 'Test customer', customerContact: '+56911112222',
    heaterBrand: 'Bosch', heaterModel: 'Therm', reportedIssue: 'Turns off',
    diagnosis: null, status, receivedAt: '2026-09-26T12:00:00Z', completedAt: null,
  }))
}

function render(repairs: RepairOrder[]): HTMLDivElement {
  const root = document.createElement('div')
  root.innerHTML = generateWorkshopMonitorHtml(repairs)
  return root
}

function counts(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll('dd'), element => element.textContent!)
}

describe('operational dashboard', () => {
  it('counts each lifecycle state and the total using the supplied collection', () => {
    const root = render(orders(RepairStatus.RECEIVED, RepairStatus.COMPLETED,
      RepairStatus.IN_PROGRESS, RepairStatus.RECEIVED, RepairStatus.COMPLETED, RepairStatus.COMPLETED))
    expect(counts(root)).toEqual(['1', '2', '3'])
    expect(root.querySelector('.dashboard-summary__total')?.textContent).toBe('Total de reparaciones: 6')
    expect(Array.from(root.querySelectorAll('dt'), element => element.firstChild?.textContent))
      .toEqual(dashboardCategories.map(category => category.label))
    expect(root.textContent).not.toContain('Aún no hay reparaciones.')
    expect(root.querySelector('.monitor, .monitor__distribution, [role="img"]')).toBeNull()
  })

  it('renders all zero states and an explicit empty message', () => {
    const root = render([])
    expect(counts(root)).toEqual(['0', '0', '0'])
    expect(root.querySelector('.dashboard-summary__total')?.textContent).toBe('Total de reparaciones: 0')
    expect(root.textContent).toContain('Aún no hay reparaciones.')
    expect(root.querySelectorAll('dt')).toHaveLength(3)
  })

  it('recalculates counts for changed collections without retaining previous values', () => {
    const repairs = orders(RepairStatus.RECEIVED, RepairStatus.COMPLETED)
    expect(counts(render(repairs))).toEqual(['0', '1', '1'])
    const updated = repairs.map(order => ({ ...order, status: RepairStatus.IN_PROGRESS }))
    expect(counts(render(updated))).toEqual(['2', '0', '0'])
    expect(counts(render(repairs))).toEqual(['0', '1', '1'])
    expect(counts(render([]))).toEqual(['0', '0', '0'])
  })
})

const now = new Date(2026, 8, 27, 18).getTime()
const received = (id: string, date: string): RepairOrder => ({ ...orders(RepairStatus.RECEIVED)[0]!, id, receivedAt: date })

describe('dashboard data rules', () => {
  it('classifies all real statuses and preserves the source collection', () => {
    const source = orders(RepairStatus.RECEIVED, RepairStatus.IN_PROGRESS, RepairStatus.COMPLETED)
    const before = structuredClone(source)
    expect(summarizeDashboard(source, now).counts).toEqual({ RECEIVED: 1, IN_PROGRESS: 1, COMPLETED: 1 })
    expect(summarizeDashboard([], now)).toEqual({ counts: { RECEIVED: 0, IN_PROGRESS: 0, COMPLETED: 0 }, attention: [], activity: [] })
    expect(source).toEqual(before)
  })

  it('prioritizes received orders oldest first with unknown/future dates last and stable ties', () => {
    const source = [received('invalid', 'invalid'), received('new', '2026-09-25T12:00:00Z'),
      received('old-b', '2026-09-20T12:00:00Z'), received('old-a', '2026-09-20T12:00:00Z'),
      received('future', '2030-01-01T00:00:00Z'), ...orders(RepairStatus.COMPLETED, RepairStatus.IN_PROGRESS)]
    expect(summarizeDashboard(source, now).attention.map(order => order.id))
      .toEqual(['old-a', 'old-b', 'new', 'future', 'invalid'])
    expect(source[0]!.id).toBe('invalid')
  })

  it('infers only timestamped reception and consistent completion events', () => {
    const source = [received('received', '2026-09-20T12:00:00Z'),
      { ...received('completed', '2026-09-21T12:00:00Z'), status: RepairStatus.COMPLETED, completedAt: '2026-09-22T12:00:00Z' },
      { ...received('in-progress', 'invalid'), status: RepairStatus.IN_PROGRESS, completedAt: '2026-09-23T12:00:00Z' },
      { ...received('inconsistent', '2026-09-24T12:00:00Z'), status: RepairStatus.COMPLETED, completedAt: '2026-09-23T12:00:00Z' },
      received('future', '2030-01-01T00:00:00Z')]
    expect(summarizeDashboard(source, now).activity.map(event => [event.order.id, event.kind])).toEqual([
      ['inconsistent', 'received'], ['completed', 'completed'], ['completed', 'received'], ['received', 'received'],
    ])
    expect(summarizeDashboard([{ ...source[1]!, receivedAt: 'invalid' }], now).activity.map(event => event.kind)).toEqual(['completed'])
  })

  it('limits activity to the six latest real events', () => {
    const source = Array.from({ length: 20 }, (_, index) => received(String(index), new Date(now - index * 1000).toISOString()))
    expect(summarizeDashboard(source, now).activity.map(event => event.order.id)).toEqual(['0', '1', '2', '3', '4', '5'])
  })

  it('groups local Monday boundaries, keeps zero weeks and excludes invalid/future/outside dates', () => {
    const weeks = weeklyReceptions([], now)
    expect(weeks).toHaveLength(8)
    expect(weeks.every(week => week.start.getDay() === 1 && week.start.getHours() === 0 && week.count === 0)).toBe(true)
    const boundary = weeks[7]!.start.getTime()
    const source = [received('monday', new Date(boundary).toISOString()),
      received('sunday', new Date(boundary - 1).toISOString()), received('now', new Date(now).toISOString()),
      received('future', new Date(now + 1).toISOString()), received('invalid', ''),
      received('outside', new Date(weeks[0]!.start.getTime() - 1).toISOString())]
    expect(weeklyReceptions(source, now).map(week => week.count)).toEqual([0, 0, 0, 0, 0, 0, 1, 2])
    expect(weeklyReceptions(source, NaN)).toEqual([])
  })

  it('handles year changes and calendar weeks across local daylight saving transitions', () => {
    for (const date of [new Date(2027, 0, 3), new Date(2026, 8, 15), new Date(2026, 3, 15)]) {
      const weeks = weeklyReceptions([], date.getTime())
      for (let index = 0; index < weeks.length; index++) {
        const week = weeks[index]!
        expect(week.start.getDay()).toBe(1)
        expect(week.end.getDay()).toBe(1)
        expect(week.start.getHours()).toBe(0)
        if (index > 0) expect(weeks[index - 1]!.end.getTime()).toBe(week.start.getTime())
      }
    }
  })
})

describe('operational blocks', () => {
  it('renders textual distributions, real events and encoded links without injecting API text', () => {
    const order = received('<img src=x>/#', '2026-09-20T12:00:00Z')
    order.customerName = '<script>alert(1)</script>'
    const root = document.createElement('div')
    root.innerHTML = generateWorkshopMonitorHtml([order], now)
    expect(root.querySelector('img, script')).toBeNull()
    expect(root.querySelector('.dashboard-attention')?.textContent).toContain(order.customerName)
    expect(root.querySelector('.dashboard-attention')?.textContent).toContain(order.heaterModel)
    expect([...root.querySelectorAll('a[href^="#repairs/"]')].every(a => a.getAttribute('href') === `#repairs/${encodeURIComponent(order.id)}`)).toBe(true)
    expect([...root.querySelectorAll('.dashboard-distribution strong')].map(node => node.textContent)).toEqual(['1', '0', '0'])
    expect(root.querySelectorAll('.dashboard-activity time')).toHaveLength(1)
    expect(root.querySelector('time')?.dateTime).toBe('2026-09-20T12:00:00.000Z')
    expect(root.querySelectorAll('.dashboard-weekly li')).toHaveLength(8)
    for (const section of root.querySelectorAll('section')) expect(root.querySelector(`#${section.getAttribute('aria-labelledby')}`)?.tagName).toBe('H2')
  })

  it('shows honest empty states without fabricated activity or invalid chart values', () => {
    const root = render([])
    expect(root.querySelector('.dashboard-attention')).toBeNull()
    expect(root.querySelector('.dashboard-activity')).toBeNull()
    expect(root.querySelectorAll('a[href^="#repairs/"], time')).toHaveLength(0)
    expect(root.querySelector('a[href="#repairs"]')?.textContent).toBe('Ver todas las reparaciones')
    expect(root.textContent).toContain('No hay reparaciones pendientes de iniciar.')
    expect(root.textContent).toContain('No hay actividad con fechas disponibles.')
    expect(root.innerHTML).not.toMatch(/NaN|Infinity|Invalid Date/)
    expect([...root.querySelectorAll('.dashboard-bar > span')].every(node => node.getAttribute('style') === 'width:0%')).toBe(true)
  })

  it('handles missing completion, invalid reception and many orders', () => {
    const source = Array.from({ length: 100 }, (_, index) => received(String(index), 'invalid'))
    const root = render([...source, ...orders(RepairStatus.COMPLETED)])
    expect(root.querySelectorAll('.dashboard-attention li')).toHaveLength(5)
    expect(root.querySelector('.dashboard-attention')?.textContent).toContain('No disponible')
    expect(root.querySelector('.dashboard-activity')?.textContent ?? '').not.toContain('Reparación completada')
    expect(root.querySelector('.dashboard-metric--completed small')?.textContent).toBe('Reparaciones completadas.')
    expect(root.innerHTML).not.toContain('Invalid Date')
  })
})


describe('dashboard closure refinements', () => {
  it('labels only COMPLETED orders as Completadas and preserves the other KPIs', () => {
    const root = render(orders(RepairStatus.RECEIVED, RepairStatus.IN_PROGRESS, RepairStatus.COMPLETED, RepairStatus.COMPLETED))
    expect([...root.querySelectorAll('dt')].map(node => node.firstChild?.textContent)).toEqual(['En proceso', 'Pendientes', 'Completadas'])
    expect(counts(root)).toEqual(['1', '1', '2'])
    expect(root.textContent).not.toMatch(/entrega/i)
  })

  it('shows the five oldest attention orders without changing the full priority list', () => {
    const source = [received('unknown', 'invalid'), received('future', '2030-01-01T00:00:00Z'),
      ...[7, 3, 1, 6, 2, 5, 4].map(day => received(`order-${day}`, `2026-09-0${day}T12:00:00Z`)),
      ...orders(RepairStatus.IN_PROGRESS, RepairStatus.COMPLETED)]
    const root = document.createElement('div')
    root.innerHTML = generateWorkshopMonitorHtml(source, now)
    expect([...root.querySelectorAll('.dashboard-attention a')].map(link => link.getAttribute('href')))
      .toEqual([1, 2, 3, 4, 5].map(day => `#repairs/order-${day}`))
    expect(summarizeDashboard(source, now).attention).toHaveLength(9)
    const link = root.querySelector<HTMLAnchorElement>('a[href="#repairs"]')!
    expect(link.textContent).toBe('Ver todas las reparaciones')
    expect(link.tabIndex).toBe(0)
    expect(link.closest('[hidden], [inert], [aria-hidden="true"]')).toBeNull()
  })
})

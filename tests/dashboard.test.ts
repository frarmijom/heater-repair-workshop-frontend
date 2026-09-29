// @vitest-environment jsdom
import { ServiceType } from '../src/models/index.ts'
import { describe, expect, it } from 'vitest'
import { generateWorkshopMonitorHtml } from '../src/components/workshop-monitor.ts'
import { dashboardKpis, summarizeDashboard, weeklyReceptions } from '../src/dashboard/dashboard-data.ts'
import { WorkOrderStatus } from '../src/models/index.ts'
import type { WorkOrder } from '../src/models/index.ts'

function orders(...statuses: WorkOrderStatus[]): WorkOrder[] {
  return statuses.map((status, index) => ({
    id: String(index), customerName: 'Test customer', customerContact: '+56911112222',
    heaterBrand: 'Bosch', heaterModel: 'Therm', serviceType: ServiceType.REPAIR, reportedIssue: 'Turns off',
    diagnosis: null, status, receivedAt: '2026-09-26T12:00:00Z', completedAt: null,
  }))
}

function render(repairs: WorkOrder[]): HTMLDivElement {
  const root = document.createElement('div')
  root.innerHTML = generateWorkshopMonitorHtml(repairs)
  return root
}

function counts(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll('.dashboard-summary__metrics dd'), element => element.textContent!)
}

describe('operational dashboard', () => {
  it('counts each lifecycle state and the total using the supplied collection', () => {
    const root = render(orders(WorkOrderStatus.RECEIVED, WorkOrderStatus.COMPLETED,
      WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.RECEIVED, WorkOrderStatus.COMPLETED, WorkOrderStatus.COMPLETED))
    expect(counts(root)).toEqual(['6', '3', '1', '0', '3', '0'])
    expect(root.querySelector('[data-kpi=total] dd')?.textContent).toBe('6')
    expect(Array.from(root.querySelectorAll('.dashboard-summary__metrics dt'), element => element.firstChild?.textContent))
      .toEqual(dashboardKpis.map(category => category.label))
    expect(root.textContent).not.toContain('Aún no hay órdenes de trabajo.')
    expect(root.querySelector('.monitor, .monitor__distribution, [role="img"]')).toBeNull()
  })

  it('renders all zero states and an explicit empty message', () => {
    const root = render([])
    expect(counts(root)).toEqual(['0', '0', '0', '0', '0', '0'])
    expect(root.querySelector('[data-kpi=total] dd')?.textContent).toBe('0')
    expect(root.textContent).toContain('Aún no hay órdenes de trabajo.')
    expect(root.querySelectorAll('.dashboard-summary__metrics dt')).toHaveLength(6)
  })

  it('recalculates counts for changed collections without retaining previous values', () => {
    const repairs = orders(WorkOrderStatus.RECEIVED, WorkOrderStatus.COMPLETED)
    expect(counts(render(repairs))).toEqual(['2', '1', '0', '0', '1', '0'])
    const updated = repairs.map(order => ({ ...order, status: WorkOrderStatus.IN_PROGRESS }))
    expect(counts(render(updated))).toEqual(['2', '2', '2', '0', '0', '0'])
    expect(counts(render(repairs))).toEqual(['2', '1', '0', '0', '1', '0'])
    expect(counts(render([]))).toEqual(['0', '0', '0', '0', '0', '0'])
  })
})

const now = new Date(2026, 8, 27, 18).getTime()
const received = (id: string, date: string): WorkOrder => ({ ...orders(WorkOrderStatus.RECEIVED)[0]!, id, receivedAt: date })

describe('dashboard data rules', () => {
  it('classifies all real statuses and preserves the source collection', () => {
    const source = orders(WorkOrderStatus.RECEIVED, WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.COMPLETED)
    const before = structuredClone(source)
    expect(summarizeDashboard(source, now).counts).toEqual({ RECEIVED: 1, DIAGNOSIS: 0, WAITING_CUSTOMER: 0, WAITING_PARTS: 0, IN_PROGRESS: 1, COMPLETED: 1, NOT_APPROVED: 0 })
    expect(summarizeDashboard([], now)).toMatchObject({ counts: { RECEIVED: 0, DIAGNOSIS: 0, WAITING_CUSTOMER: 0, WAITING_PARTS: 0, IN_PROGRESS: 0, COMPLETED: 0, NOT_APPROVED: 0 }, attention: [], activity: [] })
    expect(source).toEqual(before)
  })

  it('prioritizes received orders oldest first with unknown/future dates last and stable ties', () => {
    const source = [received('invalid', 'invalid'), received('new', '2026-09-25T12:00:00Z'),
      received('old-b', '2026-09-20T12:00:00Z'), received('old-a', '2026-09-20T12:00:00Z'),
      received('future', '2030-01-01T00:00:00Z'), ...orders(WorkOrderStatus.COMPLETED, WorkOrderStatus.IN_PROGRESS)]
    expect(summarizeDashboard(source, now).attention.map(order => order.id))
      .toEqual(['old-a', 'old-b', 'new', 'future', 'invalid'])
    expect(source[0]!.id).toBe('invalid')
  })

  it('infers only timestamped reception and consistent completion events', () => {
    const source = [received('received', '2026-09-20T12:00:00Z'),
      { ...received('completed', '2026-09-21T12:00:00Z'), status: WorkOrderStatus.COMPLETED, completedAt: '2026-09-22T12:00:00Z' },
      { ...received('in-progress', 'invalid'), status: WorkOrderStatus.IN_PROGRESS, completedAt: '2026-09-23T12:00:00Z' },
      { ...received('inconsistent', '2026-09-24T12:00:00Z'), status: WorkOrderStatus.COMPLETED, completedAt: '2026-09-23T12:00:00Z' },
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
    expect([...root.querySelectorAll('a[href^="#work-orders/"]')].every(a => a.getAttribute('href') === `#work-orders/${encodeURIComponent(order.id)}`)).toBe(true)
    expect([...root.querySelectorAll('.dashboard-distribution strong')].map(node => node.textContent)).toEqual(['1', '0', '0', '0', '0', '0', '0'])
    expect(root.querySelectorAll('.dashboard-activity time')).toHaveLength(1)
    expect(root.querySelector('time')?.dateTime).toBe('2026-09-20T12:00:00.000Z')
    expect(root.querySelectorAll('.dashboard-weekly li')).toHaveLength(8)
    for (const section of root.querySelectorAll('section')) expect(root.querySelector(`#${section.getAttribute('aria-labelledby')}`)?.tagName).toBe('H2')
  })

  it('shows honest empty states without fabricated activity or invalid chart values', () => {
    const root = render([])
    expect(root.querySelector('.dashboard-attention')).toBeNull()
    expect(root.querySelector('.dashboard-activity')).toBeNull()
    expect(root.querySelectorAll('a[href^="#work-orders/"], time')).toHaveLength(0)
    expect(root.querySelector('a[href="#work-orders"]')?.textContent).toBe('Ver todas las órdenes de trabajo →')
    expect(root.textContent).toContain('No hay órdenes de trabajo pendientes de iniciar.')
    expect(root.textContent).toContain('No hay actividad con fechas disponibles.')
    expect(root.innerHTML).not.toMatch(/NaN|Infinity|Invalid Date/)
    expect(root.querySelector('.dashboard-donut')).toBeNull()
    expect(root.querySelectorAll('.dashboard-weekly-track > span')).toHaveLength(8)
    expect([...root.querySelectorAll('.dashboard-weekly-track > span')].every(node => node.getAttribute('style') === 'height:0%')).toBe(true)
  })

  it('handles missing completion, invalid reception and many orders', () => {
    const source = Array.from({ length: 100 }, (_, index) => received(String(index), 'invalid'))
    const root = render([...source, ...orders(WorkOrderStatus.COMPLETED)])
    expect(root.querySelectorAll('.dashboard-attention tbody tr')).toHaveLength(5)
    expect(root.querySelector('.dashboard-attention')?.textContent).toContain('No disponible')
    expect(root.querySelector('.dashboard-activity')?.textContent ?? '').not.toContain('Orden de trabajo completada')
    expect(root.querySelector('[data-kpi=completed] dd')?.textContent).toBe('1')
    expect(root.innerHTML).not.toContain('Invalid Date')
  })
})


describe('dashboard closure refinements', () => {
  it('labels only COMPLETED orders as Completadas and preserves the other KPIs', () => {
    const root = render(orders(WorkOrderStatus.RECEIVED, WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.COMPLETED, WorkOrderStatus.COMPLETED))
    expect([...root.querySelectorAll('.dashboard-summary__metrics dt')].map(node => node.firstChild?.textContent)).toEqual(['Total de órdenes', 'Órdenes activas', 'En ejecución', 'En espera', 'Completadas', 'No aprobadas'])
    expect(counts(root)).toEqual(['4', '2', '1', '0', '2', '0'])
    expect(root.textContent).not.toMatch(/entrega/i)
  })

  it('shows the five oldest attention orders without changing the full priority list', () => {
    const source = [received('unknown', 'invalid'), received('future', '2030-01-01T00:00:00Z'),
      ...[7, 3, 1, 6, 2, 5, 4].map(day => received(`order-${day}`, `2026-09-0${day}T12:00:00Z`)),
      ...orders(WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.COMPLETED)]
    const root = document.createElement('div')
    root.innerHTML = generateWorkshopMonitorHtml(source, now)
    expect([...root.querySelectorAll('.dashboard-attention a')].map(link => link.getAttribute('href')))
      .toEqual([1, 2, 3, 4, 5].map(day => `#work-orders/order-${day}`))
    expect(summarizeDashboard(source, now).attention).toHaveLength(9)
    const link = root.querySelector<HTMLAnchorElement>('a[href="#work-orders"]')!
    expect(link.textContent).toBe('Ver todas las órdenes de trabajo →')
    expect(link.tabIndex).toBe(0)
    expect(link.closest('[hidden], [inert], [aria-hidden="true"]')).toBeNull()
  })
})

describe('dashboard visual semantics', () => {
  it('uses a named attention table with column headers and real row values', () => {
    const root = render([received('table-order', '2026-09-20T12:00:00Z')])
    const table = root.querySelector('table.dashboard-attention')!
    expect(table.getAttribute('aria-labelledby')).toBe('attention-title')
    expect([...table.querySelectorAll('thead th[scope="col"]')].map(cell => cell.textContent))
      .toEqual(['Orden', 'Cliente', 'Equipo', 'Estado', 'Tiempo desde recepción', 'Acción'])
    expect(table.querySelector('tbody th[scope="row"]')?.textContent).toBe('#table-order')
    expect(table.querySelector('.dashboard-state')?.textContent).toBe('Recibidas')
    expect(table.querySelector('a')?.getAttribute('href')).toBe('#work-orders/table-order')
  })

  it('draws the real distribution with a complete textual equivalent', () => {
    const root = render(orders(WorkOrderStatus.RECEIVED, WorkOrderStatus.RECEIVED, WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.COMPLETED))
    expect(root.querySelector('.dashboard-donut')?.getAttribute('aria-hidden')).toBe('true')
    expect(root.querySelector('.dashboard-donut b')?.textContent).toBe('4')
    expect([...root.querySelectorAll('.dashboard-donut circle')].map(circle => circle.getAttribute('stroke-dasharray')))
      .toEqual(['50 50', '0 100', '0 100', '0 100', '25 75', '25 75', '0 100'])
    expect([...root.querySelectorAll('.dashboard-donut circle')].map(circle => circle.getAttribute('stroke-dashoffset')))
      .toEqual(['0', '-50', '-50', '-50', '-50', '-75', '-100'])
    const legend = root.querySelector('.dashboard-distribution')!
    expect(legend.getAttribute('aria-labelledby')).toBe('status-title')
    expect([...legend.querySelectorAll('strong')].map(node => node.textContent)).toEqual(['2', '0', '0', '0', '1', '1', '0'])
    expect([...legend.querySelectorAll('.dashboard-percentage')].map(node => node.textContent)).toEqual([50, 0, 0, 0, 25, 25, 0].map(value => `${value.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`))
    for (const label of ['Recibidas', 'En ejecución', 'Completadas']) expect(legend.textContent).toContain(label)
    expect([...root.querySelectorAll('.dashboard-icon')].every(svg => svg.getAttribute('aria-hidden') === 'true')).toBe(true)
  })

  it('renders eight proportional vertical bars with real counts and accessible date ranges', () => {
    const weeks = weeklyReceptions([], now)
    const source = [received('one', weeks[6]!.start.toISOString()),
      received('two', weeks[7]!.start.toISOString()), received('three', weeks[7]!.start.toISOString())]
    const root = document.createElement('div')
    root.innerHTML = generateWorkshopMonitorHtml(source, now)
    const chart = root.querySelector('.dashboard-weekly')!
    expect(chart.getAttribute('aria-labelledby')).toBe('weekly-title')
    expect(chart.getAttribute('aria-describedby')).toBe('weekly-description')
    expect([...chart.querySelectorAll('li strong')].map(node => node.textContent))
      .toEqual([0, 0, 0, 0, 0, 0, 1, 2].map(count => `${count} recepciones`))
    expect([...chart.querySelectorAll('.dashboard-weekly-track > span')].map(node => node.getAttribute('style')))
      .toEqual([0, 0, 0, 0, 0, 0, 50, 100].map(height => `height:${height}%`))
    for (const item of chart.querySelectorAll('li')) {
      expect(item.querySelector('.dashboard-weekly-track')?.getAttribute('aria-hidden')).toBe('true')
      expect(item.querySelector(':scope > .dashboard-sr-only')?.textContent).toContain(' – ')
    }
  })
})


describe('operational KPI and state groups', () => {
  it.each([
    [WorkOrderStatus.RECEIVED, 1, 0, 0, 0, 0],
    [WorkOrderStatus.DIAGNOSIS, 1, 0, 0, 0, 0],
    [WorkOrderStatus.WAITING_CUSTOMER, 1, 0, 1, 0, 0],
    [WorkOrderStatus.WAITING_PARTS, 1, 0, 1, 0, 0],
    [WorkOrderStatus.IN_PROGRESS, 1, 1, 0, 0, 0],
    [WorkOrderStatus.COMPLETED, 0, 0, 0, 1, 0],
    [WorkOrderStatus.NOT_APPROVED, 0, 0, 0, 0, 1],
  ] as const)('classifies %s without confusing active, waiting or terminal orders', (status, active, inProgress, waiting, completed, notApproved) => {
    for (const serviceType of Object.values(ServiceType)) {
      const source = orders(status).map(order => ({ ...order, serviceType }))
      expect(summarizeDashboard(source).metrics).toEqual({ total: 1, active, inProgress, waiting, completed, notApproved })
    }
  })

  it('keeps KPIs, donut and group breakdown consistent for a mixed collection', () => {
    const source = orders(WorkOrderStatus.RECEIVED, WorkOrderStatus.DIAGNOSIS,
      WorkOrderStatus.WAITING_CUSTOMER, WorkOrderStatus.WAITING_PARTS, WorkOrderStatus.IN_PROGRESS,
      WorkOrderStatus.IN_PROGRESS, ...Array<WorkOrderStatus>(24).fill(WorkOrderStatus.COMPLETED),
      ...Array<WorkOrderStatus>(3).fill(WorkOrderStatus.NOT_APPROVED))
    const root = render(source)
    expect(counts(root)).toEqual(['33', '6', '2', '2', '24', '3'])
    expect(root.querySelector('.dashboard-donut b')?.textContent).toBe('33')
    expect(root.querySelector('[data-state-group=active] h3 strong')?.textContent).toBe('6')
    expect(root.querySelector('[data-state-group=closed] h3 strong')?.textContent).toBe('27')
    expect([...root.querySelectorAll('.dashboard-state-group dd')].map(node => node.textContent))
      .toEqual(['1', '1', '1', '1', '2', '24', '3'])
    expect([...root.querySelectorAll('.dashboard-state-group dt')].map(node => node.textContent))
      .toEqual(['Recibidas', 'En diagnóstico', 'Esperando al cliente', 'Esperando repuestos', 'En ejecución', 'Completadas', 'No aprobadas'])
    const summary = summarizeDashboard(source)
    expect(summary.groups.reduce((sum, group) => sum + group.total, 0)).toBe(source.length)
    expect(root.querySelector('.dashboard-overview')?.previousElementSibling?.classList.contains('dashboard-summary')).toBe(true)
  })

  it('keeps empty KPI and group totals consistent without undefined percentages', () => {
    expect(summarizeDashboard([]).metrics).toEqual({ total: 0, active: 0, inProgress: 0, waiting: 0, completed: 0, notApproved: 0 })
    const root = render([])
    expect([...root.querySelectorAll('.dashboard-state-group dd, .dashboard-state-group h3 strong')].every(node => node.textContent === '0')).toBe(true)
    expect(root.querySelectorAll('.dashboard-distribution li')).toHaveLength(7)
  })
})

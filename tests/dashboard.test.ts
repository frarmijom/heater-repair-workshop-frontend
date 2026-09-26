// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { generateWorkshopMonitorHtml } from '../src/components/workshop-monitor.ts'
import { repairStatusPresentation } from '../src/components/repair-status.ts'
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
    expect(counts(root)).toEqual(['2', '1', '3'])
    expect(root.querySelector('.dashboard-summary__total')?.textContent).toBe('Total repairs: 6')
    expect(Array.from(root.querySelectorAll('dt'), element => element.textContent))
      .toEqual(Object.values(RepairStatus).map(status => repairStatusPresentation[status].label))
    expect(root.textContent).not.toContain('No repair orders yet.')
    expect(root.querySelector('.monitor, .monitor__distribution, [role="img"]')).toBeNull()
  })

  it('renders all zero states and an explicit empty message', () => {
    const root = render([])
    expect(counts(root)).toEqual(['0', '0', '0'])
    expect(root.querySelector('.dashboard-summary__total')?.textContent).toBe('Total repairs: 0')
    expect(root.textContent).toContain('No repair orders yet.')
    expect(root.querySelectorAll('dt')).toHaveLength(3)
  })

  it('recalculates counts for changed collections without retaining previous values', () => {
    const repairs = orders(RepairStatus.RECEIVED, RepairStatus.COMPLETED)
    expect(counts(render(repairs))).toEqual(['1', '0', '1'])
    const updated = repairs.map(order => ({ ...order, status: RepairStatus.IN_PROGRESS }))
    expect(counts(render(updated))).toEqual(['0', '2', '0'])
    expect(counts(render(repairs))).toEqual(['1', '0', '1'])
    expect(counts(render([]))).toEqual(['0', '0', '0'])
  })
})

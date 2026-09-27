// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { generateRepairDetailHtml } from '../src/components/repair-detail.ts'
import { RepairStatus } from '../src/models/index.ts'
import type { RepairOrder } from '../src/models/index.ts'
import { formatRepairDate, formatRepairDateTime } from '../src/formatters/repair-time.ts'

const order: RepairOrder = { id: 'id-1', customerName: 'Customer', customerContact: '+56912345678',
  heaterBrand: 'Brand', heaterModel: 'Model', reportedIssue: 'No heat', diagnosis: null,
  status: RepairStatus.RECEIVED, receivedAt: '2026-09-26T12:00:00Z', completedAt: null }
function render(repair: RepairOrder | undefined) {
  const root = document.createElement('div')
  root.innerHTML = generateRepairDetailHtml(repair)
  return root
}
describe('repair detail and factual lifecycle', () => {
  it.each([
    [RepairStatus.RECEIVED, ['Actual', 'Pendiente', 'Pendiente'], ['true', 'false', 'false']],
    [RepairStatus.IN_PROGRESS, ['Alcanzada', 'Actual', 'Pendiente'], ['true', 'true', 'false']],
    [RepairStatus.COMPLETED, ['Alcanzada', 'Alcanzada', 'Actual'], ['true', 'true', 'true']],
  ] as const)('represents %s without inventing transition dates', (status, labels, reached) => {
    const root = render({ ...order, status, completedAt: '2026-09-27T12:00:00Z' })
    const stages = Array.from(root.querySelectorAll('.repair-lifecycle li'))
    expect(stages.map(stage => stage.querySelector('span')?.textContent)).toEqual(labels)
    expect(stages.map(stage => stage.getAttribute('data-reached'))).toEqual(reached)
    expect(root.querySelector('[aria-current="step"]')?.getAttribute('data-stage')).toBe(status)
    expect(root.querySelectorAll('[aria-current="step"]')).toHaveLength(1)
    expect(stages[0].querySelector('small')?.textContent).toBe(formatRepairDateTime(order.receivedAt, 'es-CL'))
    expect(stages[1].querySelector('small')).toBeNull()
    expect(stages[2].querySelector('small')?.textContent ?? null).toBe(status === RepairStatus.COMPLETED ? formatRepairDate('2026-09-27T12:00:00Z', 'es-CL') : null)
    expect(root.querySelector('button')?.textContent ?? null).toBe(status === RepairStatus.RECEIVED ? 'Iniciar reparación' : status === RepairStatus.IN_PROGRESS ? 'Completar reparación' : null)
    expect(root.querySelector('button[data-repair-action]')?.getAttribute('data-repair-action') ?? null)
      .toBe(status === RepairStatus.RECEIVED ? 'start' : status === RepairStatus.IN_PROGRESS ? 'complete' : null)
  })
  it('shows actual information and an explicitly labelled diagnosis input', () => {
    const root = render(order)
    for (const value of [order.id, order.customerName, order.customerContact, order.heaterBrand, order.heaterModel, order.reportedIssue]) expect(root.textContent).toContain(value)
    expect(root.querySelector('label')?.getAttribute('for')).toBe('repair-diagnosis')
    expect(root.querySelector('textarea')?.required).toBe(true)
    expect(root.querySelector('.repair-detail__information')?.textContent).not.toContain('Diagnosis')
    expect(render({ ...order, status: RepairStatus.IN_PROGRESS, diagnosis: 'Replace valve' }).textContent).toContain('Replace valve')
  })
  it.each([null, undefined, '', 'invalid'])('omits unavailable dates safely: %s', value => {
    const root = render({ ...order, status: RepairStatus.COMPLETED, receivedAt: value as unknown as string, completedAt: value as unknown as string })
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
    expect(root.textContent).toContain('Reparación no encontrada')
    expect(root.querySelector('a')?.getAttribute('href')).toBe('#repairs')
    expect(root.querySelector('button')).toBeNull()
  })
})

// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ServiceType, WorkOrderStatus, type WorkOrder } from '../src/models/index.ts'
import { generateWorkOrderFormHtml, setupWorkOrderForm } from '../src/components/work-order-form.ts'
import { serviceTypePresentation } from '../src/components/service-type-presentation.ts'
import { generateWorkOrderResultsHtml } from '../src/components/work-order-results.ts'
import { generateWorkOrderDetailHtml } from '../src/components/work-order-detail.ts'
import { generateWorkOrderCardHtml } from '../src/components/work-order-card.ts'
import { summarizeDashboard, weeklyReceptions } from '../src/dashboard/dashboard-data.ts'

const base = { customerName: 'Juan Pérez', customerContact: '+56912345678', heaterBrand: 'Junkers', heaterModel: 'WR11', serviceType: ServiceType.REPAIR, reportedIssue: 'No enciende' }
const order: WorkOrder = { ...base, id: 'order-1', status: WorkOrderStatus.RECEIVED, diagnosis: null, receivedAt: '2026-09-26T12:00:00Z', completedAt: null }
let create: ReturnType<typeof vi.fn>
const phone = () => document.querySelector<HTMLInputElement>('#customer-phone')!
const issue = () => document.querySelector<HTMLTextAreaElement>('#reported-issue')!
const radio = (type: ServiceType) => document.querySelector<HTMLInputElement>(`input[name="serviceType"][value="${type}"]`)!
const submit = () => document.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }))
function fill() {
  for (const [name, value] of Object.entries(base)) {
    if (name === 'serviceType') continue
    document.querySelector<HTMLInputElement>(`[name="${name}"]`)!.value = name === 'customerContact' ? '12345678' : value
  }
}
beforeEach(() => {
  document.body.innerHTML = generateWorkOrderFormHtml()
  create = vi.fn().mockResolvedValue(undefined)
  setupWorkOrderForm(document.body, create)
  fill()
})

describe('Chilean mobile intake', () => {
  it('shows a fixed, non-editable +569 prefix with an eight-digit accessible input', () => {
    const prefix = document.querySelector<HTMLElement>('#customer-phone-prefix')!
    expect(prefix.textContent).toBe('+569')
    expect(prefix.matches('input, textarea, [contenteditable]')).toBe(false)
    expect(phone().value).toBe('12345678')
    expect(phone().required).toBe(true)
    expect(phone().inputMode).toBe('numeric')
    expect(phone().autocomplete).toBe('tel-local')
    expect(phone().maxLength).toBe(8)
    expect(phone().pattern).toBe('[0-9]{8}')
    expect(document.querySelector('label[for="customer-phone"]')).not.toBeNull()
    for (const id of phone().getAttribute('aria-describedby')!.split(' ')) expect(document.getElementById(id)).not.toBeNull()
    submit()
    expect(create).toHaveBeenCalledExactlyOnceWith(base)
  })
  it.each(['', '1234', '1234567', '123456789', 'abcdefgh', '1234a678', '+56912345678', '56912345678', ' 12345678', '12345678 ', '１２３４５６７８'])('rejects editable phone value %j without trimming or prefix normalization', value => {
    phone().value = value
    submit()
    expect(create).not.toHaveBeenCalled()
    expect(phone().getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(phone())
    expect(document.querySelector('#customer-phone-error')?.textContent).not.toBe('')
  })
})

describe('service selection and conditional issue', () => {
  it('defaults to REPAIR and exposes exactly two native radio options in Spanish', () => {
    expect(Object.values(ServiceType)).toEqual(['REPAIR', 'MAINTENANCE'])
    expect(Object.keys(serviceTypePresentation)).toEqual(Object.values(ServiceType))
    expect(radio(ServiceType.REPAIR).checked).toBe(true)
    expect(radio(ServiceType.MAINTENANCE).checked).toBe(false)
    expect(document.querySelectorAll('input[name="serviceType"]')).toHaveLength(2)
    for (const type of Object.values(ServiceType)) {
      const input = radio(type)
      expect(input.type).toBe('radio')
      expect(input.required).toBe(true)
      expect(input.closest('fieldset')?.querySelector('legend')?.textContent).toContain('Tipo de servicio')
      expect(document.querySelector(`label[for="${input.id}"]`)?.textContent).toContain(serviceTypePresentation[type].label)
    }
    expect(issue().required).toBe(true)
  })
  it.each(['', '   '])('does not submit a repair with an empty issue %j', value => {
    issue().value = value
    submit()
    expect(create).not.toHaveBeenCalled()
    expect(issue().getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(issue())
    expect(document.querySelector('#reported-issue-error')?.textContent).toBe('Describe el problema reportado.')
  })
  it.each(['', 'Mantención preventiva solicitada por cliente', '   '])('sends MAINTENANCE with optional observations %j', value => {
    radio(ServiceType.MAINTENANCE).click()
    issue().value = value
    expect(issue().required).toBe(false)
    expect(document.querySelector('#reported-issue-label')?.textContent).toBe('Observaciones (opcional)')
    submit()
    expect(create).toHaveBeenCalledExactlyOnceWith({ ...base, serviceType: ServiceType.MAINTENANCE, reportedIssue: value.trim() })
  })
  it('updates existing validation in both directions without erasing the entered text', () => {
    issue().value = ''
    submit()
    expect(issue().getAttribute('aria-invalid')).toBe('true')
    radio(ServiceType.MAINTENANCE).click()
    expect(issue().required).toBe(false)
    expect(issue().getAttribute('aria-invalid')).toBe('false')
    expect(document.querySelector('#reported-issue-error')?.textContent).toBe('')
    radio(ServiceType.REPAIR).click()
    expect(issue().required).toBe(true)
    expect(issue().getAttribute('aria-invalid')).toBe('true')
    expect(document.querySelector('#reported-issue-label')?.textContent).toContain('Problema reportado')
    issue().value = 'No enciende'
    radio(ServiceType.MAINTENANCE).click()
    expect(issue().value).toBe('No enciende')
    radio(ServiceType.REPAIR).click()
    expect(issue().value).toBe('No enciende')
    expect(issue().getAttribute('aria-invalid')).toBe('false')
  })
  it('restores REPAIR and the required issue after a successful maintenance submission', async () => {
    radio(ServiceType.MAINTENANCE).click()
    issue().value = ''
    submit()
    await vi.waitFor(() => expect(radio(ServiceType.REPAIR).checked).toBe(true))
    expect(issue().required).toBe(true)
    expect(document.querySelector('#reported-issue-label')?.textContent).toContain('Problema reportado')
    expect(phone().value).toBe('')
    expect(document.querySelector('#customer-phone-prefix')?.textContent).toBe('+569')
  })
  it('does not submit an unsupported service type', () => {
    radio(ServiceType.REPAIR).value = 'OTHER'
    submit()
    expect(create).not.toHaveBeenCalled()
    expect(document.querySelector('#service-type-error')?.textContent).toBe('Selecciona un tipo de servicio.')
  })
  it('preserves maintenance selection, phone digits and observations on failure and blocks duplicates', async () => {
    let reject: (error: Error) => void = () => {}
    create.mockImplementation(() => new Promise<void>((_, rejectRequest) => { reject = rejectRequest }))
    radio(ServiceType.MAINTENANCE).click()
    issue().value = 'Revisión preventiva'
    submit(); submit()
    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0]![0]).toEqual({ ...base, serviceType: ServiceType.MAINTENANCE, reportedIssue: 'Revisión preventiva' })
    reject(new Error('No se pudo completar la solicitud.'))
    await vi.waitFor(() => expect(document.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false))
    expect(radio(ServiceType.MAINTENANCE).checked).toBe(true)
    expect(phone().value).toBe('12345678')
    expect(issue().value).toBe('Revisión preventiva')
    expect(issue().required).toBe(false)
  })
})

const render = (html: string) => { const root = document.createElement('div'); root.innerHTML = html; return root }
describe('shared service presentation and unchanged lifecycle', () => {
  it.each(Object.values(ServiceType))('presents %s consistently in results, detail and cards', serviceType => {
    const current = { ...order, serviceType }
    const presentation = serviceTypePresentation[serviceType]
    const table = render(generateWorkOrderResultsHtml([current]))
    expect(table.querySelector('.work-order-service-type')?.textContent).toBe(presentation.label)
    expect(table.querySelectorAll('thead th')).toHaveLength(6)
    const detail = render(generateWorkOrderDetailHtml(current))
    const fields = Object.fromEntries([...detail.querySelectorAll('.work-order-detail__information > div')].map(row => [row.querySelector('dt')!.textContent, row.querySelector('dd')!.textContent]))
    expect(fields['Tipo de servicio']).toBe(presentation.label)
    expect(fields[presentation.issueLabel]).toBe(order.reportedIssue)
    const card = render(generateWorkOrderCardHtml(current))
    expect(card.querySelector('.work-order-card__service')?.textContent).toBe(`Tipo de servicio: ${presentation.label}`)
    expect(card.querySelector('.work-order-card__issue strong')?.textContent).toBe(`${presentation.issueLabel}:`)
    for (const root of [table, detail, card]) expect(root.textContent).not.toMatch(/REPAIR|MAINTENANCE/)
  })
  it('shows a dash for maintenance without observations and safely escapes observations', () => {
    for (const generate of [generateWorkOrderDetailHtml, generateWorkOrderCardHtml]) {
      const root = render(generate({ ...order, serviceType: ServiceType.MAINTENANCE, reportedIssue: '' }))
      expect(root.textContent).toMatch(/Observaciones[:\s]*—/)
      expect(root.textContent).not.toContain('Problema reportado')
      const escaped = render(generate({ ...order, serviceType: ServiceType.MAINTENANCE, reportedIssue: '<img src=x onerror=alert(1)>' }))
      expect(escaped.querySelector('img')).toBeNull()
      expect(escaped.textContent).toContain('<img src=x onerror=alert(1)>')
    }
  })
  it('offers diagnosis only for repair and direct work only for maintenance at reception', () => {
    const repair = render(generateWorkOrderDetailHtml(order))
    const maintenance = render(generateWorkOrderDetailHtml({ ...order, serviceType: ServiceType.MAINTENANCE }))
    expect(repair.querySelector('[data-work-order-action="diagnosis/begin"]')).not.toBeNull()
    expect(repair.querySelector('[data-work-order-action="start"]')).toBeNull()
    expect(maintenance.querySelector('[data-work-order-action="start"]')).not.toBeNull()
    expect(maintenance.querySelector('textarea')).toBeNull()
  })
  it('keeps mixed service orders in the same Dashboard status counts and weekly totals', () => {
    const now = new Date('2026-09-27T18:00:00Z').getTime()
    const mixed = [order, { ...order, id: 'maintenance', serviceType: ServiceType.MAINTENANCE, reportedIssue: '' }]
    expect(summarizeDashboard(mixed, now).counts).toEqual({ RECEIVED: 2, DIAGNOSIS: 0, WAITING_CUSTOMER: 0, WAITING_PARTS: 0, IN_PROGRESS: 0, COMPLETED: 0, NOT_APPROVED: 0 })
    expect(summarizeDashboard(mixed, now).attention).toHaveLength(2)
    expect(weeklyReceptions(mixed, now).reduce((sum, week) => sum + week.count, 0)).toBe(2)
  })
})

describe('phone paste integrity', () => {
  function paste(text: string) {
    phone().setSelectionRange(0, phone().value.length)
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } })
    phone().dispatchEvent(event)
    return event
  }
  it.each(['+56912345678', '56912345678', '123456789', 'abcdefgh'])('rejects paste %j before native maxlength truncation and prevents submission', value => {
    expect(paste(value).defaultPrevented).toBe(true)
    expect(phone().value).toBe('12345678')
    expect(phone().getAttribute('aria-invalid')).toBe('true')
    submit()
    expect(create).not.toHaveBeenCalled()
    phone().value = '87654321'
    phone().dispatchEvent(new Event('input', { bubbles: true }))
    expect(phone().getAttribute('aria-invalid')).toBe('false')
    submit()
    expect(create).toHaveBeenCalledExactlyOnceWith({ ...base, customerContact: '+56987654321' })
  })
  it('lets native paste accept eight digits without changing or normalizing them', () => {
    expect(paste('87654321').defaultPrevented).toBe(false)
  })
})

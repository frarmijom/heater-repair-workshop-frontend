// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ServiceType, WorkOrderStatus, type WorkOrder } from '../src/models/index.ts'
import { availableWorkOrderActions, type WorkOrderAction } from '../src/components/work-order-actions.ts'
import { generateWorkOrderDetailHtml } from '../src/components/work-order-detail.ts'

const initial = (): WorkOrder => ({
  id: 'ORDER-550E8400-E29B-41D4-A716-446655440000', customerName: 'Customer', customerContact: '+56912345678',
  heaterBrand: 'Bosch', heaterModel: 'Therm', serviceType: ServiceType.REPAIR, reportedIssue: 'No heat',
  status: WorkOrderStatus.RECEIVED, diagnosis: null, receivedAt: '2026-09-26T12:00:00Z', completedAt: null,
  lifecycleVersion: 'V1', legacyStatus: null, customerDecision: null,
})
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
let order: WorkOrder
let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  order = initial()
  vi.resetModules()
  vi.spyOn(window, 'addEventListener')
  vi.spyOn(window, 'setInterval').mockReturnValue(1)
  document.body.innerHTML = '<div id="app"></div>'
  window.history.replaceState(null, '', '/#work-orders/' + order.id)
  fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    if (url === '/api/auth/session') return json({ email: 'technician@example.test' })
    if (url === '/api/auth/csrf') return json({ headerName: 'X-CSRF-TOKEN', token: 'csrf-test' })
    if (url === '/api/auth/logout') return new Response(null, { status: 204 })
    if (url === '/api/work-orders') return json([order])
    expect(init.method).toBe('PATCH')
    expect(new Headers(init.headers).get('X-CSRF-TOKEN')).toBe('csrf-test')
    expect(init.credentials).toBe('same-origin')
    const action = url.slice(('/api/work-orders/' + order.id + '/').length)
    const body = init.body ? JSON.parse(init.body as string) : undefined
    switch (action) {
      case 'diagnosis/begin': order = { ...order, status: WorkOrderStatus.DIAGNOSIS }; break
      case 'diagnosis': order = { ...order, diagnosis: body.diagnosis }; break
      case 'diagnosis/complete': order = { ...order, status: WorkOrderStatus.WAITING_CUSTOMER }; break
      case 'approve': order = { ...order, customerDecision: 'APPROVED', status: body.partsAvailable ? WorkOrderStatus.IN_PROGRESS : WorkOrderStatus.WAITING_PARTS }; break
      case 'reject': order = { ...order, customerDecision: 'REJECTED', status: WorkOrderStatus.NOT_APPROVED }; break
      case 'waiting-parts': order = { ...order, status: WorkOrderStatus.WAITING_PARTS }; break
      case 'start': expect(init.body).toBeUndefined(); order = { ...order, status: WorkOrderStatus.IN_PROGRESS }; break
      case 'complete': order = { ...order, status: WorkOrderStatus.COMPLETED, completedAt: '2026-09-28T12:00:00Z' }; break
      default: throw new Error('Unexpected action ' + action)
    }
    return json(order)
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  for (const [type, listener] of vi.mocked(window.addEventListener).mock.calls) {
    if (type === 'hashchange' || type === 'resize') window.removeEventListener(type, listener)
  }
  vi.restoreAllMocks(); vi.unstubAllGlobals()
})
async function startup() {
  await import('../src/main.ts')
  await vi.waitFor(() => expect(document.querySelector('[aria-current="step"]')).not.toBeNull())
}
const control = (action: string) => document.querySelector<HTMLButtonElement>(`[data-destination="work-order-detail"] [data-work-order-action="${action}"]`)
async function act(action: WorkOrderAction, target: WorkOrderStatus) {
  control(action)!.click()
  await vi.waitFor(() => expect(document.querySelector('[aria-current="step"]')?.getAttribute('data-stage')).toBe(target))
}
async function diagnose() {
  expect(control('start')).toBeNull()
  await act('diagnosis/begin', WorkOrderStatus.DIAGNOSIS)
  expect(control('diagnosis/complete')).toBeNull()
  const input = document.querySelector<HTMLTextAreaElement>('#work-order-diagnosis')!
  input.value = '   '
  control('diagnosis')!.click()
  expect(input.getAttribute('aria-invalid')).toBe('true')
  expect(document.activeElement).toBe(input)
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/diagnosis'))).toBe(false)
  input.value = '  Replace sensor  '
  control('diagnosis')!.click()
  await vi.waitFor(() => expect(control('diagnosis/complete')).not.toBeNull())
  expect(fetchMock.mock.calls.find(([url]) => url.endsWith('/diagnosis'))?.[1].body).toBe(JSON.stringify({ diagnosis: 'Replace sensor' }))
  await act('diagnosis/complete', WorkOrderStatus.WAITING_CUSTOMER)
  expect(control('start')).toBeNull()
}
async function complete() {
  document.querySelector<HTMLButtonElement>('#detail-complete')!.click()
  expect(document.activeElement?.id).toBe('cancel-complete')
  document.querySelector<HTMLButtonElement>('#cancel-complete')!.click()
  expect(document.activeElement?.id).toBe('detail-complete')
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/complete') && !url.includes('diagnosis'))).toBe(false)
  document.querySelector<HTMLButtonElement>('#detail-complete')!.click()
  await act('complete', WorkOrderStatus.COMPLETED)
  expect(document.querySelector('#detail-actions')).toBeNull()
}

describe('Work Orders v1 browser workflows', () => {
  it.each([true, false])('repairs require diagnosis and explicit approval; parts available=%s', async partsAvailable => {
    await startup(); await diagnose()
    control('approve')!.click()
    expect(document.querySelector('#detail-action-error')?.textContent).toContain('repuestos')
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/approve'))).toBe(false)
    document.querySelector<HTMLInputElement>(`input[name="partsAvailable"][value="${partsAvailable}"]`)!.click()
    await act('approve', partsAvailable ? WorkOrderStatus.IN_PROGRESS : WorkOrderStatus.WAITING_PARTS)
    expect(order.customerDecision).toBe('APPROVED')
    if (!partsAvailable) await act('start', WorkOrderStatus.IN_PROGRESS)
    await complete()
    location.hash = '#dashboard'
    await vi.waitFor(() => expect(document.querySelector('.dashboard-metric--completed dd')?.textContent).toBe('1'))
  })
  it('rejection closes the diagnosed repair without work or completion', async () => {
    await startup(); await diagnose(); await act('reject', WorkOrderStatus.NOT_APPROVED)
    expect(order.customerDecision).toBe('REJECTED'); expect(order.completedAt).toBeNull()
    expect(document.querySelector('#detail-actions')).toBeNull()
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/start'))).toBe(false)
    location.hash = '#dashboard'
    await vi.waitFor(() => expect(document.querySelector('.dashboard-metric--not-approved dd')?.textContent).toBe('1'))
    expect(document.querySelector('.dashboard-metric--completed dd')?.textContent).toBe('0')
  })
  it.each([true, false])('maintenance needs no diagnosis or approval; waiting parts=%s', async waiting => {
    order = { ...order, serviceType: ServiceType.MAINTENANCE, reportedIssue: '' }
    await startup()
    expect(document.querySelector('#diagnosis-form')).toBeNull()
    expect(control('diagnosis/begin')).toBeNull(); expect(control('approve')).toBeNull()
    if (waiting) await act('waiting-parts', WorkOrderStatus.WAITING_PARTS)
    await act('start', WorkOrderStatus.IN_PROGRESS); await complete()
    expect(order.diagnosis).toBeNull(); expect(order.customerDecision).toBeNull()
  })
  it.each([WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.COMPLETED])('shows historical provenance and no fabricated approval for %s', async status => {
    order = { ...order, status, lifecycleVersion: 'LEGACY', legacyStatus: status, diagnosis: 'Historical diagnosis',
      completedAt: status === WorkOrderStatus.COMPLETED ? '2026-09-27T12:00:00Z' : null }
    await startup()
    expect(document.querySelector('.legacy-lifecycle')?.textContent).toContain('no representa una aprobación implícita')
    expect(document.querySelector('#work-order-information-title')?.parentElement?.textContent).toContain('Sin decisión registrada')
    expect(control('approve')).toBeNull()
    if (status === WorkOrderStatus.IN_PROGRESS) await complete()
    expect(order.customerDecision).toBeNull()
    expect(document.querySelector('#detail-actions')).toBeNull()
  })
  it('legacy received repairs must enter diagnosis, not borrow the completion exemption', async () => {
    order = { ...order, lifecycleVersion: 'LEGACY', legacyStatus: WorkOrderStatus.RECEIVED }
    await startup(); expect(control('start')).toBeNull(); await diagnose()
  })
})

const pendingCases: [WorkOrderAction, ServiceType, WorkOrderStatus][] = [
  ['diagnosis/begin', ServiceType.REPAIR, WorkOrderStatus.RECEIVED],
  ['diagnosis', ServiceType.REPAIR, WorkOrderStatus.DIAGNOSIS],
  ['diagnosis/complete', ServiceType.REPAIR, WorkOrderStatus.DIAGNOSIS],
  ['approve', ServiceType.REPAIR, WorkOrderStatus.WAITING_CUSTOMER],
  ['reject', ServiceType.REPAIR, WorkOrderStatus.WAITING_CUSTOMER],
  ['waiting-parts', ServiceType.MAINTENANCE, WorkOrderStatus.RECEIVED],
  ['start', ServiceType.MAINTENANCE, WorkOrderStatus.RECEIVED],
  ['complete', ServiceType.MAINTENANCE, WorkOrderStatus.IN_PROGRESS],
]
describe('workflow async safeguards', () => {
  it.each(pendingCases)('%s blocks duplicate mutations and permits retry after failure', async (action, serviceType, status) => {
    order = { ...order, serviceType, status, diagnosis: serviceType === ServiceType.REPAIR && status !== WorkOrderStatus.RECEIVED ? 'Diagnosis' : null }
    const original = fetchMock.getMockImplementation()!
    let resolve: ((response: Response) => void) | undefined
    fetchMock.mockImplementation((url, init) => url === '/api/work-orders/' + order.id + '/' + action
      ? new Promise<Response>(done => { resolve = done }) : original(url, init))
    await startup()
    if (action === 'approve') document.querySelector<HTMLInputElement>('input[value="true"]')!.click()
    if (action === 'complete') document.querySelector<HTMLButtonElement>('#detail-complete')!.click()
    const button = control(action)!
    button.click(); button.click()
    await vi.waitFor(() => expect(resolve).toBeDefined())
    expect(button.disabled).toBe(true)
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/work-orders/' + order.id + '/' + action)).toHaveLength(1)
    resolve!(json({},500))
    await vi.waitFor(() => expect(button.disabled).toBe(false))
    expect(document.querySelector('#detail-action-error')?.textContent).toBe('No se pudo completar la solicitud.')
    if (action === 'diagnosis') expect(document.querySelector<HTMLTextAreaElement>('#work-order-diagnosis')?.value).toBe('Diagnosis')
    resolve = undefined; button.click()
    await vi.waitFor(() => expect(resolve).toBeDefined())
    resolve!(json(order))
    await vi.waitFor(() => expect(document.querySelector('#work-order-action-status')?.textContent).toContain('cambio guardado'))
    expect(document.querySelector('#work-order-action-status')?.getAttribute('role')).toBe('status')
  })
  it.each(['start', 'complete'] as const)('ignores late %s after logout', async action => {
    order = { ...order, serviceType: ServiceType.MAINTENANCE, status: action === 'start' ? WorkOrderStatus.RECEIVED : WorkOrderStatus.IN_PROGRESS }
    const original = fetchMock.getMockImplementation()!
    let resolve: ((response: Response) => void) | undefined
    fetchMock.mockImplementation((url, init) => url.endsWith('/'+action) ? new Promise<Response>(done => { resolve = done }) : original(url, init))
    await startup()
    if (action === 'complete') document.querySelector<HTMLButtonElement>('#detail-complete')!.click()
    control(action)!.click(); await vi.waitFor(() => expect(resolve).toBeDefined())
    document.querySelector<HTMLButtonElement>('#logout')!.click()
    await vi.waitFor(() => expect(document.querySelector('#login-form')).not.toBeNull())
    resolve!(json({ ...order, status: WorkOrderStatus.COMPLETED }))
    await new Promise(done => setTimeout(done,0))
    expect(document.querySelector('.app-shell')).toBeNull()
  })
  it('retains pending diagnosis across navigation and restores the draft on failure', async () => {
    order = { ...order, status: WorkOrderStatus.DIAGNOSIS }
    const original = fetchMock.getMockImplementation()!
    let resolve: ((response: Response) => void) | undefined
    fetchMock.mockImplementation((url, init) => url.endsWith('/diagnosis') ? new Promise<Response>(done => { resolve = done }) : original(url, init))
    await startup()
    document.querySelector<HTMLTextAreaElement>('#work-order-diagnosis')!.value = 'Draft diagnosis'
    control('diagnosis')!.click(); await vi.waitFor(() => expect(resolve).toBeDefined())
    location.hash = '#work-orders/search'
    await vi.waitFor(() => expect(document.querySelector('[data-destination="work-order-search"]')?.hasAttribute('hidden')).toBe(false))
    location.hash = '#work-orders/' + order.id
    await vi.waitFor(() => expect(control('diagnosis')?.disabled).toBe(true))
    resolve!(json({},500))
    await vi.waitFor(() => expect(control('diagnosis')?.disabled).toBe(false))
    expect(document.querySelector<HTMLTextAreaElement>('#work-order-diagnosis')?.value).toBe('Draft diagnosis')
    expect(document.querySelector('#detail-action-error')?.textContent).toBe('No se pudo completar la solicitud.')
  })
})

it.each(Object.values(WorkOrderStatus))('maintenance never exposes repair-specific operations at %s', status => {
  const current = { ...initial(), serviceType: ServiceType.MAINTENANCE, status }
  expect(availableWorkOrderActions(current)).not.toEqual(expect.arrayContaining(['diagnosis/begin']))
  const root = document.createElement('div'); root.innerHTML = generateWorkOrderDetailHtml(current)
  expect(root.querySelector('#diagnosis-form, [data-work-order-action="approve"], [data-work-order-action="reject"]')).toBeNull()
})

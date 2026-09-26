// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const order = {
  id: 'order-1', customerName: 'Test Customer', customerContact: '+56911112222',
  heaterBrand: 'Bosch', heaterModel: 'Therm', reportedIssue: 'Turns off',
  status: 'RECEIVED', receivedAt: '2026-09-26T12:00:00Z', diagnosis: null, completedAt: null,
}
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.resetModules()
  vi.spyOn(window, 'addEventListener')
  window.history.replaceState(null, '', '/')
  document.body.innerHTML = '<div id="app"></div>'
  vi.spyOn(window, 'setInterval').mockReturnValue(1)
  fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    if (url === '/api/auth/session') return json({ email: 'tech@example.test' })
    if (url === '/api/auth/csrf') return json({ headerName: 'X-CSRF-TOKEN', token: 'test-token' })
    if (url === '/api/auth/logout') return new Response(null, { status: 204 })
    if (url === '/api/repair-orders' && init.method === 'POST') return json({ ...order, ...JSON.parse(init.body as string), id: 'order-2' })
    if (url === '/api/repair-orders') return json([order])
    if (url.endsWith('/start')) return json({ ...order, status: 'IN_PROGRESS', diagnosis: 'Replace valve' })
    if (url.endsWith('/complete')) return json({ ...order, status: 'COMPLETED', diagnosis: 'Replace valve', completedAt: '2026-09-26T13:00:00Z' })
    throw new Error(`Unexpected URL: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  for (const [type, listener] of vi.mocked(window.addEventListener).mock.calls) {
    if (type === 'hashchange') window.removeEventListener(type, listener)
  }
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function startup(hash = '') {
  window.history.replaceState(null, '', '/' + hash)
  await import('../src/main.ts')
  await vi.waitFor(() => expect(document.querySelector('#workload-title')).not.toBeNull())
}
const panel = (name: string) => document.querySelector<HTMLElement>(`[data-destination="${name}"]`)!
const active = () => document.querySelector('.app-shell__nav [aria-current="page"]')?.textContent
async function navigate(name: string) {
  document.querySelector<HTMLAnchorElement>(`.app-shell__nav a[href="#${name}"]`)!.click()
  await vi.waitFor(() => expect(panel(name).hidden).toBe(false))
}

describe('authenticated application shell', () => {
  it('defaults to Dashboard with semantic navigation, overview and session control', async () => {
    await startup()
    expect(location.hash).toBe('#dashboard')
    expect(active()).toBe('Dashboard')
    expect(document.querySelectorAll('main')).toHaveLength(1)
    expect(document.querySelector('nav[aria-label="Application"]')?.textContent).toContain('Repairs')
    expect(panel('dashboard').hidden).toBe(false)
    expect(panel('dashboard').querySelector('#workload-title')).not.toBeNull()
    expect(panel('repairs').hidden).toBe(true)
    expect(document.querySelector('header #logout')?.textContent).toBe('Sign out')
    expect(document.querySelector('.hero-scene')).toBeNull()
    expect(panel('dashboard').querySelectorAll('h1')).toHaveLength(1)
    expect(panel('dashboard').querySelector('h2')?.textContent).toBe('Workshop overview')
    expect(panel('dashboard').querySelector('.monitor, .monitor-card, [role="img"]')).toBeNull()
  })

  it('navigates without losing form input or filter selection and focuses the destination heading', async () => {
    await startup()
    await navigate('repairs')
    expect(active()).toBe('Repairs')
    expect(document.activeElement?.id).toBe('repairs-title')
    expect(panel('dashboard').hidden).toBe(true)
    document.querySelector<HTMLElement>('.order-form-panel summary')!.click()
    document.querySelector<HTMLInputElement>('#customer-name')!.value = 'Draft customer'
    document.querySelector<HTMLButtonElement>('[data-repair-status="IN_PROGRESS"]')!.click()
    expect(document.querySelectorAll('.repair-card')).toHaveLength(0)
    await navigate('dashboard')
    await navigate('repairs')
    expect(document.querySelector<HTMLInputElement>('#customer-name')!.value).toBe('Draft customer')
    expect(document.querySelector('[data-repair-status="IN_PROGRESS"]')?.getAttribute('aria-pressed')).toBe('true')
  })

  it('opens Repairs directly on refresh', async () => {
    await startup('#repairs')
    expect(active()).toBe('Repairs')
    expect(panel('repairs').hidden).toBe(false)
    expect(panel('repairs').querySelector('#repair-order-form')).not.toBeNull()
    expect(panel('repairs').querySelector('.repair-card')).not.toBeNull()
  })

  it('recovers unknown fragments on startup and subsequent navigation', async () => {
    await startup('#unknown')
    expect(location.hash).toBe('#dashboard')
    await navigate('repairs')
    location.hash = '#not-a-route'
    await vi.waitFor(() => expect(location.hash).toBe('#dashboard'))
    expect(active()).toBe('Dashboard')
    expect(panel('dashboard').hidden).toBe(false)
  })

  it('supports browser Back and Forward', async () => {
    await startup()
    await navigate('repairs')
    history.back()
    await vi.waitFor(() => expect(active()).toBe('Dashboard'))
    history.forward()
    await vi.waitFor(() => expect(active()).toBe('Repairs'))
  })

  it('skips to main content with a native button without changing the route or history', async () => {
    await startup('#repairs')
    const skip = document.querySelector<HTMLButtonElement>('button.app-shell__skip')!
    expect(skip.type).toBe('button')
    expect(skip.tabIndex).toBe(0)
    expect(skip.hasAttribute('href')).toBe(false)
    expect(Array.from(document.querySelectorAll<HTMLAnchorElement>('.app-shell__nav a'), link => link.hash))
      .toEqual(['#dashboard', '#repairs'])
    const historyLength = history.length
    skip.focus()
    expect(document.activeElement).toBe(skip)
    skip.click()
    expect(history.length).toBe(historyLength)
    expect(document.activeElement?.id).toBe('main-content')
    expect(location.hash).toBe('#repairs')
    expect(active()).toBe('Repairs')
  })

  it('preserves creation, start and complete actions after navigation', async () => {
    await startup()
    await navigate('repairs')
    const creation = document.querySelector<HTMLDetailsElement>('.order-form-panel')!
    expect(creation.open).toBe(false)
    creation.querySelector<HTMLElement>('summary')!.click()
    expect(creation.open).toBe(true)
    for (const [id, value] of Object.entries({ 'customer-name': 'New Customer', 'customer-phone': '+56911112222',
      'heater-brand': 'Bosch', 'heater-model': 'Therm', 'reported-issue': 'Turns off' })) {
      document.querySelector<HTMLInputElement>('#' + id)!.value = value
    }
    document.querySelector('#repair-order-form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    await vi.waitFor(() => expect(document.querySelectorAll('.repair-card')).toHaveLength(2))
    expect(active()).toBe('Repairs')
    await navigate('dashboard')
    expect(document.querySelector('.dashboard-summary__total strong')?.textContent).toBe('2')
    expect(document.querySelector('.dashboard-metric--received dd')?.textContent).toBe('2')
    await navigate('repairs')
    const prompt = vi.spyOn(window, 'prompt')
    document.querySelector<HTMLButtonElement>('[data-repair-order-id="order-1"][data-repair-action="start"]')!.click()
    await vi.waitFor(() => expect(document.querySelector('#diagnosis-form')).not.toBeNull())
    document.querySelector<HTMLTextAreaElement>('#repair-diagnosis')!.value = 'Replace valve'
    document.querySelector('#diagnosis-form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    expect(prompt).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(document.querySelector('[data-repair-order-id="order-1"][data-repair-action="complete"]')).not.toBeNull())
    await navigate('dashboard')
    expect(document.querySelector('.dashboard-metric--received dd')?.textContent).toBe('1')
    expect(document.querySelector('.dashboard-metric--in-progress dd')?.textContent).toBe('1')
    await navigate('repairs')
    document.querySelector<HTMLButtonElement>('[data-repair-order-id="order-1"][data-repair-action="complete"]')!.click()
    await vi.waitFor(() => expect(document.querySelector('.repair-card--completed')).not.toBeNull())
    expect(active()).toBe('Repairs')
    await navigate('dashboard')
    expect(document.querySelector('.dashboard-metric--in-progress dd')?.textContent).toBe('0')
    expect(document.querySelector('.dashboard-metric--completed dd')?.textContent).toBe('1')
    expect(document.querySelector('.dashboard-summary__total strong')?.textContent).toBe('2')
    expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/start') && init.body === JSON.stringify({ diagnosis: 'Replace valve' }))).toBe(true)
    document.querySelector<HTMLButtonElement>('#logout')!.click()
    await vi.waitFor(() => expect(document.querySelector('#login-form')).not.toBeNull())
    expect(document.querySelector('.app-shell')).toBeNull()
  })

  it('keeps navigation and Sign out reachable during loading and recoverable order errors', async () => {
    const original = fetchMock.getMockImplementation()!
    let resolveOrders: (response: Response) => void = () => {}
    fetchMock.mockImplementation((url: string, init: RequestInit) => url === '/api/repair-orders'
      ? new Promise<Response>(resolve => { resolveOrders = resolve }) : original(url, init))
    await import('../src/main.ts')
    await vi.waitFor(() => expect(document.querySelector('.app-shell [aria-busy="true"]')).not.toBeNull())
    expect(document.querySelector('#logout')).not.toBeNull()
    resolveOrders(json({}, 500))
    await vi.waitFor(() => expect(document.querySelector('.app-shell #retry-load')).not.toBeNull())
    expect(document.querySelectorAll('main')).toHaveLength(1)
    expect(document.querySelector('#logout')).not.toBeNull()
    fetchMock.mockImplementation(original)
    document.querySelector<HTMLButtonElement>('#retry-load')!.click()
    await vi.waitFor(() => expect(document.querySelector('#workload-title')).not.toBeNull())
  })

  it.each([
    ['all', ['order-1', 'order-2', 'order-3']],
    ['RECEIVED', ['order-1']],
    ['IN_PROGRESS', ['order-2']],
    ['COMPLETED', ['order-3']],
  ])('filters the work queue by %s with accurate counts', async (filter, ids) => {
    const original = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation((url: string, init: RequestInit) => url === '/api/repair-orders'
      ? Promise.resolve(json([order, { ...order, id: 'order-2', status: 'IN_PROGRESS' },
        { ...order, id: 'order-3', status: 'COMPLETED' }])) : original(url, init))
    await startup('#repairs')
    const button = document.querySelector<HTMLButtonElement>(`[data-repair-status="${filter}"]`)!
    button.focus()
    button.click()
    expect(Array.from(document.querySelectorAll('.repair-card'), row => row.getAttribute('data-order-id'))).toEqual(ids)
    expect(document.querySelector('#visible-order-count')?.textContent).toBe(`${ids.length} orders`)
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(document.activeElement).toBe(button)
    expect(document.querySelectorAll('.filter-button[aria-pressed="true"]')).toHaveLength(1)
    expect(Array.from(document.querySelectorAll('.filter-button strong'), count => count.textContent)).toEqual(['3', '1', '1', '1'])
    expect(document.querySelector<HTMLElement>('#repair-order-empty')!.hidden).toBe(true)
  })

  it('explains an empty collection and preserves access to creation', async () => {
    const original = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation((url: string, init: RequestInit) => url === '/api/repair-orders'
      ? Promise.resolve(json([])) : original(url, init))
    await startup('#repairs')
    expect(document.querySelectorAll('.repair-card')).toHaveLength(0)
    const empty = document.querySelector<HTMLElement>('#repair-order-empty')!
    expect(empty.hidden).toBe(false)
    expect(empty.textContent).toContain('There are no repair orders.')
    document.querySelector<HTMLElement>('.order-form-panel summary')!.click()
    expect(document.querySelector<HTMLDetailsElement>('.order-form-panel')!.open).toBe(true)
    expect(document.querySelector('#repair-order-form')).not.toBeNull()
  })

  it('distinguishes a filter with no results and restores the All queue', async () => {
    await startup('#repairs')
    document.querySelector<HTMLButtonElement>('[data-repair-status="COMPLETED"]')!.click()
    const empty = document.querySelector<HTMLElement>('#repair-order-empty')!
    expect(empty.hidden).toBe(false)
    expect(empty.textContent).toBe('There are no repairs matching this filter.')
    expect(document.querySelectorAll('.repair-card')).toHaveLength(0)
    document.querySelector<HTMLButtonElement>('[data-repair-status="all"]')!.click()
    expect(empty.hidden).toBe(true)
    expect(document.querySelectorAll('.repair-card')).toHaveLength(1)
  })

  it('retains inline action errors and allows retrying the current action', async () => {
    await startup('#repairs')
    const prompt = vi.spyOn(window, 'prompt')
    const original = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation((url: string, init: RequestInit) => url.endsWith('/start')
      ? Promise.resolve(json({}, 500)) : original(url, init))
    document.querySelector<HTMLButtonElement>('[data-repair-action="start"]')!.click()
    await vi.waitFor(() => expect(document.querySelector('#diagnosis-form')).not.toBeNull())
    document.querySelector<HTMLTextAreaElement>('#repair-diagnosis')!.value = 'Replace valve'
    const button = document.querySelector<HTMLButtonElement>('#diagnosis-form button')!
    button.click()
    expect(prompt).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(document.querySelector('#detail-action-error')?.textContent).toBe('Unable to complete the request.'))
    expect(button.disabled).toBe(false)
    expect(document.querySelector('.repair-card--received')).not.toBeNull()
  })


  it('opens detail with a native link, preserves the filter and supports Back/Forward', async () => {
    await startup('#repairs')
    document.querySelector<HTMLButtonElement>('[data-repair-status="RECEIVED"]')!.click()
    const requestCount = fetchMock.mock.calls.length
    document.querySelector<HTMLAnchorElement>('.repair-detail-link')!.click()
    await vi.waitFor(() => expect(panel('repair-detail').hidden).toBe(false))
    expect(location.hash).toBe('#repairs/order-1')
    expect(active()).toBe('Repairs')
    expect(document.activeElement?.id).toBe('repair-detail-title')
    history.back()
    await vi.waitFor(() => expect(panel('repairs').hidden).toBe(false))
    history.forward()
    await vi.waitFor(() => expect(panel('repair-detail').hidden).toBe(false))
    document.querySelector<HTMLAnchorElement>('.repair-detail > a')!.click()
    await vi.waitFor(() => expect(panel('repairs').hidden).toBe(false))
    expect(document.querySelector('[data-repair-status="RECEIVED"]')?.getAttribute('aria-pressed')).toBe('true')
    expect(fetchMock.mock.calls).toHaveLength(requestCount)
  })

  it('loads a direct detail URL and fails safely for missing or malformed IDs', async () => {
    await startup('#repairs/order-1')
    expect(panel('repair-detail').hidden).toBe(false)
    expect(document.querySelector('#repair-detail-title')?.textContent).toContain('order-1')
    location.hash = '#repairs/missing'
    await vi.waitFor(() => expect(document.querySelector('#repair-detail-title')?.textContent).toBe('Repair not found'))
    expect(document.querySelector('#diagnosis-form')).toBeNull()
    location.hash = '#repairs/%E0%A4%A'
    await vi.waitFor(() => expect(location.hash).toBe('#dashboard'))
    expect(panel('dashboard').hidden).toBe(false)
  })

  it('validates diagnosis inline and synchronizes both detail transitions with queue and Dashboard', async () => {
    await startup('#repairs')
    document.querySelector<HTMLButtonElement>('[data-repair-status="RECEIVED"]')!.click()
    document.querySelector<HTMLAnchorElement>('.repair-detail-link')!.click()
    await vi.waitFor(() => expect(document.querySelector('#diagnosis-form')).not.toBeNull())
    const prompt = vi.spyOn(window, 'prompt')
    const alert = vi.spyOn(window, 'alert')
    const input = document.querySelector<HTMLTextAreaElement>('#repair-diagnosis')!
    input.value = '   '
    document.querySelector<HTMLButtonElement>('#diagnosis-form button')!.click()
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(document.querySelector('#detail-action-error')?.textContent).toContain('A diagnosis is required')
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/start'))).toBe(false)
    input.value = '  Replace valve  '
    const form = document.querySelector<HTMLFormElement>('#diagnosis-form')!
    form.dispatchEvent(new Event('submit', { cancelable: true }))
    form.dispatchEvent(new Event('submit', { cancelable: true }))
    expect(form.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true)
    await vi.waitFor(() => expect(document.querySelector('#detail-complete')).not.toBeNull())
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/start'))).toHaveLength(1)
    expect(fetchMock.mock.calls.find(([url]) => url.endsWith('/start'))?.[1].body).toBe(JSON.stringify({ diagnosis: 'Replace valve' }))
    expect(panel('repair-detail').textContent).toContain('Replace valve')
    expect(panel('repair-detail').querySelector('[aria-current="step"]')?.getAttribute('data-stage')).toBe('IN_PROGRESS')
    expect(document.querySelector('.dashboard-metric--in-progress dd')?.textContent).toBe('1')
    expect(document.querySelector('[data-repair-status="IN_PROGRESS"] strong')?.textContent).toBe('1')
    expect(document.querySelector('[data-repair-status="RECEIVED"]')?.getAttribute('aria-pressed')).toBe('true')
    const button = document.querySelector<HTMLButtonElement>('#detail-complete')!
    button.click()
    button.click()
    await vi.waitFor(() => expect(panel('repair-detail').querySelector('[aria-current="step"]')?.getAttribute('data-stage')).toBe('COMPLETED'))
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/complete'))).toHaveLength(1)
    const { formatRepairDate } = await import('../src/formatters/repair-time.ts')
    expect(panel('repair-detail').querySelector('[data-stage="COMPLETED"] small')?.textContent).toBe(formatRepairDate('2026-09-26T13:00:00Z'))
    expect(panel('repair-detail').querySelector('button')).toBeNull()
    expect(document.querySelector('.dashboard-metric--completed dd')?.textContent).toBe('1')
    expect(document.querySelector('[data-repair-status="COMPLETED"] strong')?.textContent).toBe('1')
    expect(prompt).not.toHaveBeenCalled()
    expect(alert).not.toHaveBeenCalled()
  })

  it('ignores a late detail mutation after logout', async () => {
    await startup('#repairs/order-1')
    const original = fetchMock.getMockImplementation()!
    let resolveStart: ((value: Response) => void) | undefined
    fetchMock.mockImplementation((url: string, init: RequestInit) => url.endsWith('/start')
      ? new Promise<Response>(resolve => { resolveStart = resolve }) : original(url, init))
    document.querySelector<HTMLTextAreaElement>('#repair-diagnosis')!.value = 'Replace valve'
    document.querySelector<HTMLButtonElement>('#diagnosis-form button')!.click()
    await vi.waitFor(() => expect(resolveStart).toBeDefined())
    document.querySelector<HTMLButtonElement>('#logout')!.click()
    await vi.waitFor(() => expect(document.querySelector('#login-form')).not.toBeNull())
    resolveStart!(json({ ...order, status: 'IN_PROGRESS', diagnosis: 'Replace valve' }))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(document.querySelector('.app-shell')).toBeNull()
    expect(document.querySelector('#login-form')).not.toBeNull()
  })

})

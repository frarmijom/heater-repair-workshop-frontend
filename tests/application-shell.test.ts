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
    expect(Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'), link => link.hash))
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
    vi.spyOn(window, 'prompt').mockReturnValue('Replace valve')
    document.querySelector<HTMLButtonElement>('[data-repair-order-id="order-1"][data-repair-action="start"]')!.click()
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
    vi.spyOn(window, 'prompt').mockReturnValue('Replace valve')
    const original = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation((url: string, init: RequestInit) => url.endsWith('/start')
      ? Promise.resolve(json({}, 500)) : original(url, init))
    const button = document.querySelector<HTMLButtonElement>('[data-repair-action="start"]')!
    button.click()
    await vi.waitFor(() => expect(document.querySelector('.repair-card__action-error')?.textContent).toBe('Unable to complete the request.'))
    expect(button.disabled).toBe(false)
    expect(document.querySelector('.repair-card--received')).not.toBeNull()
  })

})

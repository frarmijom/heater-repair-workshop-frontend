// @vitest-environment jsdom
import { ServiceType } from '../src/models/index.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const order = {
  id: 'order-1', customerName: 'Test Customer', customerContact: '+56911112222',
  heaterBrand: 'Bosch', heaterModel: 'Therm', serviceType: ServiceType.REPAIR, reportedIssue: 'Turns off',
  status: 'RECEIVED', receivedAt: '2026-09-26T12:00:00Z', diagnosis: null, completedAt: null,
}
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.stubGlobal('innerWidth', 1280)
  vi.resetModules()
  vi.spyOn(window, 'addEventListener')
  window.history.replaceState(null, '', '/')
  document.body.innerHTML = '<div id="app"></div>'
  vi.spyOn(window, 'setInterval').mockReturnValue(1)
  fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    if (url === '/api/auth/session') return json({ email: 'tech@example.test' })
    if (url === '/api/auth/csrf') return json({ headerName: 'X-CSRF-TOKEN', token: 'test-token' })
    if (url === '/api/auth/logout') return new Response(null, { status: 204 })
    if (url === '/api/work-orders' && init.method === 'POST') return json({ ...order, ...JSON.parse(init.body as string), id: 'order-2' })
    if (url === '/api/work-orders') return json([order])
    if (url.endsWith('/start')) return json({ ...order, status: 'IN_PROGRESS', diagnosis: 'Replace valve' })
    if (url.endsWith('/complete')) return json({ ...order, status: 'COMPLETED', diagnosis: 'Replace valve', completedAt: '2026-09-26T13:00:00Z' })
    throw new Error(`Unexpected URL: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  for (const [type, listener] of vi.mocked(window.addEventListener).mock.calls) {
    if (type === 'hashchange' || type === 'resize') window.removeEventListener(type, listener)
  }
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function startup(hash = '') {
  window.history.replaceState(null, '', '/' + hash)
  await import('../src/main.ts')
  await vi.waitFor(() => expect(document.querySelector('#work-order-new-title')).not.toBeNull())
  if (!['#work-orders', '#work-orders/new', '#work-orders/search'].includes(hash)) {
    await vi.waitFor(() => expect(document.querySelector('#workload-title')).not.toBeNull())
  }
}
const panel = (name: string) => document.querySelector<HTMLElement>(`[data-destination="${name}"]`)!
const active = () => document.querySelector('.app-shell__nav [aria-current="page"]')?.textContent
async function navigate(name: string) {
  document.querySelector<HTMLAnchorElement>(`.app-shell__nav a[href="#${name}"]`)!.click()
  await vi.waitFor(() => expect(panel(name).hidden).toBe(false))
}

async function route(hash: string, destination: string) {
  location.hash = hash
  await vi.waitFor(() => expect(panel(destination).hidden).toBe(false))
}
async function search(filter = 'all') {
  await route('#work-orders/search', 'work-order-search')
  document.querySelector<HTMLButtonElement>(`[data-work-order-status="${filter}"]`)!.click()
  document.querySelector('#work-order-search-form')!.dispatchEvent(new Event('submit', { cancelable: true }))
  await vi.waitFor(() => expect(document.querySelector('#work-order-results-title')).not.toBeNull())
}

describe('authenticated application shell', () => {
  it('defaults to Dashboard with semantic navigation, overview and session control', async () => {
    await startup()
    expect(location.hash).toBe('#dashboard')
    expect(active()).toBe('Dashboard')
    expect(document.querySelectorAll('main')).toHaveLength(1)
    expect(document.querySelector('nav[aria-label="Application"]')?.textContent).toContain('Órdenes de trabajo')
    expect(panel('dashboard').hidden).toBe(false)
    expect(panel('dashboard').querySelector('#workload-title')).not.toBeNull()
    expect(panel('work-orders').hidden).toBe(true)
    expect(document.querySelector('.app-sidebar #logout')?.textContent).toBe('Cerrar sesión')
    expect(document.querySelector('.hero-scene')).toBeNull()
    expect(panel('dashboard').querySelectorAll('h1')).toHaveLength(1)
    expect(panel('dashboard').querySelector('h2')?.textContent).toBe('Resumen del taller')
    expect(panel('dashboard').querySelector('.monitor, .monitor-card, [role="img"]')).toBeNull()
  })

  it('opens a repair from dashboard attention using the existing route and focus handling', async () => {
    await startup()
    const link = panel('dashboard').querySelector<HTMLAnchorElement>('.dashboard-attention a')!
    expect(link.getAttribute('href')).toBe('#work-orders/order-1')
    link.click()
    await vi.waitFor(() => expect(panel('work-order-detail').hidden).toBe(false))
    expect(location.hash).toBe('#work-orders/order-1')
    expect(document.activeElement?.id).toBe('work-order-detail-title')
    expect(active()).toBe('Órdenes de trabajo')
  })

  it('opens all repairs from the dashboard using a focusable native link and existing routing', async () => {
    await startup()
    const link = panel('dashboard').querySelector<HTMLAnchorElement>('a[href="#work-orders"]')!
    expect(link.textContent).toBe('Ver todas las órdenes de trabajo →')
    expect(link.tabIndex).toBe(0)
    link.focus()
    expect(document.activeElement).toBe(link)
    link.click()
    await vi.waitFor(() => expect(panel('work-orders').hidden).toBe(false))
    expect(location.hash).toBe('#work-orders')
    expect(document.activeElement?.id).toBe('work-orders-title')
    expect(active()).toBe('Órdenes de trabajo')
  })

  it('groups future modules without introducing routes or focusable disabled controls', async () => {
    await startup()
    const sidebar = document.querySelector('.app-sidebar')!
    expect(sidebar.querySelector('.app-shell__brand')?.textContent).toBe('Heater RepairWorkshop')
    expect([...sidebar.querySelectorAll('nav a')].map(a => a.getAttribute('href'))).toEqual(['#dashboard', '#work-orders'])
    for (const [id, labels] of Object.entries({
      'sidebar-operation': ['Órdenes de trabajo', 'Clientes'],
      'sidebar-inventory': ['Repuestos'],
      'sidebar-management': ['Reportes'],
    })) {
      const section = sidebar.querySelector(`section[aria-labelledby="${id}"]`)!
      expect(section.querySelector('h2')?.id).toBe(id)
      for (const label of labels) expect(section.textContent).toContain(label)
    }
    const future = [...sidebar.querySelectorAll<HTMLButtonElement>('nav button')]
    expect(future.map(button => button.querySelector('.sidebar-label')?.textContent)).toEqual(['Clientes', 'Repuestos', 'Reportes', 'Configuración'])
    const hash = location.hash
    for (const button of future) {
      expect(button.disabled).toBe(true)
      expect(button.hasAttribute('href')).toBe(false)
      button.focus()
      expect(document.activeElement).not.toBe(button)
      button.click()
      expect(location.hash).toBe(hash)
    }
    expect(sidebar.querySelector('#logout')?.getAttribute('type')).toBe('button')
    expect(sidebar.querySelector('#logout-error')?.getAttribute('role')).toBe('alert')
    expect(sidebar.querySelector('.app-sidebar__user')?.textContent).toContain('Franco Armijo')
    expect(sidebar.querySelector('.app-sidebar__user')?.textContent).toContain('Administrador')
    expect(sidebar.querySelector('.app-sidebar__blueprint')?.getAttribute('aria-hidden')).toBe('true')
    for (const svg of sidebar.querySelectorAll('svg')) {
      expect(svg.getAttribute('aria-hidden')).toBe('true')
      expect(svg.getAttribute('focusable')).toBe('false')
    }
  })

  it('renders future Topbar controls without requests or fictitious notifications', async () => {
    await startup()
    const topbar = document.querySelector('.app-topbar')!
    const search = topbar.querySelector<HTMLInputElement>('#global-search')!
    expect(search.disabled).toBe(true)
    expect(topbar.querySelector('label[for="global-search"]')?.textContent).toContain('Buscar órdenes de trabajo')
    expect(topbar.querySelector('#search-availability')?.textContent).toContain('Próximamente')
    expect(topbar.querySelector('kbd')?.textContent).toBe('Ctrl+K')
    const bell = topbar.querySelector<HTMLButtonElement>('button[aria-label="Notificaciones — próximamente"]')!
    expect(bell.disabled).toBe(true)
    expect(bell.textContent?.trim()).toBe('')
    expect(topbar.querySelector('.app-sidebar__avatar')?.textContent).toBe('FA')
    const requests = fetchMock.mock.calls.length
    bell.click()
    expect(fetchMock.mock.calls).toHaveLength(requests)
  })

  it('collapses desktop navigation while preserving routes, labels and logout', async () => {
    await startup()
    const toggle = document.querySelector<HTMLButtonElement>('#sidebar-toggle')!
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(toggle.getAttribute('aria-controls')).toBe('app-sidebar')
    toggle.click()
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(document.querySelector('.app-shell--compact')).not.toBeNull()
    expect(document.querySelector<HTMLAnchorElement>('a[href="#work-orders"]')?.title).toBe('Órdenes de trabajo')
    await navigate('work-orders')
    expect(active()).toBe('Órdenes de trabajo')
    expect(document.querySelector('.app-shell--compact')).not.toBeNull()
    expect(document.querySelector('#logout .sidebar-label')?.textContent).toBe('Cerrar sesión')
    toggle.click()
    expect(document.querySelector('.app-shell--compact')).toBeNull()
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
  })

  it('shows contextual page headings without duplicating detail headings', async () => {
    await startup()
    expect(panel('dashboard').querySelector('.app-shell__page-header')?.textContent).toContain('Resumen general del taller de órdenes de trabajo')
    expect(document.querySelectorAll('#workshop-clock')).toHaveLength(1)
    await navigate('work-orders')
    expect(panel('work-orders').querySelector('h1')?.textContent).toBe('Órdenes de trabajo')
    expect(panel('work-orders').querySelector('.app-shell__page-header')?.textContent).toContain('Gestión de las órdenes de trabajo del taller')
    await search()
    document.querySelector<HTMLAnchorElement>('.work-order-detail-link')!.click()
    await vi.waitFor(() => expect(panel('work-order-detail').hidden).toBe(false))
    expect(panel('work-order-detail').querySelectorAll('h1')).toHaveLength(1)
    expect(document.activeElement?.id).toBe('work-order-detail-title')
  })

  it('opens a mobile modal drawer, traps focus and closes by Escape, backdrop and close button', async () => {
    vi.stubGlobal('innerWidth', 390)
    await startup()
    const toggle = document.querySelector<HTMLButtonElement>('#sidebar-toggle')!
    const sidebar = document.querySelector<HTMLElement>('#app-sidebar')!
    const close = sidebar.querySelector<HTMLButtonElement>('.sidebar-close')!
    const workspace = document.querySelector<HTMLElement>('.app-shell__workspace')!
    expect(sidebar.hidden).toBe(true)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    for (const method of ['escape', 'backdrop', 'close']) {
      toggle.click()
      expect(sidebar.hidden).toBe(false)
      expect(sidebar.getAttribute('aria-modal')).toBe('true')
      expect(toggle.getAttribute('aria-expanded')).toBe('true')
      expect(workspace.inert).toBe(true)
      expect(document.activeElement).toBe(close)
      close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }))
      expect(document.activeElement?.id).toBe('logout')
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
      expect(document.activeElement).toBe(close)
      if (method === 'escape') close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      else document.querySelector<HTMLElement>(method === 'backdrop' ? '.sidebar-backdrop' : '.sidebar-close')!.click()
      expect(sidebar.hidden).toBe(true)
      expect(workspace.inert).toBe(false)
      expect(document.activeElement).toBe(toggle)
    }
  })

  it('closes mobile navigation on selection and restores a usable layout on resize', async () => {
    vi.stubGlobal('innerWidth', 390)
    await startup()
    const toggle = document.querySelector<HTMLButtonElement>('#sidebar-toggle')!
    toggle.click()
    await navigate('work-orders')
    expect(document.querySelector<HTMLElement>('#app-sidebar')!.hidden).toBe(true)
    expect(document.activeElement?.id).toBe('work-orders-title')
    toggle.click()
    vi.stubGlobal('innerWidth', 1280)
    window.dispatchEvent(new Event('resize'))
    expect(document.querySelector<HTMLElement>('#app-sidebar')!.hidden).toBe(false)
    expect(document.querySelector('#app-sidebar')?.hasAttribute('aria-modal')).toBe(false)
    expect(document.querySelector<HTMLElement>('.app-shell__workspace')!.inert).toBe(false)
    expect(document.activeElement).toBe(toggle)
  })

  it('navigates without losing form input or filter selection and focuses the destination heading', async () => {
    await startup()
    await navigate('work-orders')
    expect(active()).toBe('Órdenes de trabajo')
    expect(document.activeElement?.id).toBe('work-orders-title')
    expect(panel('dashboard').hidden).toBe(true)
    await route('#work-orders/new', 'work-order-new')
    document.querySelector<HTMLInputElement>('#customer-name')!.value = 'Draft customer'
    await route('#work-orders/search', 'work-order-search')
    document.querySelector<HTMLButtonElement>('[data-work-order-status="IN_PROGRESS"]')!.click()
    expect(document.querySelectorAll('.work-order-card')).toHaveLength(0)
    await navigate('dashboard')
    await navigate('work-orders')
    expect(document.querySelector<HTMLInputElement>('#customer-name')!.value).toBe('Draft customer')
    expect(document.querySelector('[data-work-order-status="IN_PROGRESS"]')?.getAttribute('aria-pressed')).toBe('true')
  })

  it('opens Repairs directly on refresh', async () => {
    await startup('#work-orders')
    expect(active()).toBe('Órdenes de trabajo')
    expect(panel('work-orders').hidden).toBe(false)
    expect(panel('work-orders').querySelector('#work-order-form')).toBeNull()
    expect(panel('work-orders').querySelector('.work-order-results')).toBeNull()
    expect(panel('work-orders').querySelector('a[href="#work-orders/new"]')).not.toBeNull()
    expect(panel('work-orders').querySelector('a[href="#work-orders/search"]')).not.toBeNull()
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/work-orders')).toBe(false)
  })

  it('recovers unknown fragments on startup and subsequent navigation', async () => {
    await startup('#unknown')
    expect(location.hash).toBe('#dashboard')
    await navigate('work-orders')
    location.hash = '#not-a-route'
    await vi.waitFor(() => expect(location.hash).toBe('#dashboard'))
    expect(active()).toBe('Dashboard')
    expect(panel('dashboard').hidden).toBe(false)
  })

  it('supports browser Back and Forward', async () => {
    await startup()
    await navigate('work-orders')
    history.back()
    await vi.waitFor(() => expect(active()).toBe('Dashboard'))
    history.forward()
    await vi.waitFor(() => expect(active()).toBe('Órdenes de trabajo'))
  })

  it('skips to main content with a native button without changing the route or history', async () => {
    await startup('#work-orders')
    const skip = document.querySelector<HTMLButtonElement>('button.app-shell__skip')!
    expect(skip.type).toBe('button')
    expect(skip.tabIndex).toBe(0)
    expect(skip.hasAttribute('href')).toBe(false)
    expect(Array.from(document.querySelectorAll<HTMLAnchorElement>('.app-shell__nav a'), link => link.hash))
      .toEqual(['#dashboard', '#work-orders'])
    const historyLength = history.length
    skip.focus()
    expect(document.activeElement).toBe(skip)
    skip.click()
    expect(history.length).toBe(historyLength)
    expect(document.activeElement?.id).toBe('main-content')
    expect(location.hash).toBe('#work-orders')
    expect(active()).toBe('Órdenes de trabajo')
  })

  it('keeps navigation and Sign out reachable during loading and recoverable order errors', async () => {
    const original = fetchMock.getMockImplementation()!
    let resolveOrders: (response: Response) => void = () => {}
    fetchMock.mockImplementation((url: string, init: RequestInit) => url === '/api/work-orders'
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
    fetchMock.mockImplementation((url: string, init: RequestInit) => url === '/api/work-orders'
      ? Promise.resolve(json([order, { ...order, id: 'order-2', status: 'IN_PROGRESS' },
        { ...order, id: 'order-3', status: 'COMPLETED' }])) : original(url, init))
    await startup('#work-orders')
    await search(filter)
    const button = document.querySelector<HTMLButtonElement>(`[data-work-order-status="${filter}"]`)!
    expect(Array.from(document.querySelectorAll('.work-order-results tbody tr'), row => row.getAttribute('data-order-id'))).toEqual(ids)
    expect(document.querySelector('#visible-order-count')?.textContent).toBe(`${ids.length} órdenes de trabajo`)
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(document.activeElement?.id).toBe('work-order-results-title')
    expect(document.querySelectorAll('.filter-button[aria-pressed="true"]')).toHaveLength(1)
    expect(Array.from(document.querySelectorAll('.filter-button strong'), count => count.textContent)).toEqual(['3', '1', '0', '0', '0', '1', '1', '0'])
    expect(document.querySelector('#work-order-empty')).toBeNull()
  })

  it('explains an empty collection and preserves access to creation', async () => {
    const original = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation((url: string, init: RequestInit) => url === '/api/work-orders'
      ? Promise.resolve(json([])) : original(url, init))
    await startup('#work-orders/search')
    expect(document.querySelector('#work-order-empty')).toBeNull()
    await search()
    expect(document.querySelectorAll('.work-order-results tbody tr')).toHaveLength(0)
    expect(document.querySelector('#work-order-empty')?.textContent).toBe('No se encontraron órdenes de trabajo')
    await navigate('work-orders')
    panel('work-orders').querySelector<HTMLAnchorElement>('a[href="#work-orders/new"]')!.click()
    await vi.waitFor(() => expect(panel('work-order-new').hidden).toBe(false))
    expect(panel('work-order-new').querySelector('#work-order-form')).not.toBeNull()
  })

  it('distinguishes a filter with no results and restores the All queue', async () => {
    await startup('#work-orders/search')
    await search('COMPLETED')
    expect(document.querySelector('#work-order-empty')?.textContent).toBe('No se encontraron órdenes de trabajo')
    expect(document.querySelectorAll('.work-order-results tbody tr')).toHaveLength(0)
    await search()
    expect(document.querySelector('#work-order-empty')).toBeNull()
    expect(document.querySelectorAll('.work-order-results tbody tr')).toHaveLength(1)
  })

  it('opens detail with a native link, preserves the filter and supports Back/Forward', async () => {
    await startup('#work-orders')
    await search('RECEIVED')
    const requestCount = fetchMock.mock.calls.length
    document.querySelector<HTMLAnchorElement>('.work-order-detail-link')!.click()
    await vi.waitFor(() => expect(panel('work-order-detail').hidden).toBe(false))
    expect(location.hash).toBe('#work-orders/order-1')
    expect(active()).toBe('Órdenes de trabajo')
    expect(document.activeElement?.id).toBe('work-order-detail-title')
    history.back()
    await vi.waitFor(() => expect(panel('work-order-search').hidden).toBe(false))
    history.forward()
    await vi.waitFor(() => expect(panel('work-order-detail').hidden).toBe(false))
    document.querySelector<HTMLAnchorElement>('.work-order-detail .work-orders-breadcrumb a')!.click()
    await vi.waitFor(() => expect(panel('work-orders').hidden).toBe(false))
    expect(document.querySelector('[data-work-order-status="RECEIVED"]')?.getAttribute('aria-pressed')).toBe('true')
    expect(fetchMock.mock.calls).toHaveLength(requestCount)
  })

  it('loads a direct detail URL and fails safely for missing or malformed IDs', async () => {
    await startup('#work-orders/order-1')
    expect(panel('work-order-detail').hidden).toBe(false)
    expect(document.querySelector('#work-order-detail-title')?.textContent).toContain('order-1')
    location.hash = '#work-orders/missing'
    await vi.waitFor(() => expect(document.querySelector('#work-order-detail-title')?.textContent).toBe('Orden de trabajo no encontrada'))
    expect(document.querySelector('#diagnosis-form')).toBeNull()
    location.hash = '#work-orders/%E0%A4%A'
    await vi.waitFor(() => expect(location.hash).toBe('#dashboard'))
    expect(panel('dashboard').hidden).toBe(false)
  })

  it('requires confirmation, cancels without mutation and restores focus', async () => {
    const original = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation((url: string, init: RequestInit) => url === '/api/work-orders'
      ? Promise.resolve(json([{ ...order, status: 'IN_PROGRESS' }])) : original(url, init))
    await startup('#work-orders')
    await route('#work-orders/order-1', 'work-order-detail')
    await vi.waitFor(() => expect(document.querySelector('#detail-complete')).not.toBeNull())
    await vi.waitFor(() => expect(panel('work-order-detail').hidden).toBe(false))
    const opener = document.querySelector<HTMLButtonElement>('#detail-complete')!
    const confirmation = document.querySelector<HTMLElement>('#complete-confirmation')!
    expect(confirmation.hidden).toBe(true)
    opener.click()
    expect(confirmation.hidden).toBe(false)
    expect(opener.getAttribute('aria-expanded')).toBe('true')
    expect(opener.getAttribute('aria-controls')).toBe(confirmation.id)
    expect(confirmation.textContent).toContain('La orden de trabajo quedará marcada como completada.')
    expect(document.activeElement?.id).toBe('cancel-complete')
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/complete'))).toBe(false)
    document.querySelector<HTMLButtonElement>('#cancel-complete')!.click()
    expect(confirmation.hidden).toBe(true)
    expect(opener.hidden).toBe(false)
    expect(opener.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(opener)
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/complete'))).toBe(false)
  })

  it('ignores a late completion after logout', async () => {
    const original = fetchMock.getMockImplementation()!
    let resolveComplete: ((response: Response) => void) | undefined
    fetchMock.mockImplementation((url: string, init: RequestInit) => {
      if (url === '/api/work-orders') return Promise.resolve(json([{ ...order, status: 'IN_PROGRESS' }]))
      if (url.endsWith('/complete')) return new Promise<Response>(resolve => { resolveComplete = resolve })
      return original(url, init)
    })
    await startup('#work-orders/order-1')
    document.querySelector<HTMLButtonElement>('#detail-complete')!.click()
    document.querySelector<HTMLButtonElement>('#confirm-complete')!.click()
    await vi.waitFor(() => expect(resolveComplete).toBeDefined())
    document.querySelector<HTMLButtonElement>('#logout')!.click()
    await vi.waitFor(() => expect(document.querySelector('#login-form')).not.toBeNull())
    resolveComplete!(json({ ...order, status: 'COMPLETED', completedAt: '2026-10-01T09:00:00Z' }))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(document.querySelector('.app-shell')).toBeNull()
    expect(document.querySelector('#work-order-action-status')).toBeNull()
  })


  it('keeps native form labels, landmarks and non-focusable lifecycle semantics', async () => {
    await startup('#work-orders/order-1')
    expect(document.querySelectorAll('main')).toHaveLength(1)
    expect(document.querySelectorAll('nav[aria-label="Application"]')).toHaveLength(1)
    expect(document.querySelector('.app-shell__nav [aria-current="page"]')?.textContent).toBe('Órdenes de trabajo')
    expect(panel('work-order-detail').querySelector('ol.work-order-lifecycle')).not.toBeNull()
    expect(panel('work-order-detail').querySelectorAll('.work-order-lifecycle [tabindex], .work-order-lifecycle button, .work-order-lifecycle a')).toHaveLength(0)
    expect(panel('work-order-detail').querySelectorAll('[aria-current="step"]')).toHaveLength(1)
    expect(document.querySelector('#detail-action-error')?.getAttribute('role')).toBe('alert')
    expect(document.querySelector('#work-order-action-status')?.getAttribute('role')).toBe('status')
    for (const field of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('.app-shell input, .app-shell textarea')) {
      expect(document.querySelector(`label[for="${field.id}"]`)).not.toBeNull()
      for (const id of field.getAttribute('aria-describedby')?.split(' ') ?? []) expect(document.getElementById(id)).not.toBeNull()
    }
  })

  it('focuses the first invalid creation field and advances to the next invalid field', async () => {
    await startup('#work-orders')
    await route('#work-orders/new', 'work-order-new')
    const submit = document.querySelector<HTMLButtonElement>('#work-order-form button')!
    submit.click()
    expect(document.activeElement?.id).toBe('customer-name')
    expect(document.activeElement?.getAttribute('aria-invalid')).toBe('true')
    document.querySelector<HTMLInputElement>('#customer-name')!.value = 'Customer'
    submit.click()
    expect(document.activeElement?.id).toBe('customer-phone')
    expect(fetchMock.mock.calls.some(([url, init]) => url === '/api/work-orders' && init.method === 'POST')).toBe(false)
  })

})

describe('I5 intention-driven repairs', () => {
  const collectionRequests = () => fetchMock.mock.calls.filter(([url, init]) => url === '/api/work-orders' && (!init.method || init.method === 'GET'))
  const submitQuery = () => document.querySelector('#work-order-search-form')!.dispatchEvent(new Event('submit', { cancelable: true }))

  it.each([
    ['#work-orders', 'work-orders', 'work-orders-title'],
    ['#work-orders/new', 'work-order-new', 'work-order-new-title'],
    ['#work-orders/search', 'work-order-search', 'work-order-search-title'],
  ])('opens %s without loading orders and keeps the module active', async (hash, destination, heading) => {
    await startup(hash)
    expect(collectionRequests()).toHaveLength(0)
    expect(active()).toBe('Órdenes de trabajo')
    expect(panel(destination).hidden).toBe(false)
    expect(panel(destination).querySelector('h1')?.id).toBe(heading)
    expect(document.querySelector('.work-order-results')).toBeNull()
    expect(document.querySelector('#work-order-results-title')).toBeNull()
    expect(panel('work-orders').querySelector('form, table, .work-order-filters')).toBeNull()
  })

  it('navigates through the two capabilities and cancels creation with heading focus', async () => {
    await startup('#work-orders')
    panel('work-orders').querySelector<HTMLAnchorElement>('a[href="#work-orders/new"]')!.click()
    await vi.waitFor(() => expect(document.activeElement?.id).toBe('work-order-new-title'))
    expect(panel('work-order-new').querySelector('form')).not.toBeNull()
    panel('work-order-new').querySelector<HTMLAnchorElement>('.work-orders-secondary-action')!.click()
    await vi.waitFor(() => expect(document.activeElement?.id).toBe('work-orders-title'))
    panel('work-orders').querySelector<HTMLAnchorElement>('a[href="#work-orders/search"]')!.click()
    await vi.waitFor(() => expect(document.activeElement?.id).toBe('work-order-search-title'))
    expect(document.querySelector<HTMLElement>('#work-order-search-initial')!.hidden).toBe(false)
    expect(collectionRequests()).toHaveLength(0)
  })

  it('waits for explicit search even with a cached Dashboard collection and reapplies filters only on submit', async () => {
    await startup()
    await route('#work-orders/search', 'work-order-search')
    expect(document.querySelector('.work-order-results')).toBeNull()
    document.querySelector<HTMLButtonElement>('[data-work-order-status="COMPLETED"]')!.click()
    expect(document.querySelector('#work-order-empty')).toBeNull()
    expect(collectionRequests()).toHaveLength(1)
    await search('COMPLETED')
    expect(document.querySelector('#work-order-empty')?.textContent).toBe('No se encontraron órdenes de trabajo')
    document.querySelector<HTMLButtonElement>('[data-work-order-status="all"]')!.click()
    expect(document.querySelector('.work-order-results')).toBeNull()
    submitQuery()
    await vi.waitFor(() => expect(document.querySelectorAll('.work-order-results tbody tr')).toHaveLength(1))
    expect(collectionRequests()).toHaveLength(1)
    expect(document.activeElement?.id).toBe('work-order-results-title')
    expect(panel('work-order-search').textContent).toContain('Recibidas')
    expect(panel('work-order-search').textContent).not.toMatch(/Repair work queue|View detail|Start repair/)
  })

  it('loads only once for duplicate pending queries and offers retry after failure', async () => {
    await startup('#work-orders/search')
    const original = fetchMock.getMockImplementation()!
    let resolveQuery: ((response: Response) => void) | undefined
    fetchMock.mockImplementation((url: string, init: RequestInit) => url === '/api/work-orders'
      ? new Promise<Response>(resolve => { resolveQuery = resolve }) : original(url, init))
    submitQuery(); submitQuery()
    await vi.waitFor(() => expect(resolveQuery).toBeDefined())
    expect(collectionRequests()).toHaveLength(1)
    expect(document.querySelector('#work-order-search-form')?.getAttribute('aria-busy')).toBe('true')
    resolveQuery!(json({}, 500))
    await vi.waitFor(() => expect(document.querySelector('#work-order-search-error')?.textContent).toBe('No se pudo completar la solicitud.'))
    expect(document.querySelector<HTMLButtonElement>('#work-order-search-form button[type="submit"]')!.disabled).toBe(false)
    expect(document.querySelector('#work-order-empty')).toBeNull()
    fetchMock.mockImplementation(original)
    await search()
    expect(collectionRequests()).toHaveLength(2)
    expect(document.querySelectorAll('.work-order-results tbody tr')).toHaveLength(1)
  })

  it('preserves a creation draft and its focus when a query finishes after navigation', async () => {
    await startup('#work-orders/search')
    const original = fetchMock.getMockImplementation()!
    let resolveQuery: ((response: Response) => void) | undefined
    fetchMock.mockImplementation((url: string, init: RequestInit) => url === '/api/work-orders'
      ? new Promise<Response>(resolve => { resolveQuery = resolve }) : original(url, init))
    submitQuery()
    await vi.waitFor(() => expect(resolveQuery).toBeDefined())
    await route('#work-orders/new', 'work-order-new')
    const input = document.querySelector<HTMLInputElement>('#customer-name')!
    input.value = 'Borrador conservado'
    input.focus()
    resolveQuery!(json([order]))
    await vi.waitFor(() => expect(document.querySelector('#work-order-results-title')).not.toBeNull())
    expect(input.isConnected).toBe(true)
    expect(input.value).toBe('Borrador conservado')
    expect(document.activeElement).toBe(input)
    expect(location.hash).toBe('#work-orders/new')
  })

  it('ignores a late collection response after logout', async () => {
    await startup('#work-orders/search')
    const original = fetchMock.getMockImplementation()!
    let resolveQuery: ((response: Response) => void) | undefined
    fetchMock.mockImplementation((url: string, init: RequestInit) => url === '/api/work-orders'
      ? new Promise<Response>(resolve => { resolveQuery = resolve }) : original(url, init))
    submitQuery()
    await vi.waitFor(() => expect(resolveQuery).toBeDefined())
    document.querySelector<HTMLButtonElement>('#logout')!.click()
    await vi.waitFor(() => expect(document.querySelector('#login-form')).not.toBeNull())
    resolveQuery!(json([order]))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(document.querySelector('.app-shell')).toBeNull()
    expect(document.querySelector('#login-form')).not.toBeNull()
  })

  it('keeps the creation payload and CSRF contract, blocks duplicate submissions and opens the created detail', async () => {
    await startup('#work-orders/new')
    const payload = { customerName: 'Cliente real', customerContact: '+56911112222', heaterBrand: 'Bosch', heaterModel: 'Therm', serviceType: ServiceType.REPAIR, reportedIssue: 'No enciende' }
    for (const [name, value] of Object.entries(payload)) {
      if (name === 'serviceType') continue
      document.querySelector<HTMLInputElement>(`[name="${name}"]`)!.value = name === 'customerContact' ? value.slice(4) : ` ${value} `
    }
    const form = document.querySelector('#work-order-form')!
    form.dispatchEvent(new Event('submit', { cancelable: true }))
    form.dispatchEvent(new Event('submit', { cancelable: true }))
    await vi.waitFor(() => expect(location.hash).toBe('#work-orders/order-2'))
    await vi.waitFor(() => expect(document.activeElement?.id).toBe('work-order-detail-title'))
    const requests = fetchMock.mock.calls.filter(([url, init]) => url === '/api/work-orders' && init.method === 'POST')
    expect(requests).toHaveLength(1)
    expect(JSON.parse(requests[0]![1].body as string)).toEqual(payload)
    expect(new Headers(requests[0]![1].headers).get('X-CSRF-TOKEN')).toBe('test-token')
    expect(collectionRequests()).toHaveLength(0)
    expect(panel('work-order-detail').textContent).toContain('Cliente real')
    expect(document.querySelector('#work-order-action-status')?.textContent).toBe('Orden de trabajo creada correctamente.')
    await navigate('dashboard')
    await vi.waitFor(() => expect(collectionRequests()).toHaveLength(1))
  })
})

describe('I5 asynchronous route safeguards', () => {
  it('preserves a newly created order when an older collection request finishes', async () => {
    await startup('#work-orders/search')
    const original = fetchMock.getMockImplementation()!
    let resolveOrders: ((response: Response) => void) | undefined
    fetchMock.mockImplementation((url: string, init: RequestInit) => url === '/api/work-orders' && !init.method
      ? new Promise<Response>(resolve => { resolveOrders = resolve }) : original(url, init))
    document.querySelector('#work-order-search-form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    await vi.waitFor(() => expect(resolveOrders).toBeDefined())
    await route('#work-orders/new', 'work-order-new')
    for (const [name, value] of Object.entries({ customerName: 'Nuevo cliente', customerContact: '+56911112222', heaterBrand: 'Bosch', heaterModel: 'Therm', serviceType: ServiceType.REPAIR, reportedIssue: 'No enciende' })) {
      if (name === 'serviceType') continue
      document.querySelector<HTMLInputElement>(`[name="${name}"]`)!.value = name === 'customerContact' ? value.slice(4) : value
    }
    document.querySelector('#work-order-form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    await vi.waitFor(() => expect(location.hash).toBe('#work-orders/order-2'))
    await vi.waitFor(() => expect(panel('work-order-detail').textContent).toContain('Nuevo cliente'))
    resolveOrders!(json([order]))
    await vi.waitFor(() => expect(document.querySelector('#visible-order-count')?.textContent).toBe('2 órdenes de trabajo'))
    expect(panel('work-order-detail').textContent).toContain('Nuevo cliente')
    expect(document.querySelector('.dashboard-summary__total strong')?.textContent).toBe('2')
  })

  it('clears protected UI if an explicit query returns an expired session', async () => {
    await startup('#work-orders/search')
    const original = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation((url: string, init: RequestInit) => url === '/api/work-orders'
      ? Promise.resolve(json({}, 401)) : original(url, init))
    document.querySelector('#work-order-search-form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    await vi.waitFor(() => expect(document.querySelector('#login-form')).not.toBeNull())
    expect(document.querySelector('.app-shell')).toBeNull()
    expect(document.querySelector('#login-error')?.textContent).toContain('Tu sesión ha expirado')
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/work-orders')).toHaveLength(1)
  })
})

describe('I6 target contract', () => {
  it.each(['', 'Mantención preventiva solicitada'])('sends maintenance observations %j unchanged through the existing service', async reportedIssue => {
    await startup('#work-orders/new')
    for (const [name, value] of Object.entries({ customerName: 'Juan Pérez', customerContact: '12345678', heaterBrand: 'Junkers', heaterModel: 'WR11', reportedIssue })) {
      document.querySelector<HTMLInputElement>(`[name="${name}"]`)!.value = value
    }
    document.querySelector<HTMLInputElement>('input[value="MAINTENANCE"]')!.click()
    document.querySelector('#work-order-form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    await vi.waitFor(() => expect(location.hash).toBe('#work-orders/order-2'))
    await vi.waitFor(() => expect(panel('work-order-detail').textContent).toContain('Mantención'))
    const requests = fetchMock.mock.calls.filter(([url, init]) => url === '/api/work-orders' && init.method === 'POST')
    expect(requests).toHaveLength(1)
    expect(JSON.parse(requests[0]![1].body as string)).toEqual({ customerName: 'Juan Pérez', customerContact: '+56912345678', heaterBrand: 'Junkers', heaterModel: 'WR11', serviceType: 'MAINTENANCE', reportedIssue })
    expect(new Headers(requests[0]![1].headers).get('X-CSRF-TOKEN')).toBe('test-token')
    expect(panel('work-order-detail').textContent).toContain('Observaciones')
    expect(panel('work-order-detail').textContent).toContain(reportedIssue || '—')
    expect(document.querySelector('#diagnosis-form')).toBeNull()
    expect(document.querySelector('[data-work-order-action="start"]')).not.toBeNull()
  })
})

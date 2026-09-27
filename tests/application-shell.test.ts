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
    if (type === 'hashchange' || type === 'resize') window.removeEventListener(type, listener)
  }
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function startup(hash = '') {
  window.history.replaceState(null, '', '/' + hash)
  await import('../src/main.ts')
  await vi.waitFor(() => expect(document.querySelector('#repair-new-title')).not.toBeNull())
  if (!['#repairs', '#repairs/new', '#repairs/search'].includes(hash)) {
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
  await route('#repairs/search', 'repair-search')
  document.querySelector<HTMLButtonElement>(`[data-repair-status="${filter}"]`)!.click()
  document.querySelector('#repair-search-form')!.dispatchEvent(new Event('submit', { cancelable: true }))
  await vi.waitFor(() => expect(document.querySelector('#repair-results-title')).not.toBeNull())
}

describe('authenticated application shell', () => {
  it('defaults to Dashboard with semantic navigation, overview and session control', async () => {
    await startup()
    expect(location.hash).toBe('#dashboard')
    expect(active()).toBe('Dashboard')
    expect(document.querySelectorAll('main')).toHaveLength(1)
    expect(document.querySelector('nav[aria-label="Application"]')?.textContent).toContain('Reparaciones')
    expect(panel('dashboard').hidden).toBe(false)
    expect(panel('dashboard').querySelector('#workload-title')).not.toBeNull()
    expect(panel('repairs').hidden).toBe(true)
    expect(document.querySelector('.app-sidebar #logout')?.textContent).toBe('Cerrar sesión')
    expect(document.querySelector('.hero-scene')).toBeNull()
    expect(panel('dashboard').querySelectorAll('h1')).toHaveLength(1)
    expect(panel('dashboard').querySelector('h2')?.textContent).toBe('Resumen del taller')
    expect(panel('dashboard').querySelector('.monitor, .monitor-card, [role="img"]')).toBeNull()
  })

  it('opens a repair from dashboard attention using the existing route and focus handling', async () => {
    await startup()
    const link = panel('dashboard').querySelector<HTMLAnchorElement>('.dashboard-attention a')!
    expect(link.getAttribute('href')).toBe('#repairs/order-1')
    link.click()
    await vi.waitFor(() => expect(panel('repair-detail').hidden).toBe(false))
    expect(location.hash).toBe('#repairs/order-1')
    expect(document.activeElement?.id).toBe('repair-detail-title')
    expect(active()).toBe('Reparaciones')
  })

  it('opens all repairs from the dashboard using a focusable native link and existing routing', async () => {
    await startup()
    const link = panel('dashboard').querySelector<HTMLAnchorElement>('a[href="#repairs"]')!
    expect(link.textContent).toBe('Ver todas las reparaciones →')
    expect(link.tabIndex).toBe(0)
    link.focus()
    expect(document.activeElement).toBe(link)
    link.click()
    await vi.waitFor(() => expect(panel('repairs').hidden).toBe(false))
    expect(location.hash).toBe('#repairs')
    expect(document.activeElement?.id).toBe('repairs-title')
    expect(active()).toBe('Reparaciones')
  })

  it('groups future modules without introducing routes or focusable disabled controls', async () => {
    await startup()
    const sidebar = document.querySelector('.app-sidebar')!
    expect(sidebar.querySelector('.app-shell__brand')?.textContent).toBe('Heater RepairWorkshop')
    expect([...sidebar.querySelectorAll('nav a')].map(a => a.getAttribute('href'))).toEqual(['#dashboard', '#repairs'])
    for (const [id, labels] of Object.entries({
      'sidebar-operation': ['Reparaciones', 'Clientes'],
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
    expect(topbar.querySelector('label[for="global-search"]')?.textContent).toContain('Buscar reparaciones')
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
    expect(document.querySelector<HTMLAnchorElement>('a[href="#repairs"]')?.title).toBe('Reparaciones')
    await navigate('repairs')
    expect(active()).toBe('Reparaciones')
    expect(document.querySelector('.app-shell--compact')).not.toBeNull()
    expect(document.querySelector('#logout .sidebar-label')?.textContent).toBe('Cerrar sesión')
    toggle.click()
    expect(document.querySelector('.app-shell--compact')).toBeNull()
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
  })

  it('shows contextual page headings without duplicating detail headings', async () => {
    await startup()
    expect(panel('dashboard').querySelector('.app-shell__page-header')?.textContent).toContain('Resumen general del taller de reparaciones')
    expect(document.querySelectorAll('#workshop-clock')).toHaveLength(1)
    await navigate('repairs')
    expect(panel('repairs').querySelector('h1')?.textContent).toBe('Reparaciones')
    expect(panel('repairs').querySelector('.app-shell__page-header')?.textContent).toContain('Gestión de las reparaciones del taller')
    await search()
    document.querySelector<HTMLAnchorElement>('.repair-detail-link')!.click()
    await vi.waitFor(() => expect(panel('repair-detail').hidden).toBe(false))
    expect(panel('repair-detail').querySelectorAll('h1')).toHaveLength(1)
    expect(document.activeElement?.id).toBe('repair-detail-title')
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
    await navigate('repairs')
    expect(document.querySelector<HTMLElement>('#app-sidebar')!.hidden).toBe(true)
    expect(document.activeElement?.id).toBe('repairs-title')
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
    await navigate('repairs')
    expect(active()).toBe('Reparaciones')
    expect(document.activeElement?.id).toBe('repairs-title')
    expect(panel('dashboard').hidden).toBe(true)
    await route('#repairs/new', 'repair-new')
    document.querySelector<HTMLInputElement>('#customer-name')!.value = 'Draft customer'
    await route('#repairs/search', 'repair-search')
    document.querySelector<HTMLButtonElement>('[data-repair-status="IN_PROGRESS"]')!.click()
    expect(document.querySelectorAll('.repair-card')).toHaveLength(0)
    await navigate('dashboard')
    await navigate('repairs')
    expect(document.querySelector<HTMLInputElement>('#customer-name')!.value).toBe('Draft customer')
    expect(document.querySelector('[data-repair-status="IN_PROGRESS"]')?.getAttribute('aria-pressed')).toBe('true')
  })

  it('opens Repairs directly on refresh', async () => {
    await startup('#repairs')
    expect(active()).toBe('Reparaciones')
    expect(panel('repairs').hidden).toBe(false)
    expect(panel('repairs').querySelector('#repair-order-form')).toBeNull()
    expect(panel('repairs').querySelector('.repair-results')).toBeNull()
    expect(panel('repairs').querySelector('a[href="#repairs/new"]')).not.toBeNull()
    expect(panel('repairs').querySelector('a[href="#repairs/search"]')).not.toBeNull()
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/repair-orders')).toBe(false)
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
    await vi.waitFor(() => expect(active()).toBe('Reparaciones'))
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
    expect(active()).toBe('Reparaciones')
  })

  it('preserves creation, start and complete actions after navigation', async () => {
    await startup()
    await navigate('repairs')
    await route('#repairs/new', 'repair-new')
    for (const [id, value] of Object.entries({ 'customer-name': 'New Customer', 'customer-phone': '+56911112222',
      'heater-brand': 'Bosch', 'heater-model': 'Therm', 'reported-issue': 'Turns off' })) {
      document.querySelector<HTMLInputElement>('#' + id)!.value = value
    }
    document.querySelector('#repair-order-form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    await vi.waitFor(() => expect(location.hash).toBe('#repairs/order-2'))
    expect(active()).toBe('Reparaciones')
    await navigate('dashboard')
    expect(document.querySelector('.dashboard-summary__total strong')?.textContent).toBe('2')
    expect(document.querySelector('.dashboard-metric--received dd')?.textContent).toBe('2')
    await navigate('repairs')
    const prompt = vi.spyOn(window, 'prompt')
    await route('#repairs/order-1', 'repair-detail')
    await vi.waitFor(() => expect(document.querySelector('#diagnosis-form')).not.toBeNull())
    document.querySelector<HTMLTextAreaElement>('#repair-diagnosis')!.value = 'Replace valve'
    document.querySelector('#diagnosis-form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    expect(prompt).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(document.querySelector('#detail-complete')).not.toBeNull())
    await navigate('dashboard')
    expect(document.querySelector('.dashboard-metric--received dd')?.textContent).toBe('1')
    expect(document.querySelector('.dashboard-metric--in-progress dd')?.textContent).toBe('1')
    await navigate('repairs')
    await route('#repairs/order-1', 'repair-detail')
    await vi.waitFor(() => expect(panel('repair-detail').hidden).toBe(false))
    document.querySelector<HTMLButtonElement>('#detail-complete')!.click()
    document.querySelector<HTMLButtonElement>('#confirm-complete')!.click()
    await vi.waitFor(() => expect(panel('repair-detail').querySelector('[data-stage="COMPLETED"][aria-current="step"]')).not.toBeNull())
    expect(active()).toBe('Reparaciones')
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
    await search(filter)
    const button = document.querySelector<HTMLButtonElement>(`[data-repair-status="${filter}"]`)!
    expect(Array.from(document.querySelectorAll('.repair-results tbody tr'), row => row.getAttribute('data-order-id'))).toEqual(ids)
    expect(document.querySelector('#visible-order-count')?.textContent).toBe(`${ids.length} reparaciones`)
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(document.activeElement?.id).toBe('repair-results-title')
    expect(document.querySelectorAll('.filter-button[aria-pressed="true"]')).toHaveLength(1)
    expect(Array.from(document.querySelectorAll('.filter-button strong'), count => count.textContent)).toEqual(['3', '1', '1', '1'])
    expect(document.querySelector('#repair-order-empty')).toBeNull()
  })

  it('explains an empty collection and preserves access to creation', async () => {
    const original = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation((url: string, init: RequestInit) => url === '/api/repair-orders'
      ? Promise.resolve(json([])) : original(url, init))
    await startup('#repairs/search')
    expect(document.querySelector('#repair-order-empty')).toBeNull()
    await search()
    expect(document.querySelectorAll('.repair-results tbody tr')).toHaveLength(0)
    expect(document.querySelector('#repair-order-empty')?.textContent).toBe('No se encontraron reparaciones')
    await navigate('repairs')
    panel('repairs').querySelector<HTMLAnchorElement>('a[href="#repairs/new"]')!.click()
    await vi.waitFor(() => expect(panel('repair-new').hidden).toBe(false))
    expect(panel('repair-new').querySelector('#repair-order-form')).not.toBeNull()
  })

  it('distinguishes a filter with no results and restores the All queue', async () => {
    await startup('#repairs/search')
    await search('COMPLETED')
    expect(document.querySelector('#repair-order-empty')?.textContent).toBe('No se encontraron reparaciones')
    expect(document.querySelectorAll('.repair-results tbody tr')).toHaveLength(0)
    await search()
    expect(document.querySelector('#repair-order-empty')).toBeNull()
    expect(document.querySelectorAll('.repair-results tbody tr')).toHaveLength(1)
  })

  it('retains inline action errors and allows retrying the current action', async () => {
    await startup('#repairs')
    const prompt = vi.spyOn(window, 'prompt')
    const original = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation((url: string, init: RequestInit) => url.endsWith('/start')
      ? Promise.resolve(json({}, 500)) : original(url, init))
    await route('#repairs/order-1', 'repair-detail')
    await vi.waitFor(() => expect(document.querySelector('#diagnosis-form')).not.toBeNull())
    await vi.waitFor(() => expect(document.querySelector('#diagnosis-form')).not.toBeNull())
    document.querySelector<HTMLTextAreaElement>('#repair-diagnosis')!.value = 'Replace valve'
    const button = document.querySelector<HTMLButtonElement>('#diagnosis-form button')!
    button.click()
    expect(prompt).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(document.querySelector('#detail-action-error')?.textContent).toBe('No se pudo completar la solicitud.'))
    expect(button.disabled).toBe(false)
    expect(panel('repair-detail').querySelector('[data-stage="RECEIVED"][aria-current="step"]')).not.toBeNull()
  })


  it('opens detail with a native link, preserves the filter and supports Back/Forward', async () => {
    await startup('#repairs')
    await search('RECEIVED')
    const requestCount = fetchMock.mock.calls.length
    document.querySelector<HTMLAnchorElement>('.repair-detail-link')!.click()
    await vi.waitFor(() => expect(panel('repair-detail').hidden).toBe(false))
    expect(location.hash).toBe('#repairs/order-1')
    expect(active()).toBe('Reparaciones')
    expect(document.activeElement?.id).toBe('repair-detail-title')
    history.back()
    await vi.waitFor(() => expect(panel('repair-search').hidden).toBe(false))
    history.forward()
    await vi.waitFor(() => expect(panel('repair-detail').hidden).toBe(false))
    document.querySelector<HTMLAnchorElement>('.repair-detail .repairs-breadcrumb a')!.click()
    await vi.waitFor(() => expect(panel('repairs').hidden).toBe(false))
    expect(document.querySelector('[data-repair-status="RECEIVED"]')?.getAttribute('aria-pressed')).toBe('true')
    expect(fetchMock.mock.calls).toHaveLength(requestCount)
  })

  it('loads a direct detail URL and fails safely for missing or malformed IDs', async () => {
    await startup('#repairs/order-1')
    expect(panel('repair-detail').hidden).toBe(false)
    expect(document.querySelector('#repair-detail-title')?.textContent).toContain('order-1')
    location.hash = '#repairs/missing'
    await vi.waitFor(() => expect(document.querySelector('#repair-detail-title')?.textContent).toBe('Reparación no encontrada'))
    expect(document.querySelector('#diagnosis-form')).toBeNull()
    location.hash = '#repairs/%E0%A4%A'
    await vi.waitFor(() => expect(location.hash).toBe('#dashboard'))
    expect(panel('dashboard').hidden).toBe(false)
  })

  it('validates diagnosis inline and synchronizes both detail transitions with queue and Dashboard', async () => {
    await startup('#repairs')
    await search('RECEIVED')
    document.querySelector<HTMLAnchorElement>('.repair-detail-link')!.click()
    await vi.waitFor(() => expect(document.querySelector('#diagnosis-form')).not.toBeNull())
    const prompt = vi.spyOn(window, 'prompt')
    const alert = vi.spyOn(window, 'alert')
    const input = document.querySelector<HTMLTextAreaElement>('#repair-diagnosis')!
    input.value = '   '
    document.querySelector<HTMLButtonElement>('#diagnosis-form button')!.click()
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(document.querySelector('#detail-action-error')?.textContent).toContain('Ingresa un diagnóstico')
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
    expect(document.querySelector('#visible-order-count')?.textContent).toBe('0 reparaciones')
    expect(document.querySelector('[data-repair-status="IN_PROGRESS"] strong')?.textContent).toBe('1')
    expect(document.querySelector('[data-repair-status="RECEIVED"]')?.getAttribute('aria-pressed')).toBe('true')
    document.querySelector<HTMLButtonElement>('#detail-complete')!.click()
    const button = document.querySelector<HTMLButtonElement>('#confirm-complete')!
    button.click()
    button.click()
    await vi.waitFor(() => expect(panel('repair-detail').querySelector('[aria-current="step"]')?.getAttribute('data-stage')).toBe('COMPLETED'))
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/complete'))).toHaveLength(1)
    const { formatRepairDate } = await import('../src/formatters/repair-time.ts')
    expect(panel('repair-detail').querySelector('[data-stage="COMPLETED"] small')?.textContent).toBe(formatRepairDate('2026-09-26T13:00:00Z', 'es-CL'))
    expect(panel('repair-detail').querySelector('button')).toBeNull()
    expect(document.querySelector('.dashboard-metric--completed dd')?.textContent).toBe('1')
    expect(document.querySelector('#visible-order-count')?.textContent).toBe('0 reparaciones')
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


  it.each(['', '   '])('rejects blank diagnosis %j inline and focuses the input', async value => {
    await startup('#repairs/order-1')
    const input = document.querySelector<HTMLTextAreaElement>('#repair-diagnosis')!
    input.value = value
    document.querySelector<HTMLButtonElement>('#diagnosis-form button')!.click()
    expect(document.activeElement).toBe(input)
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(document.querySelector('#detail-action-error')?.textContent).toContain('Ingresa un diagnóstico')
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/start'))).toBe(false)
  })

  it.each(['start', 'complete'])('shows pending, retries failure and announces backend success for %s', async action => {
    const initial = { ...order, status: action === 'start' ? 'RECEIVED' : 'IN_PROGRESS', diagnosis: null }
    const original = fetchMock.getMockImplementation()!
    let resolveAction: ((response: Response) => void) | undefined
    fetchMock.mockImplementation((url: string, init: RequestInit) => {
      if (url === '/api/repair-orders') return Promise.resolve(json([initial]))
      if (url.endsWith('/' + action)) return new Promise<Response>(resolve => { resolveAction = resolve })
      return original(url, init)
    })
    await startup('#repairs/order-1')
    const input = document.querySelector<HTMLTextAreaElement>('#repair-diagnosis')
    if (input) input.value = '  Replace valve  '
    else document.querySelector<HTMLButtonElement>('#detail-complete')!.click()
    const button = document.querySelector<HTMLButtonElement>('.repair-detail [data-repair-action]')!
    const submit = () => input
      ? document.querySelector('#diagnosis-form')!.dispatchEvent(new Event('submit', { cancelable: true }))
      : button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    submit(); submit(); submit()
    expect(button.disabled).toBe(true)
    expect(button.textContent).toBe(action === 'start' ? 'Iniciando reparación…' : 'Completando reparación…')
    expect(document.querySelector('#detail-actions')?.getAttribute('aria-busy')).toBe('true')
    if (!input) expect(document.querySelector<HTMLButtonElement>('#cancel-complete')!.disabled).toBe(true)
    await vi.waitFor(() => expect(resolveAction).toBeDefined())
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/' + action))).toHaveLength(1)
    expect(panel('repair-detail').querySelector('[aria-current="step"]')?.getAttribute('data-stage')).toBe(initial.status)
    resolveAction!(json({}, 500))
    await vi.waitFor(() => expect(button.disabled).toBe(false))
    expect(button.textContent).toBe(action === 'start' ? 'Iniciar reparación' : 'Completar reparación')
    expect(document.querySelector('#detail-actions')?.getAttribute('aria-busy')).toBe('false')
    expect(document.querySelector('#detail-action-error')?.textContent).toBe('No se pudo completar la solicitud.')
    expect(document.querySelector('#repair-action-status')?.textContent).toBe('')
    expect(panel('repair-detail').querySelector('[aria-current="step"]')?.getAttribute('data-stage')).toBe(initial.status)
    if (input) expect(input.value).toBe('  Replace valve  ')
    resolveAction = undefined
    submit()
    await vi.waitFor(() => expect(resolveAction).toBeDefined())
    const result = { ...initial, status: action === 'start' ? 'IN_PROGRESS' : 'COMPLETED', diagnosis: 'Backend diagnosis', completedAt: action === 'complete' ? '2026-10-01T09:00:00Z' : null }
    resolveAction!(json(result))
    await vi.waitFor(() => expect(document.querySelector('#repair-action-status')?.textContent).toBe(action === 'start' ? 'Reparación iniciada correctamente.' : 'Reparación completada correctamente.'))
    expect(document.querySelector('#repair-action-status')?.getAttribute('role')).toBe('status')
    expect(panel('repair-detail').textContent).toContain('Backend diagnosis')
    expect(panel('repair-detail').querySelector('[aria-current="step"]')?.getAttribute('data-stage')).toBe(result.status)
    // Reload obtains the persisted state from the backend, not client storage.
    fetchMock.mockImplementation((url: string, init: RequestInit) => url === '/api/repair-orders' ? Promise.resolve(json([result])) : original(url, init))
    vi.resetModules()
    await import('../src/main.ts')
    await vi.waitFor(() => expect(panel('repair-detail').querySelector('[aria-current="step"]')?.getAttribute('data-stage')).toBe(result.status))
    expect(document.querySelector('#repair-action-status')?.textContent).toBe('')
  })

  it('requires confirmation, cancels without mutation and restores focus', async () => {
    const original = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation((url: string, init: RequestInit) => url === '/api/repair-orders'
      ? Promise.resolve(json([{ ...order, status: 'IN_PROGRESS' }])) : original(url, init))
    await startup('#repairs')
    await route('#repairs/order-1', 'repair-detail')
    await vi.waitFor(() => expect(document.querySelector('#detail-complete')).not.toBeNull())
    await vi.waitFor(() => expect(panel('repair-detail').hidden).toBe(false))
    const opener = document.querySelector<HTMLButtonElement>('#detail-complete')!
    const confirmation = document.querySelector<HTMLElement>('#complete-confirmation')!
    expect(confirmation.hidden).toBe(true)
    opener.click()
    expect(confirmation.hidden).toBe(false)
    expect(opener.getAttribute('aria-expanded')).toBe('true')
    expect(opener.getAttribute('aria-controls')).toBe(confirmation.id)
    expect(confirmation.textContent).toContain('La reparación quedará marcada como completada.')
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
      if (url === '/api/repair-orders') return Promise.resolve(json([{ ...order, status: 'IN_PROGRESS' }]))
      if (url.endsWith('/complete')) return new Promise<Response>(resolve => { resolveComplete = resolve })
      return original(url, init)
    })
    await startup('#repairs/order-1')
    document.querySelector<HTMLButtonElement>('#detail-complete')!.click()
    document.querySelector<HTMLButtonElement>('#confirm-complete')!.click()
    await vi.waitFor(() => expect(resolveComplete).toBeDefined())
    document.querySelector<HTMLButtonElement>('#logout')!.click()
    await vi.waitFor(() => expect(document.querySelector('#login-form')).not.toBeNull())
    resolveComplete!(json({ ...order, status: 'COMPLETED', completedAt: '2026-10-01T09:00:00Z' }))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(document.querySelector('.app-shell')).toBeNull()
    expect(document.querySelector('#repair-action-status')).toBeNull()
  })


  it('keeps an action pending across detail navigation and restores retry after failure', async () => {
    const original = fetchMock.getMockImplementation()!
    let resolveStart: ((response: Response) => void) | undefined
    fetchMock.mockImplementation((url: string, init: RequestInit) => {
      if (url === '/api/repair-orders') return Promise.resolve(json([order, { ...order, id: 'other' }]))
      if (url.endsWith('/start')) return new Promise<Response>(resolve => { resolveStart = resolve })
      return original(url, init)
    })
    await startup('#repairs/order-1')
    document.querySelector<HTMLTextAreaElement>('#repair-diagnosis')!.value = 'Keep this diagnosis'
    document.querySelector<HTMLButtonElement>('#diagnosis-form button')!.click()
    await vi.waitFor(() => expect(resolveStart).toBeDefined())
    location.hash = '#repairs/other'
    await vi.waitFor(() => expect(document.querySelector('#repair-detail-title')?.textContent).toContain('other'))
    location.hash = '#repairs/order-1'
    await vi.waitFor(() => expect(document.querySelector('#repair-detail-title')?.textContent).toContain('order-1'))
    expect(document.querySelector<HTMLButtonElement>('#diagnosis-form button')!.disabled).toBe(true)
    document.querySelector('#diagnosis-form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/start'))).toHaveLength(1)
    resolveStart!(json({}, 500))
    await vi.waitFor(() => expect(document.querySelector<HTMLButtonElement>('#diagnosis-form button')!.disabled).toBe(false))
    expect(document.querySelector<HTMLTextAreaElement>('#repair-diagnosis')!.value).toBe('Keep this diagnosis')
    expect(document.activeElement?.id).toBe('detail-action-error')
    expect(document.querySelector('#detail-action-error')?.textContent).toBe('No se pudo completar la solicitud.')
  })


  it('keeps native form labels, landmarks and non-focusable lifecycle semantics', async () => {
    await startup('#repairs/order-1')
    expect(document.querySelectorAll('main')).toHaveLength(1)
    expect(document.querySelectorAll('nav[aria-label="Application"]')).toHaveLength(1)
    expect(document.querySelector('.app-shell__nav [aria-current="page"]')?.textContent).toBe('Reparaciones')
    expect(panel('repair-detail').querySelector('ol.repair-lifecycle')).not.toBeNull()
    expect(panel('repair-detail').querySelectorAll('.repair-lifecycle [tabindex], .repair-lifecycle button, .repair-lifecycle a')).toHaveLength(0)
    expect(panel('repair-detail').querySelectorAll('[aria-current="step"]')).toHaveLength(1)
    expect(document.querySelector('#detail-action-error')?.getAttribute('role')).toBe('alert')
    expect(document.querySelector('#repair-action-status')?.getAttribute('role')).toBe('status')
    for (const field of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('.app-shell input, .app-shell textarea')) {
      expect(document.querySelector(`label[for="${field.id}"]`)).not.toBeNull()
      for (const id of field.getAttribute('aria-describedby')?.split(' ') ?? []) expect(document.getElementById(id)).not.toBeNull()
    }
  })

  it('focuses the first invalid creation field and advances to the next invalid field', async () => {
    await startup('#repairs')
    await route('#repairs/new', 'repair-new')
    const submit = document.querySelector<HTMLButtonElement>('#repair-order-form button')!
    submit.click()
    expect(document.activeElement?.id).toBe('customer-name')
    expect(document.activeElement?.getAttribute('aria-invalid')).toBe('true')
    document.querySelector<HTMLInputElement>('#customer-name')!.value = 'Customer'
    submit.click()
    expect(document.activeElement?.id).toBe('customer-phone')
    expect(fetchMock.mock.calls.some(([url, init]) => url === '/api/repair-orders' && init.method === 'POST')).toBe(false)
  })

  it.each(['start', 'complete'])('restores destination focus when %s resolves after navigation', async action => {
    const original = fetchMock.getMockImplementation()!
    let resolveAction: ((response: Response) => void) | undefined
    fetchMock.mockImplementation((url: string, init: RequestInit) => {
      if (url === '/api/repair-orders') return Promise.resolve(json([{ ...order, status: action === 'start' ? 'RECEIVED' : 'IN_PROGRESS' }]))
      if (url.endsWith('/' + action)) return new Promise<Response>(resolve => { resolveAction = resolve })
      return original(url, init)
    })
    await startup('#repairs/order-1')
    if (action === 'start') {
      document.querySelector<HTMLTextAreaElement>('#repair-diagnosis')!.value = 'Diagnosis'
      document.querySelector<HTMLButtonElement>('#diagnosis-form button')!.click()
    } else {
      document.querySelector<HTMLButtonElement>('#detail-complete')!.click()
      document.querySelector<HTMLButtonElement>('#confirm-complete')!.click()
    }
    await vi.waitFor(() => expect(resolveAction).toBeDefined())
    await navigate('dashboard')
    const previousHeading = document.activeElement
    expect(previousHeading?.id).toBe('dashboard-title')
    resolveAction!(json({ ...order, status: action === 'start' ? 'IN_PROGRESS' : 'COMPLETED', diagnosis: 'Diagnosis' }))
    await vi.waitFor(() => expect(document.querySelector('#repair-action-status')?.textContent).toContain('correctamente'))
    expect(previousHeading?.isConnected).toBe(true)
    expect(document.activeElement?.id).toBe('dashboard-title')
    expect(document.activeElement?.isConnected).toBe(true)
    expect(location.hash).toBe('#dashboard')
  })

})

describe('I5 intention-driven repairs', () => {
  const collectionRequests = () => fetchMock.mock.calls.filter(([url, init]) => url === '/api/repair-orders' && (!init.method || init.method === 'GET'))
  const submitQuery = () => document.querySelector('#repair-search-form')!.dispatchEvent(new Event('submit', { cancelable: true }))

  it.each([
    ['#repairs', 'repairs', 'repairs-title'],
    ['#repairs/new', 'repair-new', 'repair-new-title'],
    ['#repairs/search', 'repair-search', 'repair-search-title'],
  ])('opens %s without loading orders and keeps the module active', async (hash, destination, heading) => {
    await startup(hash)
    expect(collectionRequests()).toHaveLength(0)
    expect(active()).toBe('Reparaciones')
    expect(panel(destination).hidden).toBe(false)
    expect(panel(destination).querySelector('h1')?.id).toBe(heading)
    expect(document.querySelector('.repair-results')).toBeNull()
    expect(document.querySelector('#repair-results-title')).toBeNull()
    expect(panel('repairs').querySelector('form, table, .repair-filters')).toBeNull()
  })

  it('navigates through the two capabilities and cancels creation with heading focus', async () => {
    await startup('#repairs')
    panel('repairs').querySelector<HTMLAnchorElement>('a[href="#repairs/new"]')!.click()
    await vi.waitFor(() => expect(document.activeElement?.id).toBe('repair-new-title'))
    expect(panel('repair-new').querySelector('form')).not.toBeNull()
    panel('repair-new').querySelector<HTMLAnchorElement>('.repairs-secondary-action')!.click()
    await vi.waitFor(() => expect(document.activeElement?.id).toBe('repairs-title'))
    panel('repairs').querySelector<HTMLAnchorElement>('a[href="#repairs/search"]')!.click()
    await vi.waitFor(() => expect(document.activeElement?.id).toBe('repair-search-title'))
    expect(document.querySelector<HTMLElement>('#repair-search-initial')!.hidden).toBe(false)
    expect(collectionRequests()).toHaveLength(0)
  })

  it('waits for explicit search even with a cached Dashboard collection and reapplies filters only on submit', async () => {
    await startup()
    await route('#repairs/search', 'repair-search')
    expect(document.querySelector('.repair-results')).toBeNull()
    document.querySelector<HTMLButtonElement>('[data-repair-status="COMPLETED"]')!.click()
    expect(document.querySelector('#repair-order-empty')).toBeNull()
    expect(collectionRequests()).toHaveLength(1)
    await search('COMPLETED')
    expect(document.querySelector('#repair-order-empty')?.textContent).toBe('No se encontraron reparaciones')
    document.querySelector<HTMLButtonElement>('[data-repair-status="all"]')!.click()
    expect(document.querySelector('.repair-results')).toBeNull()
    submitQuery()
    await vi.waitFor(() => expect(document.querySelectorAll('.repair-results tbody tr')).toHaveLength(1))
    expect(collectionRequests()).toHaveLength(1)
    expect(document.activeElement?.id).toBe('repair-results-title')
    expect(panel('repair-search').textContent).toContain('Recibidas')
    expect(panel('repair-search').textContent).not.toMatch(/Repair work queue|View detail|Start repair/)
  })

  it('loads only once for duplicate pending queries and offers retry after failure', async () => {
    await startup('#repairs/search')
    const original = fetchMock.getMockImplementation()!
    let resolveQuery: ((response: Response) => void) | undefined
    fetchMock.mockImplementation((url: string, init: RequestInit) => url === '/api/repair-orders'
      ? new Promise<Response>(resolve => { resolveQuery = resolve }) : original(url, init))
    submitQuery(); submitQuery()
    await vi.waitFor(() => expect(resolveQuery).toBeDefined())
    expect(collectionRequests()).toHaveLength(1)
    expect(document.querySelector('#repair-search-form')?.getAttribute('aria-busy')).toBe('true')
    resolveQuery!(json({}, 500))
    await vi.waitFor(() => expect(document.querySelector('#repair-search-error')?.textContent).toBe('No se pudo completar la solicitud.'))
    expect(document.querySelector<HTMLButtonElement>('#repair-search-form button[type="submit"]')!.disabled).toBe(false)
    expect(document.querySelector('#repair-order-empty')).toBeNull()
    fetchMock.mockImplementation(original)
    await search()
    expect(collectionRequests()).toHaveLength(2)
    expect(document.querySelectorAll('.repair-results tbody tr')).toHaveLength(1)
  })

  it('preserves a creation draft and its focus when a query finishes after navigation', async () => {
    await startup('#repairs/search')
    const original = fetchMock.getMockImplementation()!
    let resolveQuery: ((response: Response) => void) | undefined
    fetchMock.mockImplementation((url: string, init: RequestInit) => url === '/api/repair-orders'
      ? new Promise<Response>(resolve => { resolveQuery = resolve }) : original(url, init))
    submitQuery()
    await vi.waitFor(() => expect(resolveQuery).toBeDefined())
    await route('#repairs/new', 'repair-new')
    const input = document.querySelector<HTMLInputElement>('#customer-name')!
    input.value = 'Borrador conservado'
    input.focus()
    resolveQuery!(json([order]))
    await vi.waitFor(() => expect(document.querySelector('#repair-results-title')).not.toBeNull())
    expect(input.isConnected).toBe(true)
    expect(input.value).toBe('Borrador conservado')
    expect(document.activeElement).toBe(input)
    expect(location.hash).toBe('#repairs/new')
  })

  it('ignores a late collection response after logout', async () => {
    await startup('#repairs/search')
    const original = fetchMock.getMockImplementation()!
    let resolveQuery: ((response: Response) => void) | undefined
    fetchMock.mockImplementation((url: string, init: RequestInit) => url === '/api/repair-orders'
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
    await startup('#repairs/new')
    const payload = { customerName: 'Cliente real', customerContact: '+56911112222', heaterBrand: 'Bosch', heaterModel: 'Therm', reportedIssue: 'No enciende' }
    for (const [name, value] of Object.entries(payload)) document.querySelector<HTMLInputElement>(`[name="${name}"]`)!.value = ` ${value} `
    const form = document.querySelector('#repair-order-form')!
    form.dispatchEvent(new Event('submit', { cancelable: true }))
    form.dispatchEvent(new Event('submit', { cancelable: true }))
    await vi.waitFor(() => expect(location.hash).toBe('#repairs/order-2'))
    await vi.waitFor(() => expect(document.activeElement?.id).toBe('repair-detail-title'))
    const requests = fetchMock.mock.calls.filter(([url, init]) => url === '/api/repair-orders' && init.method === 'POST')
    expect(requests).toHaveLength(1)
    expect(JSON.parse(requests[0]![1].body as string)).toEqual(payload)
    expect(new Headers(requests[0]![1].headers).get('X-CSRF-TOKEN')).toBe('test-token')
    expect(collectionRequests()).toHaveLength(0)
    expect(panel('repair-detail').textContent).toContain('Cliente real')
    expect(document.querySelector('#repair-action-status')?.textContent).toBe('Reparación creada correctamente.')
    await navigate('dashboard')
    await vi.waitFor(() => expect(collectionRequests()).toHaveLength(1))
  })
})

describe('I5 asynchronous route safeguards', () => {
  it('preserves a newly created order when an older collection request finishes', async () => {
    await startup('#repairs/search')
    const original = fetchMock.getMockImplementation()!
    let resolveOrders: ((response: Response) => void) | undefined
    fetchMock.mockImplementation((url: string, init: RequestInit) => url === '/api/repair-orders' && !init.method
      ? new Promise<Response>(resolve => { resolveOrders = resolve }) : original(url, init))
    document.querySelector('#repair-search-form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    await vi.waitFor(() => expect(resolveOrders).toBeDefined())
    await route('#repairs/new', 'repair-new')
    for (const [name, value] of Object.entries({ customerName: 'Nuevo cliente', customerContact: '+56911112222', heaterBrand: 'Bosch', heaterModel: 'Therm', reportedIssue: 'No enciende' })) {
      document.querySelector<HTMLInputElement>(`[name="${name}"]`)!.value = value
    }
    document.querySelector('#repair-order-form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    await vi.waitFor(() => expect(location.hash).toBe('#repairs/order-2'))
    await vi.waitFor(() => expect(panel('repair-detail').textContent).toContain('Nuevo cliente'))
    resolveOrders!(json([order]))
    await vi.waitFor(() => expect(document.querySelector('#visible-order-count')?.textContent).toBe('2 reparaciones'))
    expect(panel('repair-detail').textContent).toContain('Nuevo cliente')
    expect(document.querySelector('.dashboard-summary__total strong')?.textContent).toBe('2')
  })

  it('clears protected UI if an explicit query returns an expired session', async () => {
    await startup('#repairs/search')
    const original = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation((url: string, init: RequestInit) => url === '/api/repair-orders'
      ? Promise.resolve(json({}, 401)) : original(url, init))
    document.querySelector('#repair-search-form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    await vi.waitFor(() => expect(document.querySelector('#login-form')).not.toBeNull())
    expect(document.querySelector('.app-shell')).toBeNull()
    expect(document.querySelector('#login-error')?.textContent).toContain('Tu sesión ha expirado')
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/repair-orders')).toHaveLength(1)
  })
})

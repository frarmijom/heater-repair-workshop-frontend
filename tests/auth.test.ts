// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let authenticated: boolean
let requests: string[]
let fetchMock: ReturnType<typeof vi.fn>
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

beforeEach(() => {
  vi.resetModules()
  vi.spyOn(window, 'addEventListener')
  window.history.replaceState(null, '', '/')
  authenticated = false
  requests = []
  document.body.innerHTML = '<div id="app"></div>'
  localStorage.clear()
  sessionStorage.clear()
  fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    requests.push(url)
    expect(init.credentials).toBe('same-origin')
    expect(init.cache).toBe('no-store')
    if (url === '/api/auth/csrf') return json({ headerName: 'X-CSRF-TOKEN', token: 'test-token' })
    if (url === '/api/auth/session') return authenticated ? json({ email: 'tech@example.test' }) : json({}, 401)
    if (url === '/api/auth/login') {
      expect(new Headers(init.headers).get('X-CSRF-TOKEN')).toBe('test-token')
      authenticated = JSON.parse(init.body as string).password === 'test-password'
      return authenticated ? json({ email: 'tech@example.test' }) : json({ message: 'internal data must not be shown' }, 401)
    }
    if (url === '/api/auth/logout') {
      expect(new Headers(init.headers).get('X-CSRF-TOKEN')).toBe('test-token')
      authenticated = false
      return new Response(null, { status: 204 })
    }
    if (url === '/api/repair-orders') return authenticated ? json([]) : json({}, 401)
    throw new Error('Unexpected URL: ' + url)
  })
  vi.stubGlobal('fetch', fetchMock)
  // Avoid leaving dashboard clock intervals active across module reloads.
  vi.spyOn(window, 'setInterval').mockReturnValue(1)
})
afterEach(() => {
  for (const [type, listener] of vi.mocked(window.addEventListener).mock.calls) {
    if (type === 'hashchange') window.removeEventListener(type, listener)
  }
  vi.restoreAllMocks(); vi.unstubAllGlobals()
})

async function startup() { await import('../src/main.ts') }
async function submit(password = 'test-password') {
  document.querySelector<HTMLInputElement>('#login-email')!.value = 'tech@example.test'
  document.querySelector<HTMLInputElement>('#login-password')!.value = password
  document.querySelector<HTMLFormElement>('#login-form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
}
async function waitLogin() { await vi.waitFor(() => expect(document.querySelector('#login-form')).not.toBeNull()) }
async function waitDashboard() { await vi.waitFor(() => expect(document.querySelector('#workload-title')).not.toBeNull()) }

describe('AUTH-01 browser flow', () => {
  it('checks session before orders, renders login on 401 and stores no credentials', async () => {
    await startup()
    await waitLogin()
    expect(requests).toEqual(['/api/auth/session'])
    expect(document.querySelector('.workshop')).toBeNull()
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('renders the Spanish login with its existing accessible DOM contracts', async () => {
    await startup(); await waitLogin()
    expect(document.querySelectorAll('main')).toHaveLength(1)
    expect(document.querySelector('main')?.lang).toBe('es')
    expect(document.querySelector('h1')?.textContent).toBe('Bienvenido')
    expect(document.querySelector('label[for="login-email"]')?.textContent).toBe('Correo electrónico')
    expect(document.querySelector('label[for="login-password"]')?.textContent).toBe('Contraseña')
    expect(document.querySelector('#login-error')?.getAttribute('role')).toBe('alert')
    expect(document.querySelector('#login-form button[type="submit"]')?.textContent).toBe('Iniciar sesión')
    expect(document.querySelector<HTMLInputElement>('#login-email')?.autocomplete).toBe('username')
    expect(document.querySelector<HTMLInputElement>('#login-password')?.autocomplete).toBe('current-password')
    expect([...document.querySelectorAll('.login-screen__flow li')].map(li => li.textContent))
      .toEqual(['Cliente', 'Ingreso', 'Diagnóstico', 'Reparación', 'Entrega'])
  })

  it('toggles password visibility without submitting or storing credentials', async () => {
    await startup(); await waitLogin()
    const password = document.querySelector<HTMLInputElement>('#login-password')!
    const toggle = document.querySelector<HTMLButtonElement>('[data-password-toggle]')!
    password.value = 'test-password'
    expect(toggle.type).toBe('button')
    expect(toggle.getAttribute('aria-label')).toBe('Mostrar contraseña')
    expect(toggle.getAttribute('aria-controls')).toBe(password.id)
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    toggle.focus()
    expect(document.activeElement).toBe(toggle)
    toggle.click()
    expect(password.type).toBe('text')
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    expect(toggle.textContent).toBe('Ocultar')
    expect(toggle.getAttribute('aria-label')).toBe('Ocultar contraseña')
    expect(password.value).toBe('test-password')
    toggle.click()
    expect(password.type).toBe('password')
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    expect(toggle.textContent).toBe('Mostrar')
    expect(toggle.getAttribute('aria-label')).toBe('Mostrar contraseña')
    expect(requests).toEqual(['/api/auth/session'])
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    await submit(); await waitDashboard()
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('rejects invalid credentials generically and blocks duplicate submissions', async () => {
    await startup(); await waitLogin()
    await submit('wrong')
    expect(document.querySelector('#login-form')?.getAttribute('aria-busy')).toBe('true')
    expect(document.querySelector('#login-form button[type="submit"]')?.textContent).toBe('Iniciando sesión…')
    document.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    expect(document.querySelector<HTMLButtonElement>('form button[type="submit"]')!.disabled).toBe(true)
    await vi.waitFor(() => expect(document.querySelector('#login-error')!.textContent).toBe('Credenciales incorrectas.'))
    expect(document.querySelector('#login-form')?.hasAttribute('aria-busy')).toBe(false)
    expect(document.querySelector<HTMLButtonElement>('#login-form button[type="submit"]')?.disabled).toBe(false)
    expect(requests.filter(url => url === '/api/auth/login')).toHaveLength(1)
    expect(requests).not.toContain('/api/repair-orders')
    expect(document.querySelector<HTMLInputElement>('#login-password')!.value).toBe('')
  })

  it('logs in, loads the dashboard, preserves a session on reload and logs out', async () => {
    await startup(); await waitLogin(); await submit(); await waitDashboard()
    expect(requests.indexOf('/api/auth/login')).toBeLessThan(requests.indexOf('/api/repair-orders'))
    expect(requests.filter(url => url === '/api/auth/csrf')).toHaveLength(2)
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    vi.resetModules(); requests = []; await startup(); await waitDashboard()
    expect(requests).toEqual(['/api/auth/session', '/api/repair-orders'])
    document.querySelector<HTMLButtonElement>('#logout')!.click()
    await waitLogin()
    expect(authenticated).toBe(false)
    vi.resetModules(); requests = []; await startup(); await waitLogin()
    expect(requests).toEqual(['/api/auth/session'])
  })

  it('removes protected UI when a repair operation returns 401 without retrying', async () => {
    authenticated = true
    await startup(); await waitDashboard()
    authenticated = false
    const { loadRepairOrders } = await import('../src/services/repair-order-service.ts')
    requests = []
    await expect(loadRepairOrders()).rejects.toThrow('Tu sesión ha expirado.')
    await waitLogin()
    expect(document.querySelector('.workshop')).toBeNull()
    expect(document.querySelector('#login-error')!.textContent).toContain('sesión ha expirado')
    expect(requests).toEqual(['/api/repair-orders'])
  })

  it('ignores a late mutation response after logout and a new login', async () => {
    authenticated = true
    await startup(); await waitDashboard()
    document.querySelector<HTMLAnchorElement>('a[href="#repairs"]')!.click()
    await vi.waitFor(() => expect(document.querySelector<HTMLElement>('[data-destination="repairs"]')!.hidden).toBe(false))
    const original = fetchMock.getMockImplementation()!
    let complete: ((response: Response) => void) | undefined
    fetchMock.mockImplementation((url: string, init: RequestInit) => {
      if (url === '/api/repair-orders' && init.method === 'POST') {
        return new Promise<Response>(resolve => { complete = resolve })
      }
      return original(url, init)
    })
    location.hash = '#repairs/new'
    await vi.waitFor(() => expect(document.querySelector<HTMLElement>('[data-destination="repair-new"]')!.hidden).toBe(false))
    for (const [id, value] of Object.entries({ 'customer-name': 'Late order', 'customer-phone': '+56911112222',
      'heater-brand': 'Bosch', 'heater-model': 'Therm', 'reported-issue': 'Turns off' })) {
      document.querySelector<HTMLInputElement>('#' + id)!.value = value
    }
    document.querySelector('#repair-order-form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    await vi.waitFor(() => expect(complete).toBeDefined())
    document.querySelector<HTMLButtonElement>('#logout')!.click()
    await waitLogin(); location.hash = '#dashboard'; await submit(); await waitDashboard()
    complete!(json({ id: 'stale', customerName: 'Late order', customerContact: '+56911112222',
      heaterBrand: 'Bosch', heaterModel: 'Therm', reportedIssue: 'Turns off', status: 'RECEIVED',
      receivedAt: '2026-01-01T00:00:00Z', diagnosis: null, completedAt: null }))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(document.querySelector('.workshop')).not.toBeNull()
    expect(document.body.textContent).not.toContain('Late order')
  })

  it('does not reveal backend diagnostics or replay a rejected mutation', async () => {
    const { apiRequest } = await import('../src/services/api.ts')
    fetchMock.mockResolvedValueOnce(json({ headerName: 'X-CSRF-TOKEN', token: 'first' }))
      .mockResolvedValueOnce(json({ message: 'SQL secret /internal/path' }, 403))
    await expect(apiRequest('/repair-orders', { method: 'POST', body: '{}' })).rejects.toThrow('No se pudo completar la solicitud.')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('shows a recoverable error when session checking fails, without loading orders', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network detail'))
    await startup()
    await vi.waitFor(() => expect(document.querySelector('#retry-load')).not.toBeNull())
    expect(document.body.textContent).not.toContain('network detail')
    expect(requests).not.toContain('/api/repair-orders')
  })
})

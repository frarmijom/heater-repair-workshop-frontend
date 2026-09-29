// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createCatalogModule } from '../src/inventory/catalog-module.ts'
import { clearCsrf, setSessionExpiredHandler } from '../src/services/api.ts'
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const entry = { id: 'catalog-1', name: 'Gas', active: true, version: 0, createdAt: '2026-09-29T12:00:00Z', updatedAt: '2026-09-29T12:00:00Z' }
let root: HTMLElement
let fetchMock: ReturnType<typeof vi.fn>
let module: ReturnType<typeof createCatalogModule>
function input(id: string, value: string) { root.querySelector<HTMLInputElement>(id)!.value = value }
function click(selector: string) { root.querySelector<HTMLButtonElement>(selector)!.click() }
function submit() { root.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) }
beforeEach(() => {
  clearCsrf(); setSessionExpiredHandler(() => {})
  document.body.innerHTML = '<section id="catalog"></section>'; root = document.querySelector('#catalog')!
  fetchMock = vi.fn(async (url: string, options: RequestInit = {}) => {
    if (url.endsWith('/auth/csrf')) return json({ token: 'csrf', headerName: 'X-CSRF-TOKEN' })
    if (!options.method) return json([])
    expect(new Headers(options.headers).get('X-CSRF-TOKEN')).toBe('csrf')
    return json({ ...entry, ...JSON.parse(options.body as string), version: options.method === 'PATCH' ? 1 : 0 }, options.method === 'POST' ? 201 : 200)
  })
  vi.stubGlobal('fetch', fetchMock); module = createCatalogModule(root)
})
afterEach(() => { module.dispose(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
describe('inventory catalogs', () => {
  it('loads, shows empty state and creates a category without protected fields', async () => {
    const loading = module.show('categories'); expect(root.textContent).toContain('Cargando catálogo'); expect(root.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(true); await loading
    expect(root.textContent).toContain('No hay registros'); expect(root.querySelector('a[aria-current="page"]')?.textContent).toBe('Categorías')
    submit(); expect(root.querySelector('#catalog-name')?.getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement?.id).toBe('catalog-name')
    input('#catalog-name', '  Válvulas  '); submit()
    await vi.waitFor(() => expect(root.textContent).toContain('Registro guardado correctamente.'))
    expect(root.querySelector('tbody')?.textContent).toContain('Válvulas')
    const mutation = fetchMock.mock.calls.find(([, options]) => options.method === 'POST')!
    expect(JSON.parse(mutation[1].body)).toEqual({ name: 'Válvulas' })
    expect(root.querySelector('label[for="catalog-name"]')).not.toBeNull()
  })
  it('creates administrable units and edits decimal policy with expected version', async () => {
    await module.show('units'); input('#catalog-name', 'Metro'); input('#catalog-symbol', 'm')
    root.querySelector<HTMLInputElement>('#catalog-decimal')!.checked = true; submit()
    await vi.waitFor(() => expect(root.querySelector('tbody')?.textContent).toContain('Permitidos'))
    click('[data-edit]'); input('#catalog-name', 'Unidad'); input('#catalog-symbol', 'un')
    root.querySelector<HTMLInputElement>('#catalog-decimal')!.checked = false; submit()
    await vi.waitFor(() => expect(root.querySelector('tbody')?.textContent).toContain('No permitidos'))
    const mutation = fetchMock.mock.calls.find(([, options]) => options.method === 'PATCH')!
    expect(JSON.parse(mutation[1].body)).toEqual({ name: 'Unidad', symbol: 'un', allowsDecimal: false, expectedVersion: 0 })
  })
  it('requires confirmation before deactivating and supports reactivation', async () => {
    fetchMock.mockResolvedValueOnce(json([entry])); await module.show('categories')
    click('[data-toggle]'); expect(root.textContent).toContain('¿Desactivar Gas?')
    expect(fetchMock.mock.calls.some(([, options]) => options.method === 'PATCH')).toBe(false)
    click('#catalog-keep'); expect(root.querySelector('#catalog-confirm')).toBeNull()
    click('[data-toggle]'); click('#catalog-confirm')
    await vi.waitFor(() => expect(root.querySelector('.catalog-state')?.textContent).toBe('INACTIVO'))
    click('[data-toggle]'); await vi.waitFor(() => expect(root.querySelector('.catalog-state')?.textContent).toBe('ACTIVO'))
    expect(root.querySelector('[data-toggle]')?.getAttribute('aria-label')).toBe('Desactivar Gas')
  })
  it.each([400, 409, 500])('keeps entered values on API error %s with conflict feedback', async status => {
    await module.show('categories'); input('#catalog-name', 'Conservar')
    fetchMock.mockResolvedValueOnce(json({ token: 'csrf', headerName: 'X-CSRF-TOKEN' }))
    fetchMock.mockResolvedValueOnce(json({ message: status === 409 ? 'El nombre ya existe.' : 'Error de validación.' }, status))
    submit(); await vi.waitFor(() => expect(root.querySelector('[role="alert"]')?.textContent).not.toBe(''))
    expect(root.querySelector<HTMLInputElement>('#catalog-name')!.value).toBe('Conservar')
    if (status === 409) expect(root.textContent).toContain('Conflicto: El nombre ya existe.')
    if (status === 500) expect(root.textContent).not.toContain('Error de validación.')
    expect(root.querySelector<HTMLButtonElement>('button[type=submit]')?.disabled).toBe(false)
  })
  it('shows load errors and supports explicit retry', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline')); await module.show('categories')
    expect(root.querySelector('[role=alert]')?.textContent).toContain('No se pudo')
    click('#catalog-retry'); await vi.waitFor(() => expect(root.textContent).toContain('No hay registros'))
  })
  it('blocks duplicate submission and ignores responses after disposal', async () => {
    await module.show('categories'); input('#catalog-name', 'Gas')
    let resolve!: (value: Response) => void
    fetchMock.mockResolvedValueOnce(json({ token: 'csrf', headerName: 'X-CSRF-TOKEN' }))
    fetchMock.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done }))
    submit(); submit()
    await vi.waitFor(() => expect(resolve).toBeDefined())
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1)
    expect(root.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(true)
    module.dispose(); root.innerHTML = 'Sesión cerrada'; resolve(json(entry))
    await new Promise(done => setTimeout(done, 0)); expect(root.textContent).toBe('Sesión cerrada')
  })
  it('discards a category response arriving after navigating to units', async () => {
    let resolve!: (value: Response) => void
    fetchMock.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done }))
    const old = module.show('categories'); await module.show('units'); resolve(json([entry])); await old
    expect(root.querySelector('#catalog-list-title')?.textContent).toBe('Unidades de medida')
    expect(root.querySelector('tbody')).toBeNull()
  })
  it('restores submit controls after a pending save finishes on another catalog', async () => {
    await module.show('categories'); input('#catalog-name', 'Pending')
    let resolve!: (value: Response) => void
    fetchMock.mockResolvedValueOnce(json({ token: 'csrf', headerName: 'X-CSRF-TOKEN' }))
    fetchMock.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done }))
    submit(); await vi.waitFor(() => expect(resolve).toBeDefined())
    await module.show('units')
    expect(root.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(true)
    resolve(json(entry)); await vi.waitFor(() => expect(root.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(false))
    expect(root.querySelector('button[type=submit]')?.textContent).toBe('Crear registro')
    expect(root.querySelector('tbody')).toBeNull()
  })

  it('escapes catalog values and exposes named table headers', async () => {
    fetchMock.mockResolvedValueOnce(json([{ ...entry, name: '<img src=x onerror=alert(1)>' }]))
    await module.show('categories'); expect(root.querySelector('img')).toBeNull()
    expect(root.querySelector('caption')?.textContent).toBe('Categorías')
    expect(root.querySelectorAll('th[scope=col]')).toHaveLength(3)
    expect(root.querySelector('th[scope=row]')?.textContent).toContain('<img')
  })
})

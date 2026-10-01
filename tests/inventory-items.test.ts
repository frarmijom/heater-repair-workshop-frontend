// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInventoryItemModule } from '../src/inventory/item-module.ts'
import { clearCsrf, setSessionExpiredHandler } from '../src/services/api.ts'
import type { InventoryItem } from '../src/inventory/item-service.ts'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const category = { id: 'cat-1', name: 'Repuestos', active: true }
const wholeUnit = { id: 'unit-1', name: 'Unidad', symbol: 'un', allowsDecimal: false, active: true }
const decimalUnit = { id: 'unit-2', name: 'Metro', symbol: 'm', allowsDecimal: true, active: true }
const item = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
  id: 'item-1', sku: 'VALV-001', name: 'Válvula', description: null,
  category: { id: category.id, name: category.name },
  unit: { id: wholeUnit.id, name: wholeUnit.name, symbol: wholeUnit.symbol, allowsDecimal: false },
  stockCurrent: '1.000', stockMinimum: '2.000', referenceUnitCost: '2.1250', lowStock: true,
  active: true, hasMovements: true, version: 0, itemType: 'STANDARD',
  createdAt: '2026-09-29T12:00:00Z', updatedAt: '2026-09-29T12:00:00Z', ...overrides,
})

let root: HTMLElement
let module: ReturnType<typeof createInventoryItemModule>
let fetchMock: ReturnType<typeof vi.fn>
let items: InventoryItem[]
let postStatuses: number[]
let createdPayloads: Record<string, unknown>[]
let patchedPayloads: Record<string, unknown>[]

beforeEach(() => {
  clearCsrf()
  setSessionExpiredHandler(() => {})
  Element.prototype.scrollIntoView = vi.fn()
  window.history.replaceState(null, '', '/#inventory/items')
  document.body.innerHTML = '<section id="inventory"></section>'
  root = document.querySelector('#inventory')!
  items = []
  postStatuses = []
  createdPayloads = []
  patchedPayloads = []
  fetchMock = vi.fn(async (url: string, options: RequestInit = {}) => {
    if (url === '/api/auth/csrf') return json({ token: 'csrf', headerName: 'X-CSRF-TOKEN' })
    if (url === '/api/inventory/categories') return json([category])
    if (url === '/api/inventory/units') return json([wholeUnit, decimalUnit])
    if (url === '/api/inventory/items' && !options.method) return json(items)
    if (url === '/api/inventory/items' && options.method === 'POST') {
      const payload = JSON.parse(options.body as string) as Record<string, unknown>
      createdPayloads.push(payload)
      const status = postStatuses.shift() ?? 201
      if (status !== 201) return json({ message: 'SKU ya existe.' }, status)
      const selectedUnit = payload.unitId === decimalUnit.id ? decimalUnit : wholeUnit
      const created = item({
        id: `item-${items.length + 1}`, sku: String(payload.sku), name: String(payload.name),
        description: payload.description ? String(payload.description) : null,
        category: { id: category.id, name: category.name },
        unit: { id: selectedUnit.id, name: selectedUnit.name, symbol: selectedUnit.symbol, allowsDecimal: selectedUnit.allowsDecimal },
        stockCurrent: String(payload.initialStock ?? '0'), stockMinimum: String(payload.stockMinimum ?? '0'),
        referenceUnitCost: String(payload.referenceUnitCost ?? '0'),
        lowStock: Number(payload.initialStock ?? 0) < Number(payload.stockMinimum ?? 0),
        hasMovements: Number(payload.initialStock ?? 0) > 0, itemType: payload.itemType === 'KIT' ? 'KIT' : 'STANDARD',
      })
      items.push(created)
      return json(created, 201)
    }
    if (/^\/api\/inventory\/items\/[^/]+\/bom$/.test(url) && !options.method) return json({ kitItemId: 'kit-1', components: [] })
    if (/^\/api\/inventory\/items\/[^/]+\/bom$/.test(url) && options.method === 'PUT') {
      const payload = JSON.parse(options.body as string) as { components: Array<{ componentItemId: string; quantity: string }> }
      return json({ kitItemId: 'kit-1', components: payload.components })
    }
    if (/^\/api\/inventory\/items\/[^/]+\/assemblies$/.test(url) && options.method === 'POST') {
      const payload = JSON.parse(options.body as string) as { quantity: string; requestId: string; reason: string }
      const id = decodeURIComponent(url.split('/').at(-2)!)
      const existing = items.findIndex(value => value.id === id)
      const current = items[existing]
      const updated = item({ ...current, stockCurrent: String(Number(current.stockCurrent) + Number(payload.quantity)), itemType: 'KIT' })
      items[existing] = updated
      return json({ assemblyId: 'assembly-1', kit: updated, movements: [] }, 201)
    }
    if (url.startsWith('/api/inventory/items/') && options.method === 'PATCH') {
      const payload = JSON.parse(options.body as string) as Record<string, unknown>
      patchedPayloads.push(payload)
      const id = decodeURIComponent(url.split('/').at(-1)!)
      const existing = items.findIndex(value => value.id === id)
      const updated = item({ ...items[existing], ...payload, id, version: Number(payload.expectedVersion ?? 0) + 1 })
      items[existing] = updated
      return json(updated)
    }
    throw new Error(`Unexpected URL: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  module = createInventoryItemModule(root)
})

afterEach(() => {
  module.dispose()
  clearCsrf()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function field(id: string, value: string) {
  const input = root.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`#${id}`)!
  input.value = value
  input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
}

function click(selector: string) { root.querySelector<HTMLButtonElement>(selector)!.click() }
function submit() { root.querySelector('#item-form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) }

describe('inventory items', () => {
  it('loads items, catalogs, tabs, and an empty state with a create action', async () => {
    const loading = module.show()
    expect(root.textContent).toContain('Cargando artículos')
    await loading
    expect(root.querySelector('h1')?.textContent).toBe('Artículos')
    expect(root.querySelectorAll('.catalog-tabs a').length).toBe(3)
    expect(root.textContent).toContain('No hay artículos registrados')
    click('#items-empty-create')
    expect(root.querySelector('#item-form')).not.toBeNull()
    expect(document.activeElement?.id).toBe('item-sku')
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(expect.arrayContaining([
      '/api/inventory/items', '/api/inventory/categories', '/api/inventory/units',
    ]))
  })

  it('creates with initial stock, blocks duplicate submit, and keeps requestId for retries', async () => {
    postStatuses = [409, 201]
    await module.show()
    click('#item-new')
    field('item-sku', 'VALV-001')
    field('item-name', 'Válvula')
    field('item-category', category.id)
    field('item-unit', decimalUnit.id)
    field('item-initial-stock', '12.500')
    field('item-stock-minimum', '15')
    field('item-reference-cost', '2.1250')
    submit()
    await vi.waitFor(() => expect(root.querySelector('[role="alert"]')?.textContent).toContain('Conflicto: SKU ya existe.'))
    const requestId = createdPayloads[0]?.requestId
    expect(requestId).toBeTruthy()
    submit()
    await vi.waitFor(() => expect(root.textContent).toContain('Artículo creado correctamente.'))
    expect(createdPayloads).toHaveLength(2)
    expect(createdPayloads[1]?.requestId).toBe(requestId)
    expect(createdPayloads[1]).toMatchObject({
      sku: 'VALV-001', categoryId: category.id, unitId: decimalUnit.id,
      initialStock: '12.500', stockMinimum: '15', referenceUnitCost: '2.1250',
    })
    expect(root.querySelector('[data-label="Stock actual"]')?.textContent).toContain('12.500')
    expect(root.textContent).toContain('Stock bajo')
  })

  it('rejects fractional initial stock for whole units and accepts it for decimal units', async () => {
    await module.show()
    click('#item-new')
    field('item-sku', 'TORN-001')
    field('item-name', 'Tornillo')
    field('item-category', category.id)
    field('item-unit', wholeUnit.id)
    field('item-initial-stock', '2.5')
    submit()
    expect(root.querySelector('#item-initial-stock-error')?.textContent).toContain('solo admite cantidades enteras')
    expect(createdPayloads).toHaveLength(0)
    field('item-unit', decimalUnit.id)
    expect(root.querySelector<HTMLInputElement>('#item-initial-stock')?.step).toBe('0.001')
    submit()
    await vi.waitFor(() => expect(root.textContent).toContain('Artículo creado correctamente.'))
    expect(createdPayloads[0]?.initialStock).toBe('2.5')
  })

  it('filters by SKU/name, active state, category, and low stock', async () => {
    items = [item(), item({ id: 'item-2', sku: 'CABLE-2', name: 'Cable', active: false, lowStock: false })]
    await module.show()
    expect(root.querySelectorAll('tbody tr')).toHaveLength(2)
    field('item-search', 'cable')
    expect(root.querySelectorAll('tbody tr')).toHaveLength(1)
    expect(root.querySelector('tbody')?.textContent).toContain('CABLE-2')
    field('item-search', '')
    field('item-state', 'inactive')
    expect(root.querySelectorAll('tbody tr')).toHaveLength(1)
    field('item-state', 'all')
    root.querySelector<HTMLInputElement>('#item-low-stock')!.click()
    expect(root.querySelectorAll('tbody tr')).toHaveLength(1)
    expect(root.querySelector('tbody')?.textContent).toContain('VALV-001')
  })

  it('locks unit after movement and never submits stockCurrent during metadata edit', async () => {
    items = [item()]
    await module.show()
    click('[data-manage]')
    click('[data-manage-edit]')
    expect(root.querySelector<HTMLSelectElement>('#item-unit')?.disabled).toBe(true)
    expect(root.textContent).toContain('La unidad no puede modificarse porque el artículo ya posee movimientos.')
    expect(root.querySelector('#item-initial-stock')).toBeNull()
    expect(root.querySelector('output.inventory-readonly-value')?.textContent).toContain('1.000')
    field('item-name', 'Filtro nuevo')
    submit()
    await vi.waitFor(() => expect(root.textContent).toContain('Artículo actualizado.'))
    expect(patchedPayloads[0]).toMatchObject({ expectedVersion: 0, name: 'Filtro nuevo' })
    expect(patchedPayloads[0]).not.toHaveProperty('stockCurrent')
    expect(patchedPayloads[0]).not.toHaveProperty('initialStock')
  })

  it('confirms deactivation, preserves stock, and reactivates without DELETE', async () => {
    items = [item()]
    await module.show()
    click('[data-manage]')
    click('[data-manage-toggle]')
    expect(root.textContent).toContain('El artículo no se elimina')
    click('#item-confirm-toggle')
    await vi.waitFor(() => expect(root.textContent).toContain('Estado del artículo actualizado.'))
    expect(patchedPayloads[0]).toMatchObject({ active: false, expectedVersion: 0 })
    expect(root.querySelector('tbody')?.textContent).toContain('INACTIVO')
    click('[data-manage-toggle]')
    click('#item-confirm-toggle')
    await vi.waitFor(() => expect(root.querySelector('tbody')?.textContent).toContain('ACTIVO'))
    expect(patchedPayloads[1]).toMatchObject({ active: true, expectedVersion: 1 })
    expect(fetchMock.mock.calls.some(([, options]) => options.method === 'DELETE')).toBe(false)
  })

  it('creates a kit and manages its BOM without stock operations', async () => {
    items = [item({ id: 'component-1', sku: 'MEM-001', name: 'Membrana', stockCurrent: '8.000' })]
    await module.show()
    click('#item-new')
    field('item-type', 'KIT')
    field('item-sku', 'KIT-001')
    field('item-name', 'Kit mantención')
    field('item-category', category.id)
    field('item-unit', wholeUnit.id)
    submit()
    await vi.waitFor(() => expect(root.textContent).toContain('Artículo creado correctamente.'))
    expect(createdPayloads.at(-1)).toMatchObject({ itemType: 'KIT', initialStock: '0' })
    expect(root.querySelector('tbody')?.textContent).toContain('KIT')
    const kitRow = [...root.querySelectorAll<HTMLTableRowElement>('tbody tr')]
      .find(row => row.textContent?.includes('KIT-001'))
    expect(kitRow).toBeTruthy()
    kitRow!.querySelector<HTMLButtonElement>('[data-manage]')!.click()
    expect(root.textContent).toContain('Administrar artículo')
    expect(root.textContent).toContain('Kit mantención')
    click('[data-manage-bom]')
    await vi.waitFor(() => expect(root.textContent).toContain('Este kit aún no tiene componentes.'))
    expect(root.textContent).toContain('no modifica las existencias')
    click('#bom-add')
    field('bom-component-0', 'component-1')
    field('bom-quantity-0', '2')
    root.querySelector('#bom-form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await vi.waitFor(() => expect(root.textContent).toContain('Composición del kit guardada.'))
    const put = fetchMock.mock.calls.find(([url, options]) => String(url).endsWith('/bom') && options.method === 'PUT')
    expect(JSON.parse(put?.[1].body as string)).toEqual({ components: [{ componentItemId: 'component-1', quantity: '2' }] })
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/receipts') || String(url).includes('/adjustments'))).toBe(false)
  })

  it('assembles a kit from administration and refreshes its stock', async () => {
    items = [
      item({ id: 'kit-assembly', sku: 'KIT-ASM', name: 'Kit mantención', itemType: 'KIT', stockCurrent: '1.000' }),
      item({ id: 'component-1', sku: 'MEM-001', name: 'Membrana', stockCurrent: '20.000' }),
    ]

    await module.show()
    click('[data-manage]')
    expect(root.textContent).toContain('Ensamblar kit')

    click('[data-manage-assembly]')
    expect(root.querySelector('#item-management-heading')).toBeNull()
    expect(root.textContent).toContain('Ensamblar kit · Kit mantención')

    field('assembly-quantity', '2')
    field('assembly-reason', 'Preparar kits de mantención')
    root.querySelector('#assembly-form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

    await vi.waitFor(() => expect(root.textContent).toContain('Kit ensamblado correctamente.'))
    expect(root.textContent).toContain('Administrar artículo')
    expect(root.textContent).toContain('3')

    const post = fetchMock.mock.calls.find(([url, options]) =>
      String(url).endsWith('/kit-assembly/assemblies') && options.method === 'POST')
    expect(post).toBeTruthy()
    expect(JSON.parse(post?.[1].body as string)).toMatchObject({
      quantity: '2',
      reason: 'Preparar kits de mantención',
    })
    expect(JSON.parse(post?.[1].body as string).requestId).toBeTruthy()
  })

  it('shows retryable load errors and ignores responses after disposal', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    await module.show()
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('No se pudo completar')
    fetchMock.mockImplementation(async (url: string) => url.endsWith('/categories') ? json([category]) : url.endsWith('/units') ? json([wholeUnit]) : json([]))
    click('#items-retry')
    await vi.waitFor(() => expect(root.textContent).toContain('No hay artículos registrados'))
    module.dispose()
  })
})
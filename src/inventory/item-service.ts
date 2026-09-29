import { apiRequest } from '../services/api.ts'

export interface InventoryCatalogOption {
  id: string
  name: string
  active: boolean
  symbol: string
  allowsDecimal?: boolean
}

export interface InventoryItem {
  id: string
  sku: string
  name: string
  description: string | null
  category: { id: string; name: string }
  unit: { id: string; name: string; symbol: string; allowsDecimal: boolean }
  stockCurrent: string | number
  stockMinimum: string | number
  referenceUnitCost: string | number
  lowStock: boolean
  active: boolean
  hasMovements: boolean
  version: number
  createdAt: string
  updatedAt: string
}

export interface InventoryItemInput {
  sku?: string
  name?: string
  description?: string | null
  categoryId?: string
  unitId?: string
  stockMinimum?: string
  referenceUnitCost?: string
  initialStock?: string
  requestId?: string
  active?: boolean
  expectedVersion?: number
}

export const listItems = (): Promise<InventoryItem[]> => apiRequest('/inventory/items')
export const getItem = (id: string): Promise<InventoryItem> => apiRequest(`/inventory/items/${encodeURIComponent(id)}`)
export const listItemCatalog = async (kind: 'categories' | 'units'): Promise<InventoryCatalogOption[]> => {
  const values = await apiRequest<Array<Omit<InventoryCatalogOption, 'symbol'> & { symbol?: string }>>(`/inventory/${kind}`)
  return values.map(value => ({ ...value, symbol: value.symbol ?? '' }))
}
export const createItem = (input: InventoryItemInput): Promise<InventoryItem> => apiRequest('/inventory/items', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
})
export const editItem = (id: string, input: InventoryItemInput): Promise<InventoryItem> => apiRequest(`/inventory/items/${encodeURIComponent(id)}`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
})
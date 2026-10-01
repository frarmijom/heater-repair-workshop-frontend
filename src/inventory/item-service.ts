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
  itemType?: 'STANDARD' | 'KIT'
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
  itemType?: 'STANDARD' | 'KIT'
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
export interface InventoryMovement {
  id: string
  itemId: string
  type: string
  direction: string
  quantity: string | number
  stockBefore: string | number
  stockAfter: string | number
  unitCostSnapshot: string | number
  requestId: string
  occurredAt: string
  actor: string
  reason: string | null
  referenceType: string | null
  referenceId: string | null
  workOrderId: string | null
  reversalOfMovementId: string | null
  skuSnapshot: string
  itemNameSnapshot: string
  unitNameSnapshot: string
  unitSymbolSnapshot: string
}

export interface InventoryReceiptInput {
  requestId: string
  quantity: string
  unitCost: string
  reason: string
}

export const receiveItemStock = (id: string, input: InventoryReceiptInput): Promise<InventoryMovement> => apiRequest(`/inventory/items/${encodeURIComponent(id)}/receipts`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
})
export const listItemMovements = (id: string): Promise<InventoryMovement[]> => apiRequest(`/inventory/items/${encodeURIComponent(id)}/movements`)

export interface InventoryAdjustmentInput {
  requestId: string
  direction: 'INCREASE' | 'DECREASE'
  quantity: string
  reason: string
}
export interface InventoryReversalInput { requestId: string; reason: string }

export const adjustItemStock = (id: string, input: InventoryAdjustmentInput): Promise<InventoryMovement> => apiRequest(`/inventory/items/${encodeURIComponent(id)}/adjustments`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
})
export const reverseInventoryMovement = (movementId: string, input: InventoryReversalInput): Promise<InventoryMovement> => apiRequest(`/inventory/items/movements/${encodeURIComponent(movementId)}/reversal`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
})


export interface InventoryKitComponent { componentItemId: string; quantity: string | number }
export interface InventoryKitBom { kitItemId: string; components: InventoryKitComponent[] }
export const getItemBom = (id: string): Promise<InventoryKitBom> => apiRequest(`/inventory/items/${encodeURIComponent(id)}/bom`)
export const replaceItemBom = (id: string, components: InventoryKitComponent[]): Promise<InventoryKitBom> => apiRequest(`/inventory/items/${encodeURIComponent(id)}/bom`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ components }),
})

export interface InventoryKitAssemblyInput {
  requestId: string
  quantity: string
  reason: string
}

export interface InventoryKitAssemblyResponse {
  assemblyId: string
  kit: InventoryItem
  movements: InventoryMovement[]
}

export const assembleInventoryKit = (
  id: string,
  input: InventoryKitAssemblyInput,
): Promise<InventoryKitAssemblyResponse> => apiRequest(`/inventory/items/${encodeURIComponent(id)}/assemblies`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
})

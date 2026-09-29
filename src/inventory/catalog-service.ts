import { apiRequest } from '../services/api.ts'
export type CatalogKind = 'categories' | 'units'
export interface CatalogEntry {
  id: string; name: string; active: boolean; version: number; createdAt: string; updatedAt: string
  symbol?: string; allowsDecimal?: boolean
}
export interface CatalogInput { name?: string; symbol?: string; allowsDecimal?: boolean; active?: boolean; expectedVersion?: number }
export const listCatalog = (kind: CatalogKind): Promise<CatalogEntry[]> => apiRequest(`/inventory/${kind}`)
export const saveCatalog = (kind: CatalogKind, input: CatalogInput, id?: string): Promise<CatalogEntry> => apiRequest(
  `/inventory/${kind}${id ? `/${encodeURIComponent(id)}` : ''}`,
  { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) },
)

import { apiRequest } from '../services/api.ts'

export interface ServiceCatalogItem {
  id: string
  code: string
  name: string
  description: string | null
  price: string | number
  active: boolean
  version: number
  createdAt: string
  updatedAt: string
}

export interface ServiceCatalogInput {
  code?: string
  name?: string
  description?: string | null
  price?: string
  active?: boolean
  expectedVersion?: number
}

export interface ServiceComponent {
  inventoryItemId: string
  quantity: string | number
}

export interface ServiceComposition {
  serviceId: string
  components: ServiceComponent[]
}

export const listServices = (): Promise<ServiceCatalogItem[]> =>
  apiRequest('/services')

export const getService = (id: string): Promise<ServiceCatalogItem> =>
  apiRequest(`/services/${encodeURIComponent(id)}`)

export const createService = (
  input: ServiceCatalogInput,
): Promise<ServiceCatalogItem> =>
  apiRequest('/services', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

export const editService = (
  id: string,
  input: ServiceCatalogInput,
): Promise<ServiceCatalogItem> =>
  apiRequest(`/services/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

export const getServiceComposition = (
  id: string,
): Promise<ServiceComposition> =>
  apiRequest(`/services/${encodeURIComponent(id)}/composition`)

export const replaceServiceComposition = (
  id: string,
  components: ServiceComponent[],
): Promise<ServiceComposition> =>
  apiRequest(`/services/${encodeURIComponent(id)}/composition`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ components }),
  })

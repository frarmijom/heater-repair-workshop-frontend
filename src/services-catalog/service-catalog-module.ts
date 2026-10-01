import {
  listServices,
  type ServiceCatalogItem,
} from './service-catalog-service.ts'

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

const formatPrice = (value: string | number): string => {
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'

  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(number)
}

const rowsHtml = (services: ServiceCatalogItem[]): string => {
  if (services.length === 0) {
    return `
      <tr>
        <td colspan="5" class="service-catalog__empty">
          Aún no hay servicios registrados.
        </td>
      </tr>
    `
  }

  return services.map(service => `
    <tr>
      <td><strong>${escapeHtml(service.code)}</strong></td>
      <td>
        <strong>${escapeHtml(service.name)}</strong>
        ${service.description
          ? `<span class="service-catalog__description">${escapeHtml(service.description)}</span>`
          : ''}
      </td>
      <td>${formatPrice(service.price)}</td>
      <td>
        <span class="service-catalog__status ${service.active ? 'is-active' : 'is-inactive'}">
          ${service.active ? 'Activo' : 'Inactivo'}
        </span>
      </td>
      <td>
        <button
          class="service-catalog__manage"
          type="button"
          data-service-id="${escapeHtml(service.id)}"
        >
          Administrar
        </button>
      </td>
    </tr>
  `).join('')
}

export interface ServiceCatalogModule {
  show(): Promise<void>
}

export function createServiceCatalogModule(root: HTMLElement): ServiceCatalogModule {
  const tableBody = root.querySelector<HTMLTableSectionElement>(
    '[data-service-catalog-body]',
  )!
  const status = root.querySelector<HTMLElement>(
    '[data-service-catalog-status]',
  )!
  const search = root.querySelector<HTMLInputElement>(
    '[data-service-catalog-search]',
  )!

  let services: ServiceCatalogItem[] = []

  const render = (): void => {
    const query = search.value.trim().toLocaleLowerCase('es-CL')

    const filtered = query === ''
      ? services
      : services.filter(service =>
          service.code.toLocaleLowerCase('es-CL').includes(query)
          || service.name.toLocaleLowerCase('es-CL').includes(query)
          || (service.description ?? '').toLocaleLowerCase('es-CL').includes(query))

    tableBody.innerHTML = rowsHtml(filtered)
    status.textContent = filtered.length === services.length
      ? `${services.length} servicio${services.length === 1 ? '' : 's'}`
      : `${filtered.length} de ${services.length} servicios`
  }

  const load = async (): Promise<void> => {
    status.textContent = 'Cargando servicios…'

    try {
      services = await listServices()
      render()
    } catch {
      services = []
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" class="service-catalog__empty">
            No fue posible cargar el catálogo de servicios.
          </td>
        </tr>
      `
      status.textContent = 'Error al cargar servicios'
    }
  }

  search.addEventListener('input', render)

  return {
    show: load,
  }
}

import {
  createService,
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

export interface ServiceCatalogModule {
  show(): Promise<void>
}

export function createServiceCatalogModule(root: HTMLElement): ServiceCatalogModule {
  let services: ServiceCatalogItem[] = []
  let loading = false
  let saving = false
  let formOpen = false
  let query = ''

  const filtered = (): ServiceCatalogItem[] => {
    const normalized = query.trim().toLocaleLowerCase('es-CL')
    if (!normalized) return services

    return services.filter(service =>
      service.code.toLocaleLowerCase('es-CL').includes(normalized)
      || service.name.toLocaleLowerCase('es-CL').includes(normalized)
      || (service.description ?? '').toLocaleLowerCase('es-CL').includes(normalized))
  }

  const rowsHtml = (): string => {
    const visible = filtered()

    if (visible.length === 0) {
      return services.length === 0
        ? `<div class="inventory-empty">
            <h2>No hay servicios registrados</h2>
            <p>Registra los servicios ofrecidos por el taller.</p>
            <button id="services-empty-create" type="button">Nuevo servicio</button>
          </div>`
        : `<div class="inventory-empty">
            <h2>Sin resultados</h2>
            <p>No hay servicios que coincidan con la búsqueda.</p>
          </div>`
    }

    return `<div class="inventory-items-table-wrap">
      <table class="inventory-items-table service-catalog-table">
        <caption class="dashboard-sr-only">Catálogo de servicios</caption>
        <thead>
          <tr>
            <th scope="col">Código</th>
            <th scope="col">Servicio</th>
            <th scope="col">Precio</th>
            <th scope="col">Estado</th>
            <th scope="col">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${visible.map(service => `
            <tr>
              <td data-label="Código"><strong>${escapeHtml(service.code)}</strong></td>
              <th scope="row" data-label="Servicio">
                ${escapeHtml(service.name)}
                ${service.description
                  ? `<span class="service-catalog-description">${escapeHtml(service.description)}</span>`
                  : ''}
              </th>
              <td data-label="Precio">${formatPrice(service.price)}</td>
              <td data-label="Estado">
                <span class="catalog-state">${service.active ? 'ACTIVO' : 'INACTIVO'}</span>
              </td>
              <td data-label="Acciones">
                <button type="button"
                  data-service-manage="${escapeHtml(service.id)}"
                  aria-label="Administrar ${escapeHtml(service.name)}">
                  Administrar
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`
  }

  const formHtml = (): string => {
    if (!formOpen) return ''

    return `<section class="work-orders-surface inventory-item-form-surface"
        aria-labelledby="service-form-heading">
      <div class="catalog-heading">
        <div>
          <h2 id="service-form-heading">Nuevo servicio</h2>
          <p>Registra un servicio y su precio de venta.</p>
        </div>
        <button id="service-form-close" type="button">Cerrar</button>
      </div>

      <form id="service-form" novalidate aria-busy="${saving}">
        <div class="inventory-item-form-grid">

          <div class="form-field">
            <label for="service-code">Código *</label>
            <input id="service-code"
              maxlength="64"
              required
              autocomplete="off"
              aria-describedby="service-code-error">
            <small id="service-code-error"></small>
          </div>

          <div class="form-field">
            <label for="service-name">Nombre *</label>
            <input id="service-name"
              maxlength="160"
              required
              aria-describedby="service-name-error">
            <small id="service-name-error"></small>
          </div>

          <div class="form-field">
            <label for="service-price">Precio *</label>
            <input id="service-price"
              type="number"
              inputmode="decimal"
              min="0"
              step="1"
              required
              aria-describedby="service-price-error">
            <small id="service-price-error">Precio de venta en CLP.</small>
          </div>

          <div class="form-field form-field--wide">
            <label for="service-description">Descripción</label>
            <textarea id="service-description"
              maxlength="1000"
              rows="3"></textarea>
          </div>

        </div>

        <div class="order-form__actions">
          <button type="submit" ${saving ? 'disabled' : ''}>
            ${saving ? 'Guardando…' : 'Crear servicio'}
          </button>
          <button id="service-form-cancel" type="button"
            ${saving ? 'disabled' : ''}>
            Cancelar
          </button>
        </div>

        <p id="service-form-error" role="alert"></p>
      </form>
    </section>`
  }

  const render = (): void => {
    const visible = filtered()

    root.innerHTML = `
      <header class="app-shell__page-header">
        <div>
          <h1 id="services-title" tabindex="-1">Servicios</h1>
          <p>Catálogo y precios de los servicios ofrecidos por el taller</p>
        </div>
        <button id="service-new" type="button"
          ${loading || saving ? 'disabled' : ''}>
          Nuevo servicio
        </button>
      </header>

      <p id="service-status" role="status">
        ${loading
          ? 'Cargando servicios…'
          : visible.length === services.length
            ? `${services.length} servicio${services.length === 1 ? '' : 's'}`
            : `${visible.length} de ${services.length} servicios`}
      </p>

      <section class="work-orders-surface inventory-items-surface"
        aria-labelledby="services-list-heading">

        <div class="catalog-heading">
          <h2 id="services-list-heading">Listado de servicios</h2>
          <button id="services-reload" type="button"
            ${loading || saving ? 'disabled' : ''}>
            Actualizar listado
          </button>
        </div>

        <form class="service-catalog-filters" id="service-filters">
          <div class="form-field">
            <label for="service-search">Buscar código, nombre o descripción</label>
            <input id="service-search"
              type="search"
              value="${escapeHtml(query)}">
          </div>
        </form>

        <div id="service-results" aria-live="polite">
          ${rowsHtml()}
        </div>
      </section>

      <div id="service-form-region">
        ${formHtml()}
      </div>
    `

    bind()
  }

  const openForm = (): void => {
    if (loading || saving) return
    formOpen = true
    render()
    root.querySelector<HTMLInputElement>('#service-code')?.focus()
  }

  const closeForm = (): void => {
    if (saving) return
    formOpen = false
    render()
    root.querySelector<HTMLButtonElement>('#service-new')?.focus()
  }

  const submitForm = async (): Promise<void> => {
    if (saving) return

    const code = root.querySelector<HTMLInputElement>('#service-code')!
    const name = root.querySelector<HTMLInputElement>('#service-name')!
    const price = root.querySelector<HTMLInputElement>('#service-price')!
    const description = root.querySelector<HTMLTextAreaElement>('#service-description')!
    const error = root.querySelector<HTMLElement>('#service-form-error')!

    error.textContent = ''

    if (!code.value.trim()) {
      root.querySelector<HTMLElement>('#service-code-error')!.textContent = 'Ingresa un código.'
      code.focus()
      return
    }

    if (!name.value.trim()) {
      root.querySelector<HTMLElement>('#service-name-error')!.textContent = 'Ingresa un nombre.'
      name.focus()
      return
    }

    const numericPrice = Number(price.value)

    if (price.value === '' || !Number.isFinite(numericPrice) || numericPrice < 0) {
      root.querySelector<HTMLElement>('#service-price-error')!.textContent =
        'Ingresa un precio válido no negativo.'
      price.focus()
      return
    }

    saving = true

    try {
      const created = await createService({
        code: code.value.trim(),
        name: name.value.trim(),
        description: description.value.trim() || null,
        price: price.value,
      })

      services = [created, ...services]
      formOpen = false
      saving = false
      render()

      const status = root.querySelector<HTMLElement>('#service-status')
      if (status) status.textContent = `Servicio ${created.name} creado correctamente.`
    } catch (cause) {
      saving = false
      error.textContent = cause instanceof Error
        ? cause.message
        : 'No fue posible crear el servicio.'

      root.querySelector('#service-form')?.setAttribute('aria-busy', 'false')
    }
  }

  const load = async (): Promise<void> => {
    loading = true
    render()

    try {
      services = await listServices()
    } catch {
      services = []
      loading = false
      render()

      const status = root.querySelector<HTMLElement>('#service-status')
      if (status) status.textContent = 'No fue posible cargar el catálogo de servicios.'
      return
    }

    loading = false
    render()
  }

  function bind(): void {
    root.querySelector<HTMLInputElement>('#service-search')
      ?.addEventListener('input', event => {
        query = (event.currentTarget as HTMLInputElement).value
        render()
        const search = root.querySelector<HTMLInputElement>('#service-search')
        search?.focus()
        search?.setSelectionRange(query.length, query.length)
      })

    root.querySelector<HTMLButtonElement>('#service-new')
      ?.addEventListener('click', openForm)

    root.querySelector<HTMLButtonElement>('#services-empty-create')
      ?.addEventListener('click', openForm)

    root.querySelector<HTMLButtonElement>('#services-reload')
      ?.addEventListener('click', () => { void load() })

    root.querySelector<HTMLButtonElement>('#service-form-close')
      ?.addEventListener('click', closeForm)

    root.querySelector<HTMLButtonElement>('#service-form-cancel')
      ?.addEventListener('click', closeForm)

    root.querySelector<HTMLFormElement>('#service-form')
      ?.addEventListener('submit', event => {
        event.preventDefault()
        void submitForm()
      })
  }

  render()

  return {
    show: load,
  }
}

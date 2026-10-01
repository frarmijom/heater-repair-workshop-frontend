import {
  createService,
  editService,
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
  let editing: ServiceCatalogItem | undefined
  let managing: ServiceCatalogItem | undefined
  let confirming: ServiceCatalogItem | undefined
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

  const managementHtml = (): string => {
    if (!managing || formOpen) return ''

    const service = services.find(current => current.id === managing?.id) ?? managing

    return `<section class="work-orders-surface inventory-item-management"
        aria-labelledby="service-management-heading">
      <div class="catalog-heading">
        <div>
          <p class="inventory-management-kicker">Administrar servicio</p>
          <h2 id="service-management-heading">${escapeHtml(service.name)}</h2>
          <p>${escapeHtml(service.code)}</p>
        </div>

        <div class="inventory-management-heading-actions">
          <span class="catalog-state">${service.active ? 'ACTIVO' : 'INACTIVO'}</span>
          <button id="service-management-close" type="button">Cerrar</button>
        </div>
      </div>

      <div class="inventory-management-summary">
        <dl class="inventory-management-details">
          <div>
            <dt>Precio</dt>
            <dd>${formatPrice(service.price)}</dd>
          </div>
          <div>
            <dt>Descripción</dt>
            <dd>${service.description ? escapeHtml(service.description) : '—'}</dd>
          </div>
        </dl>
      </div>

      <div class="inventory-management-section">
        <h3>Administración</h3>
        <div class="catalog-row-actions">
          <button type="button"
            data-service-edit="${escapeHtml(service.id)}"
            ${saving ? 'disabled' : ''}>
            Editar servicio
          </button>
        </div>
      </div>

      <div class="inventory-management-section inventory-management-state">
        <div>
          <h3>Estado</h3>
          <p>
            ${service.active
              ? 'El servicio está disponible para nuevas órdenes de trabajo.'
              : 'El servicio está inactivo y se conserva en el catálogo.'}
          </p>
        </div>

        <button type="button"
          data-service-toggle="${escapeHtml(service.id)}"
          ${saving ? 'disabled' : ''}>
          ${service.active ? 'Desactivar servicio' : 'Reactivar servicio'}
        </button>
      </div>
    </section>`
  }

  const confirmationHtml = (): string => {
    if (!confirming) return ''

    const nextActive = !confirming.active

    return `<section class="work-orders-surface inventory-item-form-surface"
        aria-labelledby="service-confirm-title">
      <h2 id="service-confirm-title">
        ${nextActive ? '¿Reactivar' : '¿Desactivar'} ${escapeHtml(confirming.name)}?
      </h2>

      <p>
        ${nextActive
          ? 'El servicio volverá a estar disponible para nuevas órdenes de trabajo.'
          : 'El servicio no se elimina y permanecerá registrado en el catálogo.'}
      </p>

      <div class="catalog-row-actions">
        <button id="service-confirm-toggle" type="button" ${saving ? 'disabled' : ''}>
          ${nextActive ? 'Reactivar servicio' : 'Desactivar servicio'}
        </button>
        <button id="service-cancel-toggle" type="button" ${saving ? 'disabled' : ''}>
          Cancelar
        </button>
      </div>

      <p id="service-confirm-error" role="alert"></p>
    </section>`
  }

  const formHtml = (): string => {
    if (!formOpen) return ''

    return `<section class="work-orders-surface inventory-item-form-surface"
        aria-labelledby="service-form-heading">
      <div class="catalog-heading">
        <div>
          <h2 id="service-form-heading">${editing ? 'Editar servicio' : 'Nuevo servicio'}</h2>
          <p>${editing
            ? 'Actualiza los datos comerciales del servicio.'
            : 'Registra un servicio y su precio de venta.'}</p>
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
              value="${escapeHtml(editing?.code ?? '')}"
              aria-describedby="service-code-error">
            <small id="service-code-error"></small>
          </div>

          <div class="form-field">
            <label for="service-name">Nombre *</label>
            <input id="service-name"
              maxlength="160"
              required
              value="${escapeHtml(editing?.name ?? '')}"
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
              value="${escapeHtml(String(editing?.price ?? ''))}"
              aria-describedby="service-price-error">
            <small id="service-price-error">Precio de venta en CLP.</small>
          </div>

          <div class="form-field form-field--wide">
            <label for="service-description">Descripción</label>
            <textarea id="service-description"
              maxlength="1000"
              rows="3">${escapeHtml(editing?.description ?? '')}</textarea>
          </div>

        </div>

        <div class="order-form__actions">
          <button type="submit" ${saving ? 'disabled' : ''}>
            ${saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear servicio'}
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

      <div id="service-management-region">
        ${managementHtml()}
      </div>

      <div id="service-confirmation-region">
        ${confirmationHtml()}
      </div>

      <div id="service-form-region">
        ${formHtml()}
      </div>
    `

    bind()
  }

  const openForm = (): void => {
    if (loading || saving) return
    editing = undefined
    managing = undefined
    confirming = undefined
    formOpen = true
    render()
    root.querySelector<HTMLInputElement>('#service-code')?.focus()
  }

  const closeForm = (): void => {
    if (saving) return
    editing = undefined
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
      const payload = {
        code: code.value.trim(),
        name: name.value.trim(),
        description: description.value.trim() || null,
        price: price.value,
        ...(editing ? { expectedVersion: editing.version } : {}),
      }

      const saved = editing
        ? await editService(editing.id, payload)
        : await createService(payload)

      services = editing
        ? services.map(service => service.id === saved.id ? saved : service)
        : [saved, ...services]

      const wasEditing = Boolean(editing)
      managing = wasEditing ? saved : undefined
      editing = undefined
      formOpen = false
      saving = false
      render()

      const status = root.querySelector<HTMLElement>('#service-status')
      if (status) {
        status.textContent = wasEditing
          ? `Servicio ${saved.name} actualizado correctamente.`
          : `Servicio ${saved.name} creado correctamente.`
      }
    } catch (cause) {
      saving = false
      error.textContent = cause instanceof Error
        ? cause.message
        : editing
          ? 'No fue posible actualizar el servicio.'
          : 'No fue posible crear el servicio.'

      root.querySelector('#service-form')?.setAttribute('aria-busy', 'false')
    }
  }

  const toggleService = async (): Promise<void> => {
    if (!confirming || saving) return

    const target = confirming
    const nextActive = !target.active
    saving = true

    const error = root.querySelector<HTMLElement>('#service-confirm-error')
    if (error) error.textContent = ''

    try {
      const saved = await editService(target.id, {
        active: nextActive,
        expectedVersion: target.version,
      })

      services = services.map(service =>
        service.id === saved.id ? saved : service)

      managing = saved
      confirming = undefined
      saving = false
      render()

      const status = root.querySelector<HTMLElement>('#service-status')
      if (status) {
        status.textContent = nextActive
          ? `Servicio ${saved.name} reactivado correctamente.`
          : `Servicio ${saved.name} desactivado correctamente.`
      }
    } catch (cause) {
      saving = false
      render()

      const currentError = root.querySelector<HTMLElement>('#service-confirm-error')
      if (currentError) {
        currentError.textContent = cause instanceof Error
          ? cause.message
          : 'No fue posible actualizar el estado del servicio.'
      }
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

    root.querySelectorAll<HTMLButtonElement>('[data-service-manage]')
      .forEach(button => button.addEventListener('click', () => {
        managing = services.find(service => service.id === button.dataset.serviceManage)
        editing = undefined
        confirming = undefined
        formOpen = false
        render()
        root.querySelector<HTMLElement>('#service-management-heading')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }))

    root.querySelector<HTMLButtonElement>('#service-management-close')
      ?.addEventListener('click', () => {
        managing = undefined
        confirming = undefined
        render()
      })

    root.querySelector<HTMLButtonElement>('[data-service-edit]')
      ?.addEventListener('click', button => {
        const id = (button.currentTarget as HTMLButtonElement).dataset.serviceEdit
        editing = services.find(service => service.id === id)
        managing = undefined
        confirming = undefined
        formOpen = Boolean(editing)
        render()
        root.querySelector<HTMLInputElement>('#service-code')?.focus()
      })

    root.querySelector<HTMLButtonElement>('[data-service-toggle]')
      ?.addEventListener('click', button => {
        const id = (button.currentTarget as HTMLButtonElement).dataset.serviceToggle
        confirming = services.find(service => service.id === id)
        render()
        root.querySelector<HTMLButtonElement>('#service-confirm-toggle')?.focus()
      })

    root.querySelector<HTMLButtonElement>('#service-cancel-toggle')
      ?.addEventListener('click', () => {
        confirming = undefined
        render()
      })

    root.querySelector<HTMLButtonElement>('#service-confirm-toggle')
      ?.addEventListener('click', () => {
        void toggleService()
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

import { escapeHtml } from '../components/work-order-card.ts'
import { ApiRequestError, SessionExpiredError } from '../services/api.ts'
import { adjustItemStock, assembleInventoryKit, createItem, editItem, getItemBom, listItemCatalog, listItems, listItemMovements, receiveItemStock, replaceItemBom, reverseInventoryMovement, type InventoryCatalogOption, type InventoryItem, type InventoryItemInput, type InventoryKitComponent, type InventoryMovement } from './item-service.ts'

type ItemFilters = { query: string; state: 'all' | 'active' | 'inactive'; category: string; lowStock: boolean }

export function createInventoryItemModule(root: HTMLElement) {
  let generation = 0
  let disposed = false
  let saving = false
  let loading = false
  let creationRequestId = ''
  let items: InventoryItem[] = []
  let categories: InventoryCatalogOption[] = []
  let units: InventoryCatalogOption[] = []
  let editing: InventoryItem | undefined
  let formOpen = false
  let confirming: InventoryItem | undefined
  let managing: InventoryItem | undefined
  let operating: InventoryItem | undefined
  let movementHistory: InventoryMovement[] = []
  let operationMode: 'receipt' | 'adjustment' | 'assembly' | 'history' | undefined
  let receiptRequestId = ''
  let adjustmentRequestId = ''
  let assemblyRequestId = ''
  let reversing: InventoryMovement | undefined
  let bomEditing: InventoryItem | undefined
  let bomComponents: InventoryKitComponent[] = []
  let reversalRequestId = ''
  let message = ''
  let error = ''
  let filters: ItemFilters = { query: '', state: 'all', category: 'all', lowStock: false }

  const valid = (current: number) => !disposed && current === generation && root.isConnected
    && (!window.location.hash || window.location.hash === '#inventory' || window.location.hash === '#inventory/items')
  const errorText = (reason: unknown) => reason instanceof ApiRequestError && reason.status === 409
    ? `Conflicto: ${reason.message}` : reason instanceof Error ? reason.message : 'No se pudo completar la solicitud.'
  const decimalPlaces = (value: string) => value.includes('.') ? value.length - value.indexOf('.') - 1 : 0
  const decimalValid = (value: string, scale: number) => /^\d+(\.\d+)?$/.test(value) && decimalPlaces(value) <= scale
  const isZero = (value: string) => /^0+(\.0+)?$/.test(value)
  const filtered = () => items.filter(item => {
    const matchesText = `${item.sku} ${item.name}`.toLocaleLowerCase().includes(filters.query.toLocaleLowerCase())
    const matchesState = filters.state === 'all' || item.active === (filters.state === 'active')
    const matchesCategory = filters.category === 'all' || item.category.id === filters.category
    return matchesText && matchesState && matchesCategory && (!filters.lowStock || item.lowStock)
  })

  function nav() {
    return `<nav class="catalog-tabs" aria-label="Inventario"><a href="#inventory/items" aria-current="page">Artículos</a><a href="#inventory/categories">Categorías</a><a href="#inventory/units">Unidades de medida</a></nav>`
  }

  function managementHtml() {
    if (!managing || operating || bomEditing || formOpen) return ''

    const item = items.find(current => current.id === managing?.id) ?? managing

    return `<section class="work-orders-surface inventory-item-management" aria-labelledby="item-management-heading">
      <div class="catalog-heading">
        <div>
          <p class="inventory-management-kicker">Administrar artículo</p>
          <h2 id="item-management-heading">${escapeHtml(item.name)}</h2>
          <p>${escapeHtml(item.sku)} · ${item.itemType === 'KIT' ? 'KIT' : 'ARTÍCULO'}</p>
        </div>

        <div class="inventory-management-heading-actions">
          <span class="catalog-state">${item.active ? 'ACTIVO' : 'INACTIVO'}</span>
          <button id="item-management-close" type="button">Cerrar</button>
        </div>
      </div>

      <div class="inventory-management-summary">
        <div class="inventory-management-stock">
          <span>Stock actual</span>
          <strong>${escapeHtml(String(item.stockCurrent))} ${escapeHtml(item.unit.symbol)}</strong>
          ${item.lowStock ? '<span class="inventory-low-stock" role="status">Stock bajo</span>' : ''}
        </div>

        <dl class="inventory-management-details">
          <div>
            <dt>Categoría</dt>
            <dd>${escapeHtml(item.category.name)}</dd>
          </div>
          <div>
            <dt>Unidad</dt>
            <dd>${escapeHtml(item.unit.name)} (${escapeHtml(item.unit.symbol)})</dd>
          </div>
          <div>
            <dt>Stock mínimo</dt>
            <dd>${escapeHtml(String(item.stockMinimum))}</dd>
          </div>
          <div>
            <dt>Costo referencia</dt>
            <dd>${escapeHtml(String(item.referenceUnitCost))}</dd>
          </div>
        </dl>
      </div>

      <div class="inventory-management-section">
        <h3>Operaciones</h3>

        <div class="catalog-row-actions">
          <button
            type="button"
            data-manage-receipt="${escapeHtml(item.id)}"
            ${!item.active || saving ? 'disabled' : ''}>
            Registrar entrada
          </button>

          <button
            type="button"
            data-manage-adjust="${escapeHtml(item.id)}"
            ${!item.active || saving ? 'disabled' : ''}>
            Ajustar stock
          </button>

          <button
            type="button"
            data-manage-history="${escapeHtml(item.id)}">
            Ver historial
          </button>

          ${item.itemType === 'KIT'
            ? `<button type="button" data-manage-assembly="${escapeHtml(item.id)}" ${!item.active || saving ? 'disabled' : ''}>
                Ensamblar kit
              </button>
              <button type="button" data-manage-bom="${escapeHtml(item.id)}">
                Administrar composición
              </button>`
            : ''}

          <button
            type="button"
            data-manage-edit="${escapeHtml(item.id)}"
            ${saving ? 'disabled' : ''}>
            Editar artículo
          </button>
        </div>
      </div>

      <div class="inventory-management-section inventory-management-state">
        <div>
          <h3>Estado</h3>
          <p>
            ${item.active
              ? 'El artículo está disponible para operaciones de inventario.'
              : 'El artículo está inactivo; su stock e historial se conservan.'}
          </p>
        </div>

        <button
          type="button"
          data-manage-toggle="${escapeHtml(item.id)}"
          ${saving ? 'disabled' : ''}>
          ${item.active ? 'Desactivar artículo' : 'Reactivar artículo'}
        </button>
      </div>
    </section>`
  }

  function renderRows() {
    const target = root.querySelector<HTMLElement>('#inventory-item-results')
    if (!target) return
    const visible = filtered()
    if (loading) { target.innerHTML = '<p role="status">Cargando artículos…</p>'; return }
    if (error) { target.innerHTML = `<p role="alert">${escapeHtml(error)}</p><button id="items-retry" type="button">Reintentar</button>`; target.querySelector('#items-retry')?.addEventListener('click', () => { void load() }); return }
    if (visible.length === 0) {
      target.innerHTML = items.length === 0
        ? '<div class="inventory-empty"><h2>No hay artículos registrados</h2><p>Registra el inventario disponible del taller.</p><button id="items-empty-create" type="button">Nuevo artículo</button></div>'
        : '<p>No hay artículos que coincidan con los filtros.</p>'
      target.querySelector('#items-empty-create')?.addEventListener('click', () => openForm())
      return
    }
    target.innerHTML = `<div class="inventory-items-table-wrap"><table class="inventory-items-table"><caption class="dashboard-sr-only">Artículos del inventario</caption><thead><tr><th scope="col">SKU</th><th scope="col">Artículo</th><th scope="col">Tipo</th><th scope="col">Categoría</th><th scope="col">Unidad</th><th scope="col">Stock actual</th><th scope="col">Stock mínimo</th><th scope="col">Costo referencia</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead><tbody>${visible.map(item => `<tr><td data-label="SKU"><strong>${escapeHtml(item.sku)}</strong></td><th scope="row" data-label="Artículo">${escapeHtml(item.name)}${item.lowStock ? '<span class="inventory-low-stock" role="status">Stock bajo</span>' : ''}</th><td data-label="Tipo"><span class="catalog-state">${item.itemType === 'KIT' ? 'KIT' : 'ARTÍCULO'}</span></td><td data-label="Categoría">${escapeHtml(item.category.name)}</td><td data-label="Unidad">${escapeHtml(item.unit.name)} (${escapeHtml(item.unit.symbol)})</td><td data-label="Stock actual">${escapeHtml(String(item.stockCurrent))}</td><td data-label="Stock mínimo">${escapeHtml(String(item.stockMinimum))}</td><td data-label="Costo referencia">${escapeHtml(String(item.referenceUnitCost))}</td><td data-label="Estado"><span class="catalog-state">${item.active ? 'ACTIVO' : 'INACTIVO'}</span></td><td data-label="Acciones"><button type="button" data-manage="${escapeHtml(item.id)}" aria-label="Administrar ${escapeHtml(item.name)}">Administrar</button></td></tr>`).join('')}</tbody></table></div>`
    target.querySelectorAll<HTMLButtonElement>('[data-manage]').forEach(button => button.addEventListener('click', () => {
      managing = items.find(item => item.id === button.dataset.manage)
      operating = undefined
      operationMode = undefined
      movementHistory = []
      reversing = undefined
      bomEditing = undefined
      bomComponents = []
      editing = undefined
      formOpen = false
      confirming = undefined

      render()

      root.querySelector<HTMLElement>('#item-management-heading')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      })
    }))

    target.querySelectorAll<HTMLButtonElement>('[data-receipt]').forEach(button => button.addEventListener('click', () => {
      operating = items.find(item => item.id === button.dataset.receipt)
      operationMode = 'receipt'; receiptRequestId = ''; movementHistory = []; render()
      root.querySelector<HTMLInputElement>('#receipt-quantity')?.focus()
    }))
    target.querySelectorAll<HTMLButtonElement>('[data-adjust]').forEach(button => button.addEventListener('click', () => {
      operating = items.find(item => item.id === button.dataset.adjust)
      operationMode = 'adjustment'; adjustmentRequestId = ''; movementHistory = []; reversing = undefined; render()
      root.querySelector<HTMLInputElement>('#adjustment-quantity')?.focus()
    }))
    target.querySelectorAll<HTMLButtonElement>('[data-history]').forEach(button => button.addEventListener('click', () => {
      const item = items.find(value => value.id === button.dataset.history)
      if (item) void openHistory(item)
    }))
    target.querySelectorAll<HTMLButtonElement>('[data-bom]').forEach(button => button.addEventListener('click', () => {
      const item = items.find(value => value.id === button.dataset.bom)
      if (item) void openBom(item)
    }))
    target.querySelectorAll<HTMLButtonElement>('[data-edit]').forEach(button => button.addEventListener('click', () => {
      editing = items.find(item => item.id === button.dataset.edit)
      formOpen = true
      confirming = undefined
      render()
      root.querySelector<HTMLInputElement>('#item-sku')?.focus()
    }))
    target.querySelectorAll<HTMLButtonElement>('[data-toggle]').forEach(button => button.addEventListener('click', () => {
      confirming = items.find(item => item.id === button.dataset.toggle)
      renderConfirmation()
    }))
  }

  function renderConfirmation() {
    const area = root.querySelector<HTMLElement>('#item-confirmation')!
    if (!confirming) { area.innerHTML = ''; return }
    const nextActive = !confirming.active
    area.innerHTML = `<section class="work-orders-surface" aria-labelledby="item-confirm-title"><h2 id="item-confirm-title">${nextActive ? '¿Reactivar' : '¿Desactivar'} ${escapeHtml(confirming.name)}?</h2><p>${nextActive ? 'El artículo volverá a estar disponible para operaciones futuras.' : 'El artículo no se elimina; su stock y su historial se conservan.'}</p><div class="catalog-row-actions"><button id="item-confirm-toggle" type="button">${nextActive ? 'Reactivar artículo' : 'Desactivar artículo'}</button><button id="item-cancel-toggle" type="button">Cancelar</button></div><p id="item-confirm-error" role="alert"></p></section>`
    area.querySelector<HTMLButtonElement>('#item-confirm-toggle')!.addEventListener('click', () => {
      if (confirming) void save({ active: nextActive, expectedVersion: confirming.version }, confirming, true)
    })
    area.querySelector<HTMLButtonElement>('#item-cancel-toggle')!.addEventListener('click', () => { confirming = undefined; renderConfirmation() })
    area.querySelector<HTMLButtonElement>('#item-confirm-toggle')!.focus()
  }

  function render() {
    root.innerHTML = `<header class="app-shell__page-header"><div><h1 id="inventory-title" tabindex="-1">Artículos</h1><p>Existencias y datos de inventario del taller</p></div><button id="item-new" type="button" ${saving || loading ? 'disabled' : ''}>Nuevo artículo</button></header>${nav()}<p id="item-status" role="status">${escapeHtml(message)}</p><section class="work-orders-surface inventory-items-surface" aria-labelledby="items-heading"><div class="catalog-heading"><h2 id="items-heading">Listado de artículos</h2><button id="items-reload" type="button" ${saving || loading ? 'disabled' : ''}>Actualizar listado</button></div><form id="item-filters" class="inventory-item-filters"><div class="form-field"><label for="item-search">Buscar SKU o nombre</label><input id="item-search" type="search" value="${escapeHtml(filters.query)}"></div><div class="form-field"><label for="item-state">Estado</label><select id="item-state"><option value="all" ${filters.state === 'all' ? 'selected' : ''}>Todos</option><option value="active" ${filters.state === 'active' ? 'selected' : ''}>Activos</option><option value="inactive" ${filters.state === 'inactive' ? 'selected' : ''}>Inactivos</option></select></div><div class="form-field"><label for="item-category-filter">Categoría</label><select id="item-category-filter"><option value="all">Todas</option>${categories.map(category => `<option value="${escapeHtml(category.id)}" ${filters.category === category.id ? 'selected' : ''}>${escapeHtml(category.name)}</option>`).join('')}</select></div><label class="inventory-low-filter"><input id="item-low-stock" type="checkbox" ${filters.lowStock ? 'checked' : ''}> Solo stock bajo</label></form><div id="inventory-item-results" aria-live="polite"></div></section><div id="item-management-region">${managementHtml()}</div><div id="item-confirmation"></div><div id="item-operation-region">${operationHtml()}</div><div id="item-bom-region">${bomHtml()}</div><div id="item-form-region">${formHtml()}</div>`
    root.querySelector<HTMLButtonElement>('#item-new')!.addEventListener('click', () => openForm())
    root.querySelector<HTMLButtonElement>('#items-reload')!.addEventListener('click', () => { void load() })
    root.querySelector<HTMLInputElement>('#item-search')!.addEventListener('input', event => { filters.query = (event.currentTarget as HTMLInputElement).value; renderRows() })
    root.querySelector<HTMLSelectElement>('#item-state')!.addEventListener('change', event => { filters.state = (event.currentTarget as HTMLSelectElement).value as ItemFilters['state']; renderRows() })
    root.querySelector<HTMLSelectElement>('#item-category-filter')!.addEventListener('change', event => { filters.category = (event.currentTarget as HTMLSelectElement).value; renderRows() })
    root.querySelector<HTMLInputElement>('#item-low-stock')!.addEventListener('change', event => { filters.lowStock = (event.currentTarget as HTMLInputElement).checked; renderRows() })
    root.querySelector<HTMLFormElement>('#item-form')?.addEventListener('submit', event => { event.preventDefault(); void submitForm() })
    root.querySelector<HTMLFormElement>('#item-form')?.addEventListener('input', () => { if (!editing) creationRequestId = '' })
    root.querySelector<HTMLButtonElement>('#item-cancel')?.addEventListener('click', () => { editing = undefined; formOpen = false; render(); root.querySelector<HTMLButtonElement>('#item-new')?.focus() })
    root.querySelector<HTMLSelectElement>('#item-unit')?.addEventListener('change', event => {
      const selected = units.find(option => option.id === (event.currentTarget as HTMLSelectElement).value)
      const initial = root.querySelector<HTMLInputElement>('#item-initial-stock')
      if (initial) initial.step = selected?.allowsDecimal ? '0.001' : '1'
    })
    root.querySelector<HTMLButtonElement>('#bom-add')?.addEventListener('click', () => { bomComponents.push({ componentItemId: '', quantity: '1' }); render(); root.querySelector<HTMLSelectElement>('[data-bom-component]:last-of-type')?.focus() })
    root.querySelectorAll<HTMLButtonElement>('[data-bom-remove]').forEach(button => button.addEventListener('click', () => { bomComponents.splice(Number(button.dataset.bomRemove), 1); render() }))
    root.querySelector<HTMLButtonElement>('#bom-close')?.addEventListener('click', () => { bomEditing = undefined; bomComponents = []; render() })
    root.querySelector<HTMLFormElement>('#bom-form')?.addEventListener('submit', event => { event.preventDefault(); void submitBom() })
    root.querySelector<HTMLFormElement>('#receipt-form')?.addEventListener('submit', event => { event.preventDefault(); void submitReceipt() })
    root.querySelector<HTMLFormElement>('#receipt-form')?.addEventListener('input', () => { receiptRequestId = '' })
    root.querySelector<HTMLFormElement>('#adjustment-form')?.addEventListener('submit', event => { event.preventDefault(); void submitAdjustment() })
    root.querySelector<HTMLFormElement>('#adjustment-form')?.addEventListener('input', () => { adjustmentRequestId = '' })
    root.querySelector<HTMLFormElement>('#assembly-form')?.addEventListener('submit', event => { event.preventDefault(); void submitAssembly() })
    root.querySelector<HTMLFormElement>('#assembly-form')?.addEventListener('input', () => { assemblyRequestId = '' })
    root.querySelector<HTMLFormElement>('#reversal-form')?.addEventListener('submit', event => { event.preventDefault(); void submitReversal() })
    root.querySelector<HTMLFormElement>('#reversal-form')?.addEventListener('input', () => { reversalRequestId = '' })
    root.querySelector<HTMLButtonElement>('#reversal-cancel')?.addEventListener('click', () => { reversing = undefined; reversalRequestId = ''; render() })
    root.querySelectorAll<HTMLButtonElement>('[data-reverse]').forEach(button => button.addEventListener('click', () => {
      reversing = movementHistory.find(movement => movement.id === button.dataset.reverse)
      reversalRequestId = ''; render(); root.querySelector<HTMLInputElement>('#reversal-reason')?.focus()
    }))
    root.querySelector<HTMLButtonElement>('#operation-close')?.addEventListener('click', () => { operating = undefined; operationMode = undefined; movementHistory = []; reversing = undefined; render() })
    renderRows()

    root.querySelector<HTMLButtonElement>('#item-management-close')?.addEventListener('click', () => {
      managing = undefined
      operating = undefined
      operationMode = undefined
      movementHistory = []
      reversing = undefined

      render()

      root.querySelector<HTMLButtonElement>('[data-manage]')?.focus()
    })

    root.querySelector<HTMLButtonElement>('[data-manage-receipt]')?.addEventListener('click', button => {
      const id = (button.currentTarget as HTMLButtonElement).dataset.manageReceipt
      managing = undefined
      operating = items.find(item => item.id === id)
      operationMode = 'receipt'
      receiptRequestId = ''
      movementHistory = []
      render()
      root.querySelector<HTMLInputElement>('#receipt-quantity')?.focus()
    })

    root.querySelector<HTMLButtonElement>('[data-manage-adjust]')?.addEventListener('click', button => {
      const id = (button.currentTarget as HTMLButtonElement).dataset.manageAdjust
      managing = undefined
      operating = items.find(item => item.id === id)
      operationMode = 'adjustment'
      adjustmentRequestId = ''
      movementHistory = []
      reversing = undefined
      render()
      root.querySelector<HTMLInputElement>('#adjustment-quantity')?.focus()
    })

    root.querySelector<HTMLButtonElement>('[data-manage-assembly]')?.addEventListener('click', button => {
      const id = (button.currentTarget as HTMLButtonElement).dataset.manageAssembly
      managing = undefined
      operating = items.find(item => item.id === id)
      operationMode = 'assembly'
      assemblyRequestId = ''
      movementHistory = []
      reversing = undefined
      render()
      root.querySelector<HTMLInputElement>('#assembly-quantity')?.focus()
    })

    root.querySelector<HTMLButtonElement>('[data-manage-history]')?.addEventListener('click', button => {
      const id = (button.currentTarget as HTMLButtonElement).dataset.manageHistory
      const item = items.find(current => current.id === id)
      managing = undefined
      if (item) void openHistory(item)
    })

    root.querySelector<HTMLButtonElement>('[data-manage-bom]')?.addEventListener('click', button => {
      const id = (button.currentTarget as HTMLButtonElement).dataset.manageBom
      const item = items.find(current => current.id === id)
      managing = undefined
      if (item) void openBom(item)
    })

    root.querySelector<HTMLButtonElement>('[data-manage-edit]')?.addEventListener('click', button => {
      const id = (button.currentTarget as HTMLButtonElement).dataset.manageEdit
      editing = items.find(item => item.id === id)
      formOpen = true
      confirming = undefined
      render()
      root.querySelector<HTMLInputElement>('#item-sku')?.focus()
    })

    root.querySelector<HTMLButtonElement>('[data-manage-toggle]')?.addEventListener('click', button => {
      const id = (button.currentTarget as HTMLButtonElement).dataset.manageToggle
      confirming = items.find(item => item.id === id)
      renderConfirmation()
    })

    renderConfirmation()
  }

  function bomHtml() {
    if (!bomEditing) return ''
    const candidates = items.filter(item => item.active && item.id !== bomEditing?.id && item.itemType !== 'KIT')
    const rows = bomComponents.map((component, index) => `<div class="inventory-bom-row">
      <div class="form-field"><label for="bom-component-${index}">Componente ${index + 1}</label><select id="bom-component-${index}" data-bom-component="${index}" required><option value="">Selecciona un artículo</option>${candidates.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === component.componentItemId ? 'selected' : ''}>${escapeHtml(item.sku)} · ${escapeHtml(item.name)}</option>`).join('')}</select></div>
      <div class="form-field"><label for="bom-quantity-${index}">Cantidad</label><input id="bom-quantity-${index}" data-bom-quantity="${index}" type="number" min="0.001" step="0.001" value="${escapeHtml(String(component.quantity))}" required></div>
      <button type="button" data-bom-remove="${index}" aria-label="Quitar componente ${index + 1}">Quitar</button>
    </div>`).join('')
    return `<section class="work-orders-surface inventory-item-form-surface inventory-bom-surface" aria-labelledby="bom-heading"><div class="catalog-heading"><div><h2 id="bom-heading">Composición · ${escapeHtml(bomEditing.name)}</h2><p>${escapeHtml(bomEditing.sku)} · Define los artículos y cantidades que componen este kit.</p></div><button id="bom-close" type="button">Cerrar</button></div><p class="inventory-operation-note">Guardar la composición no modifica las existencias. Los movimientos de stock se registran por separado.</p><form id="bom-form" novalidate>${rows || '<p class="inventory-bom-empty">Este kit aún no tiene componentes.</p>'}<div class="order-form__actions"><button id="bom-add" type="button">Agregar componente</button><button type="submit" ${saving ? 'disabled' : ''}>${saving ? 'Guardando…' : 'Guardar composición'}</button></div><p id="bom-error" role="alert"></p></form></section>`
  }

  async function openBom(item: InventoryItem) {
    bomEditing = item; bomComponents = []; render()
    try {
      const bom = await getItemBom(item.id)
      if (!bomEditing || bomEditing.id !== item.id) return
      bomComponents = bom.components.map(component => ({ ...component, quantity: String(component.quantity) }))
      render()
    } catch (reason) {
      if (!(reason instanceof SessionExpiredError)) { message = errorText(reason); bomEditing = undefined; render() }
    }
  }

  async function submitBom() {
    if (!bomEditing || saving) return
    const components = [...root.querySelectorAll<HTMLSelectElement>('[data-bom-component]')].map((select, index) => ({
      componentItemId: select.value,
      quantity: root.querySelector<HTMLInputElement>(`[data-bom-quantity="${index}"]`)!.value,
    }))
    const duplicate = components.some((component, index) => component.componentItemId && components.findIndex(value => value.componentItemId === component.componentItemId) !== index)
    const invalid = components.some(component => !component.componentItemId || !decimalValid(String(component.quantity), 3) || Number(component.quantity) <= 0)
    if (duplicate || invalid) { root.querySelector<HTMLElement>('#bom-error')!.textContent = duplicate ? 'Un componente no puede repetirse en el kit.' : 'Selecciona cada componente e ingresa una cantidad válida mayor que cero.'; return }
    saving = true
    try {
      const saved = await replaceItemBom(bomEditing.id, components)
      bomComponents = saved.components.map(component => ({ ...component, quantity: String(component.quantity) }))
      message = 'Composición del kit guardada.'; saving = false; render()
    } catch (reason) {
      saving = false
      if (!(reason instanceof SessionExpiredError)) { render(); root.querySelector<HTMLElement>('#bom-error')!.textContent = errorText(reason) }
    }
  }

  function operationHtml() {
    if (!operating || !operationMode) return ''
    if (operationMode === 'receipt') return `<section class="work-orders-surface inventory-item-form-surface" aria-labelledby="receipt-heading"><div class="catalog-heading"><div><h2 id="receipt-heading">Registrar entrada · ${escapeHtml(operating.name)}</h2><p>Stock actual: <strong>${escapeHtml(String(operating.stockCurrent))} ${escapeHtml(operating.unit.symbol)}</strong></p></div><button id="operation-close" type="button">Cerrar</button></div><form id="receipt-form" novalidate><div class="inventory-item-form-grid"><div class="form-field"><label for="receipt-quantity">Cantidad *</label><input id="receipt-quantity" type="number" min="0" step="${operating.unit.allowsDecimal ? '0.001' : '1'}" required><small id="receipt-quantity-error"></small></div><div class="form-field"><label for="receipt-cost">Costo unitario *</label><input id="receipt-cost" type="number" min="0" step="0.0001" value="${escapeHtml(String(operating.referenceUnitCost))}" required><small id="receipt-cost-error"></small></div><div class="form-field"><label for="receipt-reason">Motivo *</label><input id="receipt-reason" maxlength="1000" value="Reposición de stock" required><small id="receipt-reason-error"></small></div></div><div class="order-form__actions"><button type="submit" ${saving ? 'disabled' : ''}>${saving ? 'Registrando…' : 'Registrar entrada'}</button></div><p id="receipt-error" role="alert"></p></form></section>`
    if (operationMode === 'adjustment') return `<section class="work-orders-surface inventory-item-form-surface" aria-labelledby="adjustment-heading"><div class="catalog-heading"><div><h2 id="adjustment-heading">Ajustar stock · ${escapeHtml(operating.name)}</h2><p>Stock actual: <strong>${escapeHtml(String(operating.stockCurrent))} ${escapeHtml(operating.unit.symbol)}</strong></p></div><button id="operation-close" type="button">Cerrar</button></div><form id="adjustment-form" novalidate><div class="inventory-item-form-grid"><div class="form-field"><label for="adjustment-direction">Tipo de ajuste *</label><select id="adjustment-direction"><option value="INCREASE">Aumentar stock</option><option value="DECREASE">Disminuir stock</option></select></div><div class="form-field"><label for="adjustment-quantity">Cantidad *</label><input id="adjustment-quantity" type="number" min="0" step="${operating.unit.allowsDecimal ? '0.001' : '1'}" required><small id="adjustment-quantity-error"></small></div><div class="form-field"><label for="adjustment-reason">Motivo *</label><input id="adjustment-reason" maxlength="1000" required><small id="adjustment-reason-error"></small></div></div><p class="inventory-operation-note">El ajuste quedará registrado en el historial. El stock no se edita directamente.</p><div class="order-form__actions"><button type="submit" ${saving ? 'disabled' : ''}>${saving ? 'Aplicando…' : 'Aplicar ajuste'}</button></div><p id="adjustment-error" role="alert"></p></form></section>`
    if (operationMode === 'assembly') return `<section class="work-orders-surface inventory-item-form-surface" aria-labelledby="assembly-heading"><div class="catalog-heading"><div><h2 id="assembly-heading">Ensamblar kit · ${escapeHtml(operating.name)}</h2><p>${escapeHtml(operating.sku)} · Stock actual: <strong>${escapeHtml(String(operating.stockCurrent))} ${escapeHtml(operating.unit.symbol)}</strong></p></div><button id="operation-close" type="button">Cerrar</button></div><form id="assembly-form" novalidate><div class="inventory-item-form-grid"><div class="form-field"><label for="assembly-quantity">Cantidad a ensamblar *</label><input id="assembly-quantity" type="number" min="0" step="${operating.unit.allowsDecimal ? '0.001' : '1'}" required><small id="assembly-quantity-error"></small></div><div class="form-field"><label for="assembly-reason">Motivo *</label><input id="assembly-reason" maxlength="1000" value="Ensamblaje de kit" required><small id="assembly-reason-error"></small></div></div><p class="inventory-operation-note">Al confirmar se descontarán automáticamente los componentes definidos en la composición y aumentará el stock del kit.</p><div class="order-form__actions"><button type="submit" ${saving ? 'disabled' : ''}>${saving ? 'Ensamblando…' : 'Ensamblar kit'}</button></div><p id="assembly-error" role="alert"></p></form></section>`
    const reversedIds = new Set(movementHistory.map(m => m.reversalOfMovementId).filter(Boolean))
    const rows = movementHistory.map(m => {
      const reversible = (m.type === 'ENTRY' || m.type === 'ADJUSTMENT') && !reversedIds.has(m.id)
      return `<tr><td>${escapeHtml(new Date(m.occurredAt).toLocaleString())}</td><td>${escapeHtml(m.type)}</td><td>${m.direction === 'INCREASE' ? '+' : '-'}${escapeHtml(String(m.quantity))} ${escapeHtml(m.unitSymbolSnapshot)}</td><td>${escapeHtml(String(m.stockBefore))} → ${escapeHtml(String(m.stockAfter))}</td><td>${escapeHtml(String(m.unitCostSnapshot))}</td><td>${escapeHtml(m.actor)}</td><td>${escapeHtml(m.reason ?? '—')}</td><td>${reversible ? `<button type="button" data-reverse="${escapeHtml(m.id)}" ${saving ? 'disabled' : ''}>Revertir</button>` : m.reversalOfMovementId ? 'Reversión' : reversedIds.has(m.id) ? 'Revertido' : '—'}</td></tr>`
    }).join('')
    const reversal = reversing ? `<form id="reversal-form" class="inventory-reversal-form" novalidate><h3>Revertir movimiento</h3><p>Se creará un movimiento compensatorio por ${escapeHtml(String(reversing.quantity))} ${escapeHtml(reversing.unitSymbolSnapshot)}. El movimiento original se conservará.</p><div class="form-field"><label for="reversal-reason">Motivo *</label><input id="reversal-reason" maxlength="1000" required><small id="reversal-reason-error"></small></div><div class="order-form__actions"><button type="submit" ${saving ? 'disabled' : ''}>${saving ? 'Revirtiendo…' : 'Confirmar reversión'}</button><button id="reversal-cancel" type="button">Cancelar</button></div><p id="reversal-error" role="alert"></p></form>` : ''
    return `<section class="work-orders-surface inventory-items-surface" aria-labelledby="history-heading"><div class="catalog-heading"><div><h2 id="history-heading">Historial · ${escapeHtml(operating.name)}</h2><p>${escapeHtml(operating.sku)}</p></div><button id="operation-close" type="button">Cerrar</button></div>${rows ? `<div class="inventory-items-table-wrap"><table class="inventory-items-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Cantidad</th><th>Saldo</th><th>Costo unitario</th><th>Actor</th><th>Motivo</th><th>Acción</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p>No hay movimientos registrados.</p>'}${reversal}</section>`
  }

  async function openHistory(item: InventoryItem) {
    operating = item; operationMode = 'history'; movementHistory = []; render()
    const current = generation
    try { movementHistory = await listItemMovements(item.id); if (valid(current)) render() }
    catch (reason) { if (valid(current) && !(reason instanceof SessionExpiredError)) { message = errorText(reason); operating = undefined; operationMode = undefined; render() } }
  }

  async function submitReceipt() {
    if (!operating || saving) return
    const quantity = root.querySelector<HTMLInputElement>('#receipt-quantity')!.value
    const unitCost = root.querySelector<HTMLInputElement>('#receipt-cost')!.value
    const reason = root.querySelector<HTMLInputElement>('#receipt-reason')!.value.trim()
    let invalid = !decimalValid(quantity, 3) || Number(quantity) <= 0
    if (!operating.unit.allowsDecimal && quantity.includes('.') && /[1-9]/.test(quantity.split('.')[1] ?? '')) invalid = true
    root.querySelector<HTMLElement>('#receipt-quantity-error')!.textContent = invalid ? 'Ingresa una cantidad válida mayor que cero.' : ''
    const badCost = !decimalValid(unitCost, 4)
    root.querySelector<HTMLElement>('#receipt-cost-error')!.textContent = badCost ? 'Ingresa un costo no negativo con hasta 4 decimales.' : ''
    root.querySelector<HTMLElement>('#receipt-reason-error')!.textContent = reason ? '' : 'Ingresa un motivo.'
    if (invalid || badCost || !reason) return
    saving = true; receiptRequestId ||= globalThis.crypto?.randomUUID?.() ?? `receipt-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const itemId = operating.id
    try {
      await receiveItemStock(itemId, { requestId: receiptRequestId, quantity, unitCost, reason })
      const refreshed = await listItems(); items = refreshed; operating = refreshed.find(item => item.id === itemId)
      message = 'Entrada registrada correctamente.'; receiptRequestId = ''; operationMode = 'history'
      movementHistory = await listItemMovements(itemId); saving = false; render()
    } catch (reasonValue) {
      saving = false
      if (!(reasonValue instanceof SessionExpiredError)) { const el = root.querySelector<HTMLElement>('#receipt-error'); if (el) el.textContent = errorText(reasonValue) }
    }
  }

  async function submitAdjustment() {
    if (!operating || saving) return
    const direction = root.querySelector<HTMLSelectElement>('#adjustment-direction')!.value as 'INCREASE' | 'DECREASE'
    const quantity = root.querySelector<HTMLInputElement>('#adjustment-quantity')!.value
    const reason = root.querySelector<HTMLInputElement>('#adjustment-reason')!.value.trim()
    let invalid = !decimalValid(quantity, 3) || Number(quantity) <= 0
    if (!operating.unit.allowsDecimal && quantity.includes('.') && /[1-9]/.test(quantity.split('.')[1] ?? '')) invalid = true
    root.querySelector<HTMLElement>('#adjustment-quantity-error')!.textContent = invalid ? 'Ingresa una cantidad válida mayor que cero.' : ''
    root.querySelector<HTMLElement>('#adjustment-reason-error')!.textContent = reason ? '' : 'Ingresa un motivo.'
    if (invalid || !reason) return
    saving = true
    adjustmentRequestId ||= globalThis.crypto?.randomUUID?.() ?? `adjustment-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const itemId = operating.id
    try {
      await adjustItemStock(itemId, { requestId: adjustmentRequestId, direction, quantity, reason })
      items = await listItems(); operating = items.find(item => item.id === itemId)
      movementHistory = await listItemMovements(itemId)
      message = 'Ajuste registrado correctamente.'
      adjustmentRequestId = ''; operationMode = 'history'; saving = false; render()
    } catch (reasonValue) {
      saving = false
      if (!(reasonValue instanceof SessionExpiredError)) root.querySelector<HTMLElement>('#adjustment-error')!.textContent = errorText(reasonValue)
    }
  }

  async function submitAssembly() {
    if (!operating || saving || operationMode !== 'assembly') return
    const quantity = root.querySelector<HTMLInputElement>('#assembly-quantity')!.value
    const reason = root.querySelector<HTMLInputElement>('#assembly-reason')!.value.trim()
    let invalid = !decimalValid(quantity, 3) || Number(quantity) <= 0
    if (!operating.unit.allowsDecimal && quantity.includes('.') && /[1-9]/.test(quantity.split('.')[1] ?? '')) invalid = true
    root.querySelector<HTMLElement>('#assembly-quantity-error')!.textContent = invalid ? 'Ingresa una cantidad válida mayor que cero.' : ''
    root.querySelector<HTMLElement>('#assembly-reason-error')!.textContent = reason ? '' : 'Ingresa un motivo.'
    if (invalid || !reason) return

    saving = true
    assemblyRequestId ||= globalThis.crypto?.randomUUID?.() ?? `assembly-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const itemId = operating.id

    try {
      await assembleInventoryKit(itemId, { requestId: assemblyRequestId, quantity, reason })
      items = await listItems()
      managing = items.find(item => item.id === itemId)
      operating = undefined
      operationMode = undefined
      assemblyRequestId = ''
      saving = false
      message = 'Kit ensamblado correctamente.'
      render()
    } catch (reasonValue) {
      saving = false
      if (!(reasonValue instanceof SessionExpiredError)) {
        root.querySelector<HTMLElement>('#assembly-error')!.textContent = errorText(reasonValue)
      }
    }
  }

  async function submitReversal() {
    if (!operating || !reversing || saving) return
    const reason = root.querySelector<HTMLInputElement>('#reversal-reason')!.value.trim()
    root.querySelector<HTMLElement>('#reversal-reason-error')!.textContent = reason ? '' : 'Ingresa un motivo.'
    if (!reason) return
    saving = true
    reversalRequestId ||= globalThis.crypto?.randomUUID?.() ?? `reversal-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const itemId = operating.id
    try {
      await reverseInventoryMovement(reversing.id, { requestId: reversalRequestId, reason })
      items = await listItems(); operating = items.find(item => item.id === itemId)
      movementHistory = await listItemMovements(itemId)
      message = 'Movimiento revertido correctamente.'
      reversing = undefined; reversalRequestId = ''; saving = false; render()
    } catch (reasonValue) {
      saving = false
      if (!(reasonValue instanceof SessionExpiredError)) root.querySelector<HTMLElement>('#reversal-error')!.textContent = errorText(reasonValue)
    }
  }

  function formHtml() {
    if (loading || !formOpen) return ''
    const activeCategories = categories.filter(option => option.active || option.id === editing?.category.id)
    const activeUnits = units.filter(option => option.active || option.id === editing?.unit.id)
    const categoriesHtml = activeCategories.map(option => `<option value="${escapeHtml(option.id)}" ${option.id === editing?.category.id ? 'selected' : ''}>${escapeHtml(option.name)}${option.active ? '' : ' (inactiva, actual)'}</option>`).join('')
    const unitsHtml = activeUnits.map(option => `<option value="${escapeHtml(option.id)}" ${option.id === editing?.unit.id ? 'selected' : ''}>${escapeHtml(option.name)} (${escapeHtml(option.symbol)})${option.allowsDecimal ? ' · permite decimales' : ' · solo enteros'}${option.active ? '' : ' · inactiva, actual'}</option>`).join('')
    const stockField = editing
      ? `<div class="form-field"><span class="inventory-readonly-label">Stock actual</span><output class="inventory-readonly-value">${escapeHtml(String(editing.stockCurrent))} ${escapeHtml(editing.unit.symbol)}</output></div>`
      : '<div class="form-field"><label for="item-initial-stock">Stock inicial</label><input id="item-initial-stock" inputmode="decimal" type="number" min="0" step="1" value="0" required aria-describedby="item-initial-stock-help item-initial-stock-error"><small id="item-initial-stock-help">Cantidad actualmente disponible al registrar el artículo. No representa una compra.</small><small id="item-initial-stock-error"></small></div>'
    return `<section class="work-orders-surface inventory-item-form-surface" aria-labelledby="item-form-heading">
      <h2 id="item-form-heading">${editing ? 'Editar artículo' : 'Nuevo artículo'}</h2>
      <form id="item-form" novalidate aria-busy="${saving}">
        <div class="inventory-item-form-grid">
          <div class="form-field"><label for="item-sku">SKU *</label><input id="item-sku" maxlength="64" required value="${escapeHtml(editing?.sku ?? '')}" aria-describedby="item-sku-error"><small id="item-sku-error"></small></div>
          <div class="form-field"><label for="item-type">Tipo *</label><select id="item-type" ${editing ? 'disabled' : ''}><option value="STANDARD" ${editing?.itemType !== 'KIT' ? 'selected' : ''}>Artículo</option><option value="KIT" ${editing?.itemType === 'KIT' ? 'selected' : ''}>Kit</option></select><small>El tipo se define al crear el registro.</small></div><div class="form-field"><label for="item-name">Nombre *</label><input id="item-name" maxlength="160" required value="${escapeHtml(editing?.name ?? '')}" aria-describedby="item-name-error"><small id="item-name-error"></small></div>
          <div class="form-field"><label for="item-category">Categoría *</label><select id="item-category" required aria-describedby="item-category-error"><option value="">Selecciona una categoría</option>${categoriesHtml}</select><small id="item-category-error"></small></div>
          <div class="form-field"><label for="item-unit">Unidad *</label><select id="item-unit" required ${editing?.hasMovements ? 'disabled aria-describedby="item-unit-lock"' : 'aria-describedby="item-unit-error"'}><option value="">Selecciona una unidad</option>${unitsHtml}</select>${editing?.hasMovements ? '<small id="item-unit-lock">La unidad no puede modificarse porque el artículo ya posee movimientos.</small>' : '<small id="item-unit-error"></small>'}</div>
          <div class="form-field"><label for="item-description">Descripción</label><textarea id="item-description" maxlength="1000" rows="3">${escapeHtml(editing?.description ?? '')}</textarea></div>
          ${stockField}
          <div class="form-field"><label for="item-stock-minimum">Stock mínimo</label><input id="item-stock-minimum" inputmode="decimal" type="number" min="0" step="0.001" value="${escapeHtml(String(editing?.stockMinimum ?? '0'))}" required aria-describedby="item-stock-minimum-error"><small id="item-stock-minimum-error"></small></div>
          <div class="form-field"><label for="item-reference-cost">Costo referencia</label><input id="item-reference-cost" inputmode="decimal" type="number" min="0" step="0.0001" value="${escapeHtml(String(editing?.referenceUnitCost ?? '0'))}" required aria-describedby="item-reference-cost-error"><small id="item-reference-cost-error">Costo interno/referencial.</small><small id="item-reference-cost-error-text"></small></div>
        </div>
        <div class="order-form__actions"><button type="submit" ${saving || loading ? 'disabled' : ''}>${saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear artículo'}</button>${editing ? '<button id="item-cancel" type="button">Cancelar</button>' : ''}</div>
        <p id="item-form-error" role="alert"></p>
      </form>
    </section>`
  }

  function openForm() {
    if (saving || loading || categories.filter(value => value.active).length === 0 || units.filter(value => value.active).length === 0) {
      message = 'Para crear un artículo debe existir al menos una categoría y una unidad activa.'
      render()
      return
    }
    editing = undefined
    creationRequestId = ''
    formOpen = true
    render()
    root.querySelector<HTMLInputElement>('#item-sku')?.focus()
  }

  function validate(): InventoryItemInput | undefined {
    const formError = root.querySelector<HTMLElement>('#item-form-error')!
    formError.textContent = ''
    const fields = [
      ['item-sku', 'Ingresa un SKU válido.'], ['item-name', 'Ingresa un nombre válido.'],
    ] as const
    let first: HTMLElement | undefined
    for (const [id, text] of fields) {
      const input = root.querySelector<HTMLInputElement>(`#${id}`)!
      const invalid = !input.value.trim()
      root.querySelector<HTMLElement>(`#${id}-error`)!.textContent = invalid ? text : ''
      input.setAttribute('aria-invalid', String(invalid))
      if (invalid && !first) first = input
    }
    for (const [id, label, scale] of [['item-stock-minimum', 'El stock mínimo debe ser no negativo y usar hasta 3 decimales.', 3], ['item-reference-cost', 'El costo debe ser no negativo y usar hasta 4 decimales.', 4], ...(!editing ? [['item-initial-stock', 'El stock inicial debe ser no negativo y usar hasta 3 decimales.', 3]] : [])] as [string, string, number][]) {
      const input = root.querySelector<HTMLInputElement>(`#${id}`)!
      const invalid = !decimalValid(input.value, scale)
      root.querySelector<HTMLElement>(`#${id === 'item-reference-cost' ? 'item-reference-cost-error-text' : `${id}-error`}`)!.textContent = invalid ? label : ''
      input.setAttribute('aria-invalid', String(invalid))
      if (invalid && !first) first = input
    }
    const category = root.querySelector<HTMLSelectElement>('#item-category')!
    const unit = root.querySelector<HTMLSelectElement>('#item-unit')!
    for (const [input, id] of [[category, 'item-category-error'], [unit, 'item-unit-error']] as const) {
      const invalid = !input.value
      if (!editing?.hasMovements || input === category) {
        const help = root.querySelector<HTMLElement>(`#${id}`)
        if (help) help.textContent = invalid ? 'Selecciona una opción activa.' : ''
        input.setAttribute('aria-invalid', String(invalid))
        if (invalid && !first) first = input
      }
    }
    const initial = root.querySelector<HTMLInputElement>('#item-initial-stock')?.value ?? '0'
    const selectedUnit = units.find(option => option.id === unit.value)
    if (!editing && selectedUnit && !selectedUnit.allowsDecimal && !isZero(initial) && initial.includes('.') && /[1-9]/.test(initial.split('.')[1] ?? '')) {
      root.querySelector<HTMLElement>('#item-initial-stock-error')!.textContent = 'Esta unidad solo admite cantidades enteras.'
      root.querySelector<HTMLInputElement>('#item-initial-stock')!.setAttribute('aria-invalid', 'true')
      if (!first) first = root.querySelector<HTMLInputElement>('#item-initial-stock')!
    }
    if (first) { first.focus(); return undefined }
    const payload: InventoryItemInput = {
      sku: root.querySelector<HTMLInputElement>('#item-sku')!.value.trim(),
      name: root.querySelector<HTMLInputElement>('#item-name')!.value.trim(),
      description: root.querySelector<HTMLTextAreaElement>('#item-description')!.value,
      categoryId: category.value,
      unitId: unit.value,
      stockMinimum: root.querySelector<HTMLInputElement>('#item-stock-minimum')!.value,
      referenceUnitCost: root.querySelector<HTMLInputElement>('#item-reference-cost')!.value,
    }
    if (!editing) {
      payload.initialStock = initial
      payload.itemType = root.querySelector<HTMLSelectElement>('#item-type')!.value as 'STANDARD' | 'KIT'
      creationRequestId ||= globalThis.crypto?.randomUUID?.() ?? `item-${Date.now()}-${Math.random().toString(36).slice(2)}`
      payload.requestId = creationRequestId
    } else payload.expectedVersion = editing.version
    return payload
  }

  async function submitForm() {
    if (saving || loading) return
    const payload = validate()
    if (!payload) return
    await save(payload, editing, false)
  }

  async function save(payload: InventoryItemInput, target: InventoryItem | undefined, toggle: boolean) {
    if (saving) return
    saving = true
    const current = generation
    message = ''
    const errorTarget = toggle ? root.querySelector<HTMLElement>('#item-confirm-error') : root.querySelector<HTMLElement>('#item-form-error')
    if (errorTarget) errorTarget.textContent = ''
    root.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = true })
    root.querySelector('#item-form')?.setAttribute('aria-busy', 'true')
    try {
      const saved = target ? await editItem(target.id, payload) : await createItem(payload)
      if (!valid(current)) return
      items = target ? items.map(item => item.id === saved.id ? saved : item) : [...items, saved]
      if (toggle && target) {
        items = await listItems()
        if (!valid(current)) return
        const refreshed = items.find(item => item.id === target.id)
        if (refreshed && !refreshed.active && operating?.id === refreshed.id && operationMode === 'receipt') {
          operating = undefined
          operationMode = undefined
          receiptRequestId = ''
          movementHistory = []
        }
      }
      editing = undefined
      formOpen = false
      creationRequestId = ''
      confirming = undefined
      message = target ? (toggle ? 'Estado del artículo actualizado.' : 'Artículo actualizado.') : 'Artículo creado correctamente.'
      saving = false
      render()
      root.querySelector<HTMLElement>('#item-status')?.focus()
    } catch (reason) {
      if (!valid(current) || reason instanceof SessionExpiredError) return
      const messageText = errorText(reason)
      const currentError = toggle ? root.querySelector<HTMLElement>('#item-confirm-error') : root.querySelector<HTMLElement>('#item-form-error')
      if (currentError) currentError.textContent = messageText
      else { error = messageText; renderRows() }
    } finally {
      saving = false
      if (!disposed && root.isConnected) {
        root.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = loading })
        root.querySelector('#item-form')?.setAttribute('aria-busy', 'false')
      }
    }
  }

  async function load() {
    if (saving) return
    loading = true
    error = ''
    const current = ++generation
    render()
    try {
      const [loadedItems, loadedCategories, loadedUnits] = await Promise.all([
        listItems(), listItemCatalog('categories'), listItemCatalog('units'),
      ])
      if (!valid(current)) return
      items = loadedItems
      categories = loadedCategories
      units = loadedUnits
      loading = false
      render()
    } catch (reason) {
      if (!valid(current) || reason instanceof SessionExpiredError) return
      loading = false
      error = errorText(reason)
      render()
    }
  }

  async function show() {
    disposed = false
    root.innerHTML = `<header class="app-shell__page-header"><div><h1 id="inventory-title" tabindex="-1">Artículos</h1><p>Existencias y datos de inventario del taller</p></div></header>${nav()}<section class="work-orders-surface inventory-items-surface" aria-labelledby="items-heading"><div class="catalog-heading"><h2 id="items-heading">Listado de artículos</h2></div><div id="inventory-item-results"><p role="status">Cargando artículos…</p></div></section><div id="item-confirmation"></div><div id="item-form-region"></div>`
    await load()
  }

  return { show, dispose() { disposed = true; generation++ } }
}
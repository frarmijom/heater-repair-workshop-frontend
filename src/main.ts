import { createCatalogModule } from './inventory/catalog-module.ts'
import { createInventoryItemModule } from './inventory/item-module.ts'
import { workOrderActions, type WorkOrderAction } from './components/work-order-actions.ts'
import './style.css'
import { generatePageHeaderHtml } from './components/page-header.ts'
import { generateLoginScreenHtml, setupPasswordVisibility } from './components/login-screen.ts'
import { checkSession, login, logout } from './services/auth-service.ts'
import { SessionExpiredError, setSessionExpiredHandler } from './services/api.ts'
import { generateApplicationShellHtml, updateShellDestination, selectedWorkOrderId, selectedDestination, setupSidebar } from './components/application-shell.ts'
import { generateWorkOrderDetailHtml } from './components/work-order-detail.ts'
import { generateWorkOrderResultsHtml } from './components/work-order-results.ts'
import {
  generateWorkOrderFormHtml,
  setupWorkOrderForm,
} from './components/work-order-form.ts'
import type { WorkOrderFormPayload } from './components/work-order-form.ts'
import {
  generateWorkOrderFiltersHtml,
  isWorkOrderFilter,
} from './components/work-order-filters.ts'
import type { WorkOrderFilter } from './components/work-order-filters.ts'
import { generateWorkshopMonitorHtml } from './components/workshop-monitor.ts'
import type { WorkOrder } from './models/index.ts'
import {
  performWorkOrderAction,
  createWorkOrder,
  loadWorkOrders,
} from './services/work-order-service.ts'

let workOrders: WorkOrder[] = []
let selectedFilter: WorkOrderFilter = 'all'
let resultFilter: WorkOrderFilter = 'all'
let hasSearched = false
let searching = false
let collectionLoaded = false
let collectionPending: Promise<boolean> | undefined
let collectionError = ''
let collectionRevision = 0

let renderedDetailOrder: WorkOrder | undefined
const pendingWorkOrderActions = new Set<string>()
let authenticated = false
let inventoryModule: ReturnType<typeof createCatalogModule> | undefined
let inventoryItemModule: ReturnType<typeof createInventoryItemModule> | undefined
let viewGeneration = 0
let clockIntervalId: number | undefined
const sidebarState = { compact: false }
let disposeSidebar: (() => void) | undefined

const app = document.getElementById('app') as HTMLDivElement | null

if (app === null) {
  throw new Error('The application container was not found.')
}

const appContainer: HTMLDivElement = app

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'No se pudieron cargar las órdenes de trabajo.'
}

function showLoadingState(): void {
  renderApplicationContent(`
    <${authenticated ? 'div' : 'main'} class="request-state" aria-live="polite" aria-busy="true">
      <span class="request-state__spinner" aria-hidden="true"></span>
      <div>
        <p>Taller</p>
        <h1>Cargando taller…</h1>
      </div>
    </${authenticated ? 'div' : 'main'}>
  `)
}

function showErrorState(error: unknown): void {
  renderApplicationContent(`
    <${authenticated ? 'div' : 'main'} class="request-state request-state--error" role="alert">
      <span class="request-state__mark" aria-hidden="true">!</span>
      <div>
        <p>Error de carga</p>
        <h1>Las órdenes de trabajo no están disponibles.</h1>
        <p id="load-error-message" class="request-state__message"></p>
        <button id="retry-load" type="button">Reintentar</button>
      </div>
    </${authenticated ? 'div' : 'main'}>
  `)

  const message = appContainer.querySelector<HTMLParagraphElement>(
    '#load-error-message',
  )
  const retryButton =
    appContainer.querySelector<HTMLButtonElement>('#retry-load')

  if (message === null || retryButton === null) {
    throw new Error('The loading error controls were not found.')
  }

  message.textContent = getErrorMessage(error)
  retryButton.addEventListener('click', () => {
    void initializeApplication()
  })
}

function startClock(): void {
  const clock = appContainer.querySelector<HTMLTimeElement>('#workshop-clock')

  if (clock === null) {
    throw new Error('The workshop clock element was not found.')
  }

  const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' })
  const timeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  const updateClock = (): void => {
    const now = new Date()
    clock.dateTime = now.toISOString()
    clock.replaceChildren()

    const date = document.createElement('span')
    date.textContent = dateFormatter.format(now)

    const time = document.createElement('strong')
    time.textContent = timeFormatter.format(now)

    clock.append(date, time)
  }

  updateClock()
  if (clockIntervalId !== undefined) {
    window.clearInterval(clockIntervalId)
  }
  clockIntervalId = window.setInterval(updateClock, 1000)
}

async function addWorkOrder(payload: WorkOrderFormPayload): Promise<void> {
  const generation = viewGeneration
  try {
    const createdOrder = await createWorkOrder(payload)
    if (!authenticated || generation !== viewGeneration) return
    workOrders = [createdOrder, ...workOrders]
    collectionRevision++
    refreshDataViews()
    appContainer.querySelector<HTMLElement>('#work-order-action-status')!.textContent = 'Orden de trabajo creada correctamente.'
    if (selectedDestination() === 'work-order-new') window.location.hash = `#work-orders/${encodeURIComponent(createdOrder.id)}`
  } catch (error: unknown) {
    throw new Error(getErrorMessage(error))
  }
}

function replaceWorkOrder(updatedOrder: WorkOrder): void {
  if (!authenticated) return
  workOrders = workOrders.map((order) =>
    order.id === updatedOrder.id ? updatedOrder : order,
  )
  collectionRevision++
  refreshDataViews()
}

function queryFeedbackHtml(): string {
  return collectionError
    ? `<div class="request-state request-state--error" role="alert"><p>No se pudieron cargar las órdenes de trabajo.</p><button id="retry-load" type="button">Reintentar</button></div>`
    : '<div class="request-state" role="status" aria-busy="true"><p>Cargando órdenes de trabajo…</p></div>'
}

// One collection request per session at a time. Mutations completed while a GET is
// pending take precedence over that GET's snapshot.
async function ensureCollection(): Promise<boolean> {
  if (collectionLoaded) return true
  if (collectionPending) return collectionPending
  const generation = viewGeneration
  const revision = collectionRevision
  collectionError = ''
  const pending = (async () => {
    try {
      const orders = await loadWorkOrders()
      if (!authenticated || generation !== viewGeneration) return false
      workOrders = revision === collectionRevision ? orders : [
        ...workOrders, ...orders.filter(order => !workOrders.some(current => current.id === order.id)),
      ]
      collectionLoaded = true
      return true
    } catch (error: unknown) {
      if (!(error instanceof SessionExpiredError) && authenticated && generation === viewGeneration) collectionError = getErrorMessage(error)
      return false
    } finally {
      if (generation === viewGeneration) collectionPending = undefined
    }
  })()
  collectionPending = pending
  return pending
}

function refreshSearchResults(): void {
  const results = appContainer.querySelector<HTMLElement>('#work-order-search-results')
  if (!results) return
  results.hidden = !hasSearched
  const initial = appContainer.querySelector<HTMLElement>('#work-order-search-initial')!
  initial.hidden = hasSearched || searching
  if (!hasSearched) { results.innerHTML = ''; return }
  appContainer.querySelectorAll<HTMLButtonElement>('[data-work-order-status]').forEach(button => {
    const filter = button.dataset.workOrderStatus
    let count = button.querySelector('strong')
    if (!count) { count = document.createElement('strong'); button.append(count) }
    count.textContent = String(workOrders.filter(order => filter === 'all' || order.status === filter).length)
  })
  const visible = workOrders.filter(order => resultFilter === 'all' || order.status === resultFilter)
  results.innerHTML = `<div class="work-order-list__heading"><h2 id="work-order-results-title" tabindex="-1">Resultados</h2><p id="visible-order-count" role="status">${visible.length} órdenes de trabajo</p></div><div id="work-order-list">${generateWorkOrderResultsHtml(visible)}</div>`
}

function refreshDataViews(): void {
  const previousFocus = document.activeElement
  const dashboard = appContainer.querySelector<HTMLElement>('#dashboard-content')
  if (dashboard && collectionLoaded) dashboard.innerHTML = generateWorkshopMonitorHtml(workOrders)
  refreshSearchResults()
  updateWorkOrderDetail()
  if (previousFocus instanceof HTMLElement && previousFocus !== document.body && !previousFocus.isConnected) {
    updateShellDestination(appContainer, true)
  }
}

function setupRepairSearch(): void {
  const form = appContainer.querySelector<HTMLFormElement>('#work-order-search-form')!
  const buttons = form.querySelectorAll<HTMLButtonElement>('[data-work-order-status]')
  buttons.forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.workOrderStatus === selectedFilter))
    button.addEventListener('click', () => {
      const filter = button.dataset.workOrderStatus
      if (filter && isWorkOrderFilter(filter)) {
        selectedFilter = filter
        buttons.forEach(control => control.setAttribute('aria-pressed', String(control === button)))
      }
    })
  })
  form.addEventListener('submit', async event => {
    event.preventDefault()
    if (searching) return
    const generation = viewGeneration
    const filter = selectedFilter
    searching = true
    hasSearched = false
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!
    submit.disabled = true
    buttons.forEach(button => { button.disabled = true })
    form.setAttribute('aria-busy', 'true')
    const feedback = appContainer.querySelector<HTMLElement>('#work-order-search-feedback')!
    feedback.textContent = 'Buscando órdenes de trabajo…'
    appContainer.querySelector<HTMLElement>('#work-order-search-error')!.textContent = ''
    refreshSearchResults()
    const loaded = await ensureCollection()
    if (!authenticated || generation !== viewGeneration) return
    searching = false
    submit.disabled = false
    buttons.forEach(button => { button.disabled = false })
    form.removeAttribute('aria-busy')
    feedback.textContent = ''
    if (loaded) {
      hasSearched = true
      resultFilter = filter
      refreshDataViews()
      if (selectedDestination() === 'work-order-search') appContainer.querySelector<HTMLElement>('#work-order-results-title')?.focus()
    } else {
      appContainer.querySelector<HTMLElement>('#work-order-search-error')!.textContent = collectionError
      refreshSearchResults()
    }
  })
}

function renderWorkshop(): void {
  if (!authenticated) return
  renderApplicationContent(`
    <section class="work-orders-module catalog-module" lang="es" data-destination="inventory" aria-labelledby="inventory-title" hidden></section>
    <section data-destination="dashboard" aria-labelledby="dashboard-title">
      ${generatePageHeaderHtml({ id: 'dashboard-title', title: 'Dashboard', description: 'Resumen general del taller de órdenes de trabajo', contextHtml: '<time id="workshop-clock" class="workshop__clock"></time>' })}
      <div id="dashboard-content"></div>
    </section>
    <section class="work-orders-module" lang="es" data-destination="work-orders" aria-labelledby="work-orders-title" hidden>
      ${generatePageHeaderHtml({ id: 'work-orders-title', title: 'Órdenes de trabajo', description: 'Gestión de las órdenes de trabajo del taller' })}
      <div class="work-orders-capabilities">
        <section class="work-orders-surface"><span class="work-orders-capability-icon" aria-hidden="true">＋</span><h2>Nueva orden de trabajo</h2><p>Registrar un nuevo ingreso de calefont al taller.</p><a class="work-orders-primary-action" href="#work-orders/new">Crear orden de trabajo →</a></section>
        <section class="work-orders-surface"><span class="work-orders-capability-icon" aria-hidden="true">⌕</span><h2>Consultar órdenes de trabajo</h2><p>Buscar y revisar órdenes de trabajo existentes.</p><a class="work-orders-primary-action" href="#work-orders/search">Ir a búsqueda →</a></section>
      </div>
    </section>
    <section class="work-orders-module" lang="es" data-destination="work-order-new" aria-labelledby="work-order-new-title" hidden>
      <nav class="work-orders-breadcrumb" aria-label="Ruta de navegación"><a href="#work-orders">Órdenes de trabajo</a><span aria-hidden="true"> / </span><span aria-current="page">Nueva orden de trabajo</span></nav>
      ${generatePageHeaderHtml({ id: 'work-order-new-title', title: 'Nueva orden de trabajo', description: 'Registra el ingreso de un calefont al taller.' })}
      ${generateWorkOrderFormHtml()}
    </section>
    <section class="work-orders-module" lang="es" data-destination="work-order-search" aria-labelledby="work-order-search-title" hidden>
      <nav class="work-orders-breadcrumb" aria-label="Ruta de navegación"><a href="#work-orders">Órdenes de trabajo</a><span aria-hidden="true"> / </span><span aria-current="page">Consultar</span></nav>
      ${generatePageHeaderHtml({ id: 'work-order-search-title', title: 'Consultar órdenes de trabajo', description: 'Busca y filtra órdenes de trabajo por los criterios disponibles.' })}
      <form id="work-order-search-form" class="work-orders-surface" aria-labelledby="work-order-query-title">
        <h2 id="work-order-query-title">Buscar órdenes de trabajo</h2>
        <fieldset><legend>Estado de la orden de trabajo</legend><div class="work-order-filters">${generateWorkOrderFiltersHtml([], false)}</div></fieldset>
        <button type="submit">Buscar</button><p id="work-order-search-feedback" role="status"></p><p id="work-order-search-error" role="alert"></p>
      </form>
      <div id="work-order-search-initial" class="work-orders-empty"><h2>Selecciona un criterio de consulta</h2><p>Utiliza los filtros disponibles y pulsa Buscar para consultar órdenes de trabajo.</p></div>
      <section id="work-order-search-results" class="work-orders-surface" aria-labelledby="work-order-results-title" hidden></section>
    </section>
    <section class="work-order-detail work-orders-module" lang="es" data-destination="work-order-detail" aria-labelledby="work-order-detail-title" hidden></section>
  `)
  inventoryModule?.dispose()
  inventoryItemModule?.dispose()
  inventoryModule = createCatalogModule(appContainer.querySelector<HTMLElement>('[data-destination="inventory"]')!)
  inventoryItemModule = createInventoryItemModule(appContainer.querySelector<HTMLElement>('[data-destination="inventory"]')!)
  startClock()
  setupWorkOrderForm(appContainer, addWorkOrder)
  setupRepairSearch()
  refreshDataViews()
}

async function loadDestination(focusHeading = false): Promise<void> {
  const destination = selectedDestination()
  if (destination === 'inventory') {
    const hash = window.location.hash
    const loading = hash === '#inventory/categories' || hash === '#inventory/units'
      ? inventoryModule?.show(hash === '#inventory/units' ? 'units' : 'categories')
      : inventoryItemModule?.show()
    updateShellDestination(appContainer, focusHeading)
    await loading
    if (authenticated && selectedDestination() === 'inventory') updateShellDestination(appContainer, focusHeading)
    return
  }
  const needsCollection = destination === 'dashboard' || (destination === 'work-order-detail' && !workOrders.some(order => order.id === selectedWorkOrderId()))
  updateWorkOrderDetail()
  updateShellDestination(appContainer, focusHeading)
  if (!needsCollection || collectionLoaded) return
  const generation = viewGeneration
  const container = appContainer.querySelector<HTMLElement>(destination === 'dashboard' ? '#dashboard-content' : '[data-destination="work-order-detail"]')
  if (container) {
    container.innerHTML = (destination === 'work-order-detail' ? '<h1 id="work-order-detail-title" tabindex="-1">Detalle de orden de trabajo</h1>' : '') + queryFeedbackHtml()
    if (destination === 'work-order-detail') renderedDetailOrder = undefined
    updateShellDestination(appContainer, focusHeading)
  }
  const loaded = await ensureCollection()
  if (!authenticated || generation !== viewGeneration) return
  refreshDataViews()
  if (!loaded && selectedDestination() === destination && container?.isConnected) {
    container.innerHTML = (destination === 'work-order-detail' ? '<h1 id="work-order-detail-title" tabindex="-1">Detalle de orden de trabajo</h1>' : '') + queryFeedbackHtml()
    container.querySelector('#retry-load')?.addEventListener('click', () => {
      collectionError = ''
      void loadDestination(true)
    })
  }
  if (selectedDestination() === destination) updateShellDestination(appContainer, focusHeading)
}

// Keep request feedback inside the authenticated shell, including Sign out.
function renderApplicationContent(content: string): void {
  disposeSidebar?.()
  disposeSidebar = undefined
  if (!authenticated) {
    appContainer.innerHTML = content
    return
  }
  appContainer.innerHTML = generateApplicationShellHtml(content)
  disposeSidebar = setupSidebar(appContainer, sidebarState)
  renderedDetailOrder = undefined
  updateWorkOrderDetail()
  updateShellDestination(appContainer)
  appContainer.querySelector('.app-shell__skip')!.addEventListener('click', () => {
    appContainer.querySelector<HTMLElement>('#main-content')!.focus()
  })
  appContainer.querySelector<HTMLButtonElement>('#logout')!.addEventListener('click', async (event) => {
    const button = event.currentTarget as HTMLButtonElement
    button.disabled = true
    try {
      await logout()
      showLogin()
    } catch (error: unknown) {
      if (error instanceof SessionExpiredError) return
      button.disabled = false
      const message = appContainer.querySelector<HTMLElement>('#logout-error')
      if (message) message.textContent = 'No se pudo completar la solicitud.'
    }
  })
}

window.addEventListener('hashchange', () => {
  if (authenticated) {
    void loadDestination(true)
  }
})

function updateWorkOrderDetail(): void {
  const container = appContainer.querySelector<HTMLElement>('[data-destination="work-order-detail"]')
  const id = selectedWorkOrderId()
  if (!container || id === null) return
  const order = workOrders.find(order => order.id === id)
  if (!order && !collectionLoaded) { renderedDetailOrder = undefined; return }
  if (order && renderedDetailOrder === order && container.childElementCount > 0) return
  renderedDetailOrder = order
  container.innerHTML = generateWorkOrderDetailHtml(order)
  if (!order) return
  const form = container.querySelector<HTMLFormElement>('#diagnosis-form')
  const input = container.querySelector<HTMLTextAreaElement>('#work-order-diagnosis')
  const buttons = [...container.querySelectorAll<HTMLButtonElement>('button[data-work-order-action]')]
  const button = buttons[0]
  const errorElement = container.querySelector<HTMLElement>('#detail-action-error')
  if (!button || !errorElement) return
  const generation = viewGeneration
  const actions = container.querySelector<HTMLElement>('#detail-actions')!
  const opener = container.querySelector<HTMLButtonElement>('#detail-complete')
  const confirmation = container.querySelector<HTMLElement>('#complete-confirmation')
  const cancel = container.querySelector<HTMLButtonElement>('#cancel-complete')
  const idleLabel = button.textContent
  const setPending = (pending: boolean): void => {
    buttons.forEach(control => { control.disabled = pending })
    if (opener) opener.disabled = pending
    if (cancel) cancel.disabled = pending
    actions.setAttribute('aria-busy', String(pending))
    form?.setAttribute('aria-busy', String(pending))
    button.textContent = pending ? 'Guardando cambio…' : idleLabel
  }
  const showConfirmation = (show: boolean, moveFocus = true): void => {
    if (!opener || !confirmation || !cancel) return
    opener.hidden = show
    opener.setAttribute('aria-expanded', String(show))
    confirmation.hidden = !show
    if (moveFocus) {
      if (show) cancel.focus()
      else opener.focus()
    }
  }
  opener?.addEventListener('click', () => {
    if (!pendingWorkOrderActions.has(order.id)) showConfirmation(true)
  })
  cancel?.addEventListener('click', () => {
    if (pendingWorkOrderActions.has(order.id)) return
    errorElement.textContent = ''
    showConfirmation(false)
  })
  if (pendingWorkOrderActions.has(order.id)) {
    if (confirmation) showConfirmation(true, false)
    setPending(true)
  }
  const execute = async (action: WorkOrderAction): Promise<void> => {
    if (pendingWorkOrderActions.has(order.id) || (action === 'complete' && confirmation?.hidden)) return
    const diagnosis = input?.value.trim()
    errorElement.textContent = ''
    appContainer.querySelector<HTMLElement>('#work-order-action-status')!.textContent = ''
    if (action === 'diagnosis' && input) {
      input.setAttribute('aria-invalid', String(!diagnosis))
      if (!diagnosis) {
        errorElement.textContent = 'Ingresa un diagnóstico válido.'
        input.focus()
        return
      }
    }
    const parts = container.querySelector<HTMLInputElement>('input[name="partsAvailable"]:checked')
    if (action === 'approve' && !parts) {
      errorElement.textContent = 'Indica si los repuestos están disponibles antes de registrar la aprobación.'
      container.querySelector<HTMLInputElement>('input[name="partsAvailable"]')?.focus()
      return
    }
    pendingWorkOrderActions.add(order.id)
    setPending(true)
    try {
      const updated = await performWorkOrderAction(order.id, action, action === 'diagnosis' ? { diagnosis: diagnosis! } : action === 'approve' ? { partsAvailable: parts!.value === 'true' } : undefined)
      if (!authenticated || generation !== viewGeneration) return
      pendingWorkOrderActions.delete(order.id)
      replaceWorkOrder(updated)
      appContainer.querySelector<HTMLElement>('#work-order-action-status')!.textContent = `${workOrderActions[action]}: cambio guardado.`
      if (selectedWorkOrderId() === order.id) appContainer.querySelector<HTMLElement>('#work-order-detail-title')?.focus()
    } catch (error: unknown) {
      if (generation !== viewGeneration) return
      errorElement.textContent = getErrorMessage(error)
    } finally {
      if (generation === viewGeneration) {
        pendingWorkOrderActions.delete(order.id)
        // Navigation may have replaced the pending form. Restore retry feedback there too.
        if (authenticated && selectedWorkOrderId() === order.id && renderedDetailOrder === order && !button.isConnected) {
          const restoreFocus = container.contains(document.activeElement)
          renderedDetailOrder = undefined
          updateWorkOrderDetail()
          const currentInput = appContainer.querySelector<HTMLTextAreaElement>('#work-order-diagnosis')
          if (currentInput && input) currentInput.value = input.value
          const currentError = appContainer.querySelector<HTMLElement>('#detail-action-error')
          if (currentError) {
            currentError.textContent = errorElement.textContent
            if (restoreFocus) {
              currentError.tabIndex = -1
              currentError.focus()
            }
          }
        }
      }
      setPending(false)
    }
  }
  if (form) form.addEventListener('submit', event => { event.preventDefault(); void execute('diagnosis') })
  buttons.filter(control => control.type !== 'submit').forEach(control => {
    control.addEventListener('click', () => { void execute(control.dataset.workOrderAction as WorkOrderAction) })
  })
}

function showLogin(message = ''): void {
  inventoryModule?.dispose()
  inventoryModule = undefined
  inventoryItemModule?.dispose()
  inventoryItemModule = undefined
  disposeSidebar?.()
  disposeSidebar = undefined
  sidebarState.compact = false
  authenticated = false
  viewGeneration++
  workOrders = []
  selectedFilter = 'all'
  resultFilter = 'all'
  hasSearched = false
  searching = false
  collectionLoaded = false
  collectionPending = undefined
  collectionError = ''
  collectionRevision = 0
  pendingWorkOrderActions.clear()
  renderedDetailOrder = undefined
  if (clockIntervalId !== undefined) window.clearInterval(clockIntervalId)
  clockIntervalId = undefined
  appContainer.innerHTML = generateLoginScreenHtml()
  setupPasswordVisibility(appContainer)
  const form = appContainer.querySelector<HTMLFormElement>('#login-form')!
  const errorElement = appContainer.querySelector<HTMLElement>('#login-error')!
  errorElement.textContent = message
  let submitting = false
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (submitting) return
    submitting = true
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!
    const email = form.querySelector<HTMLInputElement>('#login-email')!
    const password = form.querySelector<HTMLInputElement>('#login-password')!
    button.disabled = true
    button.textContent = 'Iniciando sesión…'
    form.setAttribute('aria-busy', 'true')
    errorElement.textContent = ''
    try {
      const pending = login(email.value.trim(), password.value)
      password.value = ''
      await pending
      await initializeApplication()
    } catch (error: unknown) {
      errorElement.textContent = getErrorMessage(error)
    } finally {
      password.value = ''
      submitting = false
      button.disabled = false
      button.textContent = 'Iniciar sesión'
      form.removeAttribute('aria-busy')
    }
  })
}

setSessionExpiredHandler(() => showLogin(authenticated ? 'Tu sesión ha expirado. Inicia sesión nuevamente.' : ''))

async function initializeApplication(): Promise<void> {
  const generation = ++viewGeneration
  showLoadingState()
  try {
    await checkSession()
    if (generation !== viewGeneration) return
    authenticated = true
    renderWorkshop()
    await loadDestination()
  } catch (error: unknown) {
    if (error instanceof SessionExpiredError || generation !== viewGeneration) return
    showErrorState(error)
  }
}

void initializeApplication()

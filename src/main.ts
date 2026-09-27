import './style.css'
import { generatePageHeaderHtml } from './components/page-header.ts'
import { generateLoginScreenHtml, setupPasswordVisibility } from './components/login-screen.ts'
import { checkSession, login, logout } from './services/auth-service.ts'
import { SessionExpiredError, setSessionExpiredHandler } from './services/api.ts'
import { generateApplicationShellHtml, updateShellDestination, selectedRepairId, selectedDestination, setupSidebar } from './components/application-shell.ts'
import { generateRepairDetailHtml } from './components/repair-detail.ts'
import { generateRepairResultsHtml } from './components/repair-results.ts'
import {
  generateRepairOrderFormHtml,
  setupRepairOrderForm,
} from './components/repair-order-form.ts'
import type { RepairOrderFormPayload } from './components/repair-order-form.ts'
import {
  generateRepairOrderFiltersHtml,
  isRepairOrderFilter,
} from './components/repair-order-filters.ts'
import type { RepairOrderFilter } from './components/repair-order-filters.ts'
import { generateWorkshopMonitorHtml } from './components/workshop-monitor.ts'
import type { RepairOrder } from './models/index.ts'
import {
  completeRepairOrder,
  createRepairOrder,
  loadRepairOrders,
  startRepairOrder,
} from './services/repair-order-service.ts'

let repairOrders: RepairOrder[] = []
let selectedFilter: RepairOrderFilter = 'all'
let resultFilter: RepairOrderFilter = 'all'
let hasSearched = false
let searching = false
let collectionLoaded = false
let collectionPending: Promise<boolean> | undefined
let collectionError = ''
let collectionRevision = 0

let renderedDetailOrder: RepairOrder | undefined
const pendingRepairActions = new Set<string>()
let authenticated = false
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
    : 'No se pudieron cargar las reparaciones.'
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
        <h1>Las reparaciones no están disponibles.</h1>
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

async function addRepairOrder(payload: RepairOrderFormPayload): Promise<void> {
  const generation = viewGeneration
  try {
    const createdOrder = await createRepairOrder(payload)
    if (!authenticated || generation !== viewGeneration) return
    repairOrders = [...repairOrders, createdOrder]
    collectionRevision++
    refreshDataViews()
    appContainer.querySelector<HTMLElement>('#repair-action-status')!.textContent = 'Reparación creada correctamente.'
    if (selectedDestination() === 'repair-new') window.location.hash = `#repairs/${encodeURIComponent(createdOrder.id)}`
  } catch (error: unknown) {
    throw new Error(getErrorMessage(error))
  }
}

function replaceRepairOrder(updatedOrder: RepairOrder): void {
  if (!authenticated) return
  repairOrders = repairOrders.map((order) =>
    order.id === updatedOrder.id ? updatedOrder : order,
  )
  collectionRevision++
  refreshDataViews()
}

function queryFeedbackHtml(): string {
  return collectionError
    ? `<div class="request-state request-state--error" role="alert"><p>No se pudieron cargar las reparaciones.</p><button id="retry-load" type="button">Reintentar</button></div>`
    : '<div class="request-state" role="status" aria-busy="true"><p>Cargando reparaciones…</p></div>'
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
      const orders = await loadRepairOrders()
      if (!authenticated || generation !== viewGeneration) return false
      repairOrders = revision === collectionRevision ? orders : [
        ...orders.filter(order => !repairOrders.some(current => current.id === order.id)), ...repairOrders,
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
  const results = appContainer.querySelector<HTMLElement>('#repair-search-results')
  if (!results) return
  results.hidden = !hasSearched
  const initial = appContainer.querySelector<HTMLElement>('#repair-search-initial')!
  initial.hidden = hasSearched || searching
  if (!hasSearched) { results.innerHTML = ''; return }
  appContainer.querySelectorAll<HTMLButtonElement>('[data-repair-status]').forEach(button => {
    const filter = button.dataset.repairStatus
    let count = button.querySelector('strong')
    if (!count) { count = document.createElement('strong'); button.append(count) }
    count.textContent = String(repairOrders.filter(order => filter === 'all' || order.status === filter).length)
  })
  const visible = repairOrders.filter(order => resultFilter === 'all' || order.status === resultFilter)
  results.innerHTML = `<div class="repair-list__heading"><h2 id="repair-results-title" tabindex="-1">Resultados</h2><p id="visible-order-count" role="status">${visible.length} reparaciones</p></div><div id="repair-order-list">${generateRepairResultsHtml(visible)}</div>`
}

function refreshDataViews(): void {
  const previousFocus = document.activeElement
  const dashboard = appContainer.querySelector<HTMLElement>('#dashboard-content')
  if (dashboard && collectionLoaded) dashboard.innerHTML = generateWorkshopMonitorHtml(repairOrders)
  refreshSearchResults()
  updateRepairDetail()
  if (previousFocus instanceof HTMLElement && previousFocus !== document.body && !previousFocus.isConnected) {
    updateShellDestination(appContainer, true)
  }
}

function setupRepairSearch(): void {
  const form = appContainer.querySelector<HTMLFormElement>('#repair-search-form')!
  const buttons = form.querySelectorAll<HTMLButtonElement>('[data-repair-status]')
  buttons.forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.repairStatus === selectedFilter))
    button.addEventListener('click', () => {
      const filter = button.dataset.repairStatus
      if (filter && isRepairOrderFilter(filter)) {
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
    const feedback = appContainer.querySelector<HTMLElement>('#repair-search-feedback')!
    feedback.textContent = 'Buscando reparaciones…'
    appContainer.querySelector<HTMLElement>('#repair-search-error')!.textContent = ''
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
      if (selectedDestination() === 'repair-search') appContainer.querySelector<HTMLElement>('#repair-results-title')?.focus()
    } else {
      appContainer.querySelector<HTMLElement>('#repair-search-error')!.textContent = collectionError
      refreshSearchResults()
    }
  })
}

function renderWorkshop(): void {
  if (!authenticated) return
  renderApplicationContent(`
    <section data-destination="dashboard" aria-labelledby="dashboard-title">
      ${generatePageHeaderHtml({ id: 'dashboard-title', title: 'Dashboard', description: 'Resumen general del taller de reparaciones', contextHtml: '<time id="workshop-clock" class="workshop__clock"></time>' })}
      <div id="dashboard-content"></div>
    </section>
    <section class="repairs-module" lang="es" data-destination="repairs" aria-labelledby="repairs-title" hidden>
      ${generatePageHeaderHtml({ id: 'repairs-title', title: 'Reparaciones', description: 'Gestión de las reparaciones del taller' })}
      <div class="repairs-capabilities">
        <section class="repairs-surface"><span class="repairs-capability-icon" aria-hidden="true">＋</span><h2>Nueva reparación</h2><p>Registrar un nuevo ingreso de calefont al taller.</p><a class="repairs-primary-action" href="#repairs/new">Crear reparación →</a></section>
        <section class="repairs-surface"><span class="repairs-capability-icon" aria-hidden="true">⌕</span><h2>Consultar reparaciones</h2><p>Buscar y revisar reparaciones existentes.</p><a class="repairs-primary-action" href="#repairs/search">Ir a búsqueda →</a></section>
      </div>
    </section>
    <section class="repairs-module" lang="es" data-destination="repair-new" aria-labelledby="repair-new-title" hidden>
      <nav class="repairs-breadcrumb" aria-label="Ruta de navegación"><a href="#repairs">Reparaciones</a><span aria-hidden="true"> / </span><span aria-current="page">Nueva reparación</span></nav>
      ${generatePageHeaderHtml({ id: 'repair-new-title', title: 'Nueva reparación', description: 'Registra el ingreso de un calefont al taller.' })}
      ${generateRepairOrderFormHtml()}
    </section>
    <section class="repairs-module" lang="es" data-destination="repair-search" aria-labelledby="repair-search-title" hidden>
      <nav class="repairs-breadcrumb" aria-label="Ruta de navegación"><a href="#repairs">Reparaciones</a><span aria-hidden="true"> / </span><span aria-current="page">Consultar</span></nav>
      ${generatePageHeaderHtml({ id: 'repair-search-title', title: 'Consultar reparaciones', description: 'Busca y filtra reparaciones por los criterios disponibles.' })}
      <form id="repair-search-form" class="repairs-surface" aria-labelledby="repair-query-title">
        <h2 id="repair-query-title">Buscar reparaciones</h2>
        <fieldset><legend>Estado de la reparación</legend><div class="repair-filters">${generateRepairOrderFiltersHtml([], false)}</div></fieldset>
        <button type="submit">Buscar</button><p id="repair-search-feedback" role="status"></p><p id="repair-search-error" role="alert"></p>
      </form>
      <div id="repair-search-initial" class="repairs-empty"><h2>Selecciona un criterio de consulta</h2><p>Utiliza los filtros disponibles y pulsa Buscar para consultar reparaciones.</p></div>
      <section id="repair-search-results" class="repairs-surface" aria-labelledby="repair-results-title" hidden></section>
    </section>
    <section class="repair-detail repairs-module" lang="es" data-destination="repair-detail" aria-labelledby="repair-detail-title" hidden></section>
  `)
  startClock()
  setupRepairOrderForm(appContainer, addRepairOrder)
  setupRepairSearch()
  refreshDataViews()
}

async function loadDestination(focusHeading = false): Promise<void> {
  const destination = selectedDestination()
  const needsCollection = destination === 'dashboard' || (destination === 'repair-detail' && !repairOrders.some(order => order.id === selectedRepairId()))
  updateRepairDetail()
  updateShellDestination(appContainer, focusHeading)
  if (!needsCollection || collectionLoaded) return
  const generation = viewGeneration
  const container = appContainer.querySelector<HTMLElement>(destination === 'dashboard' ? '#dashboard-content' : '[data-destination="repair-detail"]')
  if (container) {
    container.innerHTML = (destination === 'repair-detail' ? '<h1 id="repair-detail-title" tabindex="-1">Detalle de reparación</h1>' : '') + queryFeedbackHtml()
    if (destination === 'repair-detail') renderedDetailOrder = undefined
    updateShellDestination(appContainer, focusHeading)
  }
  const loaded = await ensureCollection()
  if (!authenticated || generation !== viewGeneration) return
  refreshDataViews()
  if (!loaded && selectedDestination() === destination && container?.isConnected) {
    container.innerHTML = (destination === 'repair-detail' ? '<h1 id="repair-detail-title" tabindex="-1">Detalle de reparación</h1>' : '') + queryFeedbackHtml()
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
  updateRepairDetail()
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

function updateRepairDetail(): void {
  const container = appContainer.querySelector<HTMLElement>('[data-destination="repair-detail"]')
  const id = selectedRepairId()
  if (!container || id === null) return
  const order = repairOrders.find(repair => repair.id === id)
  if (!order && !collectionLoaded) { renderedDetailOrder = undefined; return }
  if (order && renderedDetailOrder === order && container.childElementCount > 0) return
  renderedDetailOrder = order
  container.innerHTML = generateRepairDetailHtml(order)
  if (!order) return
  const form = container.querySelector<HTMLFormElement>('#diagnosis-form')
  const input = container.querySelector<HTMLTextAreaElement>('#repair-diagnosis')
  const button = container.querySelector<HTMLButtonElement>('button[data-repair-action]')
  const errorElement = container.querySelector<HTMLElement>('#detail-action-error')
  if (!button || !errorElement) return
  const generation = viewGeneration
  const actions = container.querySelector<HTMLElement>('#detail-actions')!
  const opener = container.querySelector<HTMLButtonElement>('#detail-complete')
  const confirmation = container.querySelector<HTMLElement>('#complete-confirmation')
  const cancel = container.querySelector<HTMLButtonElement>('#cancel-complete')
  const idleLabel = button.textContent
  const setPending = (pending: boolean): void => {
    button.disabled = pending
    if (opener) opener.disabled = pending
    if (cancel) cancel.disabled = pending
    actions.setAttribute('aria-busy', String(pending))
    form?.setAttribute('aria-busy', String(pending))
    button.textContent = pending ? (input ? 'Iniciando reparación…' : 'Completando reparación…') : idleLabel
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
    if (!pendingRepairActions.has(order.id)) showConfirmation(true)
  })
  cancel?.addEventListener('click', () => {
    if (pendingRepairActions.has(order.id)) return
    errorElement.textContent = ''
    showConfirmation(false)
  })
  if (pendingRepairActions.has(order.id)) {
    if (confirmation) showConfirmation(true, false)
    setPending(true)
  }
  const execute = async (): Promise<void> => {
    if (pendingRepairActions.has(order.id) || (confirmation && confirmation.hidden)) return
    const diagnosis = input?.value.trim()
    errorElement.textContent = ''
    appContainer.querySelector<HTMLElement>('#repair-action-status')!.textContent = ''
    if (input) {
      input.setAttribute('aria-invalid', String(!diagnosis))
      if (!diagnosis) {
        errorElement.textContent = 'Ingresa un diagnóstico para iniciar la reparación.'
        input.focus()
        return
      }
    }
    pendingRepairActions.add(order.id)
    setPending(true)
    try {
      const updated = input ? await startRepairOrder(order.id, diagnosis!) : await completeRepairOrder(order.id)
      if (!authenticated || generation !== viewGeneration) return
      pendingRepairActions.delete(order.id)
      replaceRepairOrder(updated)
      appContainer.querySelector<HTMLElement>('#repair-action-status')!.textContent = input
        ? 'Reparación iniciada correctamente.' : 'Reparación completada correctamente.'
      if (selectedRepairId() === order.id) appContainer.querySelector<HTMLElement>('#repair-detail-title')?.focus()
    } catch (error: unknown) {
      if (generation !== viewGeneration) return
      errorElement.textContent = getErrorMessage(error)
    } finally {
      if (generation === viewGeneration) {
        pendingRepairActions.delete(order.id)
        // Navigation may have replaced the pending form. Restore retry feedback there too.
        if (authenticated && selectedRepairId() === order.id && renderedDetailOrder === order && !button.isConnected) {
          const restoreFocus = container.contains(document.activeElement)
          renderedDetailOrder = undefined
          updateRepairDetail()
          const currentInput = appContainer.querySelector<HTMLTextAreaElement>('#repair-diagnosis')
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
  if (form) form.addEventListener('submit', event => { event.preventDefault(); void execute() })
  else button.addEventListener('click', () => { void execute() })
}

function showLogin(message = ''): void {
  disposeSidebar?.()
  disposeSidebar = undefined
  sidebarState.compact = false
  authenticated = false
  viewGeneration++
  repairOrders = []
  selectedFilter = 'all'
  resultFilter = 'all'
  hasSearched = false
  searching = false
  collectionLoaded = false
  collectionPending = undefined
  collectionError = ''
  collectionRevision = 0
  pendingRepairActions.clear()
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

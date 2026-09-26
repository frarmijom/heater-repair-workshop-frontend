import './style.css'
import { checkSession, login, logout } from './services/auth-service.ts'
import { SessionExpiredError, setSessionExpiredHandler } from './services/api.ts'
import { generateApplicationShellHtml, updateShellDestination } from './components/application-shell.ts'
import { generateRepairOrderCardHtml } from './components/repair-order-card.ts'
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
let authenticated = false
let viewGeneration = 0
let clockIntervalId: number | undefined

const app = document.getElementById('app') as HTMLDivElement | null

if (app === null) {
  throw new Error('The application container was not found.')
}

const appContainer: HTMLDivElement = app

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'An unexpected error occurred while loading repair orders.'
}

function showLoadingState(): void {
  renderApplicationContent(`
    <${authenticated ? 'div' : 'main'} class="request-state" aria-live="polite" aria-busy="true">
      <span class="request-state__spinner" aria-hidden="true"></span>
      <div>
        <p>Workshop API</p>
        <h1>Loading workshop…</h1>
      </div>
    </${authenticated ? 'div' : 'main'}>
  `)
}

function showErrorState(error: unknown): void {
  renderApplicationContent(`
    <${authenticated ? 'div' : 'main'} class="request-state request-state--error" role="alert">
      <span class="request-state__mark" aria-hidden="true">!</span>
      <div>
        <p>Loading error</p>
        <h1>Repair orders are unavailable.</h1>
        <p id="load-error-message" class="request-state__message"></p>
        <button id="retry-load" type="button">Try again</button>
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
    renderWorkshop()
  } catch (error: unknown) {
    throw new Error(getErrorMessage(error))
  }
}

function replaceRepairOrder(updatedOrder: RepairOrder): void {
  if (!authenticated) return
  repairOrders = repairOrders.map((order) =>
    order.id === updatedOrder.id ? updatedOrder : order,
  )
  renderWorkshop()
}

function setupRepairOrderActions(): void {
  const repairList = appContainer.querySelector<HTMLElement>('#repair-order-list')
  if (repairList === null) {
    throw new Error('The repair order list was not found.')
  }

  repairList.addEventListener('click', (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof HTMLButtonElement)) {
      return
    }

    const action = target.dataset.repairAction
    const orderId = target.dataset.repairOrderId
    if ((action !== 'start' && action !== 'complete') || orderId === undefined) {
      return
    }

    const card = target.closest<HTMLElement>('.repair-card')
    const errorElement = card?.querySelector<HTMLElement>(
      '.repair-card__action-error',
    )
    const generation = viewGeneration
    const executeAction = async (): Promise<void> => {
      target.disabled = true
      if (errorElement !== undefined && errorElement !== null) {
        errorElement.textContent = ''
      }

      try {
        if (action === 'start') {
          const diagnosis = window.prompt('Enter the repair diagnosis:')?.trim()
          if (diagnosis === undefined) {
            target.disabled = false
            return
          }
          if (diagnosis.length === 0) {
            throw new Error('A diagnosis is required to start the repair.')
          }
          const updated = await startRepairOrder(orderId, diagnosis)
          if (generation === viewGeneration) replaceRepairOrder(updated)
        } else {
          const updated = await completeRepairOrder(orderId)
          if (generation === viewGeneration) replaceRepairOrder(updated)
        }
      } catch (error: unknown) {
        target.disabled = false
        if (errorElement !== undefined && errorElement !== null) {
          errorElement.textContent = getErrorMessage(error)
        }
      }
    }

    void executeAction()
  })
}

function setupRepairOrderFilters(): void {
  const repairList = appContainer.querySelector<HTMLElement>('#repair-order-list')
  const visibleCount = appContainer.querySelector<HTMLElement>('#visible-order-count')
  const filterButtons = appContainer.querySelectorAll<HTMLButtonElement>(
    '[data-repair-status]',
  )

  if (repairList === null || visibleCount === null) {
    throw new Error('The repair order list controls were not found.')
  }

  const renderFilteredOrders = (filter: RepairOrderFilter): void => {
    const visibleOrders = repairOrders.filter(
      ({ status }) => filter === 'all' || status === filter,
    )
    repairList.innerHTML = visibleOrders.map(generateRepairOrderCardHtml).join('')
    visibleCount.textContent = `${visibleOrders.length} orders`

    filterButtons.forEach((button) => {
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.repairStatus === filter),
      )
    })
  }

  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const filter = button.dataset.repairStatus
      if (filter !== undefined && isRepairOrderFilter(filter)) {
        renderFilteredOrders(filter)
      }
    })
  })
}

function renderWorkshop(): void {
  if (!authenticated) return
  const cardsHtml = repairOrders.map(generateRepairOrderCardHtml).join('')

  renderApplicationContent(`
    <section data-destination="dashboard" aria-labelledby="dashboard-title">
      <header class="app-shell__page-header">
        <h1 id="dashboard-title" tabindex="-1">Dashboard</h1>
        <p>Taller Fuego Sur</p>
        <time id="workshop-clock" class="workshop__clock"></time>
      </header>
      ${generateWorkshopMonitorHtml(repairOrders)}
    </section>
    <section data-destination="repairs" aria-labelledby="repairs-title" hidden>
      <header class="app-shell__page-header">
        <h1 id="repairs-title" tabindex="-1">Repairs</h1>
      </header>
      ${generateRepairOrderFormHtml()}
      <nav class="repair-filters" aria-label="Repair order status filters">
        ${generateRepairOrderFiltersHtml(repairOrders)}
      </nav>
      <div class="repair-list__heading">
        <h2>Repair orders</h2>
        <p id="visible-order-count" class="workshop__count">${repairOrders.length} orders</p>
      </div>
      <section id="repair-order-list" class="repair-list" aria-label="Repair orders">
        ${cardsHtml}
      </section>
    </section>
  `)
  startClock()
  setupRepairOrderForm(appContainer, addRepairOrder)
  setupRepairOrderFilters()
  setupRepairOrderActions()
}

// Keep request feedback inside the authenticated shell, including Sign out.
function renderApplicationContent(content: string): void {
  if (!authenticated) {
    appContainer.innerHTML = content
    return
  }
  appContainer.innerHTML = generateApplicationShellHtml(content)
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
      if (message) message.textContent = 'Unable to complete the request.'
    }
  })
}

window.addEventListener('hashchange', () => {
  if (authenticated) updateShellDestination(appContainer, true)
})

function showLogin(message = ''): void {
  authenticated = false
  viewGeneration++
  repairOrders = []
  if (clockIntervalId !== undefined) window.clearInterval(clockIntervalId)
  clockIntervalId = undefined
  appContainer.innerHTML = `
    <main class="request-state auth-view">
      <h1>Heater Repair Workshop</h1>
      <form id="login-form" class="auth-form">
        <label for="login-email">Email</label>
        <input id="login-email" name="email" type="email" autocomplete="username" maxlength="254" required />
        <label for="login-password">Password</label>
        <input id="login-password" name="password" type="password" autocomplete="current-password" maxlength="1024" required />
        <button type="submit">Sign in</button>
        <p id="login-error" role="alert"></p>
      </form>
    </main>`
  const form = appContainer.querySelector<HTMLFormElement>('#login-form')!
  const errorElement = appContainer.querySelector<HTMLElement>('#login-error')!
  errorElement.textContent = message
  let submitting = false
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (submitting) return
    submitting = true
    const button = form.querySelector<HTMLButtonElement>('button')!
    const email = form.querySelector<HTMLInputElement>('#login-email')!
    const password = form.querySelector<HTMLInputElement>('#login-password')!
    button.disabled = true
    button.textContent = 'Signing in…'
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
      button.textContent = 'Sign in'
      form.removeAttribute('aria-busy')
    }
  })
}

setSessionExpiredHandler(() => showLogin(authenticated ? 'Your session has expired. Please sign in again.' : ''))

async function initializeApplication(): Promise<void> {
  const generation = ++viewGeneration
  showLoadingState()
  try {
    await checkSession()
    if (generation !== viewGeneration) return
    authenticated = true
    showLoadingState()
    const orders = await loadRepairOrders()
    if (generation !== viewGeneration || !authenticated) return
    repairOrders = orders
    renderWorkshop()
  } catch (error: unknown) {
    if (error instanceof SessionExpiredError || generation !== viewGeneration) return
    showErrorState(error)
  }
}

void initializeApplication()

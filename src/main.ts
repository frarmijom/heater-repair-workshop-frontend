import './style.css'
import masterTechnicianImage from './assets/master-technician-v3.png'
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
  createRepairOrder,
  loadRepairOrders,
} from './services/repair-order-service.ts'

let repairOrders: RepairOrder[] = []
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
  appContainer.innerHTML = `
    <main class="request-state" aria-live="polite" aria-busy="true">
      <span class="request-state__spinner" aria-hidden="true"></span>
      <div>
        <p>Workshop API</p>
        <h1>Loading repair orders…</h1>
      </div>
    </main>
  `
}

function showErrorState(error: unknown): void {
  appContainer.innerHTML = `
    <main class="request-state request-state--error" role="alert">
      <span class="request-state__mark" aria-hidden="true">!</span>
      <div>
        <p>Loading error</p>
        <h1>Repair orders are unavailable.</h1>
        <p id="load-error-message" class="request-state__message"></p>
        <button id="retry-load" type="button">Try again</button>
      </div>
    </main>
  `

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
  const greeting = appContainer.querySelector<HTMLHeadingElement>('#workshop-greeting')

  if (clock === null || greeting === null) {
    throw new Error('The workshop clock or greeting element was not found.')
  }

  const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' })
  const timeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  const updateClock = (): void => {
    const now = new Date()
    const hour = now.getHours()
    clock.dateTime = now.toISOString()
    clock.replaceChildren()

    greeting.textContent =
      hour < 12
        ? 'Good morning.'
        : hour < 18
          ? 'Good afternoon.'
          : 'Good evening.'

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
  try {
    const createdOrder = await createRepairOrder(payload)
    repairOrders = [...repairOrders, createdOrder]
    renderDashboard()
  } catch (error: unknown) {
    throw new Error(getErrorMessage(error))
  }
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

function renderDashboard(): void {
  const cardsHtml = repairOrders.map(generateRepairOrderCardHtml).join('')

  appContainer.innerHTML = `
    <main class="workshop">
      <header class="workshop__header">
        <div class="workshop__identity">
          <div class="workshop__name">
            <span class="workshop__mark" aria-hidden="true">HR</span>
            <span>Heater Repair Workshop</span>
          </div>
          <time id="workshop-clock" class="workshop__clock"></time>
        </div>
        <div class="workshop__heading">
          <div>
            <p class="workshop__eyebrow">
              <span class="workshop__business-name">Taller Fuego Sur</span>
              <span aria-hidden="true">·</span>
              <span>Workshop overview</span>
            </p>
            <h1 id="workshop-greeting"></h1>
            <p class="workshop__subtitle">Here is the current repair workload.</p>
          </div>
          <div class="hero-scene" aria-hidden="true">
            <img class="master-technician" src="${masterTechnicianImage}" alt="" />
            <div class="heater-visual">
              <span class="heat-wave heat-wave--one"></span>
              <span class="heat-wave heat-wave--two"></span>
              <span class="heat-wave heat-wave--three"></span>
              <div class="heater-visual__unit">
                <span class="heater-visual__vent"></span>
                <span class="heater-visual__brand-light"></span>
                <span class="heater-visual__front-line"></span>
                <div class="heater-visual__display">
                  <span>48</span>
                  <small>°</small>
                </div>
                <div class="heater-visual__connections">
                  <span></span><span></span><span></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>
      ${generateWorkshopMonitorHtml(repairOrders)}
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
    </main>
  `

  startClock()
  setupRepairOrderForm(appContainer, addRepairOrder)
  setupRepairOrderFilters()
}

async function initializeApplication(): Promise<void> {
  showLoadingState()

  try {
    repairOrders = await loadRepairOrders()
    renderDashboard()
  } catch (error: unknown) {
    showErrorState(error)
  }
}

void initializeApplication()

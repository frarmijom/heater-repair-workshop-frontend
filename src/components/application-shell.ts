import { generateTopbarHtml } from './topbar.ts'
import { generateHeaterBlueprintHtml } from './heater-blueprint.ts'

export function generateApplicationShellHtml(content: string): string {
  return `
    <div class="app-shell">
      <button class="app-shell__skip" type="button">Ir al contenido principal</button>
      <aside id="app-sidebar" class="app-sidebar" lang="es" aria-label="Panel del taller">
        <button class="sidebar-close" type="button" aria-label="Cerrar panel lateral">×</button>
        <header class="app-shell__header">
          <svg class="app-sidebar__mark" viewBox="0 0 32 40" fill="none" aria-hidden="true" focusable="false">
            <g stroke="currentColor" stroke-width="2"><rect x="5" y="7" width="22" height="27" rx="3"/><path d="M12 7V2h8v5M10 14h12M10 18h12M11 34v5m10-5v5"/><circle cx="16" cy="27" r="3"/></g>
          </svg>
          <span class="app-shell__brand" lang="en">Heater Repair<br>Workshop</span>
        </header>
        <nav class="app-shell__nav" aria-label="Application">
          <a href="#dashboard" lang="en"><svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" focusable="false"><path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/></svg><span class="sidebar-label">Dashboard</span></a>
          <section aria-labelledby="sidebar-operation">
            <h2 id="sidebar-operation">OPERACIÓN</h2>
            <a href="#work-orders"><svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" focusable="false"><path d="M14 5a5 5 0 0 0-6 6l-5 5 5 5 5-5a5 5 0 0 0 6-6l-4 3-3-3 2-5Z"/></svg><span class="sidebar-label">Órdenes de trabajo</span></a>
            <button type="button" disabled><svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" focusable="false"><path d="M8 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-6 12v-5a6 6 0 0 1 12 0v5M17 4a4 4 0 0 1 0 8m1 3a4 4 0 0 1 4 4v3"/></svg><span class="sidebar-label">Clientes</span> <small>Próximamente</small></button>
          </section>
          <section aria-labelledby="sidebar-inventory">
            <h2 id="sidebar-inventory">INVENTARIO</h2>
            <a href="#inventory/items"><svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" focusable="false"><path d="m3 7 9-4 9 4v12l-9 3-9-3V7Zm0 0 9 4 9-4M12 11v11"/></svg><span class="sidebar-label">Inventario</span></a>
          </section>
          <section aria-labelledby="sidebar-management">
            <h2 id="sidebar-management">GESTIÓN</h2>
            <a href="#services"><svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" focusable="false"><path d="M4 5h16v14H4zM8 9h8M8 13h5"/></svg><span class="sidebar-label">Servicios</span></a>
            <button type="button" disabled><svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" focusable="false"><path d="M5 3h14v18H5zM8 16v-4m4 4V8m4 8v-6"/></svg><span class="sidebar-label">Reportes</span> <small>Próximamente</small></button>
          </section>
          <button class="app-sidebar__settings" type="button" disabled><svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" focusable="false"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/></svg><span class="sidebar-label">Configuración</span> <small>Próximamente</small></button>
        </nav>
        <div class="app-sidebar__blueprint" aria-hidden="true">${generateHeaterBlueprintHtml()}</div>
        <div class="app-shell__session">
          <div class="app-sidebar__user">
            <span class="app-sidebar__avatar" aria-hidden="true">FA</span>
            <p><strong>Franco Armijo</strong><span>Administrador</span></p>
          </div>
          <button id="logout" type="button"><svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" focusable="false"><path d="M10 4H4v16h6m4-12 4 4-4 4m-6-4h10"/></svg><span class="sidebar-label">Cerrar sesión</span></button>
          <p id="logout-error" role="alert" lang="es"></p>
        </div>
      </aside>
      <div class="sidebar-backdrop" hidden></div>
      <div class="app-shell__workspace">
      ${generateTopbarHtml()}
      <main id="main-content" class="workshop app-shell__main" lang="es" tabindex="-1">
        <p id="work-order-action-status" role="status"></p>
        ${content}
      </main>
      </div>
    </div>
  `
}

export function selectedWorkOrderId(): string | null {
  const match = /^#work-orders\/([^/]+)$/.exec(window.location.hash)
  if (!match || ['new', 'search'].includes(match[1]!)) return null
  try { return decodeURIComponent(match[1]) } catch { return null }
}

export function selectedDestination(): string {
  if (['#inventory', '#inventory/items', '#inventory/categories', '#inventory/units'].includes(window.location.hash)) return 'inventory'
  if (window.location.hash === '#services') return 'services'
  if (window.location.hash === '#work-orders/new') return 'work-order-new'
  if (window.location.hash === '#work-orders/search') return 'work-order-search'
  if (selectedWorkOrderId() !== null) return 'work-order-detail'
  return window.location.hash === '#work-orders' ? 'work-orders' : 'dashboard'
}

export function updateShellDestination(root: HTMLElement, focusHeading = false): void {
  const destination = selectedDestination()
  if (destination === 'dashboard' && window.location.hash !== '#dashboard') {
    window.history.replaceState(null, '', '#dashboard')
  }
  root.querySelectorAll<HTMLAnchorElement>('.app-shell__nav a').forEach(link => {
    const activeHash = destination === 'inventory'
      ? '#inventory/items'
      : destination === 'dashboard'
        ? '#dashboard'
        : destination.startsWith('work-order')
          ? '#work-orders'
          : `#${destination}`
    if (link.hash === activeHash) link.setAttribute('aria-current', 'page')
    else link.removeAttribute('aria-current')
  })
  root.querySelectorAll<HTMLElement>('[data-destination]').forEach(panel => {
    panel.hidden = panel.dataset.destination !== destination
    if (!panel.hidden && focusHeading) panel.querySelector<HTMLElement>('h1')?.focus()
  })
}

// State lives only for this authenticated application instance, never in storage.
export interface SidebarState { compact: boolean }

export function setupSidebar(root: HTMLElement, state: SidebarState): () => void {
  const shell = root.querySelector<HTMLElement>('.app-shell')!
  const sidebar = root.querySelector<HTMLElement>('#app-sidebar')!
  const workspace = root.querySelector<HTMLElement>('.app-shell__workspace')!
  const skip = root.querySelector<HTMLButtonElement>('.app-shell__skip')!
  const toggle = root.querySelector<HTMLButtonElement>('#sidebar-toggle')!
  const close = root.querySelector<HTMLButtonElement>('.sidebar-close')!
  const backdrop = root.querySelector<HTMLElement>('.sidebar-backdrop')!
  let mobile = window.innerWidth <= 700
  let open = false
  const sync = (): void => {
    shell.classList.toggle('app-shell--compact', !mobile && state.compact)
    shell.classList.toggle('app-shell--drawer-open', mobile && open)
    sidebar.hidden = mobile && !open
    close.hidden = !mobile
    backdrop.hidden = !mobile || !open
    workspace.inert = mobile && open
    skip.inert = mobile && open
    if (mobile && open) {
      sidebar.setAttribute('role', 'dialog')
      sidebar.setAttribute('aria-modal', 'true')
    } else {
      sidebar.removeAttribute('role')
      sidebar.removeAttribute('aria-modal')
    }
    toggle.setAttribute('aria-expanded', String(mobile ? open : !state.compact))
    toggle.setAttribute('aria-label', mobile ? 'Abrir panel lateral' : state.compact ? 'Expandir panel lateral' : 'Contraer panel lateral')
  }
  const dismiss = (returnFocus = true): void => {
    open = false
    sync()
    if (returnFocus) toggle.focus()
  }
  toggle.addEventListener('click', () => {
    if (mobile) {
      open = !open
      sync()
      if (open) close.focus()
      else toggle.focus()
    } else {
      state.compact = !state.compact
      sync()
    }
  })
  close.addEventListener('click', () => dismiss())
  backdrop.addEventListener('click', () => dismiss())
  sidebar.querySelectorAll<HTMLAnchorElement>('nav a').forEach(link => {
    link.title = link.textContent ?? ''
    link.addEventListener('click', () => {
      if (mobile) {
        dismiss(false)
        root.querySelector<HTMLElement>('[data-destination]:not([hidden]) h1')?.focus()
      }
    })
  })
  sidebar.querySelectorAll<HTMLButtonElement>('nav button, #logout').forEach(button => {
    button.title = button.textContent?.trim() ?? ''
  })
  shell.addEventListener('keydown', event => {
    if (!mobile || !open) return
    if (event.key === 'Escape') { event.preventDefault(); dismiss() }
    if (event.key === 'Tab') {
      const controls = [...sidebar.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)')]
      const first = controls[0]!
      const last = controls[controls.length - 1]!
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
  })
  const resize = (): void => {
    const next = window.innerWidth <= 700
    if (next === mobile) return
    const focusInside = sidebar.contains(document.activeElement)
    mobile = next
    open = false
    sync()
    if (focusInside) toggle.focus()
  }
  window.addEventListener('resize', resize)
  sync()
  return () => window.removeEventListener('resize', resize)
}

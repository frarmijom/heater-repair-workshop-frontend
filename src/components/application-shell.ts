import { generateHeaterBlueprintHtml } from './heater-blueprint.ts'

export function generateApplicationShellHtml(content: string): string {
  return `
    <div class="app-shell">
      <button class="app-shell__skip" type="button">Skip to main content</button>
      <aside class="app-sidebar" lang="es" aria-label="Panel del taller">
        <header class="app-shell__header">
          <svg class="app-sidebar__mark" viewBox="0 0 32 40" fill="none" aria-hidden="true" focusable="false">
            <g stroke="currentColor" stroke-width="2"><rect x="5" y="7" width="22" height="27" rx="3"/><path d="M12 7V2h8v5M10 14h12M10 18h12M11 34v5m10-5v5"/><circle cx="16" cy="27" r="3"/></g>
          </svg>
          <span class="app-shell__brand" lang="en">Heater Repair<br>Workshop</span>
        </header>
        <nav class="app-shell__nav" aria-label="Application">
          <a href="#dashboard" lang="en">Dashboard</a>
          <section aria-labelledby="sidebar-operation">
            <h2 id="sidebar-operation">OPERACIÓN</h2>
            <a href="#repairs">Reparaciones</a>
            <button type="button" disabled>Clientes <small>Próximamente</small></button>
          </section>
          <section aria-labelledby="sidebar-inventory">
            <h2 id="sidebar-inventory">INVENTARIO</h2>
            <button type="button" disabled>Repuestos <small>Próximamente</small></button>
          </section>
          <section aria-labelledby="sidebar-management">
            <h2 id="sidebar-management">GESTIÓN</h2>
            <button type="button" disabled>Reportes <small>Próximamente</small></button>
          </section>
          <button class="app-sidebar__settings" type="button" disabled>Configuración <small>Próximamente</small></button>
        </nav>
        <div class="app-sidebar__blueprint" aria-hidden="true">${generateHeaterBlueprintHtml()}</div>
        <div class="app-shell__session">
          <div class="app-sidebar__user">
            <span class="app-sidebar__avatar" aria-hidden="true">FA</span>
            <p><strong>Franco Armijo</strong><span>Administrador</span></p>
          </div>
          <button id="logout" type="button">Cerrar sesión</button>
          <p id="logout-error" role="alert" lang="en"></p>
        </div>
      </aside>
      <main id="main-content" class="workshop app-shell__main" tabindex="-1">
        <p id="repair-action-status" role="status"></p>
        ${content}
      </main>
    </div>
  `
}

export function selectedRepairId(): string | null {
  const match = /^#repairs\/([^/]+)$/.exec(window.location.hash)
  if (!match) return null
  try { return decodeURIComponent(match[1]) } catch { return null }
}

export function updateShellDestination(root: HTMLElement, focusHeading = false): void {
  const detail = selectedRepairId() !== null
  const destination = detail ? 'repair-detail' : window.location.hash === '#repairs' ? 'repairs' : 'dashboard'
  if (!detail && window.location.hash !== `#${destination}`) {
    window.history.replaceState(null, '', `#${destination}`)
  }
  root.querySelectorAll<HTMLAnchorElement>('.app-shell__nav a').forEach(link => {
    if (link.hash === `#${detail ? 'repairs' : destination}`) link.setAttribute('aria-current', 'page')
    else link.removeAttribute('aria-current')
  })
  root.querySelectorAll<HTMLElement>('[data-destination]').forEach(panel => {
    panel.hidden = panel.dataset.destination !== destination
    if (!panel.hidden && focusHeading) panel.querySelector<HTMLElement>('h1')?.focus()
  })
}

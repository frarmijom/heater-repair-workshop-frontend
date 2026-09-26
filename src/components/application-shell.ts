export function generateApplicationShellHtml(content: string): string {
  return `
    <div class="app-shell">
      <button class="app-shell__skip" type="button">Skip to main content</button>
      <header class="app-shell__header">
        <span class="app-shell__brand">Heater Repair Workshop</span>
        <div class="app-shell__session">
          <button id="logout" type="button">Sign out</button>
          <p id="logout-error" role="alert"></p>
        </div>
      </header>
      <nav class="app-shell__nav" aria-label="Application">
        <a href="#dashboard">Dashboard</a>
        <a href="#repairs">Repairs</a>
      </nav>
      <main id="main-content" class="workshop app-shell__main" tabindex="-1">
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

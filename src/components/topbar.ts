export function generateTopbarHtml(): string {
  return `<header class="app-topbar" lang="es">
    <button id="sidebar-toggle" type="button" aria-controls="app-sidebar" aria-expanded="true" aria-label="Contraer panel lateral"><span aria-hidden="true">☰</span></button>
    <div class="app-topbar__search">
      <label for="global-search">Buscar reparaciones, clientes, repuestos...</label>
      <input id="global-search" type="search" placeholder="Buscar reparaciones, clientes, repuestos..." disabled aria-describedby="search-availability" />
      <span id="search-availability">Próximamente · <kbd>Ctrl+K</kbd></span>
    </div>
    <button type="button" disabled aria-label="Notificaciones — próximamente" title="Notificaciones — próximamente">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" focusable="false"><path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5l-2 3Zm5 3h4"/></svg>
    </button>
    <span class="app-sidebar__avatar" role="img" aria-label="Franco Armijo, Administrador">FA</span>
  </header>`
}

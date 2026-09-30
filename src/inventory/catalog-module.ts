import { escapeHtml } from '../components/work-order-card.ts'
import { ApiRequestError, SessionExpiredError } from '../services/api.ts'
import { listCatalog, saveCatalog, type CatalogEntry, type CatalogKind, type CatalogInput } from './catalog-service.ts'

export function createCatalogModule(root: HTMLElement) {
  let generation = 0
  let disposed = false
  let saving = false
  let loadingCatalog = false
  let kind: CatalogKind = 'categories'
  let entries: CatalogEntry[] = []
  let editing: CatalogEntry | undefined
  let confirmation: CatalogEntry | undefined
  let message = ''
  const valid = (value: number) => !disposed && value === generation && root.isConnected
    && (!window.location.hash || window.location.hash === `#inventory/${kind}`)
  const errorText = (error: unknown) => error instanceof ApiRequestError && error.status === 409
    ? `Conflicto: ${error.message}` : error instanceof Error ? error.message : 'No se pudo completar la solicitud.'
  function render(loading = false, error = '') {
    const units = kind === 'units'
    const title = units ? 'Unidades de medida' : 'Categorías'
    root.innerHTML = `<header class="app-shell__page-header"><div><h1 id="inventory-title" tabindex="-1">Inventario</h1><p>Administración de categorías y unidades de medida</p></div></header>
      <nav class="catalog-tabs" aria-label="Inventario"><a href="#inventory/items">Artículos</a><a href="#inventory/categories" ${!units ? 'aria-current="page"' : ''}>Categorías</a><a href="#inventory/units" ${units ? 'aria-current="page"' : ''}>Unidades de medida</a></nav>
      <p id="catalog-status" role="status">${escapeHtml(message)}</p>
      <section class="work-orders-surface" aria-labelledby="catalog-list-title"><div class="catalog-heading"><h2 id="catalog-list-title">${title}</h2><button id="catalog-reload" type="button" ${saving || loadingCatalog ? 'disabled' : ''}>Actualizar listado</button></div>
      ${loading ? '<p role="status">Cargando catálogo…</p>' : error ? `<p role="alert">${escapeHtml(error)}</p><button id="catalog-retry" type="button">Reintentar</button>` : entries.length === 0 ? '<p>No hay registros en este catálogo.</p>' : `<table class="catalog-table"><caption class="dashboard-sr-only">${title}</caption><thead><tr><th scope="col">Nombre</th>${units ? '<th scope="col">Símbolo</th><th scope="col">Decimales</th>' : ''}<th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead><tbody>${entries.map(entry => `<tr><th scope="row" data-label="Nombre">${escapeHtml(entry.name)}</th>${units ? `<td data-label="Símbolo">${escapeHtml(entry.symbol ?? '')}</td><td data-label="Decimales">${entry.allowsDecimal ? 'Permitidos' : 'No permitidos'}</td>` : ''}<td data-label="Estado"><span class="catalog-state">${entry.active ? 'ACTIVO' : 'INACTIVO'}</span></td><td data-label="Acciones"><div class="catalog-row-actions"><button type="button" data-edit="${escapeHtml(entry.id)}" aria-label="Editar ${escapeHtml(entry.name)}" ${saving || loadingCatalog ? 'disabled' : ''}>Editar</button><button type="button" data-toggle="${escapeHtml(entry.id)}" aria-label="${entry.active ? 'Desactivar' : 'Activar'} ${escapeHtml(entry.name)}" ${saving || loadingCatalog ? 'disabled' : ''}>${entry.active ? 'Desactivar' : 'Activar'}</button></div></td></tr>`).join('')}</tbody></table>`}
      </section>
      ${confirmation ? `<section class="work-orders-surface" aria-labelledby="catalog-confirm-title"><h2 id="catalog-confirm-title">¿Desactivar ${escapeHtml(confirmation.name)}?</h2><p>El registro se conservará y no podrá utilizarse para nuevas asignaciones.</p><div class="catalog-row-actions"><button id="catalog-confirm" type="button">Confirmar desactivación</button><button id="catalog-keep" type="button">Cancelar</button></div><p id="catalog-confirm-error" role="alert"></p></section>` : ''}
      <section class="work-orders-surface" aria-labelledby="catalog-form-title"><h2 id="catalog-form-title">${editing ? 'Editar registro' : units ? 'Nueva unidad de medida' : 'Nueva categoría'}</h2>
      <form id="catalog-form" novalidate><div class="form-field"><label for="catalog-name">Nombre</label><input id="catalog-name" name="name" maxlength="120" required aria-describedby="catalog-name-error" value="${escapeHtml(editing?.name ?? '')}"><small id="catalog-name-error"></small></div>
      ${units ? `<div class="form-field"><label for="catalog-symbol">Símbolo</label><input id="catalog-symbol" name="symbol" maxlength="16" required aria-describedby="catalog-symbol-error" value="${escapeHtml(editing?.symbol ?? '')}"><small id="catalog-symbol-error"></small></div><label class="catalog-checkbox"><input type="checkbox" id="catalog-decimal" ${editing?.allowsDecimal ? 'checked' : ''}>Permitir cantidades decimales</label>` : ''}
      <div class="order-form__actions"><button type="submit" ${saving || loadingCatalog ? 'disabled' : ''}>${saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear registro'}</button>${editing ? '<button id="catalog-cancel" type="button">Cancelar edición</button>' : ''}</div><p id="catalog-form-error" role="alert"></p></form></section>`
    root.querySelector('#catalog-reload')?.addEventListener('click', () => { void show(kind) })
    root.querySelector('#catalog-retry')?.addEventListener('click', () => { void show(kind) })
    root.querySelectorAll<HTMLButtonElement>('[data-edit]').forEach(button => button.addEventListener('click', () => {
      editing = entries.find(entry => entry.id === button.dataset.edit); confirmation = undefined; render(); root.querySelector<HTMLInputElement>('#catalog-name')?.focus()
    }))
    root.querySelectorAll<HTMLButtonElement>('[data-toggle]').forEach(button => button.addEventListener('click', () => {
      const entry = entries.find(value => value.id === button.dataset.toggle)!
      if (entry.active) { confirmation = entry; render(); root.querySelector<HTMLButtonElement>('#catalog-confirm')?.focus() }
      else void mutate({ active: true, expectedVersion: entry.version }, entry, '#catalog-form-error')
    }))
    root.querySelector('#catalog-keep')?.addEventListener('click', () => { const id = confirmation?.id; confirmation = undefined; render(); root.querySelector<HTMLButtonElement>(`[data-toggle="${id}"]`)?.focus() })
    root.querySelector('#catalog-confirm')?.addEventListener('click', () => { if (confirmation) void mutate({ active: false, expectedVersion: confirmation.version }, confirmation, '#catalog-confirm-error') })
    root.querySelector('#catalog-cancel')?.addEventListener('click', () => { editing = undefined; render(); root.querySelector<HTMLInputElement>('#catalog-name')?.focus() })
    root.querySelector<HTMLFormElement>('#catalog-form')?.addEventListener('submit', event => {
      event.preventDefault(); if (saving || loadingCatalog) return
      let first: HTMLInputElement | undefined
      for (const field of ['name', ...(units ? ['symbol'] : [])]) {
        const input = root.querySelector<HTMLInputElement>(`#catalog-${field}`)!
        const invalid = !input.value.trim() || input.value.length > input.maxLength
        root.querySelector(`#catalog-${field}-error`)!.textContent = invalid ? 'Completa este campo con un texto válido.' : ''
        input.setAttribute('aria-invalid', String(invalid)); if (invalid && !first) first = input
      }
      if (first) { first.focus(); return }
      const input: CatalogInput = { name: root.querySelector<HTMLInputElement>('#catalog-name')!.value.trim() }
      if (units) { input.symbol = root.querySelector<HTMLInputElement>('#catalog-symbol')!.value.trim(); input.allowsDecimal = root.querySelector<HTMLInputElement>('#catalog-decimal')!.checked }
      if (editing) input.expectedVersion = editing.version
      void mutate(input, editing, '#catalog-form-error')
    })
  }
  async function mutate(input: CatalogInput, target: CatalogEntry | undefined, errorSelector: string) {
    if (saving || loadingCatalog) return
    const current = generation; saving = true
    message = ''; root.querySelector('#catalog-status')!.textContent = ''
    root.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = true })
    root.querySelector('#catalog-form')?.setAttribute('aria-busy', 'true')
    root.querySelector(errorSelector)!.textContent = ''
    try {
      const saved = await saveCatalog(kind, input, target?.id)
      if (!valid(current)) return
      entries = [...entries.filter(entry => entry.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name))
      editing = undefined; confirmation = undefined; message = 'Registro guardado correctamente.'; saving = false; render()
      root.querySelector<HTMLInputElement>('#catalog-name')?.focus()
    } catch (error) {
      if (!valid(current) || error instanceof SessionExpiredError) return
      root.querySelector(errorSelector)!.textContent = errorText(error)
    } finally {
      saving = false
      if (!disposed && root.isConnected) {
        root.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = loadingCatalog })
        const submit = root.querySelector<HTMLButtonElement>('button[type=submit]')
        if (submit) submit.textContent = editing ? 'Guardar cambios' : 'Crear registro'
        root.querySelector('#catalog-form')?.setAttribute('aria-busy', 'false')
      }
    }
  }
  async function show(next: CatalogKind) {
    kind = next; loadingCatalog = true; const current = ++generation; editing = undefined; confirmation = undefined; entries = []; message = ''; render(true)
    try { const loaded = await listCatalog(next); if (valid(current)) { loadingCatalog = false; entries = loaded; render() } }
    catch (error) { if (valid(current) && !(error instanceof SessionExpiredError)) { loadingCatalog = false; render(false, errorText(error)) } }
  }
  return { show, dispose() { disposed = true; generation++ } }
}

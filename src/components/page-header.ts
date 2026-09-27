import { escapeHtml } from './repair-order-card.ts'

interface PageHeaderOptions {
  id: string
  title: string
  description: string
  contextHtml?: string // Trusted application markup only.
}

export function generatePageHeaderHtml({ id, title, description, contextHtml = '' }: PageHeaderOptions): string {
  return `<header class="app-shell__page-header" lang="es">
    <div><h1 id="${escapeHtml(id)}" tabindex="-1">${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div>
    <div class="page-header__context">${contextHtml}</div>
  </header>`
}

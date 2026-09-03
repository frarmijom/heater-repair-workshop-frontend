import { RepairStatus } from '../models/index.ts'
import type { RepairOrder } from '../models/index.ts'

const statusLabels: Record<RepairStatus, string> = {
  [RepairStatus.RECEIVED]: 'Received',
  [RepairStatus.IN_PROGRESS]: 'In repair',
  [RepairStatus.COMPLETED]: 'Completed',
}

const receivedDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const completedDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
})

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function generateRepairOrderCardHtml(order: RepairOrder): string {
  const completedDateHtml =
    order.status === RepairStatus.COMPLETED && order.completedAt !== null
      ? `
        <div>
          <dt>Completed</dt>
          <dd>${completedDateFormatter.format(new Date(order.completedAt))}</dd>
        </div>
      `
      : ''

  return `
    <article class="repair-card repair-card--${order.status}">
      <header class="repair-card__header">
        <p class="repair-card__id">Repair order #${order.id}</p>
        <span class="repair-card__status repair-card__status--${order.status}">
          ${statusLabels[order.status]}
        </span>
      </header>
      <h2>${escapeHtml(order.heaterBrand)} ${escapeHtml(order.heaterModel)}</h2>
      <p class="repair-card__customer">
        ${escapeHtml(order.customerName)}
        <span>${escapeHtml(order.customerContact)}</span>
      </p>
      <p class="repair-card__issue">${escapeHtml(order.reportedIssue)}</p>
      <dl class="repair-card__dates">
        <div>
          <dt>Received</dt>
          <dd>${receivedDateFormatter.format(new Date(order.receivedAt))}</dd>
        </div>
        ${completedDateHtml}
      </dl>
    </article>
  `
}

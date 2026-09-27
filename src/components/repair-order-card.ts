import { serviceTypePresentation } from './service-type-presentation.ts'
import { RepairStatus } from '../models/index.ts'
import type { RepairOrder } from '../models/index.ts'

import { repairStatusPresentation } from './repair-status.ts'
import { formatRepairDate, formatRepairDateTime } from '../formatters/repair-time.ts'

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function generateRepairOrderCardHtml(order: RepairOrder): string {
  const service = serviceTypePresentation[order.serviceType]
  const { label, modifier: statusModifier } = repairStatusPresentation[order.status]
  const completedDate = formatRepairDate(order.completedAt)
  const completedDateHtml =
    order.status === RepairStatus.COMPLETED && completedDate !== null
      ? `
        <div>
          <dt>${repairStatusPresentation[RepairStatus.COMPLETED].label}</dt>
          <dd>${completedDate}</dd>
        </div>
      `
      : ''
  const diagnosisHtml =
    order.diagnosis === null
      ? ''
      : `<p class="repair-card__diagnosis"><strong>Diagnóstico:</strong> ${escapeHtml(order.diagnosis)}</p>`
  const actionHtml =
    order.status === RepairStatus.RECEIVED
      ? `<button type="button" data-repair-action="start" data-repair-order-id="${escapeHtml(order.id)}">Iniciar reparación</button>`
      : order.status === RepairStatus.IN_PROGRESS
        ? `<button type="button" data-repair-action="complete" data-repair-order-id="${escapeHtml(order.id)}">Completar reparación</button>`
        : ''

  return `
    <article class="repair-card repair-card--${statusModifier}" data-order-id="${escapeHtml(order.id)}">
      <header class="repair-card__header">
        <p class="repair-card__id">Reparación #${escapeHtml(order.id)}</p>
        <p class="repair-card__service">Tipo de servicio: ${service.label}</p>
        <h3>${escapeHtml(order.heaterBrand)} ${escapeHtml(order.heaterModel)}</h3>
        <p class="repair-card__customer">
          ${escapeHtml(order.customerName)} · ${escapeHtml(order.customerContact)}
        </p>
      </header>
      <div>
        <span class="repair-card__status repair-card__status--${statusModifier}">${label}</span>
      </div>
      <dl class="repair-card__dates">
        <div>
          <dt>${repairStatusPresentation[RepairStatus.RECEIVED].label}</dt>
          <dd>${formatRepairDateTime(order.receivedAt) ?? 'Fecha no disponible'}</dd>
        </div>
        ${completedDateHtml}
      </dl>
      <div class="repair-card__actions">
        ${actionHtml}
        <a class="repair-detail-link" href="#repairs/${escapeHtml(encodeURIComponent(order.id))}">Ver detalle</a>
        <p class="repair-card__action-error" role="alert"></p>
      </div>
      <div class="repair-card__notes">
        <p class="repair-card__issue"><strong>${service.issueLabel}:</strong> ${escapeHtml(order.reportedIssue || (service.issueRequired ? '' : '—'))}</p>
        ${diagnosisHtml}
      </div>
    </article>
  `
}

import { availableWorkOrderActions, workOrderActions } from './work-order-actions.ts'
import { serviceTypePresentation } from './service-type-presentation.ts'
import { WorkOrderStatus } from '../models/index.ts'
import { workOrderEquipmentSummary, type WorkOrder } from '../models/index.ts'

import { workOrderStatusPresentation } from './work-order-status.ts'
import { formatWorkOrderDate, formatWorkOrderDateTime } from '../formatters/work-order-time.ts'

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function generateWorkOrderCardHtml(order: WorkOrder): string {
  const service = serviceTypePresentation[order.serviceType]
  const { label, modifier: statusModifier } = workOrderStatusPresentation[order.status]
  const completedDate = formatWorkOrderDate(order.completedAt)
  const completedDateHtml =
    order.status === WorkOrderStatus.COMPLETED && completedDate !== null
      ? `
        <div>
          <dt>${workOrderStatusPresentation[WorkOrderStatus.COMPLETED].label}</dt>
          <dd>${completedDate}</dd>
        </div>
      `
      : ''
  const diagnosisHtml =
    order.diagnosis === null
      ? ''
      : `<p class="work-order-card__diagnosis"><strong>Diagnóstico:</strong> ${escapeHtml(order.diagnosis)}</p>`

  return `
    <article class="work-order-card work-order-card--${statusModifier}" data-order-id="${escapeHtml(order.id)}">
      <header class="work-order-card__header">
        <p class="work-order-card__id">Orden de trabajo #${escapeHtml(order.id)}</p>
        <p class="work-order-card__service">Tipo de servicio: ${service.label}</p>
        <h3>${escapeHtml(workOrderEquipmentSummary(order))}</h3>
        <p class="work-order-card__customer">
          ${escapeHtml(order.customerName)} · ${escapeHtml(order.customerContact)}
        </p>
      </header>
      <div>
        <span class="work-order-card__status work-order-card__status--${statusModifier}">${label}</span>
      </div>
      <dl class="work-order-card__dates">
        <div>
          <dt>${workOrderStatusPresentation[WorkOrderStatus.RECEIVED].label}</dt>
          <dd>${formatWorkOrderDateTime(order.receivedAt) ?? 'Fecha no disponible'}</dd>
        </div>
        ${completedDateHtml}
      </dl>
      <div class="work-order-card__actions">
        ${availableWorkOrderActions(order).map(action => `<button type="button" data-work-order-action="${action}" data-work-order-id="${escapeHtml(order.id)}">${workOrderActions[action]}</button>`).join('')}
        <a class="work-order-detail-link" href="#work-orders/${escapeHtml(encodeURIComponent(order.id))}">Ver detalle</a>
        <p class="work-order-card__action-error" role="alert"></p>
      </div>
      <div class="work-order-card__notes">
        <p class="work-order-card__issue"><strong>${service.issueLabel}:</strong> ${escapeHtml(order.reportedIssue || (service.issueRequired ? '' : '—'))}</p>
        ${diagnosisHtml}
      </div>
    </article>
  `
}

import { serviceTypePresentation } from './service-type-presentation.ts'
import type { WorkOrder } from '../models/index.ts'
import { escapeHtml } from './work-order-card.ts'
import { workOrderStatusPresentation } from './work-order-status.ts'
import { formatWorkOrderDateTime } from '../formatters/work-order-time.ts'

export function generateWorkOrderResultsHtml(orders: readonly WorkOrder[]): string {
  if (!orders.length) return '<p id="work-order-empty" class="work-orders-empty" role="status">No se encontraron órdenes de trabajo</p>'
  return `<table class="work-order-results" aria-labelledby="work-order-results-title">
    <thead><tr>${['Orden / Servicio', 'Cliente', 'Equipo', 'Estado', 'Ingreso', 'Acción'].map(label => `<th scope="col">${label}</th>`).join('')}</tr></thead>
    <tbody>${orders.map(order => {
      const { label, modifier } = workOrderStatusPresentation[order.status]
      return `<tr data-order-id="${escapeHtml(order.id)}">
        <th scope="row" data-label="Orden / Servicio"><span>#${escapeHtml(order.id)}</span><small class="work-order-service-type">${serviceTypePresentation[order.serviceType].label}</small></th>
        <td data-label="Cliente">${escapeHtml(order.customerName)}</td>
        <td data-label="Equipo">${escapeHtml(order.heaterBrand)} ${escapeHtml(order.heaterModel)}</td>
        <td data-label="Estado"><span class="work-order-card__status work-order-card__status--${modifier}">${label}</span></td>
        <td data-label="Ingreso">${formatWorkOrderDateTime(order.receivedAt, 'es-CL') ?? 'Fecha no disponible'}</td>
        <td data-label="Acción"><a class="work-order-detail-link" href="#work-orders/${escapeHtml(encodeURIComponent(order.id))}">Ver detalle<span class="dashboard-sr-only"> de la orden de trabajo #${escapeHtml(order.id)}</span></a></td>
      </tr>`
    }).join('')}</tbody></table>`
}

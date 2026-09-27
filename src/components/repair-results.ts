import { serviceTypePresentation } from './service-type-presentation.ts'
import type { RepairOrder } from '../models/index.ts'
import { escapeHtml } from './repair-order-card.ts'
import { repairStatusPresentation } from './repair-status.ts'
import { formatRepairDateTime } from '../formatters/repair-time.ts'

export function generateRepairResultsHtml(orders: readonly RepairOrder[]): string {
  if (!orders.length) return '<p id="repair-order-empty" class="repairs-empty" role="status">No se encontraron reparaciones</p>'
  return `<table class="repair-results" aria-labelledby="repair-results-title">
    <thead><tr>${['Orden / Servicio', 'Cliente', 'Equipo', 'Estado', 'Ingreso', 'Acción'].map(label => `<th scope="col">${label}</th>`).join('')}</tr></thead>
    <tbody>${orders.map(order => {
      const { label, modifier } = repairStatusPresentation[order.status]
      return `<tr data-order-id="${escapeHtml(order.id)}">
        <th scope="row" data-label="Orden / Servicio"><span>#${escapeHtml(order.id)}</span><small class="repair-service-type">${serviceTypePresentation[order.serviceType].label}</small></th>
        <td data-label="Cliente">${escapeHtml(order.customerName)}</td>
        <td data-label="Equipo">${escapeHtml(order.heaterBrand)} ${escapeHtml(order.heaterModel)}</td>
        <td data-label="Estado"><span class="repair-card__status repair-card__status--${modifier}">${label}</span></td>
        <td data-label="Ingreso">${formatRepairDateTime(order.receivedAt, 'es-CL') ?? 'Fecha no disponible'}</td>
        <td data-label="Acción"><a class="repair-detail-link" href="#repairs/${escapeHtml(encodeURIComponent(order.id))}">Ver detalle<span class="dashboard-sr-only"> de la reparación #${escapeHtml(order.id)}</span></a></td>
      </tr>`
    }).join('')}</tbody></table>`
}

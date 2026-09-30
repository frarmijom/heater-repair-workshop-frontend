import { WorkOrderStatus, workOrderEquipmentSummary, type WorkOrder } from '../models/index.ts'
import { workOrderStatusPresentation } from './work-order-status.ts'
import { escapeHtml } from './work-order-card.ts'
import { formatWorkOrderDate, formatWorkOrderDateTime, formatReceptionElapsed } from '../formatters/work-order-time.ts'
import { dashboardKpis, summarizeDashboard, weeklyReceptions } from '../dashboard/dashboard-data.ts'

const link = (order: WorkOrder): string => `<a href="#work-orders/${escapeHtml(encodeURIComponent(order.id))}">Abrir orden de trabajo #${escapeHtml(order.id)}</a>`
const paths = {
  diagnosis: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  'waiting-customer': '<circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',
  'waiting-parts': '<path d="M4 4h16v16H4zM8 8h8"/>',
  'not-approved': '<circle cx="12" cy="12" r="8"/><path d="m8 8 8 8m-8 0 8-8"/>',
  received: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
  'in-progress': '<path d="M14 5a5 5 0 0 0-6 6l-5 5a2 2 0 0 0 3 3l5-5a5 5 0 0 0 6-6l-3 3-3-3 3-3Z"/>',
  completed: '<circle cx="12" cy="12" r="8"/><path d="m8 12 3 3 5-6"/>',
  attention: '<path d="m12 3 10 18H2L12 3Z M12 9v5 M12 17v1"/>',
}
const icon = (kind: keyof typeof paths): string => `<svg class="dashboard-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[kind]}</svg>`
const kpiIcons = { total: 'waiting-parts', active: 'diagnosis', inProgress: 'in-progress',
  waiting: 'received', completed: 'completed', notApproved: 'not-approved' } as const
const shortDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })

export function generateWorkshopMonitorHtml(orders: readonly WorkOrder[], now = Date.now()): string {
  const { counts, metrics, groups, attention, activity } = summarizeDashboard(orders, now)
  const weeks = weeklyReceptions(orders, now)
  const maximum = Math.max(0, ...weeks.map(week => week.count))
  let offset = 0
  const segments = Object.values(WorkOrderStatus).map(status => {
    const percentage = orders.length ? counts[status] / orders.length * 100 : 0
    const segment = `<circle class="dashboard-tone--${workOrderStatusPresentation[status].modifier}" cx="60" cy="60" r="46" pathLength="100" stroke-dasharray="${percentage} ${100 - percentage}" stroke-dashoffset="${-offset}"/>`
    offset += percentage
    return segment
  }).join('')
  return `<div class="operational-dashboard">
    <section class="dashboard-summary" aria-labelledby="workload-title">
      <h2 id="workload-title">Resumen del taller</h2>
      <dl class="dashboard-summary__metrics">${dashboardKpis.map(({ key, label }) => `
        <div class="dashboard-metric dashboard-metric--${key}" data-kpi="${key}">
          <dt>${label}<span class="dashboard-kpi-icon">${icon(kpiIcons[key])}</span></dt><dd>${metrics[key]}</dd>
        </div>`).join('')}</dl>
      ${orders.length === 0 ? '<p>Aún no hay órdenes de trabajo.</p>' : ''}
    </section>
    <div class="dashboard-overview">
      <section class="dashboard-panel" aria-labelledby="status-title">
        <h2 id="status-title">Estado de órdenes de trabajo</h2>
        <p class="dashboard-caption">Distribución de las órdenes cargadas.</p>
        <div class="dashboard-status-layout">
          ${orders.length ? `<div class="dashboard-donut" aria-hidden="true">
            <svg viewBox="0 0 120 120" focusable="false"><g transform="rotate(-90 60 60)">${segments}</g></svg>
            <div><span>TOTAL</span><b>${orders.length}</b></div>
          </div>` : '<p class="dashboard-empty">No hay órdenes de trabajo para mostrar la distribución.</p>'}
          <ul class="dashboard-distribution" aria-labelledby="status-title">${Object.values(WorkOrderStatus).map(status => `<li>
            <span class="dashboard-legend-dot dashboard-tone--${workOrderStatusPresentation[status].modifier}" aria-hidden="true"></span>
            <span>${workOrderStatusPresentation[status].label}</span><strong>${counts[status]}</strong>
            <span class="dashboard-percentage">${orders.length ? `${(counts[status] / orders.length * 100).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : '—'}</span>
          </li>`).join('')}</ul>
        </div>
      </section>
      <section class="dashboard-panel dashboard-state-summary" aria-labelledby="state-summary-title">
        <h2 id="state-summary-title">Resumen por tipo de estado</h2>
        ${groups.map(group => `<div class="dashboard-state-group" data-state-group="${group.id}">
          <h3>${group.label}<strong>${group.total}</strong></h3>
          <dl>${group.statuses.map(status => `<div><dt><span class="dashboard-legend-dot dashboard-tone--${workOrderStatusPresentation[status].modifier}" aria-hidden="true"></span>${workOrderStatusPresentation[status].label}</dt><dd>${counts[status]}</dd></div>`).join('')}</dl>
        </div>`).join('')}
      </section>
    </div>
    <section class="dashboard-panel dashboard-attention-panel" aria-labelledby="attention-title">
      <div class="dashboard-panel-heading"><h2 id="attention-title">${icon('attention')}Órdenes de trabajo que requieren atención</h2>
        <a href="#work-orders">Ver todas las órdenes de trabajo<span aria-hidden="true"> →</span></a></div>
      <p id="attention-description" class="dashboard-caption">Recibidas y pendientes de iniciar, desde la recepción más antigua. Fechas no disponibles o futuras al final.</p>
      ${attention.length === 0 ? '<p class="dashboard-empty">No hay órdenes de trabajo pendientes de iniciar.</p>' : `
      <table class="dashboard-attention" aria-labelledby="attention-title" aria-describedby="attention-description">
        <thead><tr>${['Orden', 'Cliente', 'Equipo', 'Estado', 'Tiempo desde recepción', 'Acción'].map(label => `<th scope="col">${label}</th>`).join('')}</tr></thead>
        <tbody>${attention.slice(0, 5).map(order => `<tr>
          <th scope="row" data-label="Orden">#${escapeHtml(order.id)}</th>
          <td data-label="Cliente">${escapeHtml(order.customerName)}</td>
          <td data-label="Equipo">${escapeHtml(workOrderEquipmentSummary(order))}</td>
          <td data-label="Estado"><span class="dashboard-state dashboard-tone--${workOrderStatusPresentation[order.status].modifier}">${workOrderStatusPresentation[order.status].label}</span></td>
          <td data-label="Tiempo desde recepción">${escapeHtml(formatReceptionElapsed(order, now) ?? 'No disponible')}</td>
          <td data-label="Acción">${link(order)}</td>
        </tr>`).join('')}</tbody></table>`}
    </section>
    <section class="dashboard-panel" aria-labelledby="activity-title">
        <h2 id="activity-title">Actividad reciente</h2>
        <p class="dashboard-caption">Últimas recepciones y finalizaciones con fecha válida.</p>
        ${activity.length === 0 ? '<p class="dashboard-empty">No hay actividad con fechas disponibles.</p>' : `
        <ol class="dashboard-activity">${activity.map(({ order, kind, at }) => `<li>
          <span class="dashboard-activity-marker dashboard-tone--${kind === 'received' ? 'received' : 'completed'}">${icon(kind === 'received' ? 'received' : 'completed')}</span>
          <div><strong>Orden de trabajo ${kind === 'received' ? 'recibida' : 'completada'}</strong>${link(order)}</div>
          <time datetime="${new Date(at).toISOString()}">${formatWorkOrderDateTime(new Date(at).toISOString())}</time>
        </li>`).join('')}</ol>`}
      </section>
    <section class="dashboard-panel" aria-labelledby="weekly-title">
      <h2 id="weekly-title">Órdenes de trabajo por semana</h2>
      <p id="weekly-description" class="dashboard-caption">Recepciones en las últimas ocho semanas, incluida la actual hasta este momento. Semanas de lunes a domingo, en hora local. Se excluyen fechas inválidas y futuras.</p>
      <ul class="dashboard-weekly" aria-labelledby="weekly-title" aria-describedby="weekly-description">${weeks.map(({ start, end, count }) => {
        const last = new Date(end)
        last.setDate(last.getDate() - 1)
        return `<li><strong>${count}<span class="dashboard-sr-only"> recepciones</span></strong>
          <span class="dashboard-weekly-track" aria-hidden="true"><span style="height:${maximum ? count / maximum * 100 : 0}%"></span></span>
          <span class="dashboard-week-label" aria-hidden="true">${shortDate.format(start)}</span>
          <span class="dashboard-sr-only">${formatWorkOrderDate(start.toISOString())} – ${formatWorkOrderDate(last.toISOString())}</span></li>`
      }).join('')}</ul>
      ${maximum === 0 ? '<p class="dashboard-empty">No hay recepciones con fecha válida en este período.</p>' : ''}
    </section>
  </div>`
}

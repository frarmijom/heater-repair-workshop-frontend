import { RepairStatus, type RepairOrder } from '../models/index.ts'
import { repairStatusPresentation } from './repair-status.ts'
import { escapeHtml } from './repair-order-card.ts'
import { formatRepairDate, formatRepairDateTime, formatReceptionElapsed } from '../formatters/repair-time.ts'
import { dashboardCategories, summarizeDashboard, weeklyReceptions } from '../dashboard/dashboard-data.ts'

const link = (order: RepairOrder): string => `<a href="#repairs/${escapeHtml(encodeURIComponent(order.id))}">Abrir reparación #${escapeHtml(order.id)}</a>`
const bar = (count: number, max: number): string => `<span class="dashboard-bar" aria-hidden="true"><span style="width:${max ? count / max * 100 : 0}%"></span></span>`

export function generateWorkshopMonitorHtml(orders: readonly RepairOrder[], now = Date.now()): string {
  const { counts, attention, activity } = summarizeDashboard(orders, now)
  const weeks = weeklyReceptions(orders, now)
  const maximum = Math.max(0, ...weeks.map(week => week.count))
  return `<div class="operational-dashboard">
    <section class="dashboard-summary" aria-labelledby="workload-title">
      <h2 id="workload-title">Resumen del taller</h2>
      <dl class="dashboard-summary__metrics">${dashboardCategories.map(({ status, label, context }) => `
        <div class="dashboard-metric dashboard-metric--${repairStatusPresentation[status].modifier}">
          <dt>${label}<small>${context}</small></dt><dd>${counts[status]}</dd>
        </div>`).join('')}</dl>
      <p class="dashboard-summary__total">Total de reparaciones: <strong>${orders.length}</strong></p>
      ${orders.length === 0 ? '<p>Aún no hay reparaciones.</p>' : ''}
    </section>
    <section class="dashboard-panel" aria-labelledby="attention-title">
      <h2 id="attention-title">Reparaciones que requieren atención</h2>
      <p>Recibidas y pendientes de iniciar, desde la recepción más antigua. Fechas no disponibles o futuras al final.</p>
      ${attention.length === 0 ? '<p class="dashboard-empty">No hay reparaciones pendientes de iniciar.</p>' : `
      <ul class="dashboard-attention">${attention.slice(0, 5).map(order => `<li>
        <div><strong>Orden #${escapeHtml(order.id)}</strong><span>${escapeHtml(order.customerName)}</span></div>
        <div><span>${escapeHtml(order.heaterBrand)} ${escapeHtml(order.heaterModel)}</span><span class="dashboard-state">${repairStatusPresentation[order.status].label}</span></div>
        <div><span>Tiempo desde recepción</span><strong>${escapeHtml(formatReceptionElapsed(order, now) ?? 'No disponible')}</strong></div>
        ${link(order)}
      </li>`).join('')}</ul>`}
      <a href="#repairs">Ver todas las reparaciones</a>
    </section>
    <div class="dashboard-secondary">
      <section class="dashboard-panel" aria-labelledby="activity-title">
        <h2 id="activity-title">Actividad reciente</h2>
        <p>Últimas recepciones y finalizaciones con fecha válida.</p>
        ${activity.length === 0 ? '<p class="dashboard-empty">No hay actividad con fechas disponibles.</p>' : `
        <ol class="dashboard-activity">${activity.map(({ order, kind, at }) => `<li>
          <strong>Reparación ${kind === 'received' ? 'recibida' : 'completada'}</strong>
          ${link(order)}<time datetime="${new Date(at).toISOString()}">${formatRepairDateTime(new Date(at).toISOString())}</time>
        </li>`).join('')}</ol>`}
      </section>
      <section class="dashboard-panel" aria-labelledby="status-title">
        <h2 id="status-title">Estado de reparaciones</h2>
        <p>Distribución de las órdenes cargadas.</p>
        <ul class="dashboard-distribution">${Object.values(RepairStatus).map(status => `<li>
          <span>${repairStatusPresentation[status].label}</span><strong>${counts[status]}</strong>
          ${bar(counts[status], orders.length)}
        </li>`).join('')}</ul>
      </section>
    </div>
    <section class="dashboard-panel" aria-labelledby="weekly-title">
      <h2 id="weekly-title">Reparaciones por semana</h2>
      <p>Recepciones en las últimas ocho semanas, incluida la actual hasta este momento. Semanas de lunes a domingo, en hora local. Se excluyen fechas inválidas y futuras.</p>
      <ul class="dashboard-weekly">${weeks.map(({ start, end, count }) => {
        const last = new Date(end)
        last.setDate(last.getDate() - 1)
        return `<li><span>${formatRepairDate(start.toISOString())} – ${formatRepairDate(last.toISOString())}</span>
          <strong>${count} recepciones</strong>${bar(count, maximum)}</li>`
      }).join('')}</ul>
      ${maximum === 0 ? '<p class="dashboard-empty">No hay recepciones con fecha válida en este período.</p>' : ''}
    </section>
  </div>`
}

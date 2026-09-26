import { RepairStatus } from '../models/index.ts'
import type { RepairOrder } from '../models/index.ts'
import { repairStatusPresentation } from './repair-status.ts'

export function generateWorkshopMonitorHtml(
  repairOrders: readonly RepairOrder[],
): string {
  const metricsHtml = Object.values(RepairStatus).map(status => {
    const { label, modifier } = repairStatusPresentation[status]
    const count = repairOrders.filter(order => order.status === status).length
    return `
      <div class="dashboard-metric dashboard-metric--${modifier}">
        <dt>${label}</dt>
        <dd>${count}</dd>
      </div>
    `
  }).join('')

  return `
    <section class="dashboard-summary" aria-labelledby="workload-title">
      <h2 id="workload-title">Workshop overview</h2>
      <p class="dashboard-summary__description">Current repair workload</p>
      <dl class="dashboard-summary__metrics">
        ${metricsHtml}
      </dl>
      <p class="dashboard-summary__total">Total repairs: <strong>${repairOrders.length}</strong></p>
      ${repairOrders.length === 0 ? '<p>No repair orders yet.</p>' : ''}
    </section>
  `
}

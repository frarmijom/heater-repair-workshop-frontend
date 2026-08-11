import { RepairStatus } from '../models/index.ts'
import type { RepairOrder } from '../models/index.ts'

interface MonitorMetric {
  label: string
  value: number
  modifier: string
}

export function generateWorkshopMonitorHtml(
  repairOrders: readonly RepairOrder[],
): string {
  const total = repairOrders.length
  const received = repairOrders.filter(
    ({ status }) => status === RepairStatus.RECEIVED,
  ).length
  const inRepair = repairOrders.filter(
    ({ status }) => status === RepairStatus.IN_REPAIR,
  ).length
  const completed = repairOrders.filter(
    ({ status }) => status === RepairStatus.COMPLETED,
  ).length

  const metrics: readonly MonitorMetric[] = [
    {
      label: 'Total workload',
      value: total,
      modifier: 'total',
    },
    {
      label: 'Received',
      value: received,
      modifier: 'received',
    },
    {
      label: 'In repair',
      value: inRepair,
      modifier: 'in-repair',
    },
    {
      label: 'Completed',
      value: completed,
      modifier: 'completed',
    },
  ]

  const metricsHtml = metrics
    .map(
      ({ label, value, modifier }) => `
        <article class="monitor-card monitor-card--${modifier}">
          <span class="monitor-card__indicator" aria-hidden="true"></span>
          <strong>${value}</strong>
          <span>${label}</span>
        </article>
      `,
    )
    .join('')

  const percentage = (value: number): number =>
    total === 0 ? 0 : (value / total) * 100

  return `
    <section class="monitor" aria-labelledby="monitor-title">
      <header class="monitor__header">
        <div>
          <p>Current status</p>
          <h2 id="monitor-title">Workshop monitor</h2>
        </div>
        <span class="monitor__current">
          <span aria-hidden="true"></span>
          Current data
        </span>
      </header>
      <div class="monitor__grid">
        ${metricsHtml}
      </div>
      <div
        class="monitor__distribution"
        role="img"
        aria-label="${received} received, ${inRepair} in repair, ${completed} completed"
      >
        <span class="monitor__segment monitor__segment--received" style="width: ${percentage(received)}%"></span>
        <span class="monitor__segment monitor__segment--in-repair" style="width: ${percentage(inRepair)}%"></span>
        <span class="monitor__segment monitor__segment--completed" style="width: ${percentage(completed)}%"></span>
      </div>
    </section>
  `
}

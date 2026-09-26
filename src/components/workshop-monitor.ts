import { RepairStatus } from '../models/index.ts'
import type { RepairOrder } from '../models/index.ts'
import { repairStatusPresentation } from './repair-status.ts'

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
    ({ status }) => status === RepairStatus.IN_PROGRESS,
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
      label: repairStatusPresentation[RepairStatus.RECEIVED].label,
      value: received,
      modifier: repairStatusPresentation[RepairStatus.RECEIVED].modifier,
    },
    {
      label: repairStatusPresentation[RepairStatus.IN_PROGRESS].label,
      value: inRepair,
      modifier: repairStatusPresentation[RepairStatus.IN_PROGRESS].modifier,
    },
    {
      label: repairStatusPresentation[RepairStatus.COMPLETED].label,
      value: completed,
      modifier: repairStatusPresentation[RepairStatus.COMPLETED].modifier,
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
        aria-label="${received} ${repairStatusPresentation[RepairStatus.RECEIVED].label}, ${inRepair} ${repairStatusPresentation[RepairStatus.IN_PROGRESS].label}, ${completed} ${repairStatusPresentation[RepairStatus.COMPLETED].label}"
      >
        <span class="monitor__segment monitor__segment--${repairStatusPresentation[RepairStatus.RECEIVED].modifier}" style="width: ${percentage(received)}%"></span>
        <span class="monitor__segment monitor__segment--${repairStatusPresentation[RepairStatus.IN_PROGRESS].modifier}" style="width: ${percentage(inRepair)}%"></span>
        <span class="monitor__segment monitor__segment--${repairStatusPresentation[RepairStatus.COMPLETED].modifier}" style="width: ${percentage(completed)}%"></span>
      </div>
    </section>
  `
}

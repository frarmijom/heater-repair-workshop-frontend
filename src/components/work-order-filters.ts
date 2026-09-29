import { WorkOrderStatus } from '../models/index.ts'
import type { WorkOrder } from '../models/index.ts'
import { workOrderStatusPresentation } from './work-order-status.ts'

export type WorkOrderFilter = WorkOrderStatus | 'all'

interface FilterOption {
  label: string
  value: WorkOrderFilter
}

export const workOrderFilterOptions: readonly FilterOption[] = [
  { label: 'Todas', value: 'all' },
  ...Object.values(WorkOrderStatus).map(value => ({
    value, label: workOrderStatusPresentation[value].label,
  })),
]

export function isWorkOrderFilter(value: string): value is WorkOrderFilter {
  return workOrderFilterOptions.some((option) => option.value === value)
}

export function generateWorkOrderFiltersHtml(
  workOrders: readonly WorkOrder[],
  showCounts = true,
): string {
  return workOrderFilterOptions
    .map(({ label, value }) => {
      const count =
        value === 'all'
          ? workOrders.length
          : workOrders.filter(({ status }) => status === value).length

      return `
        <button
          class="filter-button"
          type="button"
          data-work-order-status="${value}"
          aria-pressed="${value === 'all'}"
        >
          <span>${label}</span>
          ${showCounts ? `<strong>${count}</strong>` : ''}
        </button>
      `
    })
    .join('')
}

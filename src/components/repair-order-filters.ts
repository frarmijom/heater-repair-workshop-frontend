import { RepairStatus } from '../models/index.ts'
import type { RepairOrder } from '../models/index.ts'

export type RepairOrderFilter = RepairStatus | 'all'

interface FilterOption {
  label: string
  value: RepairOrderFilter
}

export const repairOrderFilterOptions: readonly FilterOption[] = [
  { label: 'All', value: 'all' },
  { label: 'Received', value: RepairStatus.RECEIVED },
  { label: 'In repair', value: RepairStatus.IN_REPAIR },
  { label: 'Completed', value: RepairStatus.COMPLETED },
]

export function isRepairOrderFilter(value: string): value is RepairOrderFilter {
  return repairOrderFilterOptions.some((option) => option.value === value)
}

export function generateRepairOrderFiltersHtml(
  repairOrders: readonly RepairOrder[],
): string {
  return repairOrderFilterOptions
    .map(({ label, value }) => {
      const count =
        value === 'all'
          ? repairOrders.length
          : repairOrders.filter(({ status }) => status === value).length

      return `
        <button
          class="filter-button"
          type="button"
          data-repair-status="${value}"
          aria-pressed="${value === 'all'}"
        >
          <span>${label}</span>
          <strong>${count}</strong>
        </button>
      `
    })
    .join('')
}

import { WorkOrderStatus, type WorkOrder } from '../models/index.ts'
import { parseTimestamp } from '../formatters/work-order-time.ts'

export const dashboardStateGroups = [
  { id: 'active', label: 'Órdenes activas', statuses: [WorkOrderStatus.RECEIVED, WorkOrderStatus.DIAGNOSIS,
    WorkOrderStatus.WAITING_CUSTOMER, WorkOrderStatus.WAITING_PARTS, WorkOrderStatus.IN_PROGRESS] },
  { id: 'closed', label: 'Órdenes cerradas / terminales', statuses: [WorkOrderStatus.COMPLETED, WorkOrderStatus.NOT_APPROVED] },
] as const

export const dashboardKpis = [
  { key: 'total', label: 'Total de órdenes' },
  { key: 'active', label: 'Órdenes activas' },
  { key: 'inProgress', label: 'En ejecución' },
  { key: 'waiting', label: 'En espera' },
  { key: 'completed', label: 'Completadas' },
  { key: 'notApproved', label: 'No aprobadas' },
] as const

const statuses = Object.values(WorkOrderStatus)
const timestamp = (value: string | null): number | undefined => parseTimestamp(value)?.getTime()

export function summarizeDashboard(orders: readonly WorkOrder[], now = Date.now()) {
  const counts = Object.fromEntries(statuses.map(status =>
    [status, orders.filter(order => order.status === status).length],
  )) as Record<WorkOrderStatus, number>
  const groups = dashboardStateGroups.map(group => ({ ...group,
    total: group.statuses.reduce((sum, status) => sum + counts[status], 0),
  }))
  const metrics = {
    total: orders.length,
    active: groups[0]!.total,
    inProgress: counts[WorkOrderStatus.IN_PROGRESS],
    waiting: counts[WorkOrderStatus.WAITING_CUSTOMER] + counts[WorkOrderStatus.WAITING_PARTS],
    completed: counts[WorkOrderStatus.COMPLETED],
    notApproved: counts[WorkOrderStatus.NOT_APPROVED],
  }
  // RECEIVED is the only state with an unambiguous next action and state start time.
  // Oldest valid reception first; unknown/future dates last, then ID for stable ties.
  const attentionTime = (order: WorkOrder): number => {
    const value = timestamp(order.receivedAt)
    return value !== undefined && value <= now ? value : Infinity
  }
  const attention = orders.filter(order => order.status === WorkOrderStatus.RECEIVED)
    .sort((a, b) => (attentionTime(a) - attentionTime(b)) || a.id.localeCompare(b.id))
  const activity = orders.flatMap(order => {
    const events: { order: WorkOrder; kind: 'received' | 'completed'; at: number }[] = []
    const received = timestamp(order.receivedAt)
    const completed = timestamp(order.completedAt)
    if (received !== undefined && received <= now) events.push({ order, kind: 'received', at: received })
    if (order.status === WorkOrderStatus.COMPLETED && completed !== undefined && completed <= now
      && (received === undefined || completed >= received)) {
      events.push({ order, kind: 'completed', at: completed })
    }
    return events
  }).sort((a, b) => b.at - a.at || a.order.id.localeCompare(b.order.id)).slice(0, 6)
  return { counts, metrics, groups, attention, activity }
}

// Eight local calendar weeks, Monday 00:00 through next Monday (exclusive).
// Calendar arithmetic preserves week boundaries across daylight saving changes.
export function weeklyReceptions(orders: readonly WorkOrder[], now = Date.now()) {
  const monday = new Date(now)
  if (!Number.isFinite(monday.getTime())) return []
  monday.setHours(0, 0, 0, 0)
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7)
  const dates = orders.map(order => timestamp(order.receivedAt))
  return Array.from({ length: 8 }, (_, index) => {
    const start = new Date(monday)
    start.setDate(start.getDate() - (7 - index) * 7)
    const end = new Date(start)
    end.setDate(end.getDate() + 7)
    return { start, end, count: dates.filter(date => date !== undefined
      && date >= start.getTime() && date < end.getTime() && date <= now).length }
  })
}

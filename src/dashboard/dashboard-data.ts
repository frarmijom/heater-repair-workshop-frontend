import { RepairStatus, type RepairOrder } from '../models/index.ts'
import { repairStatusPresentation } from '../components/repair-status.ts'
import { parseTimestamp } from '../formatters/repair-time.ts'

// Each operational category maps to exactly one existing lifecycle state.
export const dashboardCategories = [
  { status: RepairStatus.IN_PROGRESS, label: 'En proceso', context: 'Reparaciones en curso.' },
  { status: RepairStatus.RECEIVED, label: 'Pendientes', context: 'Recibidas, pendientes de iniciar.' },
  { status: RepairStatus.COMPLETED, label: repairStatusPresentation[RepairStatus.COMPLETED].label, context: 'Reparaciones completadas.' },
] as const

const statuses = Object.values(RepairStatus)
const timestamp = (value: string | null): number | undefined => parseTimestamp(value)?.getTime()

export function summarizeDashboard(orders: readonly RepairOrder[], now = Date.now()) {
  const counts = Object.fromEntries(statuses.map(status =>
    [status, orders.filter(order => order.status === status).length],
  )) as Record<RepairStatus, number>
  // RECEIVED is the only state with an unambiguous next action and state start time.
  // Oldest valid reception first; unknown/future dates last, then ID for stable ties.
  const attentionTime = (order: RepairOrder): number => {
    const value = timestamp(order.receivedAt)
    return value !== undefined && value <= now ? value : Infinity
  }
  const attention = orders.filter(order => order.status === RepairStatus.RECEIVED)
    .sort((a, b) => (attentionTime(a) - attentionTime(b)) || a.id.localeCompare(b.id))
  const activity = orders.flatMap(order => {
    const events: { order: RepairOrder; kind: 'received' | 'completed'; at: number }[] = []
    const received = timestamp(order.receivedAt)
    const completed = timestamp(order.completedAt)
    if (received !== undefined && received <= now) events.push({ order, kind: 'received', at: received })
    if (order.status === RepairStatus.COMPLETED && completed !== undefined && completed <= now
      && (received === undefined || completed >= received)) {
      events.push({ order, kind: 'completed', at: completed })
    }
    return events
  }).sort((a, b) => b.at - a.at || a.order.id.localeCompare(b.order.id)).slice(0, 6)
  return { counts, attention, activity }
}

// Eight local calendar weeks, Monday 00:00 through next Monday (exclusive).
// Calendar arithmetic preserves week boundaries across daylight saving changes.
export function weeklyReceptions(orders: readonly RepairOrder[], now = Date.now()) {
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

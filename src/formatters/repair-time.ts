import { RepairStatus } from '../models/index.ts'
import type { RepairOrder } from '../models/index.ts'

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium', timeStyle: 'short',
})
const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'always' })

type Timestamp = string | null | undefined

export function parseTimestamp(timestamp: Timestamp): Date | null {
  if (timestamp == null) return null
  const date = new Date(timestamp)
  return Number.isFinite(date.getTime()) ? date : null
}

export function formatRepairDateTime(timestamp: Timestamp, locale?: string): string | null {
  const date = parseTimestamp(timestamp)
  return date === null ? null : (locale ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }) : dateTimeFormatter).format(date)
}

export function formatRepairDate(timestamp: Timestamp, locale?: string): string | null {
  const date = parseTimestamp(timestamp)
  return date === null ? null : (locale ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }) : dateFormatter).format(date)
}

// There is no startedAt in the API. Only RECEIVED supports a current-state duration.
// Return null for unknown data or a future reception, rather than inventing an age.
export function formatReceptionElapsed(
  order: Pick<RepairOrder, 'status' | 'receivedAt'>,
  now: number = Date.now(),
): string | null {
  if (order.status !== RepairStatus.RECEIVED || !Number.isFinite(now)) return null
  const received = parseTimestamp(order.receivedAt)
  if (received === null) return null
  const elapsed = now - received.getTime()
  if (elapsed < 0) return null

  const seconds = Math.floor(elapsed / 1000)
  if (seconds < 60) return relativeFormatter.format(-seconds, 'second')
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return relativeFormatter.format(-minutes, 'minute')
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return relativeFormatter.format(-hours, 'hour')
  return relativeFormatter.format(-Math.floor(hours / 24), 'day')
}

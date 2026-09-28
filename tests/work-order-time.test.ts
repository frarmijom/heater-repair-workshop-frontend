import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkOrderStatus } from '../src/models/index.ts'
import { formatWorkOrderDate, formatWorkOrderDateTime, formatReceptionElapsed } from '../src/formatters/work-order-time.ts'

const now = Date.parse('2026-09-26T12:00:00Z')
afterEach(() => vi.useRealTimers())

describe('local repair dates', () => {
  it('formats a valid receivedAt with local date and time', () => {
    const timestamp = '2026-09-24T12:15:00Z'
    expect(formatWorkOrderDateTime(timestamp)).toBe(new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium', timeStyle: 'short',
    }).format(new Date(timestamp)))
  })

  it('formats a valid completedAt as a local date', () => {
    const timestamp = '2026-09-26T13:45:00Z'
    expect(formatWorkOrderDate(timestamp)).toBe(new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
    }).format(new Date(timestamp)))
  })

  it('respects timestamp offsets instead of treating UTC as a local wall clock', () => {
    expect(formatWorkOrderDateTime('2026-09-26T09:00:00-03:00')).toBe(formatWorkOrderDateTime('2026-09-26T12:00:00Z'))
  })

  it.each([null, undefined, '', '   ', 'not-a-date', '2026-99-99T99:99:99Z'])('returns no invented date for %s', value => {
    expect(formatWorkOrderDateTime(value)).toBeNull()
    expect(formatWorkOrderDate(value)).toBeNull()
  })
})

describe('elapsed reception time', () => {
  it.each([
    { age: 0, value: 0, unit: 'second' },
    { age: 59_000, value: 59, unit: 'second' },
    { age: 60_000, value: 1, unit: 'minute' },
    { age: 3_599_000, value: 59, unit: 'minute' },
    { age: 3_600_000, value: 1, unit: 'hour' },
    { age: 7_200_000, value: 2, unit: 'hour' },
    { age: 86_400_000, value: 1, unit: 'day' },
    { age: 259_200_000, value: 3, unit: 'day' },
  ] as const)('formats reception age $age using frozen time', ({ age, value, unit }) => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    expect(formatReceptionElapsed({ status: WorkOrderStatus.RECEIVED, receivedAt: new Date(now - age).toISOString() }))
      .toBe(new Intl.RelativeTimeFormat(undefined, { numeric: 'always' }).format(-value, unit))
  })

  it.each([WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.COMPLETED])('does not derive a current-state duration for %s', status => {
    expect(formatReceptionElapsed({ status, receivedAt: '2026-09-23T12:00:00Z' }, now)).toBeNull()
  })

  it.each(['', 'invalid', '2026-09-27T12:00:00Z'])('does not claim an age for invalid/future reception %s', receivedAt => {
    expect(formatReceptionElapsed({ status: WorkOrderStatus.RECEIVED, receivedAt }, now)).toBeNull()
  })

  it('rejects an invalid reference clock', () => {
    expect(formatReceptionElapsed({ status: WorkOrderStatus.RECEIVED, receivedAt: '2026-09-23T12:00:00Z' }, NaN)).toBeNull()
  })
})

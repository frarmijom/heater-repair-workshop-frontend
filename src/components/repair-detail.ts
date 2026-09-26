import { RepairStatus } from '../models/index.ts'
import type { RepairOrder } from '../models/index.ts'
import { repairStatusPresentation } from './repair-status.ts'
import { escapeHtml } from './repair-order-card.ts'
import { formatRepairDate, formatRepairDateTime } from '../formatters/repair-time.ts'

export function generateRepairDetailHtml(order: RepairOrder | undefined): string {
  const back = '<a href="#repairs">Back to Repairs</a>'
  if (!order) return `${back}<h1 id="repair-detail-title" tabindex="-1">Repair not found</h1><p>This repair is not in the loaded work queue.</p>`
  const states = Object.values(RepairStatus)
  const current = states.indexOf(order.status)
  const { label, modifier } = repairStatusPresentation[order.status]
  const lifecycle = states.map((status, index) => {
    const reached = index <= current
    const state = index === current ? 'Current' : reached ? 'Reached' : 'Upcoming'
    const date = status === RepairStatus.RECEIVED ? formatRepairDateTime(order.receivedAt)
      : status === RepairStatus.COMPLETED && order.status === RepairStatus.COMPLETED ? formatRepairDate(order.completedAt) : null
    return `<li data-stage="${status}" data-reached="${reached}"${index === current ? ' aria-current="step"' : ''}>
      <strong>${repairStatusPresentation[status].label}</strong>
      <span>${state}</span>${date === null ? '' : `<small>${date}</small>`}
    </li>`
  }).join('')
  const action = order.status === RepairStatus.RECEIVED ? `
    <form id="diagnosis-form" novalidate>
      <label for="repair-diagnosis">Diagnosis</label>
      <textarea id="repair-diagnosis" name="diagnosis" rows="4" required aria-describedby="detail-action-error"></textarea>
      <button type="submit" data-repair-action="start">Start repair</button>
    </form>` : order.status === RepairStatus.IN_PROGRESS ? `<button id="detail-complete" type="button" aria-expanded="false" aria-controls="complete-confirmation">Complete repair</button>
      <section id="complete-confirmation" aria-labelledby="complete-confirmation-title" hidden>
        <h3 id="complete-confirmation-title">Complete this repair?</h3>
        <p>This will mark the repair order as completed.</p>
        <button id="cancel-complete" type="button">Cancel</button>
        <button id="confirm-complete" type="button" data-repair-action="complete">Complete repair</button>
      </section>` : ''
  return `
    ${back}
    <header class="app-shell__page-header">
      <h1 id="repair-detail-title" tabindex="-1">Repair order #${escapeHtml(order.id)}</h1>
      <p>${escapeHtml(order.heaterBrand)} ${escapeHtml(order.heaterModel)}</p>
      <span class="repair-card__status repair-card__status--${modifier}">${label}</span>
    </header>
    <section aria-labelledby="lifecycle-title">
      <h2 id="lifecycle-title">Lifecycle</h2>
      <ol class="repair-lifecycle">${lifecycle}</ol>
    </section>
    <section aria-labelledby="repair-information-title">
      <h2 id="repair-information-title">Repair information</h2>
      <dl class="repair-detail__information">
        <div><dt>Customer</dt><dd>${escapeHtml(order.customerName)}</dd></div>
        <div><dt>Contact</dt><dd>${escapeHtml(order.customerContact)}</dd></div>
        <div><dt>Reported issue</dt><dd>${escapeHtml(order.reportedIssue)}</dd></div>
        ${order.diagnosis ? `<div><dt>Diagnosis</dt><dd>${escapeHtml(order.diagnosis)}</dd></div>` : ''}
      </dl>
    </section>
    ${action ? `<section id="detail-actions" aria-labelledby="detail-action-title"><h2 id="detail-action-title">Next action</h2>${action}<p id="detail-action-error" role="alert"></p></section>` : ''}
  `
}

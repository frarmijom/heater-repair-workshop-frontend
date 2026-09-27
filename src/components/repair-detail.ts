import { RepairStatus } from '../models/index.ts'
import type { RepairOrder } from '../models/index.ts'
import { repairStatusPresentation } from './repair-status.ts'
import { escapeHtml } from './repair-order-card.ts'
import { formatRepairDate, formatRepairDateTime } from '../formatters/repair-time.ts'

export function generateRepairDetailHtml(order: RepairOrder | undefined): string {
  const back = '<nav class="repairs-breadcrumb" aria-label="Ruta de navegación"><a href="#repairs">Volver a Reparaciones</a></nav>'
  if (!order) return `${back}<h1 id="repair-detail-title" tabindex="-1">Reparación no encontrada</h1><p>No se encontró esta reparación.</p>`
  const states = Object.values(RepairStatus)
  const current = states.indexOf(order.status)
  const { label, modifier } = repairStatusPresentation[order.status]
  const lifecycle = states.map((status, index) => {
    const reached = index <= current
    const state = index === current ? 'Actual' : reached ? 'Alcanzada' : 'Pendiente'
    const date = status === RepairStatus.RECEIVED ? formatRepairDateTime(order.receivedAt, 'es-CL')
      : status === RepairStatus.COMPLETED && order.status === RepairStatus.COMPLETED ? formatRepairDate(order.completedAt, 'es-CL') : null
    return `<li data-stage="${status}" data-reached="${reached}"${index === current ? ' aria-current="step"' : ''}>
      <strong>${repairStatusPresentation[status].label}</strong>
      <span>${state}</span>${date === null ? '' : `<small>${date}</small>`}
    </li>`
  }).join('')
  const action = order.status === RepairStatus.RECEIVED ? `
    <form id="diagnosis-form" novalidate>
      <label for="repair-diagnosis">Diagnóstico</label>
      <textarea id="repair-diagnosis" name="diagnosis" rows="4" required aria-describedby="detail-action-error"></textarea>
      <button type="submit" data-repair-action="start">Iniciar reparación</button>
    </form>` : order.status === RepairStatus.IN_PROGRESS ? `<button id="detail-complete" type="button" aria-expanded="false" aria-controls="complete-confirmation">Completar reparación</button>
      <section id="complete-confirmation" aria-labelledby="complete-confirmation-title" hidden>
        <h3 id="complete-confirmation-title">¿Completar esta reparación?</h3>
        <p>La reparación quedará marcada como completada.</p>
        <button id="cancel-complete" type="button">Cancelar</button>
        <button id="confirm-complete" type="button" data-repair-action="complete">Completar reparación</button>
      </section>` : ''
  return `
    ${back}
    <header class="app-shell__page-header">
      <div>
      <h1 id="repair-detail-title" tabindex="-1">Reparación #${escapeHtml(order.id)}</h1>
      <p>${escapeHtml(order.heaterBrand)} ${escapeHtml(order.heaterModel)}</p>
      </div><span class="repair-card__status repair-card__status--${modifier}">${label}</span>
    </header>
    <section class="repairs-surface" aria-labelledby="lifecycle-title">
      <h2 id="lifecycle-title">Etapas de reparación</h2>
      <ol class="repair-lifecycle">${lifecycle}</ol>
    </section>
    <section class="repairs-surface" aria-labelledby="repair-information-title">
      <h2 id="repair-information-title">Información de la reparación</h2>
      <dl class="repair-detail__information">
        <div><dt>Cliente</dt><dd>${escapeHtml(order.customerName)}</dd></div>
        <div><dt>Contacto</dt><dd>${escapeHtml(order.customerContact)}</dd></div>
        <div><dt>Problema reportado</dt><dd>${escapeHtml(order.reportedIssue)}</dd></div>
        ${order.diagnosis ? `<div><dt>Diagnóstico</dt><dd>${escapeHtml(order.diagnosis)}</dd></div>` : ''}
      </dl>
    </section>
    ${action ? `<section class="repairs-surface" id="detail-actions" aria-labelledby="detail-action-title"><h2 id="detail-action-title">Siguiente acción</h2>${action}<p id="detail-action-error" role="alert"></p></section>` : ''}
  `
}

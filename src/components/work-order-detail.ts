import { serviceTypePresentation } from './service-type-presentation.ts'
import { ServiceType, WorkOrderStatus, type WorkOrder } from '../models/index.ts'
import { workOrderStatusPresentation } from './work-order-status.ts'
import { escapeHtml } from './work-order-card.ts'
import { formatWorkOrderDateTime } from '../formatters/work-order-time.ts'
import { availableWorkOrderActions, workOrderActions, type WorkOrderAction } from './work-order-actions.ts'

export function generateWorkOrderDetailHtml(order: WorkOrder | undefined): string {
  const back = '<nav class="work-orders-breadcrumb" aria-label="Ruta de navegación"><a href="#work-orders">Volver a Órdenes de trabajo</a></nav>'
  if (!order) return `${back}<h1 id="work-order-detail-title" tabindex="-1">Orden de trabajo no encontrada</h1><p>No se encontró esta orden de trabajo.</p>`
  const service = serviceTypePresentation[order.serviceType]
  const { label, modifier } = workOrderStatusPresentation[order.status]
  const legacy = order.lifecycleVersion === 'LEGACY'
  const legacyStarted = legacy && [WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.COMPLETED].includes(order.legacyStatus!)
  const actions = availableWorkOrderActions(order)
  const button = (action: WorkOrderAction) => `<button ${action === 'complete' ? 'id="confirm-complete"' : ''} type="button" data-work-order-action="${action}">${workOrderActions[action]}</button>`
  const actionHtml = actions.map(action => {
    if (action === 'diagnosis') return `<form id="diagnosis-form" novalidate>
      <label for="work-order-diagnosis">Diagnóstico</label>
      <textarea id="work-order-diagnosis" name="diagnosis" rows="4" required aria-describedby="detail-action-error">${escapeHtml(order.diagnosis ?? '')}</textarea>
      <button type="submit" data-work-order-action="diagnosis">Guardar diagnóstico</button></form>`
    if (action === 'approve') return `<fieldset><legend>Disponibilidad de repuestos para la reparación aprobada</legend>
      <label><input type="radio" name="partsAvailable" value="true" required>Disponibles / no requiere repuestos</label>
      <label><input type="radio" name="partsAvailable" value="false" required>Faltan repuestos</label></fieldset>${button(action)}`
    if (action === 'complete') return `<button id="detail-complete" type="button" aria-expanded="false" aria-controls="complete-confirmation">Completar trabajo</button>
      <section id="complete-confirmation" aria-labelledby="complete-confirmation-title" hidden>
        <h3 id="complete-confirmation-title">¿Completar esta orden de trabajo?</h3><p>La orden de trabajo quedará marcada como completada.</p>
        <button id="cancel-complete" type="button">Cancelar</button>${button(action)}</section>`
    return button(action)
  }).join('')
  // Show only facts recorded by the API, not an inferred linear history through optional branches.
  const next = actions.map(action => workOrderActions[action]).join(' · ')
  const flow = legacyStarted ? 'Trabajo iniciado bajo el lifecycle anterior.'
    : order.serviceType === ServiceType.MAINTENANCE
      ? 'Recepción → trabajo → finalización. Puede esperar repuestos antes de iniciar.'
      : 'Recepción → diagnóstico → decisión del cliente. Si aprueba: trabajo y finalización, con espera de repuestos cuando corresponda. Si rechaza: cierre sin reparación.'
  return `${back}
    <header class="app-shell__page-header"><div><h1 id="work-order-detail-title" tabindex="-1">Orden de trabajo #${escapeHtml(order.id)}</h1>
      <p>${escapeHtml(order.heaterBrand)} ${escapeHtml(order.heaterModel)}</p></div>
      <span class="work-order-card__status work-order-card__status--${modifier}">${label}</span></header>
    <section class="work-orders-surface" aria-labelledby="lifecycle-title"><h2 id="lifecycle-title">Flujo de la orden de trabajo</h2>
      <p>${flow}</p><ol class="work-order-lifecycle"><li data-stage="${order.status}" aria-current="step"><strong>${label}</strong><span>Estado actual</span></li></ol>
      ${next ? `<p>Siguientes acciones: ${next}</p>` : '<p>Orden cerrada.</p>'}
      ${legacy ? `<p class="legacy-lifecycle">Lifecycle anterior (LEGACY). Estado al migrar: ${workOrderStatusPresentation[order.legacyStatus!].label}.
        ${legacyStarted ? 'No hay aprobación del cliente registrada. Se conserva el trabajo histórico; esto no representa una aprobación implícita.' : 'Las acciones posteriores siguen las reglas del nuevo flujo.'}</p>` : ''}
    </section>
    <section class="work-orders-surface" aria-labelledby="work-order-information-title"><h2 id="work-order-information-title">Información de la orden de trabajo</h2>
      <dl class="work-order-detail__information">
        <div><dt>Cliente</dt><dd>${escapeHtml(order.customerName)}</dd></div>
        <div><dt>Contacto</dt><dd>${escapeHtml(order.customerContact)}</dd></div>
        <div><dt>Tipo de servicio</dt><dd>${service.label}</dd></div>
        <div><dt>${service.issueLabel}</dt><dd>${escapeHtml(order.reportedIssue || (service.issueRequired ? '' : '—'))}</dd></div>
        <div><dt>Ingreso</dt><dd>${formatWorkOrderDateTime(order.receivedAt, 'es-CL') ?? 'Fecha no disponible'}</dd></div>
        ${order.completedAt ? `<div><dt>Finalización</dt><dd>${formatWorkOrderDateTime(order.completedAt, 'es-CL') ?? 'Fecha no disponible'}</dd></div>` : ''}
        ${order.diagnosis ? `<div><dt>Diagnóstico</dt><dd>${escapeHtml(order.diagnosis)}</dd></div>` : ''}
        ${order.serviceType === ServiceType.REPAIR ? `<div><dt>Decisión del cliente</dt><dd>${order.customerDecision === 'APPROVED' ? 'Aprobada' : order.customerDecision === 'REJECTED' ? 'No aprobada' : 'Sin decisión registrada'}</dd></div>` : ''}
      </dl></section>
    ${actions.length ? `<section class="work-orders-surface" id="detail-actions" aria-labelledby="detail-action-title"><h2 id="detail-action-title">Siguiente acción</h2>${actionHtml}<p id="detail-action-error" role="alert"></p></section>` : ''}`
}

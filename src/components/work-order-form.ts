import { ServiceType, type CreateWorkOrderPayload, type CreateWorkOrderEquipmentPayload } from '../models/index.ts'
import { serviceTypePresentation } from './service-type-presentation.ts'

const phonePrefix = '+569'
const phoneFormatError = 'Ingresa exactamente 8 dígitos, sin el prefijo +569.'
export type WorkOrderFormPayload = CreateWorkOrderPayload

type FormField = 'customerName' | 'customerContact' | 'serviceType' | 'reportedIssue'
type FormErrors = Partial<Record<FormField, string>>

function equipmentHtml(index: number): string {
  const position = index + 1
  return `<section class="work-order-equipment" data-equipment-index="${index}" aria-labelledby="equipment-${position}-title">
    <div class="work-order-equipment__header"><h3 id="equipment-${position}-title">Calefont ${position}</h3>
      ${index ? '<button type="button" class="work-orders-secondary-action" data-remove-equipment>Quitar</button>' : ''}</div>
    <div class="form-field"><label for="equipment-${index}-brand">Marca <span class="required-mark" aria-hidden="true">*</span></label>
      <input id="equipment-${index}-brand" name="${index === 0 ? 'heaterBrand' : `equipmentBrand${index}`}" data-equipment-field="brand" required autocomplete="off"><small data-equipment-error="brand"></small></div>
    <div class="form-field"><label for="equipment-${index}-model">Modelo <span class="required-mark" aria-hidden="true">*</span></label>
      <input id="equipment-${index}-model" name="${index === 0 ? 'heaterModel' : `equipmentModel${index}`}" data-equipment-field="model" required autocomplete="off"><small data-equipment-error="model"></small></div>
    <div class="form-field"><label for="equipment-${index}-capacity">Capacidad</label><input id="equipment-${index}-capacity" data-equipment-field="capacity" autocomplete="off" placeholder="Ej. 10 L"></div>
    <div class="form-field"><label for="equipment-${index}-serial">N.º de serie</label><input id="equipment-${index}-serial" data-equipment-field="serialNumber" autocomplete="off"></div>
    <div class="form-field form-field--wide"><label for="equipment-${index}-notes">Notas del equipo</label><textarea id="equipment-${index}-notes" data-equipment-field="notes" rows="2"></textarea></div>
  </section>`
}

function validateBase(payload: WorkOrderFormPayload, phoneDigits: string): FormErrors {
  const errors: FormErrors = {}
  if (!payload.customerName.trim()) errors.customerName = 'Ingresa el nombre del cliente.'
  if (!phoneDigits) errors.customerContact = 'Ingresa el teléfono del cliente.'
  else if (!/^[0-9]{8}$/.test(phoneDigits)) errors.customerContact = phoneFormatError
  if (!Object.values(ServiceType).includes(payload.serviceType)) errors.serviceType = 'Selecciona un tipo de servicio.'
  if (payload.serviceType === ServiceType.REPAIR && !payload.reportedIssue.trim()) errors.reportedIssue = 'Describe el problema reportado.'
  return errors
}

export function generateWorkOrderFormHtml(): string {
  return `<section class="order-form-panel work-orders-surface" aria-label="Datos de la nueva orden de trabajo"><form id="work-order-form" class="order-form" novalidate>
    <fieldset class="work-order-form-group"><legend>Cliente</legend>
      <div class="form-field"><label for="customer-name">Nombre del cliente <span class="required-mark" aria-hidden="true">*</span></label><input id="customer-name" name="customerName" type="text" required autocomplete="name" aria-describedby="customer-name-error"><small id="customer-name-error" data-error-for="customerName"></small></div>
      <div class="form-field"><label for="customer-phone">Teléfono <span class="required-mark" aria-hidden="true">*</span></label><div class="work-order-phone-control"><span id="customer-phone-prefix" class="work-order-phone-prefix">${phonePrefix}</span><input id="customer-phone" name="customerContact" type="tel" required autocomplete="tel-local" inputmode="numeric" maxlength="8" pattern="[0-9]{8}" placeholder="12345678" aria-describedby="customer-phone-prefix customer-phone-help customer-phone-error"></div><span id="customer-phone-help" class="work-order-field-help">Escribe los 8 dígitos de tu móvil, sin el prefijo.</span><small id="customer-phone-error" data-error-for="customerContact"></small></div>
    </fieldset>
    <fieldset class="work-order-form-group work-order-equipment-group"><legend>Equipos</legend><p class="work-order-field-help">Una orden puede incluir uno o más calefonts.</p><div id="work-order-equipment-list">${equipmentHtml(0)}</div><button id="add-equipment" class="work-orders-secondary-action" type="button">+ Agregar otro calefont</button></fieldset>
    <fieldset class="work-order-service-selector" aria-describedby="service-type-error"><legend>Tipo de servicio <span class="required-mark" aria-hidden="true">*</span></legend><div class="work-order-service-options">${Object.values(ServiceType).map(type => `<label for="service-type-${type}"><input id="service-type-${type}" type="radio" name="serviceType" value="${type}" required ${type === ServiceType.REPAIR ? 'checked' : ''} aria-describedby="service-type-error"><span>${serviceTypePresentation[type].label}</span></label>`).join('')}</div><small id="service-type-error" data-error-for="serviceType"></small></fieldset>
    <div class="form-field form-field--wide"><label id="reported-issue-label" for="reported-issue">${serviceTypePresentation[ServiceType.REPAIR].issueLabel} <span class="required-mark" aria-hidden="true">*</span></label><textarea id="reported-issue" name="reportedIssue" required rows="4" aria-describedby="reported-issue-error"></textarea><small id="reported-issue-error" data-error-for="reportedIssue"></small></div>
    <div class="order-form__actions form-field--wide"><p id="form-submit-status" aria-live="polite">Los campos marcados con * son obligatorios.</p><a class="work-orders-secondary-action" href="#work-orders">Cancelar</a><button type="submit">Crear orden de trabajo</button></div>
  </form></section>`
}

export function setupWorkOrderForm(root: ParentNode, onValidSubmit: (payload: WorkOrderFormPayload) => Promise<void>): void {
  const form = root.querySelector<HTMLFormElement>('#work-order-form')
  const name = root.querySelector<HTMLInputElement>('#customer-name')
  const phone = root.querySelector<HTMLInputElement>('#customer-phone')
  const issue = root.querySelector<HTMLTextAreaElement>('#reported-issue')
  const list = root.querySelector<HTMLElement>('#work-order-equipment-list')
  const add = root.querySelector<HTMLButtonElement>('#add-equipment')
  const button = form?.querySelector<HTMLButtonElement>('button[type="submit"]')
  const status = root.querySelector<HTMLParagraphElement>('#form-submit-status')
  const serviceInputs = [...root.querySelectorAll<HTMLInputElement>('input[name="serviceType"]')]
  const issueLabel = root.querySelector<HTMLLabelElement>('#reported-issue-label')
  if (!form || !name || !phone || !issue || !list || !add || !button || !status || !issueLabel) throw new Error('The repair order form is incomplete.')

  let submitting = false, attempted = false, rejectedPhonePaste = false
  const touched = new Set<string>()
  const clean = (value: string): string | null => value.trim() || null
  const equipmentSections = () => [...list.querySelectorAll<HTMLElement>('[data-equipment-index]')]
  const readEquipments = (): CreateWorkOrderEquipmentPayload[] => equipmentSections().map((section, index) => ({
    brand: section.querySelector<HTMLInputElement>('[data-equipment-field="brand"]')!.value.trim(),
    model: section.querySelector<HTMLInputElement>('[data-equipment-field="model"]')!.value.trim(),
    capacity: clean(section.querySelector<HTMLInputElement>('[data-equipment-field="capacity"]')!.value),
    serialNumber: clean(section.querySelector<HTMLInputElement>('[data-equipment-field="serialNumber"]')!.value),
    notes: clean(section.querySelector<HTMLTextAreaElement>('[data-equipment-field="notes"]')!.value), position: index + 1,
  }))
  const readPayload = (): WorkOrderFormPayload => { const equipments = readEquipments(); return { customerName: name.value.trim(), customerContact: `${phonePrefix}${phone.value}`, heaterBrand: equipments[0]?.brand ?? '', heaterModel: equipments[0]?.model ?? '', equipments, serviceType: serviceInputs.find(input => input.checked)?.value as ServiceType, reportedIssue: issue.value.trim() } }

  const validate = (): boolean => {
    const payload = readPayload(); const errors = validateBase(payload, phone.value); if (rejectedPhonePaste) errors.customerContact = phoneFormatError
    for (const field of ['customerName','customerContact','serviceType','reportedIssue'] as FormField[]) {
      const control = field === 'customerName' ? name : field === 'customerContact' ? phone : field === 'reportedIssue' ? issue : serviceInputs[0]
      const show = (attempted || touched.has(field)) && errors[field] !== undefined
      root.querySelector<HTMLElement>(`[data-error-for="${field}"]`)!.textContent = show ? errors[field]! : ''
      const controls: Array<HTMLInputElement | HTMLTextAreaElement> = field === 'serviceType' ? serviceInputs : [control!]
      controls.forEach(control => control.setAttribute('aria-invalid', String(show)))
    }
    let equipmentValid = true
    equipmentSections().forEach(section => { for (const field of ['brand','model'] as const) { const input = section.querySelector<HTMLInputElement>(`[data-equipment-field="${field}"]`)!; const invalid = !input.value.trim(); input.setAttribute('aria-invalid', String(invalid && attempted)); section.querySelector<HTMLElement>(`[data-equipment-error="${field}"]`)!.textContent = invalid && attempted ? `Ingresa ${field === 'brand' ? 'la marca' : 'el modelo'} del calefont.` : ''; if (invalid) equipmentValid = false } })
    return !Object.keys(errors).length && equipmentValid
  }

  const bindEquipment = (section: HTMLElement) => { section.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea').forEach(control => control.addEventListener('input', () => attempted && validate())); section.querySelector('[data-remove-equipment]')?.addEventListener('click', () => { section.remove(); renumber(); validate() }) }
  const renumber = () => equipmentSections().forEach((section, index) => { section.dataset.equipmentIndex = String(index); section.querySelector('h3')!.textContent = `Calefont ${index + 1}` })
  equipmentSections().forEach(bindEquipment)
  add.addEventListener('click', () => { const holder = document.createElement('div'); holder.innerHTML = equipmentHtml(equipmentSections().length); const section = holder.firstElementChild as HTMLElement; list.append(section); bindEquipment(section); section.querySelector<HTMLInputElement>('[data-equipment-field="brand"]')!.focus() })

  phone.addEventListener('paste', event => { const pasted = event.clipboardData?.getData('text'); if (pasted === undefined) return; const proposed = phone.value.slice(0, phone.selectionStart ?? 0) + pasted + phone.value.slice(phone.selectionEnd ?? phone.value.length); if (!/^[0-9]{0,8}$/.test(proposed)) { event.preventDefault(); rejectedPhonePaste = true; touched.add('customerContact'); validate() } })
  ;[name, phone, issue, ...serviceInputs].forEach(control => { control.addEventListener('blur', () => { touched.add(control.name); validate() }); control.addEventListener('input', () => { if (control === phone) rejectedPhonePaste = false; if (attempted || touched.has(control.name)) validate() }) })
  const syncService = () => { const type = serviceInputs.find(input => input.checked)?.value as ServiceType; if (!Object.values(ServiceType).includes(type)) return; const p = serviceTypePresentation[type]; issue.required = p.issueRequired; issueLabel.innerHTML = `${p.issueLabel}${p.issueRequired ? ' <span class="required-mark" aria-hidden="true">*</span>' : ' (opcional)'}`; validate() }
  serviceInputs.forEach(input => input.addEventListener('change', syncService))

  form.addEventListener('submit', async event => { event.preventDefault(); if (submitting) return; attempted = true; const payload = readPayload(); if (!validate()) { form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); return } status.classList.remove('form-submit-status--error'); submitting = true; form.setAttribute('aria-busy','true'); button.disabled = true; button.textContent = 'Creando orden de trabajo…'; status.textContent = 'Registrando orden de trabajo…'; try { await onValidSubmit(payload); form.reset(); list.innerHTML = equipmentHtml(0); equipmentSections().forEach(bindEquipment); status.textContent = 'Orden de trabajo creada correctamente.'; attempted = false; rejectedPhonePaste = false; touched.clear(); syncService() } catch (error) { status.textContent = error instanceof Error ? error.message : 'No se pudo crear la orden de trabajo.'; status.classList.add('form-submit-status--error') } finally { submitting = false; form.removeAttribute('aria-busy'); button.disabled = false; button.textContent = 'Crear orden de trabajo' } })
}

import { ServiceType, type CreateWorkOrderPayload } from '../models/index.ts'
import { serviceTypePresentation } from './service-type-presentation.ts'

const phonePrefix = '+569'
const phoneFormatError = 'Ingresa exactamente 8 dígitos, sin el prefijo +569.'

export type WorkOrderFormPayload = CreateWorkOrderPayload

type FormField = keyof WorkOrderFormPayload
type FormErrors = Partial<Record<FormField, string>>

function validatePayload(payload: WorkOrderFormPayload, phoneDigits: string): FormErrors {
  const errors: FormErrors = {}

  if (payload.customerName.trim().length === 0) {
    errors.customerName = 'Ingresa el nombre del cliente.'
  }

  if (phoneDigits.length === 0) {
    errors.customerContact = 'Ingresa el teléfono del cliente.'
  } else if (!/^[0-9]{8}$/.test(phoneDigits)) {
    errors.customerContact = phoneFormatError
  }

  if (payload.heaterBrand.trim().length === 0) {
    errors.heaterBrand = 'Ingresa la marca del calefont.'
  }

  if (payload.heaterModel.trim().length === 0) {
    errors.heaterModel = 'Ingresa el modelo del calefont.'
  }

  if (!Object.values(ServiceType).includes(payload.serviceType)) {
    errors.serviceType = 'Selecciona un tipo de servicio.'
  }

  if (payload.serviceType === ServiceType.REPAIR && payload.reportedIssue.trim().length === 0) {
    errors.reportedIssue = 'Describe el problema reportado.'
  }

  return errors
}

export function generateWorkOrderFormHtml(): string {
  return `
    <section class="order-form-panel work-orders-surface" aria-label="Datos de la nueva orden de trabajo">
      <form id="work-order-form" class="order-form" novalidate>
        <fieldset class="work-order-form-group"><legend>Cliente</legend>
        <div class="form-field">
          <label for="customer-name">Nombre del cliente <span class="required-mark" aria-hidden="true">*</span></label>
          <input id="customer-name" name="customerName" type="text" required autocomplete="name" aria-describedby="customer-name-error" />
          <small id="customer-name-error" data-error-for="customerName"></small>
        </div>

        <div class="form-field">
          <label for="customer-phone">Teléfono <span class="required-mark" aria-hidden="true">*</span></label>
          <div class="work-order-phone-control">
            <span id="customer-phone-prefix" class="work-order-phone-prefix">${phonePrefix}</span>
            <input id="customer-phone" name="customerContact" type="tel" required autocomplete="tel-local" inputmode="numeric" maxlength="8" pattern="[0-9]{8}" placeholder="12345678" aria-describedby="customer-phone-prefix customer-phone-help customer-phone-error" />
          </div>
          <span id="customer-phone-help" class="work-order-field-help">Escribe los 8 dígitos de tu móvil, sin el prefijo.</span>
          <small id="customer-phone-error" data-error-for="customerContact"></small>
        </div>

        </fieldset>
        <fieldset class="work-order-form-group"><legend>Calefont</legend>
        <div class="form-field">
          <label for="heater-brand">Marca del calefont <span class="required-mark" aria-hidden="true">*</span></label>
          <input id="heater-brand" name="heaterBrand" type="text" required autocomplete="off" aria-describedby="heater-brand-error" />
          <small id="heater-brand-error" data-error-for="heaterBrand"></small>
        </div>

        <div class="form-field">
          <label for="heater-model">Modelo del calefont <span class="required-mark" aria-hidden="true">*</span></label>
          <input id="heater-model" name="heaterModel" type="text" required autocomplete="off" aria-describedby="heater-model-error" />
          <small id="heater-model-error" data-error-for="heaterModel"></small>
        </div>

        </fieldset>
        <fieldset class="work-order-service-selector" aria-describedby="service-type-error">
          <legend>Tipo de servicio <span class="required-mark" aria-hidden="true">*</span></legend>
          <div class="work-order-service-options">${Object.values(ServiceType).map(type => `
            <label for="service-type-${type}">
              <input id="service-type-${type}" type="radio" name="serviceType" value="${type}" required ${type === ServiceType.REPAIR ? 'checked' : ''} aria-describedby="service-type-error" />
              <span>${serviceTypePresentation[type].label}</span>
            </label>`).join('')}</div>
          <small id="service-type-error" data-error-for="serviceType"></small>
        </fieldset>
        <div class="form-field form-field--wide">
          <label id="reported-issue-label" for="reported-issue">${serviceTypePresentation[ServiceType.REPAIR].issueLabel} <span class="required-mark" aria-hidden="true">*</span></label>
          <textarea id="reported-issue" name="reportedIssue" required rows="4" aria-describedby="reported-issue-error"></textarea>
          <small id="reported-issue-error" data-error-for="reportedIssue"></small>
        </div>

        <div class="order-form__actions form-field--wide">
          <p id="form-submit-status" aria-live="polite">Los campos marcados con * son obligatorios.</p>
          <a class="work-orders-secondary-action" href="#work-orders">Cancelar</a>
          <button type="submit">Crear orden de trabajo</button>
        </div>
      </form>
    </section>
  `
}

export function setupWorkOrderForm(
  root: ParentNode,
  onValidSubmit: (payload: WorkOrderFormPayload) => Promise<void>,
): void {
  const form = root.querySelector('#work-order-form') as HTMLFormElement | null
  const customerNameInput = root.querySelector('#customer-name') as HTMLInputElement | null
  const customerContactInput = root.querySelector('#customer-phone') as HTMLInputElement | null
  const brandInput = root.querySelector('#heater-brand') as HTMLInputElement | null
  const modelInput = root.querySelector('#heater-model') as HTMLInputElement | null
  const issueInput = root.querySelector('#reported-issue') as HTMLTextAreaElement | null
  const submitButton = form?.querySelector('button[type="submit"]') as HTMLButtonElement | null
  const submitStatus = root.querySelector('#form-submit-status') as HTMLParagraphElement | null
  const serviceInputs = [...root.querySelectorAll<HTMLInputElement>('input[name="serviceType"]')]
  const issueLabel = root.querySelector<HTMLLabelElement>('#reported-issue-label')

  if (
    form === null ||
    customerNameInput === null ||
    customerContactInput === null ||
    brandInput === null ||
    modelInput === null ||
    issueInput === null ||
    submitButton === null ||
    submitStatus === null ||
    serviceInputs.length !== Object.values(ServiceType).length ||
    issueLabel === null
  ) {
    throw new Error('The repair order form is incomplete.')
  }

  let submitting = false
  let hasAttemptedSubmit = false
  let rejectedPhonePaste = false
  const touchedFields = new Set<FormField>()

  const controls = [
    customerNameInput,
    customerContactInput,
    brandInput,
    modelInput,
    issueInput,
    ...serviceInputs,
  ]

  const readPayload = (): WorkOrderFormPayload => ({
      customerName: customerNameInput.value.trim(),
      customerContact: `${phonePrefix}${customerContactInput.value}`,
      serviceType: serviceInputs.find(input => input.checked)?.value as ServiceType,
      heaterBrand: brandInput.value.trim(),
      heaterModel: modelInput.value.trim(),
      reportedIssue: issueInput.value.trim(),
    })

  const showErrors = (errors: FormErrors): void => {
    controls.forEach((control) => {
      const field = control.name as FormField
      const error = errors[field]
      const shouldShowError =
        (hasAttemptedSubmit || touchedFields.has(field)) && error !== undefined
      const errorElement = root.querySelector<HTMLElement>(`[data-error-for="${field}"]`)

      control.setAttribute('aria-invalid', String(shouldShowError))
      if (errorElement !== null) {
        errorElement.textContent = shouldShowError ? (error ?? '') : ''
      }
    })
  }

  const validateCurrentValues = (): boolean => {
    const payload = readPayload()
    const errors = validatePayload(payload, customerContactInput.value)
    if (rejectedPhonePaste) errors.customerContact = phoneFormatError
    showErrors(errors)
    return Object.keys(errors).length === 0
  }

  // Reject invalid paste before maxlength can silently truncate a full number.
  customerContactInput.addEventListener('paste', event => {
    const pasted = event.clipboardData?.getData('text')
    if (pasted === undefined) return
    const { value, selectionStart, selectionEnd } = customerContactInput
    const proposed = value.slice(0, selectionStart ?? 0) + pasted + value.slice(selectionEnd ?? value.length)
    if (!/^[0-9]{0,8}$/.test(proposed)) {
      event.preventDefault()
      rejectedPhonePaste = true
      touchedFields.add('customerContact')
      validateCurrentValues()
    }
  })

  controls.forEach((control) => {
    const field = control.name as FormField
    control.addEventListener('blur', () => {
      touchedFields.add(field)
      validateCurrentValues()
    })
    control.addEventListener('input', () => {
      if (control === customerContactInput) rejectedPhonePaste = false
      if (touchedFields.has(field) || hasAttemptedSubmit) {
        validateCurrentValues()
      }
    })
  })

  const syncServiceType = (): void => {
    const type = serviceInputs.find(input => input.checked)?.value as ServiceType
    if (!Object.values(ServiceType).includes(type)) return
    const presentation = serviceTypePresentation[type]
    issueInput.required = presentation.issueRequired
    issueLabel.textContent = presentation.issueLabel
    if (presentation.issueRequired) {
      const mark = document.createElement('span')
      mark.className = 'required-mark'
      mark.setAttribute('aria-hidden', 'true')
      mark.textContent = ' *'
      issueLabel.append(mark)
    } else {
      issueLabel.append(' (opcional)')
    }
    validateCurrentValues()
  }
  serviceInputs.forEach(input => input.addEventListener('change', syncServiceType))

  form.addEventListener('submit', async (event: SubmitEvent) => {
    event.preventDefault()
    if (submitting) return
    hasAttemptedSubmit = true

    const payload = readPayload()
    const isValid = validateCurrentValues()

    if (!isValid) {
      controls.find(control => control.getAttribute('aria-invalid') === 'true')?.focus()
    }

    if (isValid) {
      submitStatus.classList.remove('form-submit-status--error')
      submitting = true
      form.setAttribute('aria-busy', 'true')
      submitButton.disabled = true
      submitButton.textContent = 'Creando orden de trabajo…'
      submitStatus.textContent = 'Registrando orden de trabajo…'

      try {
        await onValidSubmit(payload)
        form.reset()
        submitStatus.textContent = 'Orden de trabajo creada correctamente.'
        form.removeAttribute('aria-busy')
        submitButton.disabled = false
        submitButton.textContent = 'Crear orden de trabajo'
        hasAttemptedSubmit = false
        rejectedPhonePaste = false
        touchedFields.clear()
        syncServiceType()
        showErrors({})
      } catch (error: unknown) {
        submitStatus.textContent =
          error instanceof Error
            ? error.message
            : 'No se pudo crear la orden de trabajo.'
        submitStatus.classList.add('form-submit-status--error')
        form.setAttribute('aria-busy', 'false')
        submitButton.disabled = false
        submitButton.textContent = 'Crear orden de trabajo'
      } finally {
        submitting = false
      }
    }
  })

}

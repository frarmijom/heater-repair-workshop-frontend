import type { CreateRepairOrderPayload } from '../models/index.ts'

export type RepairOrderFormPayload = CreateRepairOrderPayload

type FormField = keyof RepairOrderFormPayload
type FormErrors = Partial<Record<FormField, string>>

function validatePayload(payload: RepairOrderFormPayload): FormErrors {
  const errors: FormErrors = {}

  if (payload.customerName.trim().length === 0) {
    errors.customerName = 'Ingresa el nombre del cliente.'
  }

  if (payload.customerContact.trim().length === 0) {
    errors.customerContact = 'Ingresa el teléfono del cliente.'
  } else if (!/^\+[1-9][0-9]{7,14}$/.test(payload.customerContact)) {
    errors.customerContact = 'Usa formato internacional, por ejemplo +56911112222.'
  }

  if (payload.heaterBrand.trim().length === 0) {
    errors.heaterBrand = 'Ingresa la marca del calefont.'
  }

  if (payload.heaterModel.trim().length === 0) {
    errors.heaterModel = 'Ingresa el modelo del calefont.'
  }

  if (payload.reportedIssue.trim().length === 0) {
    errors.reportedIssue = 'Describe el problema reportado.'
  }

  return errors
}

export function generateRepairOrderFormHtml(): string {
  return `
    <section class="order-form-panel repairs-surface" aria-label="Datos de la nueva reparación">
      <form id="repair-order-form" class="order-form" novalidate>
        <fieldset class="repair-form-group"><legend>Cliente</legend>
        <div class="form-field">
          <label for="customer-name">Nombre del cliente <span class="required-mark" aria-hidden="true">*</span></label>
          <input id="customer-name" name="customerName" type="text" required autocomplete="name" aria-describedby="customer-name-error" />
          <small id="customer-name-error" data-error-for="customerName"></small>
        </div>

        <div class="form-field">
          <label for="customer-phone">Teléfono <span class="required-mark" aria-hidden="true">*</span></label>
          <input id="customer-phone" name="customerContact" type="tel" required autocomplete="tel" inputmode="tel" placeholder="+56911112222" aria-describedby="customer-phone-error" />
          <small id="customer-phone-error" data-error-for="customerContact"></small>
        </div>

        </fieldset>
        <fieldset class="repair-form-group"><legend>Calefont</legend>
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
        <div class="form-field form-field--wide">
          <label for="reported-issue">Problema reportado <span class="required-mark" aria-hidden="true">*</span></label>
          <textarea id="reported-issue" name="reportedIssue" required rows="4" aria-describedby="reported-issue-error"></textarea>
          <small id="reported-issue-error" data-error-for="reportedIssue"></small>
        </div>

        <div class="order-form__actions form-field--wide">
          <p id="form-submit-status" aria-live="polite">Los campos marcados con * son obligatorios.</p>
          <a class="repairs-secondary-action" href="#repairs">Cancelar</a>
          <button type="submit">Crear reparación</button>
        </div>
      </form>
    </section>
  `
}

export function setupRepairOrderForm(
  root: ParentNode,
  onValidSubmit: (payload: RepairOrderFormPayload) => Promise<void>,
): void {
  const form = root.querySelector('#repair-order-form') as HTMLFormElement | null
  const customerNameInput = root.querySelector('#customer-name') as HTMLInputElement | null
  const customerContactInput = root.querySelector('#customer-phone') as HTMLInputElement | null
  const brandInput = root.querySelector('#heater-brand') as HTMLInputElement | null
  const modelInput = root.querySelector('#heater-model') as HTMLInputElement | null
  const issueInput = root.querySelector('#reported-issue') as HTMLTextAreaElement | null
  const submitButton = form?.querySelector('button[type="submit"]') as HTMLButtonElement | null
  const submitStatus = root.querySelector('#form-submit-status') as HTMLParagraphElement | null

  if (
    form === null ||
    customerNameInput === null ||
    customerContactInput === null ||
    brandInput === null ||
    modelInput === null ||
    issueInput === null ||
    submitButton === null ||
    submitStatus === null
  ) {
    throw new Error('The repair order form is incomplete.')
  }

  let submitting = false
  let hasAttemptedSubmit = false
  const touchedFields = new Set<FormField>()

  const controls = [
    customerNameInput,
    customerContactInput,
    brandInput,
    modelInput,
    issueInput,
  ]

  const readPayload = (): RepairOrderFormPayload => ({
      customerName: customerNameInput.value.trim(),
      customerContact: customerContactInput.value.trim(),
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
    const errors = validatePayload(payload)
    showErrors(errors)
    return Object.keys(errors).length === 0
  }

  controls.forEach((control) => {
    const field = control.name as FormField
    control.addEventListener('blur', () => {
      touchedFields.add(field)
      validateCurrentValues()
    })
    control.addEventListener('input', () => {
      if (touchedFields.has(field) || hasAttemptedSubmit) {
        validateCurrentValues()
      }
    })
  })

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
      submitButton.textContent = 'Creando reparación…'
      submitStatus.textContent = 'Registrando reparación…'

      try {
        await onValidSubmit(payload)
        form.reset()
        submitStatus.textContent = 'Reparación creada correctamente.'
        form.removeAttribute('aria-busy')
        submitButton.disabled = false
        submitButton.textContent = 'Crear reparación'
        hasAttemptedSubmit = false
        touchedFields.clear()
        showErrors({})
      } catch (error: unknown) {
        submitStatus.textContent =
          error instanceof Error
            ? error.message
            : 'No se pudo crear la reparación.'
        submitStatus.classList.add('form-submit-status--error')
        form.setAttribute('aria-busy', 'false')
        submitButton.disabled = false
        submitButton.textContent = 'Crear reparación'
      } finally {
        submitting = false
      }
    }
  })

}


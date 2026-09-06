import type { CreateRepairOrderPayload } from '../models/index.ts'

export type RepairOrderFormPayload = CreateRepairOrderPayload

type FormField = keyof RepairOrderFormPayload
type FormErrors = Partial<Record<FormField, string>>

function validatePayload(payload: RepairOrderFormPayload): FormErrors {
  const errors: FormErrors = {}

  if (payload.customerName.trim().length === 0) {
    errors.customerName = 'Enter the customer name.'
  }

  if (payload.customerContact.trim().length === 0) {
    errors.customerContact = 'Enter the customer phone number.'
  } else if (!/^\+[1-9][0-9]{7,14}$/.test(payload.customerContact)) {
    errors.customerContact = 'Use international format, for example +56911112222.'
  }

  if (payload.heaterBrand.trim().length === 0) {
    errors.heaterBrand = 'Enter the heater brand.'
  }

  if (payload.heaterModel.trim().length === 0) {
    errors.heaterModel = 'Enter the heater model.'
  }

  if (payload.reportedIssue.trim().length === 0) {
    errors.reportedIssue = 'Describe the reported issue.'
  }

  return errors
}

export function generateRepairOrderFormHtml(): string {
  return `
    <details class="order-form-panel" open>
      <summary class="order-form-panel__header">
        <span>
          <span class="order-form-panel__eyebrow">New workshop entry</span>
          <strong id="order-form-title">Add repair order</strong>
        </span>
        <span class="order-form-panel__toggle" aria-hidden="true"></span>
      </summary>

      <form id="repair-order-form" class="order-form" novalidate>
        <div class="form-field">
          <label for="customer-name">Customer name <span class="required-mark" aria-hidden="true">*</span></label>
          <input id="customer-name" name="customerName" type="text" required autocomplete="name" aria-describedby="customer-name-error" />
          <small id="customer-name-error" data-error-for="customerName"></small>
        </div>

        <div class="form-field">
          <label for="customer-phone">Phone number <span class="required-mark" aria-hidden="true">*</span></label>
          <input id="customer-phone" name="customerContact" type="tel" required autocomplete="tel" inputmode="tel" placeholder="+56911112222" aria-describedby="customer-phone-error" />
          <small id="customer-phone-error" data-error-for="customerContact"></small>
        </div>

        <div class="form-field">
          <label for="heater-brand">Heater brand <span class="required-mark" aria-hidden="true">*</span></label>
          <input id="heater-brand" name="heaterBrand" type="text" required autocomplete="off" aria-describedby="heater-brand-error" />
          <small id="heater-brand-error" data-error-for="heaterBrand"></small>
        </div>

        <div class="form-field">
          <label for="heater-model">Heater model <span class="required-mark" aria-hidden="true">*</span></label>
          <input id="heater-model" name="heaterModel" type="text" required autocomplete="off" aria-describedby="heater-model-error" />
          <small id="heater-model-error" data-error-for="heaterModel"></small>
        </div>

        <div class="form-field form-field--wide">
          <label for="reported-issue">Reported issue <span class="required-mark" aria-hidden="true">*</span></label>
          <textarea id="reported-issue" name="reportedIssue" required rows="4" aria-describedby="reported-issue-error"></textarea>
          <small id="reported-issue-error" data-error-for="reportedIssue"></small>
        </div>

        <div class="order-form__actions form-field--wide">
          <p id="form-submit-status" aria-live="polite">Required fields (*) are validated before submission.</p>
          <button type="submit">Add repair order</button>
        </div>
      </form>
    </details>
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
    hasAttemptedSubmit = true

    const payload = readPayload()
    const isValid = validateCurrentValues()

    if (isValid) {
      form.setAttribute('aria-busy', 'true')
      submitButton.disabled = true
      submitButton.textContent = 'Adding order…'
      submitStatus.textContent = 'Sending validated data to the workshop API…'

      try {
        await onValidSubmit(payload)
      } catch (error: unknown) {
        submitStatus.textContent =
          error instanceof Error
            ? error.message
            : 'The repair order could not be added.'
        submitStatus.classList.add('form-submit-status--error')
        form.setAttribute('aria-busy', 'false')
        submitButton.disabled = false
        submitButton.textContent = 'Add repair order'
      }
    }
  })

}


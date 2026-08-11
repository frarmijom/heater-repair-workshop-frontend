import { RepairStatus } from '../models/index.ts'

export interface RepairOrderFormPayload {
  customerName: string
  customerPhone: string
  heaterBrand: string
  heaterModel: string
  reportedIssue: string
  status: RepairStatus
  completedAt?: string
}

type FormField = keyof RepairOrderFormPayload
type FormErrors = Partial<Record<FormField, string>>

const statusLabels: Record<RepairStatus, string> = {
  [RepairStatus.RECEIVED]: 'Received',
  [RepairStatus.IN_REPAIR]: 'In repair',
  [RepairStatus.COMPLETED]: 'Completed',
}

function isRepairStatus(value: string): value is RepairStatus {
  return Object.values(RepairStatus).some((status) => status === value)
}

function validatePayload(payload: RepairOrderFormPayload): FormErrors {
  const errors: FormErrors = {}

  if (payload.customerName.trim().length === 0) {
    errors.customerName = 'Enter the customer name.'
  }

  const phoneDigits = payload.customerPhone.replace(/\D/g, '')
  const hasValidPhoneCharacters = /^\+?[0-9 ()-]+$/.test(payload.customerPhone)
  if (payload.customerPhone.trim().length === 0) {
    errors.customerPhone = 'Enter the customer phone number.'
  } else if (
    !hasValidPhoneCharacters ||
    phoneDigits.length < 7 ||
    phoneDigits.length > 15
  ) {
    errors.customerPhone = 'Enter a valid phone number.'
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

  if (payload.status === RepairStatus.COMPLETED) {
    if (
      payload.completedAt === undefined ||
      payload.completedAt.length === 0 ||
      Number.isNaN(Date.parse(payload.completedAt))
    ) {
      errors.completedAt = 'A completed order requires a completion date.'
    }
  }

  return errors
}

export function generateRepairOrderFormHtml(): string {
  const statusOptions = Object.values(RepairStatus)
    .map(
      (status) => `
        <option value="${status}" ${status === RepairStatus.RECEIVED ? 'selected' : ''}>
          ${statusLabels[status]}
        </option>
      `,
    )
    .join('')

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
          <input id="customer-phone" name="customerPhone" type="tel" required autocomplete="tel" inputmode="tel" aria-describedby="customer-phone-error" />
          <small id="customer-phone-error" data-error-for="customerPhone"></small>
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

        <div class="form-field">
          <label for="repair-status">Status</label>
          <select id="repair-status" name="status">
            ${statusOptions}
          </select>
        </div>

        <div class="form-field form-field--wide" id="completed-at-field" hidden>
          <label for="completed-at">Completed <span class="required-mark" aria-hidden="true">*</span></label>
          <input id="completed-at" name="completedAt" type="date" aria-describedby="completed-at-error" />
          <small id="completed-at-error" data-error-for="completedAt"></small>
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
  const customerPhoneInput = root.querySelector('#customer-phone') as HTMLInputElement | null
  const brandInput = root.querySelector('#heater-brand') as HTMLInputElement | null
  const modelInput = root.querySelector('#heater-model') as HTMLInputElement | null
  const issueInput = root.querySelector('#reported-issue') as HTMLTextAreaElement | null
  const statusSelect = root.querySelector('#repair-status') as HTMLSelectElement | null
  const completedInput = root.querySelector('#completed-at') as HTMLInputElement | null
  const completedField = root.querySelector('#completed-at-field') as HTMLDivElement | null
  const submitButton = form?.querySelector('button[type="submit"]') as HTMLButtonElement | null
  const submitStatus = root.querySelector('#form-submit-status') as HTMLParagraphElement | null

  if (
    form === null ||
    customerNameInput === null ||
    customerPhoneInput === null ||
    brandInput === null ||
    modelInput === null ||
    issueInput === null ||
    statusSelect === null ||
    completedInput === null ||
    completedField === null ||
    submitButton === null ||
    submitStatus === null
  ) {
    throw new Error('The repair order form is incomplete.')
  }

  let hasAttemptedSubmit = false
  const touchedFields = new Set<FormField>()

  const controls = [
    customerNameInput,
    customerPhoneInput,
    brandInput,
    modelInput,
    issueInput,
    completedInput,
  ]

  const readPayload = (): RepairOrderFormPayload | null => {
    if (!isRepairStatus(statusSelect.value)) {
      return null
    }

    const payload: RepairOrderFormPayload = {
      customerName: customerNameInput.value.trim(),
      customerPhone: customerPhoneInput.value.trim(),
      heaterBrand: brandInput.value.trim(),
      heaterModel: modelInput.value.trim(),
      reportedIssue: issueInput.value.trim(),
      status: statusSelect.value,
    }

    if (statusSelect.value === RepairStatus.COMPLETED) {
      payload.completedAt = completedInput.value
    }

    return payload
  }

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
    if (payload === null) {
      return false
    }

    const errors = validatePayload(payload)
    showErrors(errors)
    return Object.keys(errors).length === 0
  }

  const updateCompletedField = (): void => {
    const isCompleted = statusSelect.value === RepairStatus.COMPLETED
    completedField.hidden = !isCompleted
    if (isCompleted) {
      completedInput.setAttribute('required', 'true')
    } else {
      completedInput.removeAttribute('required')
      completedInput.value = ''
      completedInput.setAttribute('aria-invalid', 'false')
    }
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

  statusSelect.addEventListener('change', () => {
    updateCompletedField()
    validateCurrentValues()
  })

  form.addEventListener('submit', async (event: SubmitEvent) => {
    event.preventDefault()
    hasAttemptedSubmit = true

    const payload = readPayload()
    const isValid = validateCurrentValues()

    if (payload !== null && isValid) {
      form.setAttribute('aria-busy', 'true')
      submitButton.disabled = true
      submitButton.textContent = 'Adding order…'
      submitStatus.textContent = 'Sending validated data to the simulated service…'

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

  updateCompletedField()
}


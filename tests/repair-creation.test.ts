// @vitest-environment jsdom
import { ServiceType } from '../src/models/index.ts'
import { expect, it, vi } from 'vitest'
import { generateRepairOrderFormHtml, setupRepairOrderForm } from '../src/components/repair-order-form.ts'

it('submits creation once while pending and preserves input for retry after failure', async () => {
  document.body.innerHTML = generateRepairOrderFormHtml()
  let rejectRequest: (error: Error) => void = () => {}
  const create = vi.fn(() => new Promise<void>((_, reject) => { rejectRequest = reject }))
  setupRepairOrderForm(document.body, create)
  const payload = { customerName: 'Customer', customerContact: '+56911112222', heaterBrand: 'Bosch', heaterModel: 'Therm', serviceType: ServiceType.REPAIR, reportedIssue: 'No heat' }
  for (const [name, value] of Object.entries(payload)) {
    if (name === 'serviceType') continue
    document.querySelector<HTMLInputElement>(`[name="${name}"]`)!.value = name === 'customerContact' ? value.slice(4) : value
  }
  const form = document.querySelector<HTMLFormElement>('form')!
  const button = form.querySelector<HTMLButtonElement>('button')!
  const submit = () => form.dispatchEvent(new Event('submit', { cancelable: true }))
  submit(); submit()
  expect(create).toHaveBeenCalledTimes(1)
  expect(create).toHaveBeenCalledWith(payload)
  expect(button.disabled).toBe(true)
  expect(form.getAttribute('aria-busy')).toBe('true')
  rejectRequest(new Error('No se pudo completar la solicitud.'))
  await vi.waitFor(() => expect(button.disabled).toBe(false))
  expect(document.querySelector('#form-submit-status')?.textContent).toBe('No se pudo completar la solicitud.')
  for (const [name, value] of Object.entries(payload)) {
    if (name === 'serviceType') { expect(document.querySelector<HTMLInputElement>('input[name="serviceType"]:checked')!.value).toBe(value); continue }
    expect(document.querySelector<HTMLInputElement>(`[name="${name}"]`)!.value).toBe(name === 'customerContact' ? value.slice(4) : value)
  }
  submit()
  expect(create).toHaveBeenCalledTimes(2)
  rejectRequest(new Error('No se pudo completar la solicitud.'))
  await vi.waitFor(() => expect(button.disabled).toBe(false))
})

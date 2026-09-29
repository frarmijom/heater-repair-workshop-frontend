export class ApiRequestError extends Error {
  constructor(public readonly status: number, message: string) { super(message) }
}

export class SessionExpiredError extends Error {
  constructor() { super('Tu sesión ha expirado. Inicia sesión nuevamente.') }
}

interface Csrf { headerName: string; token: string }
let csrf: Csrf | undefined
let onSessionExpired: () => void = () => {}

export function setSessionExpiredHandler(handler: () => void): void {
  onSessionExpired = handler
}

export function clearCsrf(): void { csrf = undefined }

export async function refreshCsrf(): Promise<void> {
  csrf = await apiRequest<Csrf>('/auth/csrf')
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (!['GET', 'HEAD', 'OPTIONS'].includes(init.method ?? 'GET')) {
    if (csrf === undefined) await refreshCsrf()
    headers.set(csrf!.headerName, csrf!.token)
  }
  let response: Response
  try {
    response = await fetch(`/api${path}`, { ...init, headers, credentials: 'same-origin', cache: 'no-store' })
  } catch {
    throw new Error('No se pudo completar la solicitud.')
  }
  if (response.status === 401) {
    clearCsrf()
    if (path === '/auth/login') throw new Error('Credenciales incorrectas.')
    onSessionExpired()
    throw new SessionExpiredError()
  }
  if (!response.ok) {
    // The next explicit submission obtains a fresh token; never replay a mutation.
    if (response.status === 403) clearCsrf()
    if (path.startsWith('/inventory/')) {
      let message = 'No se pudo completar la solicitud.'
      try {
        const body = await response.json() as { message?: unknown }
        if ([400, 404, 409].includes(response.status) && typeof body.message === 'string') message = body.message
      } catch { /* Keep a safe fallback for non-JSON errors. */ }
      throw new ApiRequestError(response.status, message)
    }
    throw new Error('No se pudo completar la solicitud.')
  }
  if (response.status === 204) return undefined as T
  try { return await response.json() as T }
  catch { throw new Error('No se pudo completar la solicitud.') }
}

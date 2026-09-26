import { apiRequest, clearCsrf, refreshCsrf } from './api.ts'

export interface AuthenticatedUser { email: string }

export function checkSession(): Promise<AuthenticatedUser> {
  return apiRequest<AuthenticatedUser>('/auth/session')
}

export async function login(email: string, password: string): Promise<void> {
  await apiRequest<AuthenticatedUser>('/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  clearCsrf()
  await refreshCsrf()
}

export async function logout(): Promise<void> {
  await apiRequest<void>('/auth/logout', { method: 'POST' })
  clearCsrf()
}

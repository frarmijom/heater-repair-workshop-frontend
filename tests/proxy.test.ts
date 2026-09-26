import { afterEach, expect, it, vi } from 'vitest'
// Worker entrypoint is plain JavaScript so Wrangler and Node can both execute it.
import worker from '../worker/api-proxy.mjs'

afterEach(() => vi.unstubAllGlobals())
const env = { ASSETS: { fetch: vi.fn(async () => new Response('asset')) } }

it('proxies API method, body, session and CSRF to the fixed Render origin without caching', async () => {
  const upstream = vi.fn(async () => new Response('{"email":"tech@example.test"}', {
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'WORKSHOP_SESSION=test; Path=/; HttpOnly; Secure; SameSite=Lax' },
  }))
  vi.stubGlobal('fetch', upstream)
  const response = await worker.fetch(new Request('https://workshop.example/api/auth/login?x=1', {
    method: 'POST', body: '{}', headers: { Origin: 'https://workshop.example', Cookie: 'WORKSHOP_SESSION=old',
      'X-CSRF-TOKEN': 'token', 'Content-Type': 'application/json', 'X-Forwarded-Host': 'evil.example' },
  }), env)
  const [url, init] = upstream.mock.calls[0] as unknown as [URL, RequestInit]
  expect(url.toString()).toBe('https://heater-repair-workshop-api.onrender.com/api/auth/login?x=1')
  expect(init.method).toBe('POST')
  expect(init.redirect).toBe('manual')
  expect(init.cache).toBe('no-store')
  const headers = new Headers(init.headers)
  expect(headers.get('Cookie')).toBe('WORKSHOP_SESSION=old')
  expect(headers.get('X-CSRF-TOKEN')).toBe('token')
  expect(headers.has('Origin')).toBe(false)
  expect(headers.has('X-Forwarded-Host')).toBe(false)
  expect(await new Response(init.body).text()).toBe('{}')
  expect(response.headers.get('Set-Cookie')).toContain('HttpOnly; Secure; SameSite=Lax')
  expect(response.headers.get('Cache-Control')).toBe('no-store')
})

it('keeps static assets separate and rejects cross-origin or non-HTTPS API requests', async () => {
  const upstream = vi.fn()
  vi.stubGlobal('fetch', upstream)
  expect(await (await worker.fetch(new Request('https://workshop.example/dashboard'), env)).text()).toBe('asset')
  expect((await worker.fetch(new Request('https://workshop.example/api/auth/login', {
    method: 'POST', headers: { Origin: 'https://evil.example' },
  }), env)).status).toBe(403)
  expect((await worker.fetch(new Request('http://workshop.example/api/auth/session'), env)).status).toBe(400)
  expect(upstream).not.toHaveBeenCalled()
})

it('preserves API failure statuses and cookie expiration', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(null, { status: 401 }))
    .mockResolvedValueOnce(new Response(null, { status: 204, headers: {
      'Set-Cookie': 'WORKSHOP_SESSION=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax',
    } })))
  expect((await worker.fetch(new Request('https://workshop.example/api/repair-orders'), env)).status).toBe(401)
  const response = await worker.fetch(new Request('https://workshop.example/api/auth/logout', { method: 'POST' }), env)
  expect(response.status).toBe(204)
  expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0')
})

it('does not follow backend redirects or expose network errors', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(null, {
    status: 302, headers: { Location: 'https://evil.example' },
  })).mockRejectedValueOnce(new Error('private error')))
  for (let i = 0; i < 2; i++) {
    const response = await worker.fetch(new Request('https://workshop.example/api/auth/session'), env)
    expect(response.status).toBe(502)
    expect(await response.text()).toBe('')
  }
})

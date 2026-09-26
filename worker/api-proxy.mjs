const BACKEND_ORIGIN = 'https://heater-repair-workshop-api.onrender.com'

export default {
  async fetch(request, env) {
    const incoming = new URL(request.url)
    if (!incoming.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
    const failure = (status) => new Response(null, { status, headers: { 'Cache-Control': 'no-store' } })
    if (incoming.protocol !== 'https:') return failure(400)
    const origin = request.headers.get('Origin')
    if (origin !== null && origin !== incoming.origin) return failure(403)
    const target = new URL(BACKEND_ORIGIN)
    target.pathname = incoming.pathname
    target.search = incoming.search
    // Only forward the API headers needed by AUTH-01. Never trust forwarded host headers.
    const headers = new Headers()
    for (const name of ['Accept', 'Content-Type', 'Cookie', 'X-CSRF-TOKEN']) {
      if (request.headers.has(name)) headers.set(name, request.headers.get(name))
    }
    try {
      const upstream = await fetch(target, {
        method: request.method, headers, redirect: 'manual', cache: 'no-store',
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      })
      if (upstream.status >= 300 && upstream.status < 400) return failure(502)
      const responseHeaders = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
      if (upstream.headers.has('Content-Type')) responseHeaders.set('Content-Type', upstream.headers.get('Content-Type'))
      for (const cookie of upstream.headers.getSetCookie()) responseHeaders.append('Set-Cookie', cookie)
      return new Response(upstream.body, { status: upstream.status, headers: responseHeaders })
    } catch {
      return failure(502)
    }
  },
}

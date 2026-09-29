# Heater Repair Workshop - Frontend (Taller Fuego Sur)

Interactive web application for the visual and comprehensive management of work orders in a heater repair workshop. It allows collection-based monitoring of workshop workload metrics, filtering repair orders across their lifecycle (Received, In Repair, Completed), and registering new orders with real-time reactive validation and asynchronous handling.

## Technologies

- **Vanilla TypeScript** (Hermetic type safety, strict mode, zero `any`)
- **Vite** (Next-generation build tool and hot-reloading dev server)
- **Native Web Standards & ESModules** (HTML5, CSS3, Async/Await, and Fetch API)

## Installation and Execution Commands

- **Install dependencies:**
  ```bash
  npm install
  ```

- **Run hot-reloading development server:**
  ```bash
  npm run dev
  ```

- **Run TypeScript type verification and production build:**
  ```bash
  npm run build
  ```

## Run with Docker

The backend repository contains the shared Docker Compose file. Clone both
repositories as sibling directories:

```text
parent-directory/
|-- heater-repair-workshop/
`-- heater-repair-workshop-frontend/
```

Create the backend environment file and start the complete stack:

```bash
cd heater-repair-workshop
cp .env.example .env
docker compose up -d --build
```

Open <http://localhost:8081>. Nginx serves the production frontend and proxies
requests under `/api` to the Spring Boot backend within the Docker network.
Node.js is not required on the host for this workflow.

## Deploy on Cloudflare Workers

Import this Git repository in Cloudflare Workers and use the following build
configuration:

```text
Production branch: main
Build command: npm run build
Deploy command: npx wrangler@4.129.0 deploy
```

AUTH-01 uses same-origin `/api/*` requests. Remove the previous `VITE_API_URL`
build variable; the application no longer reads it. `wrangler.jsonc` runs
`worker/api-proxy.mjs` before static assets for `/api/*`. That Worker forwards
requests to the existing Render HTTPS origin, preserving session cookies and CSRF
headers and disabling API response caching. It does not follow backend redirects
or accept requests carrying a foreign Origin. No new Cloudflare secrets are needed.

Keep Render's existing `CORS_ALLOWED_ORIGINS` restricted to the exact frontend URL;
the browser now talks only to its own origin. Production cookies require HTTPS.
The production branch setting stays unchanged; AUTH-01 must complete QA/review
before a separately authorized release.

The production frontend is available at:

- Web application: <https://heater-repair-workshop-frontend.franco-armijo.workers.dev>

For a manual deployment from a machine authenticated with Cloudflare, run:

```bash
npm install
npm run deploy
```

Validate the deployment by opening the web application and confirming that the
work-order list loads from Render. The API can also be checked directly:

```bash
curl -i https://heater-repair-workshop-api.onrender.com/api/work-orders
```

Without a session it must return `401`. `/api/health` returns `200` with an empty
body. Authenticate through the UI to view orders; no work-order data is loaded
before session validation. Sign out invalidates the backend session, and expired
sessions return to login. No credentials are stored in localStorage/sessionStorage.

Run `npm test` for authentication UI and proxy tests, then `npm run build` for
TypeScript checks and the production bundle. Vitest and jsdom are development-only
dependencies. The existing Vite and Nginx local proxies are unchanged. Use the
backend `dev` profile for local HTTP; production requires HTTPS and Secure cookies.
See the backend `docs/AUTH-01.md` for first-user provisioning and remaining QA.


## Work Orders v1

The resource is `/api/work-orders`; UI routes use `#work-orders`.
Repair orders require diagnosis and an explicit customer decision before work starts.
Approval records whether parts are available; otherwise work waits for parts.
Rejection closes the order as `NOT_APPROVED`. Maintenance can start directly or wait
for parts, without diagnosis or repair approval. Only work in progress can complete.

The detail displays the current state and valid business actions. The Dashboard
represents all seven states and distinguishes completed work from rejected repairs.
Session authentication and CSRF headers remain required for mutations.

Historical orders display their `LEGACY` provenance. Historical work already in
progress can complete without inventing approval; new `V1` repairs cannot use this
exception. The backend migration must be applied before starting the updated API;
see the backend `docs/WORK-ORDERS-V1.md` runbook. No deployment is part of this change.

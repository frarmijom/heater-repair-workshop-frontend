# Heater Repair Workshop - Frontend (Taller Fuego Sur)

Interactive web application for the visual and comprehensive management of work orders in a heater repair workshop. It allows real-time monitoring of workshop workload metrics, filtering repair orders across their lifecycle (Received, In Repair, Completed), and registering new orders with real-time reactive validation and asynchronous handling.

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

Add this production environment variable before deploying:

```text
VITE_API_URL=https://heater-repair-workshop-api.onrender.com/api
```

The included `wrangler.jsonc` publishes `dist` as static assets and configures
the fallback required by a single-page application. After Cloudflare assigns
the final `workers.dev` URL, configure that exact URL as
`CORS_ALLOWED_ORIGINS` in the Render service and redeploy the API.

The production frontend is available at:

- Web application: <https://heater-repair-workshop-frontend.franco-armijo.workers.dev>

For a manual deployment from a machine authenticated with Cloudflare, run:

```bash
npm install
npm run deploy
```

Validate the deployment by opening the web application and confirming that the
repair-order list loads from Render. The API can also be checked directly:

```bash
curl -i https://heater-repair-workshop-api.onrender.com/api/repair-orders
```

It must return `200` with a JSON array. If the frontend reports a connection
error, verify `VITE_API_URL`, rebuild the frontend, and confirm that Render's
`CORS_ALLOWED_ORIGINS` exactly matches the Cloudflare Workers origin.

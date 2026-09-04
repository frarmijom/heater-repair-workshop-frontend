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

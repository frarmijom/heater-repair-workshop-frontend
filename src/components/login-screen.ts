import { generateHeaterBlueprintHtml } from './heater-blueprint.ts'

export function generateLoginScreenHtml(): string {
  return `
    <main class="login-screen" lang="es">
      <section class="login-screen__identity" aria-label="Heater Repair Workshop">
        <p class="login-screen__brand" lang="en"><span aria-hidden="true">HRW /</span> Heater Repair Workshop</p>
        <div class="login-screen__intro">
          <p class="login-screen__eyebrow">Gestión técnica de órdenes de trabajo</p>
          <h2>Cada orden de trabajo,<br>paso a paso.</h2>
          <p>El trabajo de tu taller, desde el ingreso hasta el cierre.</p>
        </div>
        <div class="login-screen__technical">
          <ol class="login-screen__flow" aria-label="Flujo operacional">
            <li>Cliente</li><li>Ingreso</li><li>Servicio</li><li>Seguimiento</li><li>Cierre</li>
          </ol>
          <div class="login-screen__blueprint">${generateHeaterBlueprintHtml()}</div>
        </div>
        <p class="login-screen__caption">Orden · Diagnóstico · Seguimiento</p>
      </section>
      <section class="login-screen__access" aria-labelledby="login-title">
        <div class="login-screen__card">
          <p class="login-screen__eyebrow">Acceso al taller</p>
          <h1 id="login-title">Bienvenido</h1>
          <p class="login-screen__description">Ingresa tus credenciales para acceder al taller.</p>
          <form id="login-form" class="login-screen__form">
            <div class="login-screen__field">
              <label for="login-email">Correo electrónico</label>
              <input id="login-email" name="email" type="email" autocomplete="username" maxlength="254" required />
            </div>
            <div class="login-screen__field">
              <label for="login-password">Contraseña</label>
              <div class="login-screen__password">
                <input id="login-password" name="password" type="password" autocomplete="current-password" maxlength="1024" required />
                <button type="button" data-password-toggle aria-label="Mostrar contraseña" aria-controls="login-password" aria-pressed="false">Mostrar</button>
              </div>
            </div>
            <button class="login-screen__submit" type="submit">Iniciar sesión</button>
            <p id="login-error" role="alert" lang="en"></p>
          </form>
        </div>
      </section>
    </main>`
}

export function setupPasswordVisibility(root: HTMLElement): void {
  const input = root.querySelector<HTMLInputElement>('#login-password')!
  const toggle = root.querySelector<HTMLButtonElement>('[data-password-toggle]')!
  toggle.addEventListener('click', () => {
    const visible = input.type === 'password'
    input.type = visible ? 'text' : 'password'
    toggle.setAttribute('aria-pressed', String(visible))
    toggle.setAttribute('aria-label', visible ? 'Ocultar contraseña' : 'Mostrar contraseña')
    toggle.textContent = visible ? 'Ocultar' : 'Mostrar'
  })
}

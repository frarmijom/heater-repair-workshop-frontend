export function generateLoginScreenHtml(): string {
  return `
    <main class="login-screen" lang="es">
      <section class="login-screen__identity" aria-label="Heater Repair Workshop">
        <p class="login-screen__brand" lang="en"><span aria-hidden="true">HRW /</span> Heater Repair Workshop</p>
        <div class="login-screen__intro">
          <p class="login-screen__eyebrow">Gestión técnica de reparaciones</p>
          <h2>Cada reparación,<br>paso a paso.</h2>
          <p>El trabajo de tu taller, desde el ingreso hasta la entrega.</p>
        </div>
        <div class="login-screen__technical">
          <ol class="login-screen__flow" aria-label="Flujo operacional">
            <li>Cliente</li><li>Ingreso</li><li>Diagnóstico</li><li>Reparación</li><li>Entrega</li>
          </ol>
          <svg class="login-screen__blueprint" viewBox="0 0 260 340" fill="none" aria-hidden="true" focusable="false">
            <g stroke="currentColor" stroke-width="1.5">
              <path opacity=".35" stroke-dasharray="4 5" d="M130 0v340M0 170h260"/>
              <path d="M110 42V16h40v26M104 16h52M104 25h52"/>
              <rect x="55" y="42" width="150" height="236" rx="12"/>
              <rect x="65" y="52" width="130" height="216" rx="6" opacity=".4"/>
              <path d="M82 76h96M82 84h96M82 92h96M82 100h96"/>
              <rect x="83" y="123" width="94" height="68" rx="5"/>
              <path d="M96 137h68v12H96v12h68v12H96"/>
              <path d="M103 191v19m54-19v19M82 278v40h-20m116-40v40h20M130 278v50"/>
              <circle cx="97" cy="238" r="10"/><path d="M97 231v7"/>
              <rect x="129" y="224" width="39" height="27" rx="3"/>
              <path d="M140 236h17M140 241h10"/>
              <path opacity=".5" d="M28 42v236M22 42h12M22 278h12M55 298h150M55 292v12M205 292v12"/>
            </g>
          </svg>
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

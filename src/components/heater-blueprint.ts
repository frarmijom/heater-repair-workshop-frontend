export function generateHeaterBlueprintHtml(): string {
  return `<svg class="heater-blueprint" viewBox="0 0 260 340" fill="none" aria-hidden="true" focusable="false">
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
          </svg>`
}

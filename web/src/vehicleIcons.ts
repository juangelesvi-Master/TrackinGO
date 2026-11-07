// Íconos de vehículo vistos desde arriba, con el frente hacia arriba (el mapa los gira según el rumbo).
// El color de la carrocería sale de "currentColor", así cambia con el estado (en línea, sin señal…).

export type VehicleKind = 'car' | 'bus' | 'van'

export const VEHICLE_KINDS: { id: VehicleKind; name: string }[] = [
  { id: 'car', name: 'Carro' },
  { id: 'bus', name: 'Camión de personal' },
  { id: 'van', name: 'Urvan / camioneta' },
]

/** Tipo de vehículo a partir de la categoría de Traccar (por defecto, carro). */
export function vehicleKind(category: string | null | undefined): VehicleKind {
  if (category === 'bus' || category === 'truck') return 'bus'
  if (category === 'van') return 'van'
  return 'car'
}

/** Colores para elegir. Sin color, la carrocería cambia según el estado (verde en línea, gris sin señal…).
 *  No hay grises: el gris queda reservado para "apagado / sin señal". */
export const VEHICLE_COLORS: { id: string; name: string }[] = [
  { id: '#f8fafc', name: 'Blanco' },
  { id: '#111827', name: 'Negro' },
  { id: '#dc2626', name: 'Rojo' },
  { id: '#2563eb', name: 'Azul' },
  { id: '#1e3a8a', name: 'Azul marino' },
  { id: '#facc15', name: 'Amarillo' },
  { id: '#ea580c', name: 'Naranja' },
  { id: '#15803d', name: 'Verde' },
  { id: '#7c2d12', name: 'Café' },
  { id: '#7c3aed', name: 'Morado' },
]

/** true si el color se confunde con el gris de "apagado" (poco color y ni muy claro ni muy oscuro). */
export function isGrayish(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const light = (max + min) / 2 / 255
  return max - min < 40 && light > 0.2 && light < 0.85
}

/** Color elegido para el vehículo (guardado en attributes.color), o null si usa el color por estado. */
export function vehicleColor(attributes: Record<string, unknown> | null | undefined): string | null {
  const c = attributes?.color
  return typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) && !isGrayish(c) ? c.toLowerCase() : null
}

const GLASS = 'fill="#dbeafe" stroke="#1f2937" stroke-width="0.6"'
const BODY = 'fill="currentColor" stroke="#1f2937" stroke-width="1"'

const SVG: Record<VehicleKind, string> = {
  car: `<svg viewBox="0 0 20 36" width="16" height="29" aria-hidden="true">
    <rect x="2" y="1" width="16" height="34" rx="6" ${BODY}/>
    <path d="M4.5 10.5 Q10 7.5 15.5 10.5 L14.5 14 Q10 12.8 5.5 14 Z" ${GLASS}/>
    <rect x="5.5" y="15" width="9" height="9" rx="2" fill="rgb(0 0 0 / 0.12)"/>
    <path d="M5.5 26 Q10 27 14.5 26 L15 30 Q10 31.5 5 30 Z" ${GLASS}/>
  </svg>`,
  van: `<svg viewBox="0 0 20 40" width="16" height="32" aria-hidden="true">
    <rect x="2" y="1" width="16" height="38" rx="5" ${BODY}/>
    <path d="M4.5 6 Q10 3.5 15.5 6 L15 10 Q10 8.8 5 10 Z" ${GLASS}/>
    <rect x="4.5" y="12" width="11" height="24" rx="2" fill="rgb(255 255 255 / 0.25)" stroke="#1f2937" stroke-width="0.5"/>
    <line x1="4.5" y1="20" x2="15.5" y2="20" stroke="#1f2937" stroke-width="0.5"/>
    <line x1="4.5" y1="28" x2="15.5" y2="28" stroke="#1f2937" stroke-width="0.5"/>
  </svg>`,
  bus: `<svg viewBox="0 0 20 46" width="15" height="35" aria-hidden="true">
    <rect x="2" y="1" width="16" height="44" rx="3.5" ${BODY}/>
    <path d="M4 3.5 Q10 2.2 16 3.5 L16 7.5 Q10 6.6 4 7.5 Z" ${GLASS}/>
    <rect x="2.6" y="10" width="2" height="31" rx="0.6" ${GLASS}/>
    <rect x="15.4" y="10" width="2" height="31" rx="0.6" ${GLASS}/>
    <line x1="2.6" y1="17.5" x2="4.6" y2="17.5" stroke="#1f2937" stroke-width="0.5"/>
    <line x1="2.6" y1="25.5" x2="4.6" y2="25.5" stroke="#1f2937" stroke-width="0.5"/>
    <line x1="2.6" y1="33.5" x2="4.6" y2="33.5" stroke="#1f2937" stroke-width="0.5"/>
    <line x1="15.4" y1="17.5" x2="17.4" y2="17.5" stroke="#1f2937" stroke-width="0.5"/>
    <line x1="15.4" y1="25.5" x2="17.4" y2="25.5" stroke="#1f2937" stroke-width="0.5"/>
    <line x1="15.4" y1="33.5" x2="17.4" y2="33.5" stroke="#1f2937" stroke-width="0.5"/>
    <rect x="7" y="14" width="6" height="5" rx="1" fill="rgb(255 255 255 / 0.35)"/>
    <rect x="7" y="29" width="6" height="5" rx="1" fill="rgb(255 255 255 / 0.35)"/>
    <rect x="4" y="42" width="12" height="1.6" rx="0.6" fill="rgb(0 0 0 / 0.25)"/>
  </svg>`,
}

export const vehicleIconHtml = (kind: VehicleKind) => SVG[kind]

// Vista de lado (para la lista de vehículos). La carrocería también usa "currentColor".
const SIDE_BODY = 'fill="currentColor" stroke="#1f2937" stroke-width="1.2" stroke-linejoin="round"'
const SIDE_GLASS = 'fill="#dbeafe" stroke="#1f2937" stroke-width="0.8"'
const wheel = (x: number, y: number, r: number) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="#1f2937"/><circle cx="${x}" cy="${y}" r="${r * 0.45}" fill="#d1d5db"/>`

const SIDE: Record<VehicleKind, string> = {
  car: `<svg viewBox="0 0 124 56" width="96" height="44" aria-hidden="true">
    <path d="M8 38 L10 29 Q12 24 18 23 L34 22 L46 12 Q50 9 56 9 L78 9 Q84 9 88 13 L98 22 L110 24 Q116 26 116 32 L116 38 Q116 42 112 42 L12 42 Q8 42 8 38 Z" ${SIDE_BODY}/>
    <path d="M48 13.5 L58 12.5 L58 22 L39 22 Z" ${SIDE_GLASS}/>
    <path d="M62 12.5 L77 12.5 Q81 12.5 84 15 L91 22 L62 22 Z" ${SIDE_GLASS}/>
    <path d="M14 31 L112 31" stroke="rgb(255 255 255 / 0.4)" stroke-width="1.5"/>
    <path d="M60 23 L60 40" stroke="rgb(0 0 0 / 0.25)" stroke-width="0.8"/>
    <rect x="110" y="27" width="5" height="3" rx="1" fill="#fde68a"/>
    <rect x="8.5" y="29" width="3" height="4" rx="1" fill="#ef4444"/>
    ${wheel(32, 42, 9)}${wheel(92, 42, 9)}
  </svg>`,
  van: `<svg viewBox="0 0 124 56" width="96" height="44" aria-hidden="true">
    <path d="M8 40 L8 14 Q8 8 14 8 L86 8 Q92 8 96 12 L110 25 Q116 27 116 33 L116 40 Q116 44 112 44 L12 44 Q8 44 8 40 Z" ${SIDE_BODY}/>
    <rect x="14" y="13" width="18" height="12" rx="1.5" ${SIDE_GLASS}/>
    <rect x="36" y="13" width="18" height="12" rx="1.5" ${SIDE_GLASS}/>
    <rect x="58" y="13" width="18" height="12" rx="1.5" ${SIDE_GLASS}/>
    <path d="M80 13 L91 13 L103 25 L80 25 Z" ${SIDE_GLASS}/>
    <path d="M12 31 L114 31" stroke="rgb(255 255 255 / 0.4)" stroke-width="1.5"/>
    <path d="M56 26 L56 42" stroke="rgb(0 0 0 / 0.25)" stroke-width="0.8"/>
    <rect x="111" y="29" width="4.5" height="3" rx="1" fill="#fde68a"/>
    ${wheel(30, 44, 9)}${wheel(94, 44, 9)}
  </svg>`,
  bus: `<svg viewBox="0 0 124 56" width="96" height="44" aria-hidden="true">
    <path d="M6 42 L6 10 Q6 6 10 6 L109 6 Q115 6 116 12 L117 38 Q117 44 111 44 L10 44 Q6 44 6 42 Z" ${SIDE_BODY}/>
    ${[12, 28, 44, 60, 76, 92].map((x) => `<rect x="${x}" y="11" width="13" height="13" rx="1.5" ${SIDE_GLASS}/>`).join('')}
    <rect x="107" y="10" width="8" height="18" rx="1.5" ${SIDE_GLASS}/>
    <path d="M8 31 L115 31" stroke="rgb(255 255 255 / 0.45)" stroke-width="2"/>
    <rect x="109" y="31" width="5" height="12" rx="1" fill="rgb(0 0 0 / 0.15)"/>
    <rect x="112.5" y="35" width="4" height="3" rx="1" fill="#fde68a"/>
    ${wheel(26, 44, 8)}${wheel(94, 44, 8)}
  </svg>`,
}

export const vehicleSideHtml = (kind: VehicleKind) => SIDE[kind]

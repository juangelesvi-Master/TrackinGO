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

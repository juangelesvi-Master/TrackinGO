// Íconos de vehículo vistos desde arriba, con el frente hacia arriba (el mapa los gira según el rumbo).
// El color de la carrocería sale de "currentColor", así cambia con el estado (en línea, sin señal…).

export type VehicleKind = 'car' | 'truck' | 'van'

export const VEHICLE_KINDS: { id: VehicleKind; name: string }[] = [
  { id: 'car', name: 'Carro' },
  { id: 'truck', name: 'Camión' },
  { id: 'van', name: 'Urvan / camioneta' },
]

/** Tipo de vehículo a partir de la categoría de Traccar (por defecto, carro). */
export function vehicleKind(category: string | null | undefined): VehicleKind {
  if (category === 'truck' || category === 'van') return category
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
  truck: `<svg viewBox="0 0 22 44" width="17" height="34" aria-hidden="true">
    <rect x="3.5" y="1" width="15" height="11" rx="3" ${BODY}/>
    <path d="M5.5 4.5 Q11 2.8 16.5 4.5 L16 8 Q11 7 6 8 Z" ${GLASS}/>
    <rect x="1" y="13" width="20" height="30" rx="1.5" fill="currentColor" stroke="#1f2937" stroke-width="1"/>
    <rect x="3" y="15" width="16" height="26" rx="1" fill="rgb(255 255 255 / 0.3)"/>
  </svg>`,
}

export const vehicleIconHtml = (kind: VehicleKind) => SVG[kind]

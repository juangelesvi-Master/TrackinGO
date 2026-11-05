import type { Device, TraccarEvent } from './traccar'

/** Nombre en español de cada tipo de evento de Traccar. */
export const EVENT_LABEL: Record<string, string> = {
  geofenceEnter: 'Entró a una geocerca',
  geofenceExit: 'Salió de una geocerca',
  deviceOverspeed: 'Exceso de velocidad',
  deviceOffline: 'Se desconectó',
  deviceOnline: 'Se conectó',
  deviceUnknown: 'Estado desconocido',
  deviceInactive: 'Sin reportar por mucho tiempo',
  deviceMoving: 'Empezó a moverse',
  deviceStopped: 'Se detuvo',
  ignitionOn: 'Motor encendido',
  ignitionOff: 'Motor apagado',
  alarm: 'Alarma',
  commandResult: 'Respuesta del rastreador',
  queuedCommandSent: 'Orden en cola enviada',
  maintenance: 'Mantenimiento pendiente',
  driverChanged: 'Cambio de conductor',
}

const ALARM_LABEL: Record<string, string> = {
  sos: 'botón de pánico (SOS)',
  powerCut: 'corte de energía',
  lowBattery: 'batería baja',
  vibration: 'vibración',
  tampering: 'manipulación del equipo',
  accident: 'posible accidente',
  overspeed: 'exceso de velocidad',
}

export function eventText(e: TraccarEvent, devices: Record<number, Device>, geofenceName?: string) {
  if (e.type === 'driverChanged' && typeof e.attributes.driverUniqueId === 'string') {
    return { vehicle: devices[e.deviceId]?.name ?? 'Vehículo', what: `Cambio de chofer (tarjeta ${e.attributes.driverUniqueId})` }
  }
  const vehicle = devices[e.deviceId]?.name ?? 'Vehículo'
  let what = EVENT_LABEL[e.type] ?? e.type
  if (e.type === 'alarm' && typeof e.attributes.alarm === 'string') what = `Alarma: ${ALARM_LABEL[e.attributes.alarm] ?? e.attributes.alarm}`
  if ((e.type === 'geofenceEnter' || e.type === 'geofenceExit') && geofenceName) what = `${e.type === 'geofenceEnter' ? 'Entró a' : 'Salió de'} ${geofenceName}`
  if (e.type === 'deviceOverspeed' && typeof e.attributes.speed === 'number') what += ` (${Math.round(e.attributes.speed * 1.852)} km/h)`
  if (e.type === 'commandResult' && typeof e.attributes.result === 'string') what += `: ${e.attributes.result}`
  return { vehicle, what }
}

/** Eventos que conviene destacar en rojo. */
export const URGENT = new Set(['alarm', 'deviceOverspeed', 'geofenceExit'])

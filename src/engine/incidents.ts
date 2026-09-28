import type { Incident, RouteId } from '../data/types';

export type IncidentStatus = 'none' | 'warning' | 'straight' | 'detour' | 'cleared';

export function shouldWarn(status: IncidentStatus, routeId: RouteId, km: number, inc: Incident): boolean {
  return status === 'none' && routeId === 'main' && km >= inc.warnAtKm && km < inc.positionKm;
}

export function canTriggerManually(status: IncidentStatus, routeId: RouteId, km: number, inc: Incident): boolean {
  return status === 'none' && routeId === 'main' && km < inc.positionKm;
}

export function detourCost(mainKm: number, detourKm: number, speedKmh: number): { extraKm: number; extraMin: number } {
  const extraKm = detourKm - mainKm;
  return { extraKm, extraMin: Math.round((extraKm / speedKmh) * 60) };
}

export function passedIncident(prevKm: number, km: number, inc: Incident): boolean {
  return prevKm < inc.positionKm && km >= inc.positionKm;
}

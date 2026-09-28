import { INCIDENT } from './incidents';
import { GREETING, POIS } from './pois';
import routes from './routes.json';
import { SERVICES } from './services';
import type { LatLng, TripData } from './types';

export const TRIP_DATA: TripData = {
  routes: { main: routes.main as LatLng[], detour: routes.detour as LatLng[] },
  branchKm: routes.branchKm,
  pois: POIS,
  services: SERVICES,
  incident: INCIDENT,
  greeting: GREETING,
};

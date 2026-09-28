export type LatLng = [number, number];
export type RouteId = 'main' | 'detour';

export interface Poi {
  id: string;
  name: string;
  /** Начала слов в нижнем регистре, без «ё» — для голосового поиска. */
  aliases: string[];
  position: LatLng;
  routes: RouteId[];
  short: string;
  detailed: string;
  /** Свой запас (км) для короткого рассказа. */
  leadKm?: number;
  /** Финиш: по прибытии звучит его подробный рассказ. */
  isDestination?: boolean;
  needsFactCheck?: boolean;
  placeholder?: boolean;
}

export type ServiceKind = 'cafe' | 'hotel' | 'autoservice' | 'pharmacy';

export interface Service {
  id: string;
  kind: ServiceKind;
  name: string;
  position: LatLng;
  routes: RouteId[];
  rating: number;
  details: {
    menu?: { name: string; price: number }[];
    freeRooms?: number;
    pricePerNight?: number;
    hours?: string;
  };
}

export interface Incident {
  id: string;
  kind: 'accident' | 'roadwork';
  title: string;
  source: string;
  /** Километр основного маршрута, где затор. */
  positionKm: number;
  /** Километр основного маршрута, где появляется предупреждение. */
  warnAtKm: number;
  delayMin: number;
  /** Объекты, которые есть только на объезде. */
  detourPoiIds: string[];
}

export interface TripData {
  routes: Record<RouteId, LatLng[]>;
  branchKm: number;
  pois: Poi[];
  services: Service[];
  incident: Incident;
  greeting: string;
}

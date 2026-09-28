import type { Service, ServiceKind } from '../data/types';
import { fmtDuration } from './format';

export type OfferReason = 'hunger' | 'fatigue' | 'query';

export interface ServiceOnRoute {
  service: Service;
  km: number;
}

export interface OfferItem {
  service: Service;
  aheadKm: number;
}

export interface Offer {
  reason: OfferReason;
  kind: ServiceKind;
  message: string;
  items: OfferItem[];
}

export interface OfferContext {
  tripMin: number;
  drivingSinceStopMin: number;
  kind?: ServiceKind;
}

export const LUNCH_START_MIN = 12 * 60 + 30;
export const LUNCH_END_MIN = 14 * 60;
export const LUNCH_MEAL_GAP_MIN = 90;
export const MEAL_GAP_MIN = 150;
export const FATIGUE_MIN = 120;
export const AUTO_COOLDOWN_MIN = 60;
export const CAFE_RADIUS_KM = 30;
const BEHIND_TOLERANCE_KM = 0.5;
const MAX_ITEMS = 3;

export const KIND_LABEL: Record<ServiceKind, string> = {
  cafe: 'Кафе',
  hotel: 'Отели',
  autoservice: 'Автосервисы',
  pharmacy: 'Аптеки',
};

const hasFreeRooms = (s: Service) => (s.details.freeRooms ?? 0) > 0;

export function hungerDue(clockMin: number, sinceMealMin: number): boolean {
  const lunch = clockMin >= LUNCH_START_MIN && clockMin <= LUNCH_END_MIN;
  return sinceMealMin >= MEAL_GAP_MIN || (lunch && sinceMealMin >= LUNCH_MEAL_GAP_MIN);
}

export function fatigueDue(drivingSinceStopMin: number): boolean {
  return drivingSinceStopMin >= FATIGUE_MIN;
}

export function servicesAhead(
  list: ServiceOnRoute[],
  kind: ServiceKind,
  km: number,
  opts: { maxAheadKm?: number; limit?: number; accept?: (s: Service) => boolean } = {},
): OfferItem[] {
  const { maxAheadKm = Infinity, limit = MAX_ITEMS, accept = () => true } = opts;
  return list
    .filter((x) => x.service.kind === kind && x.km >= km - BEHIND_TOLERANCE_KM && x.km - km <= maxAheadKm && accept(x.service))
    .sort((a, b) => a.km - b.km)
    .slice(0, limit)
    .map((x) => ({ service: x.service, aheadKm: Math.max(0, x.km - km) }));
}

export function buildOffer(reason: OfferReason, list: ServiceOnRoute[], km: number, ctx: OfferContext): Offer {
  if (reason === 'hunger') {
    let items = servicesAhead(list, 'cafe', km, { maxAheadKm: CAFE_RADIUS_KM });
    if (items.length === 0) items = servicesAhead(list, 'cafe', km);
    const message = items.length
      ? `Вы в пути ${fmtDuration(ctx.tripMin)} — время перекусить. Ближайшее кафе — через ${Math.round(items[0].aheadKm)} км.`
      : 'Впереди по маршруту кафе не нашлось.';
    return { reason, kind: 'cafe', message, items };
  }
  if (reason === 'fatigue') {
    const items = servicesAhead(list, 'hotel', km, { accept: hasFreeRooms });
    const message = items.length
      ? `Вы за рулём ${fmtDuration(ctx.drivingSinceStopMin)} без остановки — пора отдохнуть. Отели со свободными номерами впереди: ${items.length}.`
      : 'Впереди нет отелей со свободными номерами.';
    return { reason, kind: 'hotel', message, items };
  }
  const kind = ctx.kind ?? 'cafe';
  const items = servicesAhead(list, kind, km, { accept: kind === 'hotel' ? hasFreeRooms : undefined });
  const message = items.length
    ? `${KIND_LABEL[kind]} впереди по маршруту: ${items.length}. Ближайшее — через ${Math.round(items[0].aheadKm)} км.`
    : `${KIND_LABEL[kind]} впереди по маршруту не найдены.`;
  return { reason, kind, message, items };
}

import { describe, expect, it } from 'vitest';
import type { Service, ServiceKind } from '../data/types';
import { buildOffer, fatigueDue, hungerDue, servicesAhead, type OfferItem, type ServiceOnRoute } from './needs';

const svc = (id: string, kind: ServiceKind, extra: Partial<Service> = {}): Service => ({
  id, kind, name: id, position: [0, 0], routes: ['main'], rating: 4.5, details: {}, ...extra,
});
const at = (service: Service, km: number): ServiceOnRoute => ({ service, km });
const ids = (items: OfferItem[]) => items.map((i) => i.service.id);

const LIST = [
  at(svc('c1', 'cafe'), 5),
  at(svc('c2', 'cafe'), 25),
  at(svc('c3', 'cafe'), 45),
  at(svc('h1', 'hotel', { details: { freeRooms: 1 } }), 30),
  at(svc('c0', 'cafe'), 9.8),
];

describe('hungerDue', () => {
  it('is false right after the start', () => expect(hungerDue(11 * 60 + 30, 60)).toBe(false));
  it('is true at lunch time after 90 minutes without food', () => expect(hungerDue(12 * 60 + 40, 95)).toBe(true));
  it('is true after 150 minutes without food at any time', () => expect(hungerDue(11 * 60, 150)).toBe(true));
  it('is false after lunch time with a recent meal', () => expect(hungerDue(15 * 60, 100)).toBe(false));
});

describe('fatigueDue', () => {
  it('triggers after two hours behind the wheel', () => {
    expect(fatigueDue(119)).toBe(false);
    expect(fatigueDue(120)).toBe(true);
  });
});

describe('servicesAhead', () => {
  it('returns services of the kind ahead of the car, nearest first', () => {
    expect(ids(servicesAhead(LIST, 'cafe', 10))).toEqual(['c0', 'c2', 'c3']);
  });

  it('never returns what is left behind', () => {
    expect(ids(servicesAhead(LIST, 'cafe', 10))).not.toContain('c1');
  });

  it('limits the distance and the count', () => {
    expect(ids(servicesAhead(LIST, 'cafe', 10, { maxAheadKm: 30 }))).toEqual(['c0', 'c2']);
    expect(ids(servicesAhead(LIST, 'cafe', 0, { limit: 2 }))).toEqual(['c1', 'c0']);
  });

  it('reports how far ahead each one is', () => {
    expect(servicesAhead(LIST, 'hotel', 10)[0].aheadKm).toBe(20);
    expect(servicesAhead(LIST, 'cafe', 10)[0].aheadKm).toBe(0);
  });
});

describe('buildOffer', () => {
  const ctx = { tripMin: 100, drivingSinceStopMin: 100 };

  it('suggests cafes within 30 km on hunger', () => {
    const o = buildOffer('hunger', LIST, 10, ctx);
    expect(o.kind).toBe('cafe');
    expect(ids(o.items)).toEqual(['c0', 'c2']);
    expect(o.message).toContain('Вы в пути 1 ч 40 мин — время перекусить');
  });

  it('falls back to farther cafes when none are within 30 km', () => {
    expect(ids(buildOffer('hunger', [at(svc('far', 'cafe'), 80)], 10, ctx).items)).toEqual(['far']);
  });

  it('says so when there is nothing ahead', () => {
    const o = buildOffer('hunger', [], 10, ctx);
    expect(o.items).toEqual([]);
    expect(o.message).toBe('Впереди по маршруту кафе не нашлось.');
  });

  it('offers only hotels with free rooms on fatigue', () => {
    const hotels = [
      at(svc('full', 'hotel', { details: { freeRooms: 0 } }), 20),
      at(svc('ok', 'hotel', { details: { freeRooms: 2 } }), 40),
    ];
    const o = buildOffer('fatigue', hotels, 10, { tripMin: 130, drivingSinceStopMin: 125 });
    expect(ids(o.items)).toEqual(['ok']);
    expect(o.message).toContain('Вы за рулём 2 ч 5 мин без остановки');
  });

  it('never offers a hotel without free rooms, even on request', () => {
    const hotels = [
      at(svc('full', 'hotel', { details: { freeRooms: 0 } }), 20),
      at(svc('ok', 'hotel', { details: { freeRooms: 1 } }), 40),
    ];
    expect(ids(buildOffer('query', hotels, 10, { tripMin: 0, drivingSinceStopMin: 0, kind: 'hotel' }).items)).toEqual(['ok']);
  });

  it('finds the requested kind on a query', () => {
    const o = buildOffer('query', LIST, 10, { tripMin: 0, drivingSinceStopMin: 0, kind: 'hotel' });
    expect(o.kind).toBe('hotel');
    expect(o.message).toBe('Отели впереди по маршруту: 1. Ближайшее — через 20 км.');
  });
});

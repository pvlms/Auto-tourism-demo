import { describe, expect, it } from 'vitest';
import { makePolyline, projectKm } from '../engine/geo';
import { TRIP_DATA } from './index';

const lines = {
  main: makePolyline(TRIP_DATA.routes.main),
  detour: makePolyline(TRIP_DATA.routes.detour),
};

describe.each(TRIP_DATA.pois)('POI $id', (poi) => {
  it('lies within 3 km of each of its routes', () => {
    for (const r of poi.routes) expect(projectKm(lines[r], poi.position).offKm).toBeLessThanOrEqual(3);
  });

  it('has both stories and normalized aliases', () => {
    expect(poi.short.length).toBeGreaterThan(40);
    expect(poi.detailed.length).toBeGreaterThan(poi.short.length);
    for (const a of poi.aliases) expect(a).toBe(a.toLowerCase().replace(/ё/g, 'е'));
  });
});

describe.each(TRIP_DATA.services)('service $id', (service) => {
  it('lies within 3 km of each of its routes', () => {
    for (const r of service.routes) expect(projectKm(lines[r], service.position).offKm).toBeLessThanOrEqual(3);
  });
});

describe('trip data', () => {
  it('uses unique ids', () => {
    const ids = [...TRIP_DATA.pois.map((p) => p.id), ...TRIP_DATA.services.map((s) => s.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has exactly one destination', () => {
    expect(TRIP_DATA.pois.filter((p) => p.isDestination).map((p) => p.id)).toEqual(['tolmachev']);
  });

  it('warns before the branch and the jam is after it', () => {
    const inc = TRIP_DATA.incident;
    expect(inc.warnAtKm).toBeLessThan(TRIP_DATA.branchKm);
    expect(TRIP_DATA.branchKm).toBeLessThan(inc.positionKm);
    expect(inc.positionKm).toBeLessThan(lines.main.totalKm);
  });

  it('lists detour-only objects for the detour', () => {
    for (const id of TRIP_DATA.incident.detourPoiIds) {
      expect(TRIP_DATA.pois.find((p) => p.id === id)?.routes).toEqual(['detour']);
    }
  });

  it('has a hotel without free rooms to show the filter', () => {
    expect(TRIP_DATA.services.some((s) => s.kind === 'hotel' && s.details.freeRooms === 0)).toBe(true);
  });
});

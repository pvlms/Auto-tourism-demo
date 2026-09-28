import { describe, expect, it } from 'vitest';
import { haversineKm, makePolyline, pointAt, projectKm } from '../engine/geo';
import type { LatLng } from './types';
import routes from './routes.json';

const main = makePolyline(routes.main as LatLng[]);
const detour = makePolyline(routes.detour as LatLng[]);

describe('routes.json', () => {
  it('main route Novomoskovsk → Kaluga is about 168 km', () => {
    expect(main.totalKm).toBeGreaterThan(160);
    expect(main.totalKm).toBeLessThan(176);
  });

  it('detour via Aleksin is about 199 km', () => {
    expect(detour.totalKm).toBeGreaterThan(190);
    expect(detour.totalKm).toBeLessThan(210);
  });

  it('branches in Tula', () => {
    expect(routes.branchKm).toBeGreaterThan(55);
    expect(routes.branchKm).toBeLessThan(63);
  });

  it('both routes share start and finish', () => {
    expect(haversineKm(main.points[0], detour.points[0])).toBeLessThan(0.5);
    expect(haversineKm(main.points[main.points.length - 1], detour.points[detour.points.length - 1])).toBeLessThan(0.5);
  });

  it('detour follows the main road before the branch and leaves it after', () => {
    expect(projectKm(main, pointAt(detour, routes.branchKm - 5)).offKm).toBeLessThan(0.1);
    expect(projectKm(main, pointAt(detour, routes.branchKm + 30)).offKm).toBeGreaterThan(1);
  });
});

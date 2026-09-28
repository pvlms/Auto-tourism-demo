import { describe, expect, it } from 'vitest';
import type { LatLng } from '../data/types';
import { haversineKm, makePolyline, pointAt, projectKm } from './geo';

const DEG_KM = 111.195; // 1° по экватору при R = 6371 км
const EQUATOR: LatLng[] = [[0, 0], [0, 1], [0, 2]];

describe('haversineKm', () => {
  it('measures one degree along the equator', () => {
    expect(haversineKm([0, 0], [0, 1])).toBeCloseTo(DEG_KM, 2);
  });

  it('is zero for the same point', () => {
    expect(haversineKm([54, 37], [54, 37])).toBe(0);
  });
});

describe('makePolyline', () => {
  it('accumulates segment lengths', () => {
    const line = makePolyline(EQUATOR);
    expect(line.cum[0]).toBe(0);
    expect(line.cum[1]).toBeCloseTo(DEG_KM, 2);
    expect(line.totalKm).toBeCloseTo(2 * DEG_KM, 2);
  });
});

describe('pointAt', () => {
  const line = makePolyline(EQUATOR);

  it('interpolates inside a segment', () => {
    const [lat, lng] = pointAt(line, line.cum[1] * 1.5);
    expect(lat).toBeCloseTo(0, 6);
    expect(lng).toBeCloseTo(1.5, 6);
  });

  it('clamps to the ends', () => {
    expect(pointAt(line, -5)).toEqual([0, 0]);
    expect(pointAt(line, 999)).toEqual([0, 2]);
  });

  it('handles a single-point line', () => {
    expect(pointAt(makePolyline([[5, 5]]), 10)).toEqual([5, 5]);
  });
});

describe('projectKm', () => {
  const line = makePolyline(EQUATOR);

  it('projects a point beside the line', () => {
    const r = projectKm(line, [0.01, 1.5]);
    expect(r.km).toBeCloseTo(DEG_KM * 1.5, 1);
    expect(r.offKm).toBeCloseTo(1.106, 2);
  });

  it('projects a point beyond the end onto the end', () => {
    const r = projectKm(line, [0, 2.5]);
    expect(r.km).toBeCloseTo(line.totalKm, 6);
    expect(r.offKm).toBeCloseTo(55.66, 1);
  });

  it('handles a single-point line', () => {
    const r = projectKm(makePolyline([[0, 0]]), [0, 1]);
    expect(r.km).toBe(0);
    expect(r.offKm).toBeCloseTo(DEG_KM, 2);
  });
});

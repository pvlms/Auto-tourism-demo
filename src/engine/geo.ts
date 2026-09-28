import type { LatLng } from '../data/types';

const EARTH_RADIUS_KM = 6371;
const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LNG_EQUATOR = 111.32;

export interface Polyline {
  points: LatLng[];
  cum: number[];
  totalKm: number;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function makePolyline(points: LatLng[]): Polyline {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + haversineKm(points[i - 1], points[i]));
  return { points, cum, totalKm: cum[cum.length - 1] };
}

export function pointAt(line: Polyline, km: number): LatLng {
  const { points, cum } = line;
  if (points.length === 1 || km <= 0) return points[0];
  if (km >= line.totalKm) return points[points.length - 1];
  let lo = 1;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < km) lo = mid + 1;
    else hi = mid;
  }
  const a = points[lo - 1];
  const b = points[lo];
  const seg = cum[lo] - cum[lo - 1];
  const t = seg === 0 ? 0 : (km - cum[lo - 1]) / seg;
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

// Плоская проекция вокруг точки p — точности хватает для расстояний в десятки километров.
export function projectKm(line: Polyline, p: LatLng): { km: number; offKm: number } {
  const { points, cum } = line;
  if (points.length === 1) return { km: 0, offKm: haversineKm(points[0], p) };
  const kx = KM_PER_DEG_LNG_EQUATOR * Math.cos(rad(p[0]));
  const ky = KM_PER_DEG_LAT;
  let best = { km: 0, offKm: Infinity };
  for (let i = 1; i < points.length; i++) {
    const ax = (points[i - 1][1] - p[1]) * kx;
    const ay = (points[i - 1][0] - p[0]) * ky;
    const dx = (points[i][1] - p[1]) * kx - ax;
    const dy = (points[i][0] - p[0]) * ky - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    const off = Math.hypot(ax + t * dx, ay + t * dy);
    if (off < best.offKm) best = { km: cum[i - 1] + t * (cum[i] - cum[i - 1]), offKm: off };
  }
  return best;
}

// Одноразово скачивает геометрию дорог из публичного OSRM в src/data/routes.json.
// Запуск: npm run fetch-routes
import { writeFile } from 'node:fs/promises';

const OSRM = 'https://router.project-osrm.org/route/v1/driving/';
// OSRM ожидает [lng, lat]
const NOVOMOSKOVSK = [38.2963, 54.0105];
const TULA_KREMLIN = [37.6182, 54.1961];
const ALEKSIN = [37.066, 54.508];
const KALUGA = [36.2612, 54.5138];

const round = (x) => Math.round(x * 1e5) / 1e5;

async function fetchRoute(waypoints) {
  const url = `${OSRM}${waypoints.map((p) => p.join(',')).join(';')}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
  const json = await res.json();
  if (json.code !== 'Ok') throw new Error(`OSRM code ${json.code}`);
  return json.routes[0].geometry.coordinates.map(([lng, lat]) => [round(lat), round(lng)]);
}

function haversineKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function distanceToLineKm(p, line) {
  const kx = 111.32 * Math.cos((p[0] * Math.PI) / 180);
  const ky = 110.574;
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const ax = (line[i - 1][1] - p[1]) * kx;
    const ay = (line[i - 1][0] - p[0]) * ky;
    const dx = (line[i][1] - p[1]) * kx - ax;
    const dy = (line[i][0] - p[0]) * ky - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

function lengthKm(line) {
  let km = 0;
  for (let i = 1; i < line.length; i++) km += haversineKm(line[i - 1], line[i]);
  return km;
}

// Километр объезда, на котором он уходит с основной дороги дальше чем на 100 м.
function branchKm(main, detour) {
  let km = 0;
  for (let i = 1; i < detour.length; i++) {
    if (distanceToLineKm(detour[i], main) > 0.1) break;
    km += haversineKm(detour[i - 1], detour[i]);
  }
  return Math.round(km * 10) / 10;
}

const main = await fetchRoute([NOVOMOSKOVSK, TULA_KREMLIN, KALUGA]);
const detour = await fetchRoute([NOVOMOSKOVSK, TULA_KREMLIN, ALEKSIN, KALUGA]);
const branch = branchKm(main, detour);
await writeFile(new URL('../src/data/routes.json', import.meta.url), JSON.stringify({ branchKm: branch, main, detour }));
console.log(`main ${lengthKm(main).toFixed(1)} km, detour ${lengthKm(detour).toFixed(1)} km, branch at ${branch} km`);

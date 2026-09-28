# Аудиогид — демо-прототип: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Веб-приложение в рамке смартфона, которое симулирует автопоездку Новомосковск → Тула → Калуга и показывает контекстный аудиогид, предиктивные сервисы, предупреждение о ДТП с объездом и голосовые команды.

**Architecture:** Три слоя: данные (JSON/TS) → движок поездки (чистый TypeScript, без React и браузерных API, покрыт тестами Vitest) → UI (React + Leaflet). Стор крутит `requestAnimationFrame`, вызывает `engine.tick(dt)`, озвучивает смену `guide.current` через Web Speech API и отдаёт состояние компонентам через `useSyncExternalStore`.

**Tech Stack:** Node ≥ 20, Vite 5, React 18, TypeScript 5 (strict), Leaflet 1.9, Vitest 2, Web Speech API.

**Spec:** `docs/superpowers/specs/2026-09-24-audiogid-demo-design.md`

## Global Constraints

- Все npm/node-команды выполняются в **PowerShell** из `C:\PROG\MYOWN\AUDIOGID` (в Git Bash `node` не виден).
- Тексты интерфейса — на русском; идентификаторы в коде — на английском.
- TypeScript `strict`, `noUnusedLocals`, `noUnusedParameters`.
- `src/engine/**` не импортирует React, Leaflet и браузерные API (`window`, `document`, `speechSynthesis`).
- Бэкенда нет; OSRM вызывается только одноразовым скриптом `scripts/fetch-routes.mjs`; в рантайме сеть нужна только для тайлов карты.
- Все кафе, отели, автосервисы и аптеки вымышленные; результат любого действия с ними — «Готово (демо)».
- Скорость машины — константа 90 км/ч; `timeScale` 1…30, по умолчанию 20; старт часов 11:30; `sinceMealMin` на старте 60.
- Короткий рассказ: за `poi.leadKm` или `max(1 км, 1 минута езды)` до объекта. Подробный: стоянка ≥ 3 с реального времени в пределах 3 км. Голод: `sinceMealMin ≥ 150` или 12:30–14:00 и `sinceMealMin ≥ 90`. Усталость: `drivingSinceStopMin ≥ 120`. Автопредложения не чаще раза в 60 мин симуляции. Кафе по голоду — в пределах 30 км (иначе любые впереди). До 3 вариантов в предложении.
- `tick(dt)` ограничивает `dt` 1000 мс.
- Целевой браузер показа — десктопный Chrome; в остальных — деградация (субтитры, текстовый ввод).
- Коммиты заканчиваются строкой `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (второй `-m`).

## Review Focus

1. **Ведущий жмёт кнопки не по порядку** (до «Старт», после прибытия, дважды подряд) → ничего не ломается, команда просто игнорируется. Тест: Task 9, «ignores commands that make no sense in the current state».
2. **Вкладка ушла в фон и вернулась** (огромный `dt` кадра) → машина не перепрыгивает объекты, рассказы не теряются. Тест: Task 9, «clamps a huge frame delta to one second».
3. **Живая фраза с падежами, «ё», пунктуацией и опечаткой** → находится нужный объект, а обычные слова («пока», «около») не принимаются за объекты. Тесты: Task 8.
4. **Запоздалый колбэк окончания озвучки** от уже заменённого рассказа → не пропускает новый рассказ. Тест: Task 9, «ignores a stale finish callback».
5. **Предложения сервисов** никогда не указывают на то, что уже позади, и на отель без свободных номеров. Тесты: Task 6.

---

## Prerequisite (делает пользователь или с его явного согласия)

Node.js на машине не установлен. Нужен Node ≥ 20 (LTS):

```powershell
winget install OpenJS.NodeJS.LTS
```

После установки открыть новое окно PowerShell и проверить:

```powershell
node -v   # v20.x или новее
npm -v
```

---

## File Structure

```
package.json, tsconfig.json, vite.config.ts, index.html, .gitignore, README.md
.claude/launch.json                 # dev-сервер для встроенного браузера
scripts/fetch-routes.mjs            # одноразовая загрузка геометрии из OSRM
src/
  main.tsx                          # сборка: данные → движок → стор → React
  data/
    types.ts                        # LatLng, RouteId, Poi, Service, Incident, TripData
    routes.json                     # { branchKm, main, detour } — генерируется скриптом
    routes.test.ts
    pois.ts                         # POIS, GREETING
    services.ts                     # SERVICES
    incidents.ts                    # INCIDENT
    index.ts                        # TRIP_DATA
    data.test.ts
  engine/
    format.ts (+test)               # fmtDuration, fmtClock
    geo.ts (+test)                  # haversineKm, makePolyline, pointAt, projectKm
    guide.ts (+test)                # очередь рассказов
    needs.ts (+test)                # голод/усталость/поиск сервисов
    incidents.ts (+test)            # правила предупреждения и объезда
    intents.ts (+test)              # разбор текстовой команды
    trip.ts (+test)                 # TripEngine
  speech/
    tts.ts (+test)                  # озвучка по предложениям, fallback-таймер
    stt.ts                          # распознавание одной фразы
  store/
    tripStore.ts                    # TripStore, StoreContext, useTrip, useUi, useStore
  ui/
    App.tsx, PhoneFrame.tsx, TopBar.tsx, DirectorPanel.tsx, MapView.tsx,
    GuideCard.tsx, AlertBanner.tsx, ServiceSheet.tsx, VoiceBar.tsx, TripSummary.tsx,
    styles.css
```

---

### Task 1: Каркас проекта и форматирование времени

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`, `src/main.tsx`
- Create: `src/engine/format.ts`
- Test: `src/engine/format.test.ts`

**Interfaces:**
- Consumes: —
- Produces: `fmtDuration(min: number): string` («0 мин», «45 мин», «1 ч», «1 ч 40 мин»); `fmtClock(min: number): string` («11:30», минуты от полуночи, по модулю суток). Скрипты npm: `dev`, `build`, `test`, `typecheck`, `fetch-routes`.

- [ ] **Step 1: Создать `package.json`**

```json
{
  "name": "audiogid-demo",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "fetch-routes": "node scripts/fetch-routes.mjs"
  }
}
```

- [ ] **Step 2: Установить зависимости**

```powershell
npm install react@^18.3.1 react-dom@^18.3.1 leaflet@^1.9.4
npm install -D vite@^5.4.0 @vitejs/plugin-react@^4.3.0 typescript@^5.5.0 vitest@^2.1.0 @types/react@^18.3.0 @types/react-dom@^18.3.0 @types/leaflet@^1.9.0 @types/node@^20.0.0
```

Expected: `added N packages`, без ошибок.

- [ ] **Step 3: Создать `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client", "node"]
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 4: Создать `vite.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 5: Создать `index.html`, `.gitignore`, временный `src/main.tsx`**

`index.html`:

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Аудиогид — демо</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`.gitignore`:

```
node_modules
dist
```

`src/main.tsx` (временный, заменяется в Task 11):

```tsx
import { createRoot } from 'react-dom/client';

createRoot(document.getElementById('root')!).render(<h1>Аудиогид</h1>);
```

- [ ] **Step 6: Написать падающий тест `src/engine/format.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { fmtClock, fmtDuration } from './format';

describe('fmtDuration', () => {
  it('formats minutes and hours in Russian', () => {
    expect(fmtDuration(0)).toBe('0 мин');
    expect(fmtDuration(45)).toBe('45 мин');
    expect(fmtDuration(60)).toBe('1 ч');
    expect(fmtDuration(100)).toBe('1 ч 40 мин');
    expect(fmtDuration(125.4)).toBe('2 ч 5 мин');
  });

  it('never shows negative durations', () => {
    expect(fmtDuration(-5)).toBe('0 мин');
  });
});

describe('fmtClock', () => {
  it('formats minutes since midnight as HH:MM', () => {
    expect(fmtClock(690)).toBe('11:30');
    expect(fmtClock(750.9)).toBe('12:30');
  });

  it('wraps past midnight', () => {
    expect(fmtClock(1445)).toBe('00:05');
  });
});
```

- [ ] **Step 7: Запустить тест, убедиться, что он падает**

Run: `npx vitest run src/engine/format.test.ts`
Expected: FAIL — `Failed to resolve import "./format"`.

- [ ] **Step 8: Реализовать `src/engine/format.ts`**

```ts
export function fmtDuration(min: number): string {
  const total = Math.max(0, Math.round(min));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} мин`;
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}

export function fmtClock(min: number): string {
  const day = 24 * 60;
  const m = ((Math.floor(min) % day) + day) % day;
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}
```

- [ ] **Step 9: Проверить тесты, типы и сборку**

Run: `npm test` → Expected: PASS (4 tests).
Run: `npm run build` → Expected: `✓ built in …`, без ошибок TypeScript.

- [ ] **Step 10: Commit**

```powershell
git add package.json package-lock.json tsconfig.json vite.config.ts index.html .gitignore src/main.tsx src/engine/format.ts src/engine/format.test.ts
git commit -m "chore: scaffold Vite + React + TS project with time formatting" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Геометрия

**Files:**
- Create: `src/data/types.ts` (только `LatLng` и `RouteId`; остальное — в Task 4)
- Create: `src/engine/geo.ts`
- Test: `src/engine/geo.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - `type LatLng = [number, number]` (lat, lng), `type RouteId = 'main' | 'detour'` в `src/data/types.ts`
  - `haversineKm(a: LatLng, b: LatLng): number`
  - `interface Polyline { points: LatLng[]; cum: number[]; totalKm: number }`
  - `makePolyline(points: LatLng[]): Polyline`
  - `pointAt(line: Polyline, km: number): LatLng` — с ограничением по краям
  - `projectKm(line: Polyline, p: LatLng): { km: number; offKm: number }` — километр ближайшей точки ломаной и расстояние до неё

- [ ] **Step 1: Создать `src/data/types.ts`**

```ts
export type LatLng = [number, number];
export type RouteId = 'main' | 'detour';
```

- [ ] **Step 2: Написать падающий тест `src/engine/geo.test.ts`**

```ts
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
    const [lat, lng] = pointAt(line, DEG_KM * 1.5);
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
```

- [ ] **Step 3: Запустить тест, убедиться, что он падает**

Run: `npx vitest run src/engine/geo.test.ts`
Expected: FAIL — `Failed to resolve import "./geo"`.

- [ ] **Step 4: Реализовать `src/engine/geo.ts`**

```ts
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
```

- [ ] **Step 5: Запустить тесты**

Run: `npx vitest run src/engine/geo.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: Commit**

```powershell
git add src/data/types.ts src/engine/geo.ts src/engine/geo.test.ts
git commit -m "feat(engine): polyline geometry helpers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Геометрия реальных дорог из OSRM

**Files:**
- Create: `scripts/fetch-routes.mjs`
- Create (генерируется): `src/data/routes.json`
- Test: `src/data/routes.test.ts`

**Interfaces:**
- Consumes: `haversineKm`, `makePolyline`, `pointAt`, `projectKm` из Task 2.
- Produces: `src/data/routes.json` вида `{ "branchKm": number, "main": [lat, lng][], "detour": [lat, lng][] }`. Основной ≈ 168 км (Новомосковск → Тульский кремль → Калуга), объезд ≈ 199 км (… → Тульский кремль → Алексин → Калуга), `branchKm` ≈ 59,7.

- [ ] **Step 1: Написать падающий тест `src/data/routes.test.ts`**

```ts
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
```

- [ ] **Step 2: Запустить тест, убедиться, что он падает**

Run: `npx vitest run src/data/routes.test.ts`
Expected: FAIL — `Failed to resolve import "./routes.json"`.

- [ ] **Step 3: Создать `scripts/fetch-routes.mjs`**

```js
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
```

- [ ] **Step 4: Запустить скрипт**

Run: `npm run fetch-routes`
Expected: `main 167.7 km, detour 199.0 km, branch at 59.7 km` (±0,5 км), появился `src/data/routes.json` (~90 КБ).

Если `fetch` падает с ошибкой TLS/сети: открыть во встроенном браузере `https://router.project-osrm.org/`, через `javascript_tool` выполнить те же два запроса (`fetch(url).then(r => r.json())`) и функцию `branchKm`, вернуть `JSON.stringify({ branchKm, main, detour })` и записать результат в `src/data/routes.json` инструментом Write.

- [ ] **Step 5: Запустить тесты**

Run: `npx vitest run src/data/routes.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```powershell
git add scripts/fetch-routes.mjs src/data/routes.json src/data/routes.test.ts
git commit -m "feat(data): real road geometry Novomoskovsk - Kaluga and detour via Aleksin" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Контент — объекты гида, сервисы, инцидент

**Files:**
- Modify: `src/data/types.ts` (дописать типы)
- Create: `src/data/pois.ts`, `src/data/services.ts`, `src/data/incidents.ts`, `src/data/index.ts`
- Test: `src/data/data.test.ts`

**Interfaces:**
- Consumes: `LatLng`, `RouteId` (Task 2), `routes.json` (Task 3), `makePolyline`, `projectKm` (Task 2).
- Produces:
  - типы `Poi`, `ServiceKind`, `Service`, `Incident`, `TripData` (поля — ниже, в Step 1);
  - `POIS: Poi[]` с id `novomoskovsk`, `tula`, `kaluga-land`, `aleksin`, `oka`, `kaluga`, `tolmachev`; `GREETING: string`;
  - `SERVICES: Service[]`; `INCIDENT: Incident` (id `p132-accident`);
  - `TRIP_DATA: TripData` из `src/data/index.ts`.

- [ ] **Step 1: Дописать `src/data/types.ts`**

```ts
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
```

- [ ] **Step 2: Написать падающий тест `src/data/data.test.ts`**

```ts
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
```

- [ ] **Step 3: Запустить тест, убедиться, что он падает**

Run: `npx vitest run src/data/data.test.ts`
Expected: FAIL — `Failed to resolve import "./index"`.

- [ ] **Step 4: Создать `src/data/pois.ts`**

```ts
import type { Poi } from './types';

export const GREETING =
  'Добрый день! Я ваш аудиогид. Сегодня едем из Новомосковска в Калугу через Тулу — около 170 километров. ' +
  'Я расскажу об интересных местах в нужный момент, подскажу, где поесть и отдохнуть, и предупрежу о ситуации на дороге.';

const KALUGA_CENTER: [number, number] = [54.5138, 36.2612];

// Тексты написаны по общеизвестным фактам и требуют проверки (needsFactCheck).
export const POIS: Poi[] = [
  {
    id: 'novomoskovsk',
    name: 'Новомосковск',
    aliases: ['новомосковск', 'бобрик', 'сталиногорск', 'исток дона'],
    position: [54.0105, 38.2963],
    routes: ['main', 'detour'],
    short:
      'Мы стартуем в Новомосковске. Город вырос в 1930-х годах вокруг строительства крупного химического комбината, ' +
      'а с 1934 по 1961 год назывался Сталиногорском. По традиции именно здесь, в городском парке, берёт начало Дон.',
    detailed:
      'Новомосковск — один из крупнейших городов Тульской области. До революции здесь было село Бобрики — имение графов Бобринских. ' +
      'Основатель рода, Алексей Бобринский, был сыном Екатерины Второй и Григория Орлова. ' +
      'В 1930-е годы здесь развернулась большая стройка химического комбината, и посёлок быстро превратился в город. ' +
      'С 1934 по 1961 год он носил имя Сталиногорск, а затем получил нынешнее название. ' +
      'В городском парке стоит памятный знак «Исток Дона»: по традиции отсюда начинается одна из главных рек юга России.',
    needsFactCheck: true,
  },
  {
    id: 'tula',
    name: 'Тульский кремль',
    aliases: ['тул', 'кремл', 'пряник', 'самовар', 'левш'],
    position: [54.1961, 37.6182],
    routes: ['main', 'detour'],
    short:
      'Подъезжаем к Туле. В центре города стоит Тульский кремль, построенный в 1514–1520 годах. ' +
      'Тула знаменита оружейниками, самоварами и пряниками.',
    detailed:
      'Тульский кремль строили в 1514–1520 годах по указу великого князя Василия Третьего: город защищал южные рубежи Московского государства от набегов. ' +
      'Кремлёвские стены с девятью башнями сохранились до наших дней. ' +
      'В 1712 году Пётр Первый основал здесь оружейный завод, и Тула на века стала столицей русских оружейников. ' +
      'Отсюда же родом Левша, подковавший блоху, — герой повести Николая Лескова. ' +
      'А ещё Тула — это самовары и печатный пряник: попробуйте его, если остановитесь в центре.',
    needsFactCheck: true,
  },
  {
    id: 'kaluga-land',
    name: 'Калужская земля',
    aliases: ['калужск', 'угре', 'угра', 'угру', 'стояни'],
    position: [54.3509, 36.8213],
    routes: ['main'],
    short:
      'Мы въехали в Калужскую область. Эта земля знаменита Стоянием на Угре 1480 года — событием, ' +
      'которое принято считать концом ордынского ига.',
    detailed:
      'Калужская земля — старый пограничный край Московской Руси. ' +
      'Осенью 1480 года на реке Угре, недалеко от Калуги, войска Ивана Третьего несколько недель стояли напротив армии хана Ахмата. ' +
      'Хан так и не решился на переправу и увёл войско — это событие вошло в историю как Стояние на Угре и конец ордынского ига. ' +
      'Сегодня на месте событий создан мемориал, а Угру по традиции называют «поясом Богородицы».',
    needsFactCheck: true,
  },
  {
    id: 'aleksin',
    name: 'Алексин',
    aliases: ['алексин'],
    position: [54.508, 37.0665],
    routes: ['detour'],
    short:
      'Мы в Алексине — старинном городе на высоком берегу Оки. ' +
      'Впервые он упоминается в четырнадцатом веке и долго был пограничной крепостью Московского княжества.',
    detailed:
      'Алексин известен с четырнадцатого века. Город стоял на Оке — главном оборонительном рубеже Москвы на юге — и не раз принимал на себя удары степных войск. ' +
      'Самая известная страница — 1472 год: небольшой гарнизон и жители держали оборону против огромного войска хана Ахмата. ' +
      'Город был сожжён, но задержал врага до подхода московских полков. ' +
      'В двадцатом веке Алексин стал известен как курорт: сосновые леса и живописные берега Оки привлекали сюда отдыхающих.',
    needsFactCheck: true,
  },
  {
    id: 'oka',
    name: 'Ока',
    aliases: ['ока', 'оку', 'оке', 'оки'],
    position: [54.5194, 37.0518],
    routes: ['detour'],
    short: 'Под нами Ока — один из крупнейших притоков Волги. Веками её берега были южной границей Московской Руси.',
    detailed:
      'Ока течёт почти полторы тысячи километров и впадает в Волгу у Нижнего Новгорода. ' +
      'В четырнадцатом–шестнадцатом веках её называли просто «Берег»: каждое лето сюда выходили полки, чтобы встретить набеги из степи. ' +
      'Вдоль реки стояли города-крепости — Калуга, Алексин, Серпухов, Коломна. ' +
      'Сегодня Ока — одна из самых живописных рек средней полосы: высокие берега, сосновые боры и старинные усадьбы на холмах.',
    needsFactCheck: true,
  },
  {
    id: 'kaluga',
    name: 'Калуга',
    aliases: ['калуг', 'циолковск', 'космонавтик', 'каменный мост'],
    position: KALUGA_CENTER,
    routes: ['main', 'detour'],
    leadKm: 8,
    short:
      'Въезжаем в Калугу — один из старейших городов центральной России, впервые упомянутый в 1371 году. ' +
      'Здесь больше сорока лет жил и работал Константин Циолковский.',
    detailed:
      'Калуга впервые упоминается в 1371 году. Город стоит на высоком берегу Оки и долго был пограничной крепостью. ' +
      'Мировую славу ему принёс учитель физики Константин Циолковский: здесь он прожил больше сорока лет и написал труды, которые легли в основу космонавтики. ' +
      'В 1967 году в Калуге открылся Государственный музей истории космонавтики. ' +
      'Обязательно посмотрите Каменный мост через Березуйский овраг — один из старейших каменных виадуков России, построенный в конце восемнадцатого века.',
    needsFactCheck: true,
  },
  {
    id: 'tolmachev',
    name: 'Усадьба Толмачёвых',
    aliases: ['толмачев', 'усадьб'],
    // Координаты — центр Калуги до уточнения заказчиком.
    position: KALUGA_CENTER,
    routes: ['main', 'detour'],
    leadKm: 2,
    isDestination: true,
    placeholder: true,
    short:
      'Мы подъезжаем к усадьбе Толмачёвых — финальной точке маршрута. ' +
      'Подробный рассказ об истории усадьбы и её владельцев прозвучит по прибытии.',
    detailed:
      'Добро пожаловать в усадьбу Толмачёвых! Здесь будет подробный рассказ об истории усадьбы, её владельцах и архитектуре — текст готовит команда проекта. ' +
      'Спасибо, что путешествовали с аудиогидом!',
  },
];
```

- [ ] **Step 5: Создать `src/data/services.ts`**

```ts
import type { Service } from './types';

// Все сервисы вымышленные (демо). Координаты — точки самих маршрутов.
export const SERVICES: Service[] = [
  {
    id: 's-cafe-don', kind: 'cafe', name: 'Кафе «Донской исток»', position: [54.0506, 38.1922], routes: ['main', 'detour'], rating: 4.4,
    details: { hours: '08:00–22:00', menu: [{ name: 'Солянка', price: 290 }, { name: 'Пельмени домашние', price: 350 }, { name: 'Морс', price: 90 }] },
  },
  {
    id: 's-cafe-samovar', kind: 'cafe', name: 'Чайная «Самовар и пряник»', position: [54.1289, 37.6812], routes: ['main', 'detour'], rating: 4.8,
    details: { hours: '09:00–21:00', menu: [{ name: 'Тульский пряник', price: 150 }, { name: 'Чай из самовара', price: 120 }, { name: 'Блины с творогом', price: 260 }] },
  },
  {
    id: 's-cafe-zaseka', kind: 'cafe', name: 'Придорожное кафе «Засека»', position: [54.273, 37.2585], routes: ['main'], rating: 4.2,
    details: { hours: 'круглосуточно', menu: [{ name: 'Борщ', price: 280 }, { name: 'Котлета с пюре', price: 340 }, { name: 'Компот', price: 80 }] },
  },
  {
    id: 's-cafe-zastava', kind: 'cafe', name: 'Трактир «Калужская застава»', position: [54.3722, 36.6715], routes: ['main'], rating: 4.6,
    details: { hours: '10:00–23:00', menu: [{ name: 'Щи суточные', price: 300 }, { name: 'Жаркое в горшочке', price: 450 }, { name: 'Квас', price: 100 }] },
  },
  {
    id: 's-cafe-zaokskaya', kind: 'cafe', name: 'Блинная «Заокская»', position: [54.4748, 37.4725], routes: ['detour'], rating: 4.5,
    details: { hours: '08:00–20:00', menu: [{ name: 'Блины с мясом', price: 280 }, { name: 'Блины со сметаной', price: 180 }, { name: 'Чай', price: 70 }] },
  },
  {
    id: 's-cafe-oka', kind: 'cafe', name: 'Кафе «Окский берег»', position: [54.508, 37.0665], routes: ['detour'], rating: 4.7,
    details: { hours: '11:00–23:00', menu: [{ name: 'Уха', price: 380 }, { name: 'Судак на гриле', price: 520 }, { name: 'Лимонад', price: 150 }] },
  },
  {
    id: 's-hotel-tula', kind: 'hotel', name: 'Гостиница «Оружейная слобода»', position: [54.1953, 37.6162], routes: ['main', 'detour'], rating: 4.5,
    details: { freeRooms: 3, pricePerNight: 4200 },
  },
  {
    id: 's-hotel-zvezdny', kind: 'hotel', name: 'Отель «Звёздный путь»', position: [54.4666, 36.2485], routes: ['main'], rating: 4.7,
    details: { freeRooms: 5, pricePerNight: 5100 },
  },
  {
    id: 's-hotel-most', kind: 'hotel', name: 'Гостиница «Каменный мост»', position: [54.5138, 36.2612], routes: ['main', 'detour'], rating: 4.9,
    details: { freeRooms: 0, pricePerNight: 6300 },
  },
  {
    id: 's-hotel-okacity', kind: 'hotel', name: 'Апарт-отель «Ока-Сити»', position: [54.515, 36.3383], routes: ['detour'], rating: 4.4,
    details: { freeRooms: 2, pricePerNight: 4600 },
  },
  {
    id: 's-auto-levsha', kind: 'autoservice', name: 'Автосервис «Левша»', position: [54.1709, 37.4865], routes: ['main'], rating: 4.3,
    details: { hours: '09:00–21:00' },
  },
  {
    id: 's-auto-zarechye', kind: 'autoservice', name: 'Шиномонтаж «Заречье 24/7»', position: [54.3961, 37.5055], routes: ['detour'], rating: 4.1,
    details: { hours: 'круглосуточно' },
  },
  {
    id: 's-pharm-road', kind: 'pharmacy', name: 'Аптека «Здоровье в пути»', position: [54.0789, 38.0507], routes: ['main', 'detour'], rating: 4.6,
    details: { hours: '08:00–23:00' },
  },
  {
    id: 's-pharm-okskaya', kind: 'pharmacy', name: 'Аптека «Окская»', position: [54.524, 37.1897], routes: ['detour'], rating: 4.5,
    details: { hours: '09:00–21:00' },
  },
];
```

- [ ] **Step 6: Создать `src/data/incidents.ts` и `src/data/index.ts`**

`src/data/incidents.ts`:

```ts
import type { Incident } from './types';

export const INCIDENT: Incident = {
  id: 'p132-accident',
  kind: 'accident',
  title: 'ДТП на Р-132 у Алешни, затор 4 км',
  source: 'ГИБДД · данные водителей · соцсети — проверено ИИ-фильтром',
  positionKm: 92,
  warnAtKm: 45,
  delayMin: 35,
  detourPoiIds: ['aleksin', 'oka'],
};
```

`src/data/index.ts`:

```ts
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
```

- [ ] **Step 7: Запустить тесты**

Run: `npx vitest run src/data`
Expected: PASS (все тесты `routes.test.ts` и `data.test.ts`). Если какая-то точка дальше 3 км от маршрута — заменить её координаты на ближайшую точку `routes.json` (через `projectKm` + `pointAt`), а не ослаблять тест.

- [ ] **Step 8: Commit**

```powershell
git add src/data
git commit -m "feat(data): guide objects, fictional services and the P-132 incident" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Очередь рассказов гида

**Files:**
- Create: `src/engine/guide.ts`
- Test: `src/engine/guide.test.ts`

**Interfaces:**
- Consumes: `Poi` (Task 4).
- Produces:
  - `type GuideMode = 'greeting' | 'short' | 'detailed' | 'answer' | 'notice'`
  - `interface GuideItem { key: string; poiId: string | null; title: string; mode: GuideMode; text: string }`
  - `interface GuideState { current: GuideItem | null; queue: GuideItem[]; seen: string[] }`
  - `interface PoiOnRoute { poi: Poi; km: number }`
  - `DETAILED_RADIUS_KM = 3`
  - `initialGuide(): GuideState`
  - `itemFor(poi: Poi, mode: 'short' | 'detailed'): GuideItem` — key `${poi.id}:${mode}`
  - `enqueue(g: GuideState, item: GuideItem): GuideState`
  - `finishCurrent(g: GuideState): GuideState`
  - `shortDue(pois: PoiOnRoute[], km: number, speedKmh: number, seen: string[]): PoiOnRoute[]`
  - `detailedDue(pois: PoiOnRoute[], km: number, seen: string[]): PoiOnRoute | null`

Правила `enqueue`: ключ из `seen` больше никогда не ставится; `detailed` заменяет играющий `short` того же объекта и убирает его `short` из очереди; `answer`/`notice` прерывают играющий `greeting`/`short`/`notice`, иначе встают в начало очереди; остальное — в конец.

- [ ] **Step 1: Написать падающий тест `src/engine/guide.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { Poi } from '../data/types';
import { detailedDue, enqueue, finishCurrent, initialGuide, itemFor, shortDue, type GuideItem, type PoiOnRoute } from './guide';

const poi = (id: string, extra: Partial<Poi> = {}): Poi => ({
  id, name: id.toUpperCase(), aliases: [], position: [0, 0], routes: ['main'], short: `${id} short`, detailed: `${id} detailed`, ...extra,
});
const on = (id: string, km: number, extra: Partial<Poi> = {}): PoiOnRoute => ({ poi: poi(id, extra), km });
const item = (key: string, mode: GuideItem['mode']): GuideItem => ({ key, poiId: null, title: key, mode, text: key });
const ids = (list: PoiOnRoute[]) => list.map((p) => p.poi.id);

describe('enqueue', () => {
  it('plays the first item right away and queues the next', () => {
    let g = enqueue(initialGuide(), itemFor(poi('a'), 'short'));
    g = enqueue(g, itemFor(poi('b'), 'short'));
    expect(g.current?.key).toBe('a:short');
    expect(g.queue.map((q) => q.key)).toEqual(['b:short']);
  });

  it('never schedules the same key twice, even after it finished', () => {
    let g = enqueue(initialGuide(), itemFor(poi('a'), 'short'));
    g = finishCurrent(g);
    g = enqueue(g, itemFor(poi('a'), 'short'));
    expect(g.current).toBeNull();
    expect(g.seen).toEqual(['a:short']);
  });

  it('replaces a playing short story with the detailed one of the same object', () => {
    let g = enqueue(initialGuide(), itemFor(poi('a'), 'short'));
    g = enqueue(g, itemFor(poi('a'), 'detailed'));
    expect(g.current?.key).toBe('a:detailed');
    expect(g.queue).toEqual([]);
  });

  it('drops a queued short story when the detailed one of the same object arrives', () => {
    let g = enqueue(initialGuide(), itemFor(poi('b'), 'detailed'));
    g = enqueue(g, itemFor(poi('a'), 'short'));
    g = enqueue(g, itemFor(poi('a'), 'detailed'));
    expect(g.current?.key).toBe('b:detailed');
    expect(g.queue.map((q) => q.key)).toEqual(['a:detailed']);
  });

  it('lets an answer interrupt a short story', () => {
    let g = enqueue(initialGuide(), itemFor(poi('a'), 'short'));
    g = enqueue(g, item('answer:1', 'answer'));
    expect(g.current?.key).toBe('answer:1');
  });

  it('puts a notice first in line behind a detailed story', () => {
    let g = enqueue(initialGuide(), itemFor(poi('a'), 'detailed'));
    g = enqueue(g, itemFor(poi('c'), 'short'));
    g = enqueue(g, item('notice:1', 'notice'));
    expect(g.current?.key).toBe('a:detailed');
    expect(g.queue.map((q) => q.key)).toEqual(['notice:1', 'c:short']);
  });

  it('lets a notice interrupt the greeting', () => {
    let g = enqueue(initialGuide(), item('greeting', 'greeting'));
    g = enqueue(g, item('notice:1', 'notice'));
    expect(g.current?.key).toBe('notice:1');
  });
});

describe('finishCurrent', () => {
  it('moves to the next queued item', () => {
    let g = enqueue(initialGuide(), itemFor(poi('a'), 'short'));
    g = enqueue(g, itemFor(poi('b'), 'short'));
    g = finishCurrent(g);
    expect(g.current?.key).toBe('b:short');
    expect(g.queue).toEqual([]);
  });
});

describe('shortDue', () => {
  it('uses one minute of driving as the lead distance', () => {
    expect(ids(shortDue([on('a', 11.4), on('b', 11.6)], 10, 90, []))).toEqual(['a']);
  });

  it('uses at least 1 km of lead at low speed', () => {
    expect(ids(shortDue([on('a', 10.9)], 10, 30, []))).toEqual(['a']);
  });

  it('respects a custom leadKm', () => {
    expect(ids(shortDue([on('k', 17, { leadKm: 8 })], 10, 90, []))).toEqual(['k']);
  });

  it('skips objects already scheduled or left behind', () => {
    expect(ids(shortDue([on('a', 10.5), on('b', 9), on('c', 11)], 10, 90, ['a:short']))).toEqual(['c']);
  });

  it('orders due objects by distance', () => {
    expect(ids(shortDue([on('far', 11.4), on('near', 10.2)], 10, 90, []))).toEqual(['near', 'far']);
  });
});

describe('detailedDue', () => {
  it('picks the nearest object within 3 km', () => {
    expect(detailedDue([on('a', 7), on('b', 11), on('c', 20)], 10, [])?.poi.id).toBe('b');
  });

  it('skips objects already told in detail', () => {
    expect(detailedDue([on('a', 9)], 10, ['a:detailed'])).toBeNull();
  });

  it('returns null when nothing is close', () => {
    expect(detailedDue([on('a', 20)], 10, [])).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить тест, убедиться, что он падает**

Run: `npx vitest run src/engine/guide.test.ts`
Expected: FAIL — `Failed to resolve import "./guide"`.

- [ ] **Step 3: Реализовать `src/engine/guide.ts`**

```ts
import type { Poi } from '../data/types';

export type GuideMode = 'greeting' | 'short' | 'detailed' | 'answer' | 'notice';

export interface GuideItem {
  key: string;
  poiId: string | null;
  title: string;
  mode: GuideMode;
  text: string;
}

export interface GuideState {
  current: GuideItem | null;
  queue: GuideItem[];
  /** Ключи всего, что уже ставилось в очередь: повторно не звучит. */
  seen: string[];
}

export interface PoiOnRoute {
  poi: Poi;
  km: number;
}

export const DETAILED_RADIUS_KM = 3;
const BEHIND_TOLERANCE_KM = 0.5;
const MIN_LEAD_KM = 1;
const PRIORITY: GuideMode[] = ['answer', 'notice'];
const INTERRUPTIBLE: GuideMode[] = ['greeting', 'short', 'notice'];

export function initialGuide(): GuideState {
  return { current: null, queue: [], seen: [] };
}

export function itemFor(poi: Poi, mode: 'short' | 'detailed'): GuideItem {
  return { key: `${poi.id}:${mode}`, poiId: poi.id, title: poi.name, mode, text: mode === 'short' ? poi.short : poi.detailed };
}

export function enqueue(g: GuideState, item: GuideItem): GuideState {
  if (g.seen.includes(item.key)) return g;
  const seen = [...g.seen, item.key];
  const supersedes = (other: GuideItem | null) =>
    item.mode === 'detailed' && other?.mode === 'short' && other.poiId === item.poiId;
  const queue = g.queue.filter((q) => !supersedes(q));
  if (!g.current) return { current: item, queue, seen };
  const priority = PRIORITY.includes(item.mode);
  if (supersedes(g.current) || (priority && INTERRUPTIBLE.includes(g.current.mode))) {
    return { current: item, queue, seen };
  }
  return { current: g.current, queue: priority ? [item, ...queue] : [...queue, item], seen };
}

export function finishCurrent(g: GuideState): GuideState {
  const [next, ...rest] = g.queue;
  return { current: next ?? null, queue: rest, seen: g.seen };
}

export function shortDue(pois: PoiOnRoute[], km: number, speedKmh: number, seen: string[]): PoiOnRoute[] {
  const defaultLead = Math.max(MIN_LEAD_KM, speedKmh / 60);
  return pois
    .filter((p) => {
      const ahead = p.km - km;
      const lead = p.poi.leadKm ?? defaultLead;
      return ahead >= -BEHIND_TOLERANCE_KM && ahead <= lead && !seen.includes(`${p.poi.id}:short`);
    })
    .sort((a, b) => a.km - b.km);
}

export function detailedDue(pois: PoiOnRoute[], km: number, seen: string[]): PoiOnRoute | null {
  const near = pois
    .filter((p) => Math.abs(p.km - km) <= DETAILED_RADIUS_KM && !seen.includes(`${p.poi.id}:detailed`))
    .sort((a, b) => Math.abs(a.km - km) - Math.abs(b.km - km));
  return near[0] ?? null;
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npx vitest run src/engine/guide.test.ts`
Expected: PASS (16 tests).

- [ ] **Step 5: Commit**

```powershell
git add src/engine/guide.ts src/engine/guide.test.ts
git commit -m "feat(engine): guide story queue and trigger rules" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Предиктивные сервисы

**Files:**
- Create: `src/engine/needs.ts`
- Test: `src/engine/needs.test.ts`

**Interfaces:**
- Consumes: `Service`, `ServiceKind` (Task 4), `fmtDuration` (Task 1).
- Produces:
  - `type OfferReason = 'hunger' | 'fatigue' | 'query'`
  - `interface ServiceOnRoute { service: Service; km: number }`
  - `interface OfferItem { service: Service; aheadKm: number }`
  - `interface Offer { reason: OfferReason; kind: ServiceKind; message: string; items: OfferItem[] }`
  - `interface OfferContext { tripMin: number; drivingSinceStopMin: number; kind?: ServiceKind }`
  - константы `LUNCH_START_MIN`, `LUNCH_END_MIN`, `LUNCH_MEAL_GAP_MIN`, `MEAL_GAP_MIN`, `FATIGUE_MIN`, `AUTO_COOLDOWN_MIN`, `CAFE_RADIUS_KM`, `KIND_LABEL`
  - `hungerDue(clockMin: number, sinceMealMin: number): boolean`
  - `fatigueDue(drivingSinceStopMin: number): boolean`
  - `servicesAhead(list: ServiceOnRoute[], kind: ServiceKind, km: number, opts?: { maxAheadKm?: number; limit?: number; accept?: (s: Service) => boolean }): OfferItem[]`
  - `buildOffer(reason: OfferReason, list: ServiceOnRoute[], km: number, ctx: OfferContext): Offer`

- [ ] **Step 1: Написать падающий тест `src/engine/needs.test.ts`**

```ts
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
  at(svc('h1', 'hotel'), 30),
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

  it('finds the requested kind on a query', () => {
    const o = buildOffer('query', LIST, 10, { tripMin: 0, drivingSinceStopMin: 0, kind: 'hotel' });
    expect(o.kind).toBe('hotel');
    expect(o.message).toBe('Отели впереди по маршруту: 1. Ближайшее — через 20 км.');
  });
});
```

- [ ] **Step 2: Запустить тест, убедиться, что он падает**

Run: `npx vitest run src/engine/needs.test.ts`
Expected: FAIL — `Failed to resolve import "./needs"`.

- [ ] **Step 3: Реализовать `src/engine/needs.ts`**

```ts
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
    const items = servicesAhead(list, 'hotel', km, { accept: (s) => (s.details.freeRooms ?? 0) > 0 });
    const message = items.length
      ? `Вы за рулём ${fmtDuration(ctx.drivingSinceStopMin)} без остановки — пора отдохнуть. Отели со свободными номерами впереди: ${items.length}.`
      : 'Впереди нет отелей со свободными номерами.';
    return { reason, kind: 'hotel', message, items };
  }
  const kind = ctx.kind ?? 'cafe';
  const items = servicesAhead(list, kind, km);
  const message = items.length
    ? `${KIND_LABEL[kind]} впереди по маршруту: ${items.length}. Ближайшее — через ${Math.round(items[0].aheadKm)} км.`
    : `${KIND_LABEL[kind]} впереди по маршруту не найдены.`;
  return { reason, kind, message, items };
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npx vitest run src/engine/needs.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```powershell
git add src/engine/needs.ts src/engine/needs.test.ts
git commit -m "feat(engine): predictive service offers for hunger, fatigue and queries" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Правила инцидента и объезда

**Files:**
- Create: `src/engine/incidents.ts`
- Test: `src/engine/incidents.test.ts`

**Interfaces:**
- Consumes: `Incident`, `RouteId` (Task 4).
- Produces:
  - `type IncidentStatus = 'none' | 'warning' | 'straight' | 'detour' | 'cleared'`
  - `shouldWarn(status: IncidentStatus, routeId: RouteId, km: number, inc: Incident): boolean`
  - `canTriggerManually(status: IncidentStatus, routeId: RouteId, km: number, inc: Incident): boolean`
  - `detourCost(mainKm: number, detourKm: number, speedKmh: number): { extraKm: number; extraMin: number }`
  - `passedIncident(prevKm: number, km: number, inc: Incident): boolean`

- [ ] **Step 1: Написать падающий тест `src/engine/incidents.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { Incident } from '../data/types';
import { canTriggerManually, detourCost, passedIncident, shouldWarn } from './incidents';

const INC: Incident = {
  id: 'i', kind: 'accident', title: 'ДТП', source: 'ГИБДД', positionKm: 92, warnAtKm: 45, delayMin: 35, detourPoiIds: [],
};

describe('shouldWarn', () => {
  it('warns once the car reaches warnAtKm on the main road', () => {
    expect(shouldWarn('none', 'main', 44.9, INC)).toBe(false);
    expect(shouldWarn('none', 'main', 45, INC)).toBe(true);
  });

  it('does not warn on the detour, twice, or after the jam', () => {
    expect(shouldWarn('none', 'detour', 50, INC)).toBe(false);
    expect(shouldWarn('straight', 'main', 50, INC)).toBe(false);
    expect(shouldWarn('none', 'main', 92, INC)).toBe(false);
  });
});

describe('canTriggerManually', () => {
  it('allows the button while the jam is still ahead on the main road', () => {
    expect(canTriggerManually('none', 'main', 80, INC)).toBe(true);
  });

  it('refuses after the jam, on the detour, or when already handled', () => {
    expect(canTriggerManually('none', 'main', 95, INC)).toBe(false);
    expect(canTriggerManually('none', 'detour', 30, INC)).toBe(false);
    expect(canTriggerManually('warning', 'main', 30, INC)).toBe(false);
  });
});

describe('detourCost', () => {
  it('counts extra kilometres and minutes at constant speed', () => {
    const c = detourCost(167.7, 199, 90);
    expect(c.extraKm).toBeCloseTo(31.3, 1);
    expect(c.extraMin).toBe(21);
  });
});

describe('passedIncident', () => {
  it('is true only on the tick that crosses the jam', () => {
    expect(passedIncident(91.9, 92.1, INC)).toBe(true);
    expect(passedIncident(92.1, 93, INC)).toBe(false);
    expect(passedIncident(90, 91, INC)).toBe(false);
  });
});
```

- [ ] **Step 2: Запустить тест, убедиться, что он падает**

Run: `npx vitest run src/engine/incidents.test.ts`
Expected: FAIL — `Failed to resolve import "./incidents"`.

- [ ] **Step 3: Реализовать `src/engine/incidents.ts`**

```ts
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
```

- [ ] **Step 4: Запустить тесты**

Run: `npx vitest run src/engine/incidents.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```powershell
git add src/engine/incidents.ts src/engine/incidents.test.ts
git commit -m "feat(engine): incident warning and detour rules" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Разбор голосовых и текстовых команд

**Files:**
- Create: `src/engine/intents.ts`
- Test: `src/engine/intents.test.ts`

**Interfaces:**
- Consumes: `Poi`, `ServiceKind` (Task 4); в тесте — `POIS` (Task 4).
- Produces:
  - `type Intent = { type: 'tell'; poiId: string | null } | { type: 'find'; kind: ServiceKind } | { type: 'ahead' } | { type: 'pause' } | { type: 'resume' } | { type: 'unknown' }`
  - `normalize(text: string): string` — нижний регистр, «ё»→«е», без пунктуации (дефис остаётся), одиночные пробелы
  - `levenshtein(a: string, b: string): number`
  - `parseIntent(text: string, pois: Pick<Poi, 'id' | 'name' | 'aliases'>[]): Intent`

Порядок проверки: `ahead` → `pause` → `resume` → `find` → объект по началу слова (побеждает самый длинный алиас) → объект с опечаткой (≤ 1 правка в начале слова, алиасы от 5 букв) → «расскажи / что это / что за / где мы» без объекта → `unknown`.

- [ ] **Step 1: Написать падающий тест `src/engine/intents.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { POIS } from '../data/pois';
import { levenshtein, normalize, parseIntent } from './intents';

const p = (text: string) => parseIntent(text, POIS);

describe('normalize', () => {
  it('lowercases, replaces ё and strips punctuation', () => {
    expect(normalize('  Расскажи про Толмачёвых!  ')).toBe('расскажи про толмачевых');
  });
});

describe('levenshtein', () => {
  it('counts single-character edits', () => {
    expect(levenshtein('abc', 'abc')).toBe(0);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('толмачев', 'толмачов')).toBe(1);
  });
});

describe('parseIntent — objects', () => {
  it('finds objects despite case, ё, punctuation and word endings', () => {
    expect(p('Расскажи про усадьбу Толмачёвых!')).toEqual({ type: 'tell', poiId: 'tolmachev' });
    expect(p('расскажи про тульский кремль')).toEqual({ type: 'tell', poiId: 'tula' });
    expect(p('Что за город Алексин?')).toEqual({ type: 'tell', poiId: 'aleksin' });
    expect(p('расскажи про Калужскую землю')).toEqual({ type: 'tell', poiId: 'kaluga-land' });
    expect(p('а что с Калугой')).toEqual({ type: 'tell', poiId: 'kaluga' });
  });

  it('tolerates a typo', () => {
    expect(p('расскажи про Толмачовых')).toEqual({ type: 'tell', poiId: 'tolmachev' });
  });

  it('asks for the nearest object when none is named', () => {
    expect(p('Расскажи, что это')).toEqual({ type: 'tell', poiId: null });
  });

  it('does not mistake common words for objects', () => {
    expect(p('пока')).toEqual({ type: 'unknown' });
    expect(p('около дороги')).toEqual({ type: 'unknown' });
  });
});

describe('parseIntent — services and control', () => {
  it('finds services', () => {
    expect(p('Найди кафе')).toEqual({ type: 'find', kind: 'cafe' });
    expect(p('хочу поесть')).toEqual({ type: 'find', kind: 'cafe' });
    expect(p('где переночевать')).toEqual({ type: 'find', kind: 'hotel' });
    expect(p('нужен шиномонтаж')).toEqual({ type: 'find', kind: 'autoservice' });
    expect(p('Аптека рядом?')).toEqual({ type: 'find', kind: 'pharmacy' });
  });

  it('understands trip control', () => {
    expect(p('что впереди')).toEqual({ type: 'ahead' });
    expect(p('что дальше')).toEqual({ type: 'ahead' });
    expect(p('пауза')).toEqual({ type: 'pause' });
    expect(p('стоп')).toEqual({ type: 'pause' });
    expect(p('поехали дальше')).toEqual({ type: 'resume' });
    expect(p('продолжай')).toEqual({ type: 'resume' });
  });

  it('returns unknown for empty or unrelated text', () => {
    expect(p('')).toEqual({ type: 'unknown' });
    expect(p('   ')).toEqual({ type: 'unknown' });
    expect(p('как погода')).toEqual({ type: 'unknown' });
  });
});
```

- [ ] **Step 2: Запустить тест, убедиться, что он падает**

Run: `npx vitest run src/engine/intents.test.ts`
Expected: FAIL — `Failed to resolve import "./intents"`.

- [ ] **Step 3: Реализовать `src/engine/intents.ts`**

```ts
import type { Poi, ServiceKind } from '../data/types';

export type Intent =
  | { type: 'tell'; poiId: string | null }
  | { type: 'find'; kind: ServiceKind }
  | { type: 'ahead' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'unknown' };

type PoiTerms = Pick<Poi, 'id' | 'name' | 'aliases'>;

const KIND_STEMS: [ServiceKind, string[]][] = [
  ['cafe', ['кафе', 'поес', 'еда', 'еды', 'перекус', 'ресторан', 'обед', 'столов']],
  ['hotel', ['отел', 'гостиниц', 'ночлег', 'переноч', 'поспат']],
  ['autoservice', ['автосервис', 'сервис', 'шиномонтаж', 'ремонт', 'запчаст']],
  ['pharmacy', ['аптек', 'лекарств']],
];
const FUZZY_MIN_STEM = 5;
const FUZZY_MIN_WORD = 4;

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return row[b.length];
}

/** Стем из нескольких слов совпадает, если подряд идущие слова начинаются с его частей. */
function startsWords(words: string[], stem: string): boolean {
  const parts = stem.split(' ');
  for (let i = 0; i + parts.length <= words.length; i++) {
    if (parts.every((part, j) => words[i + j].startsWith(part))) return true;
  }
  return false;
}

function nearlyStartsWord(words: string[], stem: string): boolean {
  if (stem.length < FUZZY_MIN_STEM || stem.includes(' ')) return false;
  return words.some((w) => w.length >= FUZZY_MIN_WORD && levenshtein(w.slice(0, stem.length), stem) <= 1);
}

const stemsOf = (poi: PoiTerms) => [normalize(poi.name), ...poi.aliases.map(normalize)];

function findPoi(words: string[], pois: PoiTerms[]): string | null {
  let best: { id: string; length: number } | null = null;
  for (const poi of pois) {
    for (const stem of stemsOf(poi)) {
      if (startsWords(words, stem) && (!best || stem.length > best.length)) best = { id: poi.id, length: stem.length };
    }
  }
  if (best) return best.id;
  for (const poi of pois) {
    if (stemsOf(poi).some((stem) => nearlyStartsWord(words, stem))) return poi.id;
  }
  return null;
}

export function parseIntent(text: string, pois: PoiTerms[]): Intent {
  const norm = normalize(text);
  const words = norm.split(' ').filter(Boolean);
  if (words.length === 0) return { type: 'unknown' };
  const has = (stems: string[]) => stems.some((s) => startsWords(words, s));

  if (has(['впереди', 'что дальше'])) return { type: 'ahead' };
  if (has(['пауз', 'стоп'])) return { type: 'pause' };
  if (has(['продолж', 'поехал'])) return { type: 'resume' };
  for (const [kind, stems] of KIND_STEMS) if (has(stems)) return { type: 'find', kind };
  const poiId = findPoi(words, pois);
  if (poiId) return { type: 'tell', poiId };
  if (has(['расскаж', 'что это', 'что за', 'где мы'])) return { type: 'tell', poiId: null };
  return { type: 'unknown' };
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npx vitest run src/engine/intents.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```powershell
git add src/engine/intents.ts src/engine/intents.test.ts
git commit -m "feat(engine): voice/text command parsing with fuzzy object search" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Движок поездки

**Files:**
- Create: `src/engine/trip.ts`
- Test: `src/engine/trip.test.ts`

**Interfaces:**
- Consumes: всё из Tasks 1–8 (`TripData`, `makePolyline`, `pointAt`, `projectKm`, `enqueue`, `finishCurrent`, `initialGuide`, `itemFor`, `shortDue`, `detailedDue`, `buildOffer`, `hungerDue`, `fatigueDue`, `AUTO_COOLDOWN_MIN`, `shouldWarn`, `canTriggerManually`, `detourCost`, `passedIncident`, `parseIntent`).
- Produces (используется стором и UI):
  - константы `SPEED_KMH`, `START_CLOCK_MIN`, `START_SINCE_MEAL_MIN`, `DEFAULT_TIME_SCALE`, `MIN_TIME_SCALE`, `MAX_TIME_SCALE`, `DETAILED_AFTER_STOP_MS`, `MAX_TICK_MS`, `UNKNOWN_REPLY`
  - `type TripStatus = 'idle' | 'driving' | 'stopped' | 'paused' | 'arrived'`
  - `interface IncidentView { status: IncidentStatus; canDetour: boolean; title: string; source: string; delayMin: number; extraKm: number; extraMin: number; detourPoiNames: string[] }`
  - `interface TripState` — поля в Step 3
  - `class TripEngine` с методами: `getState()`, `start()`, `pause()`, `resume()`, `stop()`, `drive()`, `setTimeScale(n)`, `triggerHunger()`, `triggerFatigue()`, `triggerIncident()`, `chooseDetour()`, `chooseStraight()`, `tellAbout(poiId)`, `handleText(text): string`, `bookService(id)`, `dismissOffer()`, `guideFinished(key)`, `skipGuide()`, `reset()`, `tick(realDtMs)`

Каждая команда заменяет объект состояния целиком (новая ссылка), поэтому `getState()` безопасно отдавать в `useSyncExternalStore`.

- [ ] **Step 1: Написать падающий тест `src/engine/trip.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { Incident, LatLng, Poi, TripData } from '../data/types';
import { makePolyline, projectKm } from './geo';
import { TripEngine, UNKNOWN_REPLY } from './trip';

// Синтетические прямые маршруты по экватору: 0.1° ≈ 11.1 км.
const MAIN: LatLng[] = [[0, 0], [0, 1]];
const DETOUR: LatLng[] = [[0, 0], [0, 0.3], [0.2, 0.6], [0, 1]];

const poi = (id: string, name: string, aliases: string[], position: LatLng, routes: Poi['routes'], extra: Partial<Poi> = {}): Poi => ({
  id, name, aliases, position, routes, short: `${name}: коротко`, detailed: `${name}: подробно`, ...extra,
});

function makeData(incident: Partial<Incident> = {}): TripData {
  return {
    routes: { main: MAIN, detour: DETOUR },
    branchKm: 33,
    pois: [
      poi('a', 'Тула', ['тул'], [0, 0.05], ['main', 'detour']),
      poi('b', 'Калужская земля', ['калужск'], [0, 0.5], ['main']),
      poi('c', 'Алексин', ['алексин'], [0.2, 0.6], ['detour']),
      poi('dest', 'Усадьба', ['усадьб'], [0, 1], ['main', 'detour'], { isDestination: true }),
    ],
    services: [
      { id: 'cafe1', kind: 'cafe', name: 'Кафе 1', position: [0, 0.2], routes: ['main', 'detour'], rating: 4.5, details: {} },
      { id: 'hotel1', kind: 'hotel', name: 'Отель 1', position: [0, 0.9], routes: ['main'], rating: 4.6, details: { freeRooms: 2, pricePerNight: 4000 } },
      { id: 'hotel0', kind: 'hotel', name: 'Отель 0', position: [0, 0.95], routes: ['main'], rating: 4.9, details: { freeRooms: 0, pricePerNight: 6000 } },
    ],
    incident: { id: 'inc', kind: 'accident', title: 'ДТП', source: 'ГИБДД', positionKm: 60, warnAtKm: 20, delayMin: 35, detourPoiIds: ['c'], ...incident },
    greeting: 'Привет',
  };
}

/** Ведёт машину секундными кадрами до km, остановки или удержания на предупреждении. */
function driveTo(e: TripEngine, km: number) {
  for (let i = 0; i < 10000; i++) {
    const before = e.getState();
    if (before.distanceKm >= km || before.status !== 'driving') return;
    e.tick(1000);
    if (e.getState().distanceKm === before.distanceKm) return;
  }
}

const NO_INCIDENT = { warnAtKm: 200, positionKm: 300 };

describe('TripEngine — driving and the guide', () => {
  it('starts with a greeting and moves at 90 km/h times timeScale', () => {
    const e = new TripEngine(makeData());
    e.start();
    expect(e.getState().status).toBe('driving');
    expect(e.getState().guide.current?.key).toBe('greeting');
    for (let i = 0; i < 10; i++) e.tick(1000); // 10 с × 20 = 200 с симуляции ≈ 5 км
    expect(e.getState().distanceKm).toBeCloseTo(5, 1);
    expect(e.getState().simClockMin).toBeCloseTo(11 * 60 + 30 + 10 / 3, 1);
  });

  it('clamps a huge frame delta to one second', () => {
    const e = new TripEngine(makeData());
    e.start();
    e.tick(60_000);
    expect(e.getState().distanceKm).toBeCloseTo(0.5, 2);
  });

  it('queues the short story about 1.5 km before the object', () => {
    const e = new TripEngine(makeData());
    e.start();
    driveTo(e, 4.5);
    expect(e.getState().guide.queue.map((q) => q.key)).toContain('a:short');
  });

  it('turns the story detailed after standing 3 s near the object', () => {
    const e = new TripEngine(makeData());
    e.start();
    driveTo(e, 6);
    e.guideFinished('greeting');
    expect(e.getState().guide.current?.key).toBe('a:short');
    e.stop();
    e.tick(1000);
    e.tick(1000);
    expect(e.getState().guide.current?.key).toBe('a:short');
    e.tick(1000);
    expect(e.getState().guide.current?.key).toBe('a:detailed');
    expect(e.getState().stats.stories).toBe(2);
  });

  it('ignores a stale finish callback', () => {
    const e = new TripEngine(makeData());
    e.start();
    driveTo(e, 4.5);
    e.skipGuide();
    expect(e.getState().guide.current?.key).toBe('a:short');
    e.guideFinished('greeting');
    expect(e.getState().guide.current?.key).toBe('a:short');
  });

  it('arrives at the destination and plays its detailed story', () => {
    const e = new TripEngine(makeData(NO_INCIDENT));
    e.start();
    driveTo(e, 500);
    const s = e.getState();
    expect(s.status).toBe('arrived');
    expect(s.distanceKm).toBeCloseTo(s.totalKm, 5);
    expect([s.guide.current?.key, ...s.guide.queue.map((q) => q.key)]).toContain('dest:detailed');
  });
});

describe('TripEngine — incident and detour', () => {
  it('holds the car at the warning and switches to the detour', () => {
    const e = new TripEngine(makeData());
    e.start();
    driveTo(e, 25);
    const s = e.getState();
    expect(s.incident.status).toBe('warning');
    expect(s.incident.canDetour).toBe(true);
    expect(s.distanceKm).toBeGreaterThanOrEqual(20);
    expect(s.distanceKm).toBeLessThan(21);
    e.tick(1000);
    expect(e.getState().distanceKm).toBe(s.distanceKm);

    e.chooseDetour();
    const d = e.getState();
    expect(d.routeId).toBe('detour');
    expect(d.distanceKm).toBeCloseTo(s.distanceKm, 1);
    expect(d.totalKm).toBeGreaterThan(makePolyline(MAIN).totalKm);
    expect(d.stats.detours).toBe(1);
    expect(d.incident.status).toBe('detour');
    e.tick(1000);
    expect(e.getState().distanceKm).toBeGreaterThan(s.distanceKm);
  });

  it('tells about detour-only objects after the switch', () => {
    const e = new TripEngine(makeData());
    e.start();
    driveTo(e, 25);
    e.chooseDetour();
    driveTo(e, projectKm(makePolyline(DETOUR), [0.2, 0.6]).km);
    expect(e.getState().guide.seen).toContain('c:short');
  });

  it('offers only straight when the branch is passed, and adds the delay once passed', () => {
    const e = new TripEngine(makeData({ warnAtKm: 50 }));
    e.start();
    driveTo(e, 40);
    e.triggerIncident();
    let s = e.getState();
    expect(s.incident.status).toBe('warning');
    expect(s.incident.canDetour).toBe(false);

    e.chooseDetour();
    expect(e.getState().routeId).toBe('main');

    e.chooseStraight();
    s = e.getState();
    expect(s.etaMin).toBeCloseTo(((s.totalKm - s.distanceKm) / 90) * 60 + 35, 0);

    driveTo(e, 61);
    s = e.getState();
    expect(s.incident.status).toBe('cleared');
    expect(s.tripMin).toBeCloseTo((s.distanceKm / 90) * 60 + 35, 0);
  });
});

describe('TripEngine — services', () => {
  it('offers cafes ahead on hunger and books one only once', () => {
    const e = new TripEngine(makeData());
    e.start();
    driveTo(e, 10);
    e.triggerHunger();
    const o = e.getState().offer!;
    expect(o.kind).toBe('cafe');
    expect(o.items.map((i) => i.service.id)).toEqual(['cafe1']);
    expect(o.items[0].aheadKm).toBeGreaterThan(11);
    expect(o.items[0].aheadKm).toBeLessThan(13);

    e.bookService('cafe1');
    e.bookService('cafe1');
    const s = e.getState();
    expect(s.booked).toEqual(['cafe1']);
    expect(s.stats.services).toBe(1);
    expect(s.sinceMealMin).toBe(0);
  });

  it('offers only hotels with free rooms on fatigue', () => {
    const e = new TripEngine(makeData());
    e.start();
    driveTo(e, 10);
    e.triggerFatigue();
    expect(e.getState().offer?.items.map((i) => i.service.id)).toEqual(['hotel1']);
  });

  it('suggests lunch automatically after 12:30', () => {
    const e = new TripEngine(makeData(NO_INCIDENT));
    e.start();
    driveTo(e, 89);
    expect(e.getState().offer).toBeNull();
    driveTo(e, 92);
    expect(e.getState().offer?.reason).toBe('hunger');
  });
});

describe('TripEngine — commands', () => {
  it('answers voice/text commands', () => {
    const e = new TripEngine(makeData());
    e.start();
    expect(e.handleText('Расскажи про Алексин')).toBe('Рассказываю: Алексин');
    expect(e.getState().guide.current?.mode).toBe('answer');
    expect(e.handleText('найди отель')).toMatch(/^Отели впереди/);
    expect(e.getState().offer?.reason).toBe('query');
    expect(e.handleText('что впереди')).toMatch(/^Впереди: Тула/);
    expect(e.handleText('как погода')).toBe(UNKNOWN_REPLY);
    e.handleText('пауза');
    expect(e.getState().status).toBe('paused');
    e.handleText('поехали');
    expect(e.getState().status).toBe('driving');
  });

  it('ignores commands that make no sense in the current state', () => {
    const e = new TripEngine(makeData());
    e.stop();
    e.drive();
    e.pause();
    e.resume();
    e.triggerHunger();
    e.triggerFatigue();
    e.triggerIncident();
    e.chooseDetour();
    e.chooseStraight();
    e.bookService('cafe1');
    e.guideFinished('greeting');
    e.skipGuide();
    e.tick(1000);
    let s = e.getState();
    expect(s.status).toBe('idle');
    expect(s.offer).toBeNull();
    expect(s.incident.status).toBe('none');
    expect(s.guide.current).toBeNull();

    e.start();
    e.start();
    s = e.getState();
    expect(s.guide.seen.filter((k) => k === 'greeting')).toHaveLength(1);
  });

  it('resumes into the state it was paused from', () => {
    const e = new TripEngine(makeData());
    e.start();
    e.tick(1000);
    e.stop();
    e.pause();
    e.tick(1000);
    expect(e.getState().status).toBe('paused');
    e.resume();
    expect(e.getState().status).toBe('stopped');
  });

  it('keeps timeScale within 1..30', () => {
    const e = new TripEngine(makeData());
    e.setTimeScale(100);
    expect(e.getState().timeScale).toBe(30);
    e.setTimeScale(0);
    expect(e.getState().timeScale).toBe(1);
  });

  it('resets to a fresh idle trip', () => {
    const e = new TripEngine(makeData());
    e.start();
    driveTo(e, 10);
    e.triggerHunger();
    e.reset();
    const s = e.getState();
    expect(s.status).toBe('idle');
    expect(s.distanceKm).toBe(0);
    expect(s.offer).toBeNull();
    expect(s.guide.current).toBeNull();
    expect(s.guide.seen).toEqual([]);
    expect(s.stats).toEqual({ stories: 0, services: 0, detours: 0 });
  });
});
```

- [ ] **Step 2: Запустить тест, убедиться, что он падает**

Run: `npx vitest run src/engine/trip.test.ts`
Expected: FAIL — `Failed to resolve import "./trip"`.

- [ ] **Step 3: Реализовать `src/engine/trip.ts`**

```ts
import type { LatLng, Poi, RouteId, ServiceKind, TripData } from '../data/types';
import { makePolyline, pointAt, projectKm, type Polyline } from './geo';
import {
  detailedDue, enqueue, finishCurrent, initialGuide, itemFor, shortDue,
  type GuideItem, type GuideState, type PoiOnRoute,
} from './guide';
import { canTriggerManually, detourCost, passedIncident, shouldWarn, type IncidentStatus } from './incidents';
import { parseIntent } from './intents';
import { AUTO_COOLDOWN_MIN, buildOffer, fatigueDue, hungerDue, type Offer, type OfferReason, type ServiceOnRoute } from './needs';

export const SPEED_KMH = 90;
export const START_CLOCK_MIN = 11 * 60 + 30;
export const START_SINCE_MEAL_MIN = 60;
export const DEFAULT_TIME_SCALE = 20;
export const MIN_TIME_SCALE = 1;
export const MAX_TIME_SCALE = 30;
export const DETAILED_AFTER_STOP_MS = 3000;
export const MAX_TICK_MS = 1000;
export const UNKNOWN_REPLY = 'Не понял. Попробуйте: «Расскажи про Тулу», «Найди кафе».';

export type TripStatus = 'idle' | 'driving' | 'stopped' | 'paused' | 'arrived';

export interface IncidentView {
  status: IncidentStatus;
  canDetour: boolean;
  title: string;
  source: string;
  delayMin: number;
  extraKm: number;
  extraMin: number;
  detourPoiNames: string[];
}

export interface TripState {
  status: TripStatus;
  pausedFrom: 'driving' | 'stopped' | null;
  routeId: RouteId;
  distanceKm: number;
  totalKm: number;
  position: LatLng;
  speedKmh: number;
  timeScale: number;
  simClockMin: number;
  tripMin: number;
  drivingSinceStopMin: number;
  sinceMealMin: number;
  stoppedRealMs: number;
  guide: GuideState;
  incident: IncidentView;
  offer: Offer | null;
  booked: string[];
  lastReply: string | null;
  lastAuto: { hunger: number; fatigue: number };
  stats: { stories: number; services: number; detours: number };
  etaMin: number;
}

const STORY_MODES: GuideItem['mode'][] = ['short', 'detailed', 'answer'];

function withEta(s: TripState): TripState {
  const driveMin = (Math.max(0, s.totalKm - s.distanceKm) / SPEED_KMH) * 60;
  return { ...s, etaMin: driveMin + (s.incident.status === 'straight' ? s.incident.delayMin : 0) };
}

export class TripEngine {
  private readonly lines: Record<RouteId, Polyline>;
  private readonly poisOn: Record<RouteId, PoiOnRoute[]>;
  private readonly servicesOn: Record<RouteId, ServiceOnRoute[]>;
  private counter = 0;
  private s: TripState;

  constructor(private readonly data: TripData) {
    this.lines = { main: makePolyline(data.routes.main), detour: makePolyline(data.routes.detour) };
    this.poisOn = { main: this.poisFor('main'), detour: this.poisFor('detour') };
    this.servicesOn = { main: this.servicesFor('main'), detour: this.servicesFor('detour') };
    this.s = this.initial();
  }

  getState(): TripState {
    return this.s;
  }

  // ——— команды ———

  start() {
    if (this.s.status !== 'idle') return;
    this.set({ status: 'driving', speedKmh: SPEED_KMH });
    this.guide((g) => enqueue(g, { key: 'greeting', poiId: null, title: 'Аудиогид', mode: 'greeting', text: this.data.greeting }));
    this.checkShort();
  }

  pause() {
    const { status } = this.s;
    if (status === 'driving' || status === 'stopped') this.set({ status: 'paused', pausedFrom: status, speedKmh: 0 });
  }

  resume() {
    if (this.s.status !== 'paused') return;
    const back = this.s.pausedFrom ?? 'driving';
    this.set({ status: back, pausedFrom: null, speedKmh: back === 'driving' ? SPEED_KMH : 0 });
  }

  stop() {
    if (this.s.status !== 'driving') return;
    this.set({ status: 'stopped', speedKmh: 0, stoppedRealMs: 0, drivingSinceStopMin: 0 });
  }

  drive() {
    if (this.s.status !== 'stopped') return;
    this.set({ status: 'driving', speedKmh: SPEED_KMH });
  }

  setTimeScale(n: number) {
    this.set({ timeScale: Math.min(MAX_TIME_SCALE, Math.max(MIN_TIME_SCALE, Math.round(n))) });
  }

  triggerHunger() {
    if (this.active()) this.offer('hunger');
  }

  triggerFatigue() {
    if (this.active()) this.offer('fatigue');
  }

  triggerIncident() {
    const s = this.s;
    if (!this.active() || !canTriggerManually(s.incident.status, s.routeId, s.distanceKm, this.data.incident)) return;
    this.warn();
  }

  chooseDetour() {
    const s = this.s;
    if (s.incident.status !== 'warning' || !s.incident.canDetour) return;
    const line = this.lines.detour;
    const km = projectKm(line, s.position).km;
    this.set({
      routeId: 'detour',
      totalKm: line.totalKm,
      distanceKm: km,
      position: pointAt(line, km),
      incident: { ...s.incident, status: 'detour' },
      stats: { ...s.stats, detours: s.stats.detours + 1 },
      offer: null,
    });
    const names = s.incident.detourPoiNames;
    this.notice('Маршрут перестроен', `Едем через ${names[0]}. По пути: ${names.join(' и ')}.`);
  }

  chooseStraight() {
    const s = this.s;
    if (s.incident.status !== 'warning') return;
    this.set({ incident: { ...s.incident, status: 'straight' } });
    this.notice('Маршрут', `Едем прямо, задержка около ${s.incident.delayMin} минут.`);
  }

  tellAbout(poiId: string) {
    const poi = this.poi(poiId);
    if (!poi) return;
    this.guide((g) =>
      enqueue(g, { key: `answer:${poi.id}:${++this.counter}`, poiId: poi.id, title: poi.name, mode: 'answer', text: poi.short }),
    );
  }

  handleText(text: string): string {
    const intent = parseIntent(text, this.data.pois);
    let reply: string;
    switch (intent.type) {
      case 'tell': {
        const poi = intent.poiId ? this.poi(intent.poiId) : this.nextPoi()?.poi;
        if (!poi) {
          reply = 'Впереди по маршруту больше нет объектов.';
          break;
        }
        this.tellAbout(poi.id);
        reply = `Рассказываю: ${poi.name}`;
        break;
      }
      case 'find':
        reply = this.active() ? this.offer('query', intent.kind).message : 'Сначала нажмите «Старт».';
        break;
      case 'ahead': {
        const next = this.nextPoi();
        reply = next
          ? `Впереди: ${next.poi.name}, через ${Math.max(0, Math.round(next.km - this.s.distanceKm))} км.`
          : 'Впереди — финиш маршрута.';
        this.notice('Что впереди', reply);
        break;
      }
      case 'pause':
        this.pause();
        reply = 'Пауза.';
        break;
      case 'resume':
        this.resume();
        reply = 'Продолжаем.';
        break;
      default:
        reply = UNKNOWN_REPLY;
    }
    this.set({ lastReply: reply });
    return reply;
  }

  bookService(id: string) {
    const s = this.s;
    const item = s.offer?.items.find((i) => i.service.id === id);
    if (!item || s.booked.includes(id)) return;
    this.set({
      booked: [...s.booked, id],
      stats: { ...s.stats, services: s.stats.services + 1 },
      sinceMealMin: item.service.kind === 'cafe' ? 0 : s.sinceMealMin,
      lastReply: `Готово (демо): ${item.service.name}`,
    });
  }

  dismissOffer() {
    if (this.s.offer) this.set({ offer: null });
  }

  guideFinished(key: string) {
    if (this.s.guide.current?.key === key) this.guide(finishCurrent);
  }

  skipGuide() {
    if (this.s.guide.current) this.guide(finishCurrent);
  }

  reset() {
    const timeScale = this.s.timeScale;
    this.counter = 0;
    this.s = { ...this.initial(), timeScale };
  }

  // ——— время ———

  tick(realDtMs: number) {
    const dt = Math.min(Math.max(realDtMs, 0), MAX_TICK_MS);
    const s = this.s;
    if (dt === 0) return;
    const simMin = (dt / 60_000) * s.timeScale;

    if (s.status === 'stopped') {
      const stoppedRealMs = s.stoppedRealMs + dt;
      this.set({ stoppedRealMs, simClockMin: s.simClockMin + simMin, tripMin: s.tripMin + simMin, sinceMealMin: s.sinceMealMin + simMin });
      if (stoppedRealMs >= DETAILED_AFTER_STOP_MS) this.checkDetailed();
      return;
    }
    // Пока предупреждение ждёт решения, машина стоит (демо-условность).
    if (s.status !== 'driving' || s.incident.status === 'warning') return;

    const line = this.lines[s.routeId];
    const distanceKm = Math.min(line.totalKm, s.distanceKm + (SPEED_KMH * simMin) / 60);
    const jam = s.routeId === 'main' && s.incident.status === 'straight' && passedIncident(s.distanceKm, distanceKm, this.data.incident);
    const extraMin = simMin + (jam ? this.data.incident.delayMin : 0);
    this.set({
      distanceKm,
      position: pointAt(line, distanceKm),
      simClockMin: s.simClockMin + extraMin,
      tripMin: s.tripMin + extraMin,
      drivingSinceStopMin: s.drivingSinceStopMin + extraMin,
      sinceMealMin: s.sinceMealMin + extraMin,
      incident: jam ? { ...s.incident, status: 'cleared' } : s.incident,
    });

    this.checkShort();
    if (shouldWarn(this.s.incident.status, this.s.routeId, distanceKm, this.data.incident)) this.warn();
    this.checkNeeds();
    if (distanceKm >= line.totalKm) this.arrive();
  }

  // ——— внутреннее ———

  private initial(): TripState {
    const main = this.lines.main;
    const inc = this.data.incident;
    const cost = detourCost(main.totalKm, this.lines.detour.totalKm, SPEED_KMH);
    return withEta({
      status: 'idle',
      pausedFrom: null,
      routeId: 'main',
      distanceKm: 0,
      totalKm: main.totalKm,
      position: main.points[0],
      speedKmh: 0,
      timeScale: DEFAULT_TIME_SCALE,
      simClockMin: START_CLOCK_MIN,
      tripMin: 0,
      drivingSinceStopMin: 0,
      sinceMealMin: START_SINCE_MEAL_MIN,
      stoppedRealMs: 0,
      guide: initialGuide(),
      incident: {
        status: 'none',
        canDetour: true,
        title: inc.title,
        source: inc.source,
        delayMin: inc.delayMin,
        extraKm: Math.round(cost.extraKm),
        extraMin: cost.extraMin,
        detourPoiNames: inc.detourPoiIds.map((id) => this.poi(id)?.name ?? id),
      },
      offer: null,
      booked: [],
      lastReply: null,
      lastAuto: { hunger: -Infinity, fatigue: -Infinity },
      stats: { stories: 0, services: 0, detours: 0 },
      etaMin: 0,
    });
  }

  private set(patch: Partial<TripState>) {
    this.s = withEta({ ...this.s, ...patch });
  }

  private active(): boolean {
    return this.s.status !== 'idle' && this.s.status !== 'arrived';
  }

  private poi(id: string): Poi | undefined {
    return this.data.pois.find((p) => p.id === id);
  }

  private poisFor(routeId: RouteId): PoiOnRoute[] {
    return this.data.pois
      .filter((p) => p.routes.includes(routeId))
      .map((poi) => ({ poi, km: projectKm(this.lines[routeId], poi.position).km }));
  }

  private servicesFor(routeId: RouteId): ServiceOnRoute[] {
    return this.data.services
      .filter((sv) => sv.routes.includes(routeId))
      .map((service) => ({ service, km: projectKm(this.lines[routeId], service.position).km }));
  }

  private nextPoi(): PoiOnRoute | undefined {
    const km = this.s.distanceKm;
    return this.poisOn[this.s.routeId].filter((p) => p.km >= km - 0.5).sort((a, b) => a.km - b.km)[0];
  }

  /** Меняет очередь гида и считает рассказы, которые начали звучать. */
  private guide(fn: (g: GuideState) => GuideState) {
    const before = this.s.guide.current?.key;
    const next = fn(this.s.guide);
    const cur = next.current;
    const started = cur !== null && cur.key !== before && STORY_MODES.includes(cur.mode);
    this.set({ guide: next, stats: { ...this.s.stats, stories: this.s.stats.stories + (started ? 1 : 0) } });
  }

  private notice(title: string, text: string) {
    this.guide((g) => enqueue(g, { key: `notice:${++this.counter}`, poiId: null, title, mode: 'notice', text }));
  }

  private offer(reason: OfferReason, kind?: ServiceKind): Offer {
    const s = this.s;
    const offer = buildOffer(reason, this.servicesOn[s.routeId], s.distanceKm, {
      tripMin: s.tripMin,
      drivingSinceStopMin: s.drivingSinceStopMin,
      kind,
    });
    const lastAuto =
      reason === 'hunger' ? { ...s.lastAuto, hunger: s.simClockMin }
      : reason === 'fatigue' ? { ...s.lastAuto, fatigue: s.simClockMin }
      : s.lastAuto;
    this.set({ offer, lastAuto });
    if (reason !== 'query') this.notice(reason === 'hunger' ? 'Перекус' : 'Отдых', offer.message);
    return offer;
  }

  private warn() {
    const canDetour = this.s.distanceKm < this.data.branchKm;
    this.set({ incident: { ...this.s.incident, status: 'warning', canDetour } });
    const i = this.s.incident;
    const advice = canDetour
      ? `Объезд через ${i.detourPoiNames[0]}: плюс ${i.extraMin} минут, по пути ${i.detourPoiNames.join(' и ')}. Прямо — задержка около ${i.delayMin} минут.`
      : `Объезд уже недоступен, задержка около ${i.delayMin} минут.`;
    this.notice('Внимание', `${i.title}. ${advice}`);
  }

  private checkShort() {
    const s = this.s;
    for (const p of shortDue(this.poisOn[s.routeId], s.distanceKm, SPEED_KMH, s.guide.seen)) {
      this.guide((g) => enqueue(g, itemFor(p.poi, 'short')));
    }
  }

  private checkDetailed() {
    const p = detailedDue(this.poisOn[this.s.routeId], this.s.distanceKm, this.s.guide.seen);
    if (p) this.guide((g) => enqueue(g, itemFor(p.poi, 'detailed')));
  }

  private checkNeeds() {
    const s = this.s;
    if (s.offer) return;
    if (hungerDue(s.simClockMin, s.sinceMealMin) && s.simClockMin - s.lastAuto.hunger >= AUTO_COOLDOWN_MIN) {
      this.offer('hunger');
    } else if (fatigueDue(s.drivingSinceStopMin) && s.simClockMin - s.lastAuto.fatigue >= AUTO_COOLDOWN_MIN) {
      this.offer('fatigue');
    }
  }

  private arrive() {
    this.set({ status: 'arrived', speedKmh: 0 });
    const dest = this.data.pois.find((p) => p.isDestination);
    if (dest) this.guide((g) => enqueue(g, itemFor(dest, 'detailed')));
  }
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npx vitest run src/engine/trip.test.ts`
Expected: PASS (17 tests).

- [ ] **Step 5: Прогнать весь набор и типы**

Run: `npm test` → Expected: PASS (все файлы).
Run: `npm run typecheck` → Expected: без ошибок.

- [ ] **Step 6: Commit**

```powershell
git add src/engine/trip.ts src/engine/trip.test.ts
git commit -m "feat(engine): trip engine - simulation, guide, services, incident, commands" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Речь — озвучка и распознавание

**Files:**
- Create: `src/speech/tts.ts`, `src/speech/stt.ts`
- Test: `src/speech/tts.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - `tts.ts`: `splitSentences(text: string): string[]`, `ttsSupported(): boolean`, `initTts(onChange: () => void): void`, `hasRussianVoice(): boolean`, `isTtsEnabled(): boolean`, `setTtsEnabled(on: boolean): void`, `speak(text: string, onEnd: () => void): void`, `cancel(): void`. `onEnd` вызывается ровно один раз и только если за это время не было нового `speak`/`cancel`. Без русского голоса или с выключенной озвучкой `onEnd` вызывается таймером `max(2 с, длина/14 символов в секунду)`.
  - `stt.ts`: `sttSupported(): boolean`, `listenOnce(h: { onText(t: string): void; onError(msg: string): void; onEnd(): void }): () => void` (возвращает функцию остановки).

- [ ] **Step 1: Написать падающий тест `src/speech/tts.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { splitSentences } from './tts';

describe('splitSentences', () => {
  it('splits text into sentences so Chrome does not cut long speech', () => {
    expect(splitSentences('Первое. Второе! Третье?')).toEqual(['Первое.', 'Второе!', 'Третье?']);
  });

  it('keeps text without a final dot', () => {
    expect(splitSentences('Без точки')).toEqual(['Без точки']);
  });

  it('returns nothing for blank text', () => {
    expect(splitSentences('   ')).toEqual([]);
  });
});
```

- [ ] **Step 2: Запустить тест, убедиться, что он падает**

Run: `npx vitest run src/speech/tts.test.ts`
Expected: FAIL — `Failed to resolve import "./tts"`.

- [ ] **Step 3: Реализовать `src/speech/tts.ts`**

```ts
const CHARS_PER_SECOND = 14;
const MIN_SILENT_MS = 2000;

let enabled = true;
let voice: SpeechSynthesisVoice | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let token = 0;

export function splitSentences(text: string): string[] {
  return (text.match(/[^.!?…]+[.!?…]*/g) ?? []).map((s) => s.trim()).filter(Boolean);
}

export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (!ttsSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang === 'ru-RU' && /google/i.test(v.name)) ??
    voices.find((v) => v.lang.toLowerCase().startsWith('ru')) ??
    null
  );
}

export function initTts(onChange: () => void) {
  if (!ttsSupported()) return;
  voice = pickVoice();
  window.speechSynthesis.addEventListener('voiceschanged', () => {
    voice = pickVoice();
    onChange();
  });
}

export const hasRussianVoice = () => voice !== null;
export const isTtsEnabled = () => enabled;

export function setTtsEnabled(on: boolean) {
  enabled = on;
  if (!on) cancel();
}

export function cancel() {
  token++;
  if (timer) clearTimeout(timer);
  timer = undefined;
  if (ttsSupported()) window.speechSynthesis.cancel();
}

export function speak(text: string, onEnd: () => void) {
  cancel();
  const mine = token;
  const finish = () => {
    if (mine === token) onEnd();
  };
  const parts = splitSentences(text);
  if (!enabled || !voice || parts.length === 0) {
    timer = setTimeout(finish, Math.max(MIN_SILENT_MS, (text.length / CHARS_PER_SECOND) * 1000));
    return;
  }
  parts.forEach((part, i) => {
    const u = new SpeechSynthesisUtterance(part);
    u.voice = voice;
    u.lang = 'ru-RU';
    u.rate = 1.05;
    if (i === parts.length - 1) {
      u.onend = finish;
      u.onerror = finish;
    }
    window.speechSynthesis.speak(u);
  });
}
```

- [ ] **Step 4: Реализовать `src/speech/stt.ts`**

```ts
interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionEvent {
  results: ArrayLike<ArrayLike<RecognitionAlternative>>;
}
interface RecognitionErrorEvent {
  error: string;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export const sttSupported = () => recognitionCtor() !== undefined;

function errorMessage(code: string): string {
  if (code === 'not-allowed' || code === 'service-not-allowed') return 'Разрешите микрофон или введите текст';
  if (code === 'no-speech') return 'Не расслышал, попробуйте ещё раз';
  return 'Не удалось распознать речь — введите текст';
}

export function listenOnce(h: { onText(t: string): void; onError(msg: string): void; onEnd(): void }): () => void {
  const Ctor = recognitionCtor();
  if (!Ctor) {
    h.onError('Распознавание речи не поддерживается этим браузером');
    h.onEnd();
    return () => {};
  }
  const r = new Ctor();
  r.lang = 'ru-RU';
  r.interimResults = false;
  r.maxAlternatives = 1;
  r.onresult = (e) => {
    const text = e.results[0]?.[0]?.transcript;
    if (text) h.onText(text);
  };
  r.onerror = (e) => h.onError(errorMessage(e.error));
  r.onend = () => h.onEnd();
  r.start();
  return () => r.stop();
}
```

- [ ] **Step 5: Запустить тесты и типы**

Run: `npx vitest run src/speech/tts.test.ts` → Expected: PASS (3 tests).
Run: `npm run typecheck` → Expected: без ошибок.

- [ ] **Step 6: Commit**

```powershell
git add src/speech
git commit -m "feat(speech): sentence-split TTS with silent fallback and one-shot speech recognition" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Стор, каркас интерфейса, панель ведущего

**Files:**
- Create: `src/store/tripStore.ts`, `src/ui/App.tsx`, `src/ui/PhoneFrame.tsx`, `src/ui/TopBar.tsx`, `src/ui/DirectorPanel.tsx`, `src/ui/styles.css`, `.claude/launch.json`
- Modify: `src/main.tsx` (полная замена)

**Interfaces:**
- Consumes: `TripEngine`, `TripState`, `MIN_TIME_SCALE`, `MAX_TIME_SCALE` (Task 9); `speak`, `cancel`, `initTts`, `hasRussianVoice`, `isTtsEnabled`, `setTtsEnabled` (Task 10); `TRIP_DATA` (Task 4); `fmtDuration`, `fmtClock` (Task 1).
- Produces:
  - `class TripStore { engine; subscribe; getState; getUi; act<R>(fn: (e: TripEngine) => R): R; setVoiceEnabled(on: boolean); refreshUi(); resetTrip(); startLoop(); stopLoop() }`
  - `interface UiState { ttsEnabled: boolean; ttsAvailable: boolean }`
  - `StoreContext`, `useStore(): TripStore`, `useTrip(): TripState`, `useUi(): UiState`
  - CSS-классы `.stage`, `.phone`, `.phone-screen`, `.topbar*`, `.map`, `.director*`, `.btn*`, `.hint`

- [ ] **Step 1: Создать `src/store/tripStore.ts`**

```ts
import { createContext, useContext, useSyncExternalStore } from 'react';
import type { TripEngine, TripState } from '../engine/trip';
import { cancel, hasRussianVoice, isTtsEnabled, setTtsEnabled, speak } from '../speech/tts';

export interface UiState {
  ttsEnabled: boolean;
  ttsAvailable: boolean;
}

export class TripStore {
  private listeners = new Set<() => void>();
  private raf = 0;
  private lastFrame = 0;
  private spokenKey: string | null = null;
  private ui: UiState = { ttsEnabled: isTtsEnabled(), ttsAvailable: hasRussianVoice() };

  constructor(readonly engine: TripEngine) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getState = (): TripState => this.engine.getState();
  getUi = (): UiState => this.ui;

  act<R>(fn: (engine: TripEngine) => R): R {
    const result = fn(this.engine);
    this.changed();
    return result;
  }

  setVoiceEnabled(on: boolean) {
    setTtsEnabled(on);
    this.spokenKey = null; // перечитать текущий рассказ в новом режиме
    this.refreshUi();
    this.changed();
  }

  refreshUi() {
    this.ui = { ttsEnabled: isTtsEnabled(), ttsAvailable: hasRussianVoice() };
    this.emit();
  }

  resetTrip() {
    cancel();
    this.spokenKey = null;
    this.act((e) => e.reset());
  }

  startLoop() {
    const frame = (t: number) => {
      const dt = this.lastFrame ? t - this.lastFrame : 0;
      this.lastFrame = t;
      const before = this.engine.getState();
      this.engine.tick(dt);
      if (this.engine.getState() !== before) this.changed();
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stopLoop() {
    cancelAnimationFrame(this.raf);
    this.lastFrame = 0;
  }

  private changed() {
    this.syncSpeech();
    this.emit();
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  private syncSpeech() {
    const current = this.engine.getState().guide.current;
    const key = current?.key ?? null;
    if (key === this.spokenKey) return;
    this.spokenKey = key;
    if (!current) {
      cancel();
      return;
    }
    speak(current.text, () => this.act((e) => e.guideFinished(current.key)));
  }
}

export const StoreContext = createContext<TripStore | null>(null);

export function useStore(): TripStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('StoreContext is missing');
  return store;
}

export function useTrip(): TripState {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getState);
}

export function useUi(): UiState {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getUi);
}
```

- [ ] **Step 2: Заменить `src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TRIP_DATA } from './data';
import { TripEngine } from './engine/trip';
import { initTts } from './speech/tts';
import { StoreContext, TripStore } from './store/tripStore';
import { App } from './ui/App';
import './ui/styles.css';

const store = new TripStore(new TripEngine(TRIP_DATA));
initTts(() => store.refreshUi());
store.startLoop();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreContext.Provider value={store}>
      <App />
    </StoreContext.Provider>
  </StrictMode>,
);
```

- [ ] **Step 3: Создать `src/ui/PhoneFrame.tsx`, `src/ui/TopBar.tsx`, `src/ui/App.tsx`**

`src/ui/PhoneFrame.tsx`:

```tsx
import type { ReactNode } from 'react';

export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="phone">
      <div className="phone-notch" />
      <div className="phone-screen">{children}</div>
    </div>
  );
}
```

`src/ui/TopBar.tsx`:

```tsx
import { TRIP_DATA } from '../data';
import { fmtClock, fmtDuration } from '../engine/format';
import { useTrip } from '../store/tripStore';

const DESTINATION = TRIP_DATA.pois.find((p) => p.isDestination)?.name ?? 'Финиш';

export function TopBar() {
  const s = useTrip();
  const leftKm = Math.max(0, s.totalKm - s.distanceKm);
  return (
    <header className="topbar">
      <div className="topbar-main">
        <span className="topbar-dest">{DESTINATION}</span>
        <span className="topbar-eta">
          {Math.round(leftKm)} км · {fmtDuration(s.etaMin)}
        </span>
      </div>
      <div className="topbar-side">
        <span className="topbar-speed">{Math.round(s.speedKmh)} км/ч</span>
        <span className="topbar-clock">{fmtClock(s.simClockMin)}</span>
      </div>
    </header>
  );
}
```

`src/ui/App.tsx` (временный вид — карта-заглушка заменяется в Task 12):

```tsx
import { DirectorPanel } from './DirectorPanel';
import { PhoneFrame } from './PhoneFrame';
import { TopBar } from './TopBar';

export function App() {
  return (
    <div className="stage">
      <PhoneFrame>
        <TopBar />
        <div className="map" />
      </PhoneFrame>
      <DirectorPanel />
    </div>
  );
}
```

- [ ] **Step 4: Создать `src/ui/DirectorPanel.tsx`**

```tsx
import { useState } from 'react';
import { MAX_TIME_SCALE, MIN_TIME_SCALE } from '../engine/trip';
import { useStore, useTrip, useUi } from '../store/tripStore';

const STEPS = [
  '«Старт» — приветствие и рассказ о Новомосковске.',
  '«Голод» — кафе впереди (Тула), «Предзаказ».',
  'Подъезд к Туле: само появится предупреждение о ДТП → «Объезд с открытиями».',
  'Тула: рассказ начнётся сам; «Остановиться» → подробный рассказ.',
  '«Поехать» — Алексин и Ока (только на объезде).',
  'Голос или текст: «Расскажи про усадьбу Толмачёвых».',
  '«Усталость» — отели Калуги со свободными номерами.',
  'Прибытие — подробный рассказ и итоги поездки.',
];

export function DirectorPanel() {
  const s = useTrip();
  const ui = useUi();
  const store = useStore();
  const [open, setOpen] = useState(false);
  const running = s.status !== 'idle' && s.status !== 'arrived';

  return (
    <aside className={`director ${open ? 'is-open' : ''}`}>
      <button className="director-toggle" onClick={() => setOpen((o) => !o)}>
        Панель ведущего {open ? '▾' : '▴'}
      </button>
      <div className="director-body">
        <h2>Панель ведущего</h2>

        <div className="director-row">
          {s.status === 'idle' && (
            <button className="btn btn-primary" onClick={() => store.act((e) => e.start())}>▶ Старт</button>
          )}
          {s.status === 'paused' && (
            <button className="btn" onClick={() => store.act((e) => e.resume())}>▶ Продолжить</button>
          )}
          {s.status !== 'idle' && s.status !== 'paused' && (
            <button className="btn" disabled={!running} onClick={() => store.act((e) => e.pause())}>⏸ Пауза</button>
          )}
          {s.status === 'stopped' ? (
            <button className="btn" onClick={() => store.act((e) => e.drive())}>🚗 Поехать</button>
          ) : (
            <button className="btn" disabled={s.status !== 'driving'} onClick={() => store.act((e) => e.stop())}>
              🅿 Остановиться
            </button>
          )}
        </div>

        <label className="director-speed">
          Скорость симуляции: ×{s.timeScale}
          <input
            type="range"
            min={MIN_TIME_SCALE}
            max={MAX_TIME_SCALE}
            value={s.timeScale}
            onChange={(ev) => store.act((e) => e.setTimeScale(Number(ev.target.value)))}
          />
        </label>

        <h3>Ситуации</h3>
        <div className="director-row">
          <button className="btn" disabled={!running} onClick={() => store.act((e) => e.triggerHunger())}>🍽 Голод</button>
          <button className="btn" disabled={!running} onClick={() => store.act((e) => e.triggerFatigue())}>😴 Усталость</button>
          <button className="btn btn-danger" disabled={!running} onClick={() => store.act((e) => e.triggerIncident())}>
            ⚠ ДТП впереди
          </button>
        </div>

        <div className="director-row">
          <button className="btn" onClick={() => store.resetTrip()}>↺ Сброс</button>
          <label className="toggle">
            <input type="checkbox" checked={ui.ttsEnabled} onChange={(ev) => store.setVoiceEnabled(ev.target.checked)} />
            Озвучка
          </label>
        </div>
        {!ui.ttsAvailable && <p className="hint warn">Русский голос недоступен — показываются только субтитры.</p>}

        <h3>Сценарий показа</h3>
        <ol className="steps">
          {STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="hint">Все кафе, отели и бронирования — вымышленные (демо).</p>
      </div>
    </aside>
  );
}
```

- [ ] **Step 5: Создать `src/ui/styles.css` (база)**

```css
:root {
  --bg: #0b0f14;
  --panel: #131a22;
  --panel-2: #1b242f;
  --line: #263241;
  --text: #e8edf2;
  --muted: #8a96a3;
  --accent: #f5a524;
  --accent-ink: #1a1203;
  --danger: #ff6b5e;
  --ok: #3ecf8e;
  --radius: 14px;
  --overlay-top: 112px;
  font-family: Inter, 'Segoe UI', Roboto, system-ui, sans-serif;
  color: var(--text);
}

* { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; }
body { background: radial-gradient(1200px 800px at 30% 20%, #16202b, var(--bg)); }
button { font: inherit; color: inherit; cursor: pointer; }
button:disabled { opacity: 0.45; cursor: default; }

/* Сцена и телефон */
.stage { height: 100%; display: flex; align-items: center; justify-content: center; gap: 32px; padding: 16px; }
.phone {
  position: relative; flex-shrink: 0;
  height: min(844px, calc(100vh - 32px)); aspect-ratio: 390 / 844;
  padding: 12px; border-radius: 48px; background: #05070a;
  box-shadow: 0 0 0 2px #2a3340, 0 30px 80px rgba(0, 0, 0, 0.6);
}
.phone-notch {
  position: absolute; top: 18px; left: 50%; transform: translateX(-50%); z-index: 1001;
  width: 110px; height: 28px; border-radius: 16px; background: #05070a;
}
.phone-screen {
  position: relative; height: 100%; overflow: hidden;
  display: flex; flex-direction: column; border-radius: 38px; background: var(--bg);
}

/* Верхняя полоса */
.topbar {
  z-index: 500; display: flex; justify-content: space-between; align-items: flex-end; gap: 8px;
  padding: 52px 16px 10px; background: var(--panel);
}
.topbar-main { display: flex; flex-direction: column; min-width: 0; }
.topbar-dest { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.topbar-eta { font-size: 20px; font-weight: 700; }
.topbar-side { display: flex; flex-direction: column; align-items: flex-end; font-size: 12px; color: var(--muted); }
.topbar-speed { font-size: 16px; font-weight: 600; color: var(--accent); }

/* Карта */
.map { flex: 1; min-height: 0; background: #0e141b; }

/* Панель ведущего */
.director {
  width: 320px; max-height: calc(100vh - 32px); overflow: auto;
  padding: 16px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel);
}
.director h2 { margin: 0 0 12px; font-size: 16px; }
.director h3 { margin: 16px 0 8px; font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
.director-toggle { display: none; }
.director-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.director-speed { display: flex; flex-direction: column; gap: 6px; margin: 6px 0 4px; font-size: 13px; }
.director-speed input { accent-color: var(--accent); }
.btn { padding: 8px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel-2); }
.btn:hover:not(:disabled) { border-color: var(--accent); }
.btn-primary { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); font-weight: 700; }
.btn-danger { border-color: var(--danger); color: var(--danger); }
.btn-small { padding: 6px 10px; font-size: 13px; }
.toggle { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; }
.steps { margin: 0; padding-left: 20px; font-size: 13px; line-height: 1.5; color: var(--muted); }
.hint { font-size: 12px; color: var(--muted); }
.hint.warn { color: var(--accent); }

/* Узкий экран: без рамки телефона, панель ведущего — шторка снизу */
@media (max-width: 900px) {
  .stage { padding: 0; }
  .phone { width: 100%; height: 100%; aspect-ratio: auto; padding: 0; border-radius: 0; box-shadow: none; }
  .phone-notch { display: none; }
  .phone-screen { border-radius: 0; }
  .topbar { padding-top: 12px; }
  :root { --overlay-top: 72px; }
  .director {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 2000;
    width: auto; max-height: 70vh; padding: 0 16px 16px; border-radius: 16px 16px 0 0;
    transform: translateY(calc(100% - 44px)); transition: transform 0.2s;
  }
  .director.is-open { transform: none; }
  .director-toggle { display: block; width: 100%; padding: 12px; border: 0; background: none; font-weight: 600; }
  .director-body h2 { display: none; }
}
```

- [ ] **Step 6: Создать `.claude/launch.json`**

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "audiogid",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "port": 5173
    }
  ]
}
```

- [ ] **Step 7: Проверить типы и сборку**

Run: `npm run build`
Expected: без ошибок TypeScript, `✓ built`.

- [ ] **Step 8: Проверить вживую**

Запустить `preview_start` с именем `audiogid`. В браузерной панели:
1. `get_page_text` — видны «Усадьба Толмачёвых», «168 км · 1 ч 52 мин» (±1 км), «11:30», «Панель ведущего».
2. Нажать «▶ Старт», подождать 3 с, снова `get_page_text` — километры уменьшились, часы идут, скорость «90 км/ч».
3. «🅿 Остановиться» → скорость «0 км/ч»; «⏸ Пауза» → «▶ Продолжить»; «↺ Сброс» → снова «11:30».
4. `read_console_messages` с `onlyErrors: true` — ошибок нет.

- [ ] **Step 9: Commit**

```powershell
git add src/store src/ui src/main.tsx .claude/launch.json
git commit -m "feat(ui): store with RAF loop and speech sync, phone frame, top bar, director panel" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Карта

**Files:**
- Create: `src/ui/MapView.tsx`
- Modify: `src/ui/App.tsx` (заменить `<div className="map" />` на `<MapView />`), `src/ui/styles.css` (дописать раздел)

**Interfaces:**
- Consumes: `TRIP_DATA` (Task 4), `makePolyline`, `pointAt` (Task 2), `useTrip` (Task 11).
- Produces: `MapView()` — Leaflet-карта с тёмными тайлами CARTO, маршрутом (пройденная часть приглушена), пунктиром старого маршрута при объезде, маркерами объектов и сервисов текущего маршрута и машиной, за которой следует карта.

- [ ] **Step 1: Создать `src/ui/MapView.tsx`**

```tsx
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef } from 'react';
import { TRIP_DATA } from '../data';
import type { LatLng, ServiceKind } from '../data/types';
import { makePolyline, pointAt } from '../engine/geo';
import { useTrip } from '../store/tripStore';

const SERVICE_ICON: Record<ServiceKind, string> = { cafe: '☕', hotel: '🛏', autoservice: '🔧', pharmacy: '💊' };
const PASSED_REDRAW_KM = 0.5;

const divIcon = (className: string, html: string) =>
  L.divIcon({ className: '', html: `<div class="${className}">${html}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] });

export function MapView() {
  const s = useTrip();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const car = useRef<L.Marker | null>(null);
  const routeLayer = useRef<L.LayerGroup | null>(null);
  const placeLayer = useRef<L.LayerGroup | null>(null);
  const passed = useRef<L.Polyline | null>(null);
  const passedKm = useRef(-Infinity);
  const lines = useMemo(
    () => ({ main: makePolyline(TRIP_DATA.routes.main), detour: makePolyline(TRIP_DATA.routes.detour) }),
    [],
  );

  useEffect(() => {
    const start = TRIP_DATA.routes.main[0];
    const m = L.map(el.current!, { zoomControl: false }).setView(start, 12);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
      attribution: '© OpenStreetMap, © CARTO',
    }).addTo(m);
    routeLayer.current = L.layerGroup().addTo(m);
    placeLayer.current = L.layerGroup().addTo(m);
    car.current = L.marker(start, { icon: divIcon('map-car', '▲'), zIndexOffset: 1000 }).addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const routes = routeLayer.current;
    const places = placeLayer.current;
    if (!routes || !places) return;
    routes.clearLayers();
    places.clearLayers();
    if (s.routeId === 'detour') {
      L.polyline(TRIP_DATA.routes.main, { color: '#6b7785', weight: 3, dashArray: '6 8', opacity: 0.7 }).addTo(routes);
    }
    L.polyline(TRIP_DATA.routes[s.routeId], { color: '#f5a524', weight: 5, opacity: 0.9 }).addTo(routes);
    passed.current = L.polyline([], { color: '#3a4450', weight: 6, opacity: 0.95 }).addTo(routes);
    passedKm.current = -Infinity;
    for (const p of TRIP_DATA.pois.filter((x) => x.routes.includes(s.routeId))) {
      L.marker(p.position, { icon: divIcon('map-poi', '★'), title: p.name }).addTo(places);
    }
    for (const sv of TRIP_DATA.services.filter((x) => x.routes.includes(s.routeId))) {
      L.marker(sv.position, { icon: divIcon('map-service', SERVICE_ICON[sv.kind]), title: sv.name }).addTo(places);
    }
  }, [s.routeId]);

  useEffect(() => {
    car.current?.setLatLng(s.position);
    map.current?.panTo(s.position, { animate: false });
    if (passed.current && Math.abs(s.distanceKm - passedKm.current) >= PASSED_REDRAW_KM) {
      passedKm.current = s.distanceKm;
      const line = lines[s.routeId];
      const pts: LatLng[] = [];
      for (let i = 0; i < line.points.length && line.cum[i] <= s.distanceKm; i++) pts.push(line.points[i]);
      pts.push(pointAt(line, s.distanceKm));
      passed.current.setLatLngs(pts);
    }
  }, [s.position, s.distanceKm, s.routeId, lines]);

  return <div ref={el} className="map" />;
}
```

- [ ] **Step 2: Подключить карту в `src/ui/App.tsx`**

```tsx
import { DirectorPanel } from './DirectorPanel';
import { MapView } from './MapView';
import { PhoneFrame } from './PhoneFrame';
import { TopBar } from './TopBar';

export function App() {
  return (
    <div className="stage">
      <PhoneFrame>
        <TopBar />
        <MapView />
      </PhoneFrame>
      <DirectorPanel />
    </div>
  );
}
```

- [ ] **Step 3: Дописать в конец `src/ui/styles.css`**

```css
/* Маркеры и Leaflet */
.leaflet-container { background: #0e141b; font: inherit; }
.leaflet-control-attribution { background: rgba(11, 15, 20, 0.7) !important; color: var(--muted) !important; font-size: 9px; }
.leaflet-control-attribution a { color: var(--muted) !important; }
.map-car {
  width: 28px; height: 28px; display: grid; place-items: center; border-radius: 50%;
  background: var(--accent); color: var(--accent-ink); font-size: 14px;
  box-shadow: 0 0 0 6px rgba(245, 165, 36, 0.25);
}
.map-poi {
  width: 26px; height: 26px; display: grid; place-items: center; border-radius: 50%;
  border: 2px solid var(--accent); background: #1f2a37; color: var(--accent); font-size: 13px;
}
.map-service {
  width: 26px; height: 26px; display: grid; place-items: center; border-radius: 8px;
  border: 1px solid var(--line); background: #1f2a37; font-size: 14px;
}
```

- [ ] **Step 4: Проверить сборку и вживую**

Run: `npm run build` → Expected: без ошибок.
В браузерной панели (сервер `audiogid` уже запущен, перезагрузить страницу):
1. Скриншот: тёмная карта, янтарная линия маршрута, машина в Новомосковске, звёзды объектов и значки сервисов.
2. «▶ Старт», ×30, подождать 5 с, скриншот — машина сдвинулась, пройденная часть серая, карта следует за машиной.
3. `read_console_messages` с `onlyErrors: true` — ошибок нет.

- [ ] **Step 5: Commit**

```powershell
git add src/ui/MapView.tsx src/ui/App.tsx src/ui/styles.css
git commit -m "feat(ui): Leaflet map with route, passed part, places and following car" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Экраны телефона — гид, предупреждение, сервисы, голос, итоги

**Files:**
- Create: `src/ui/GuideCard.tsx`, `src/ui/AlertBanner.tsx`, `src/ui/ServiceSheet.tsx`, `src/ui/VoiceBar.tsx`, `src/ui/TripSummary.tsx`
- Modify: `src/ui/App.tsx` (итоговая версия), `src/ui/styles.css` (дописать раздел)

**Interfaces:**
- Consumes: `useTrip`, `useStore`, `useUi` (Task 11); `TRIP_DATA` (Task 4); `GuideMode` (Task 5); `ServiceKind` (Task 4); `fmtDuration` (Task 1); `sttSupported`, `listenOnce` (Task 10); команды движка `skipGuide`, `chooseDetour`, `chooseStraight`, `bookService`, `dismissOffer`, `handleText` (Task 9); `store.resetTrip()`.
- Produces: компоненты, каждый сам решает, показываться ли (возвращает `null`, если нечего показать).

- [ ] **Step 1: Создать `src/ui/GuideCard.tsx`**

```tsx
import { TRIP_DATA } from '../data';
import type { GuideMode } from '../engine/guide';
import { useStore, useTrip, useUi } from '../store/tripStore';

const MODE_LABEL: Record<GuideMode, string> = {
  greeting: 'Аудиогид',
  short: 'В пути',
  detailed: 'Подробно',
  answer: 'Ответ',
  notice: 'Подсказка',
};

export function GuideCard() {
  const s = useTrip();
  const ui = useUi();
  const store = useStore();
  const cur = s.guide.current;

  if (!cur) {
    return (
      <section className="guide guide-idle">
        {s.status === 'idle' ? 'Нажмите «Старт» на панели ведущего' : 'Слушаю дорогу…'}
      </section>
    );
  }

  const poi = cur.poiId ? TRIP_DATA.pois.find((p) => p.id === cur.poiId) : undefined;
  const muted = !ui.ttsAvailable ? 'озвучка недоступна' : !ui.ttsEnabled ? 'без звука' : null;

  return (
    <section className={`guide guide-${cur.mode}`}>
      <div className="guide-head">
        <span className="guide-mode">{MODE_LABEL[cur.mode]}</span>
        <h3 className="guide-title">{cur.title}</h3>
        {muted && <span className="guide-muted">{muted}</span>}
        <button className="guide-skip" onClick={() => store.act((e) => e.skipGuide())} aria-label="Пропустить">⏭</button>
      </div>
      <p className="guide-text">{cur.text}</p>
      {poi?.placeholder && <p className="guide-note">Текст-заглушка — будет заменён.</p>}
      {s.guide.queue.length > 0 && <p className="guide-queue">Далее: {s.guide.queue.map((q) => q.title).join(' · ')}</p>}
    </section>
  );
}
```

- [ ] **Step 2: Создать `src/ui/AlertBanner.tsx`**

```tsx
import { useStore, useTrip } from '../store/tripStore';

export function AlertBanner() {
  const s = useTrip();
  const store = useStore();
  const i = s.incident;
  if (i.status !== 'warning') return null;

  return (
    <div className="alert" role="alert">
      <div className="alert-title">⚠ {i.title}</div>
      <div className="alert-source">Источник: {i.source}</div>
      <div className="alert-options">
        {i.canDetour && (
          <button className="option option-best" onClick={() => store.act((e) => e.chooseDetour())}>
            <b>Объезд с открытиями</b>
            <span>+{i.extraMin} мин · +{i.extraKm} км</span>
            <span>По пути: {i.detourPoiNames.join(', ')}</span>
          </button>
        )}
        <button className="option" onClick={() => store.act((e) => e.chooseStraight())}>
          <b>Прямо по Р-132</b>
          <span>+{i.delayMin} мин в заторе</span>
        </button>
      </div>
      {!i.canDetour && <p className="alert-note">Съезд на объезд уже пройден.</p>}
    </div>
  );
}
```

- [ ] **Step 3: Создать `src/ui/ServiceSheet.tsx`**

```tsx
import type { ServiceKind } from '../data/types';
import { useStore, useTrip } from '../store/tripStore';

const ACTION: Record<ServiceKind, string> = {
  cafe: 'Предзаказ',
  hotel: 'Забронировать',
  autoservice: 'Проложить маршрут',
  pharmacy: 'Проложить маршрут',
};

export function ServiceSheet() {
  const s = useTrip();
  const store = useStore();
  const offer = s.offer;
  if (!offer) return null;

  return (
    <div className="sheet">
      <div className="sheet-head">
        <p className="sheet-msg">{offer.message}</p>
        <button className="sheet-close" onClick={() => store.act((e) => e.dismissOffer())} aria-label="Закрыть">✕</button>
      </div>
      <ul className="sheet-list">
        {offer.items.map(({ service: sv, aheadKm }) => {
          const done = s.booked.includes(sv.id);
          const meta = [
            `через ${Math.round(aheadKm)} км`,
            sv.details.hours,
            sv.kind === 'hotel' ? `свободно номеров: ${sv.details.freeRooms ?? 0}` : undefined,
            sv.details.pricePerNight ? `${sv.details.pricePerNight} ₽/ночь` : undefined,
          ].filter(Boolean);
          return (
            <li key={sv.id} className="svc">
              <div className="svc-top">
                <span className="svc-name">{sv.name}</span>
                <span className="svc-rating">★ {sv.rating.toFixed(1)}</span>
              </div>
              <div className="svc-meta">{meta.join(' · ')}</div>
              {sv.details.menu && (
                <div className="svc-menu">{sv.details.menu.map((m) => `${m.name} — ${m.price} ₽`).join(' · ')}</div>
              )}
              <button className="btn btn-small" disabled={done} onClick={() => store.act((e) => e.bookService(sv.id))}>
                {done ? 'Готово (демо) ✓' : ACTION[sv.kind]}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Создать `src/ui/VoiceBar.tsx`**

```tsx
import { useRef, useState } from 'react';
import { listenOnce, sttSupported } from '../speech/stt';
import { useStore, useTrip } from '../store/tripStore';

export function VoiceBar() {
  const s = useTrip();
  const store = useStore();
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const stopListening = useRef<(() => void) | null>(null);

  const send = (value: string) => {
    const t = value.trim();
    if (!t) return;
    setHint(null);
    store.act((e) => e.handleText(t));
    setText('');
  };

  const toggleMic = () => {
    if (listening) {
      stopListening.current?.();
      return;
    }
    setHint(null);
    setListening(true);
    stopListening.current = listenOnce({
      onText: send,
      onError: setHint,
      onEnd: () => setListening(false),
    });
  };

  const reply = hint ?? s.lastReply;

  return (
    <div className="voice">
      {reply && <p className="voice-reply">{reply}</p>}
      <form
        className="voice-row"
        onSubmit={(ev) => {
          ev.preventDefault();
          send(text);
        }}
      >
        {sttSupported() && (
          <button type="button" className={`voice-mic ${listening ? 'is-on' : ''}`} onClick={toggleMic} aria-label="Голосовой ввод">
            🎤
          </button>
        )}
        <input
          className="voice-input"
          value={text}
          onChange={(ev) => setText(ev.target.value)}
          placeholder="«Расскажи про Тулу», «Найди кафе»"
        />
        <button className="voice-send" type="submit" aria-label="Отправить">➤</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Создать `src/ui/TripSummary.tsx`**

```tsx
import { fmtDuration } from '../engine/format';
import { useStore, useTrip } from '../store/tripStore';

export function TripSummary() {
  const s = useTrip();
  const store = useStore();
  if (s.status !== 'arrived') return null;

  return (
    <div className="summary">
      <h2>Вы прибыли!</h2>
      <ul>
        <li><b>{Math.round(s.distanceKm)}</b>км</li>
        <li><b>{s.stats.stories}</b>историй</li>
        <li><b>{s.stats.services}</b>сервисов</li>
        <li><b>{s.stats.detours}</b>объездов</li>
      </ul>
      <p>В пути: {fmtDuration(s.tripMin)}</p>
      <button className="btn btn-primary" onClick={() => store.resetTrip()}>Проехать заново</button>
    </div>
  );
}
```

- [ ] **Step 6: Итоговый `src/ui/App.tsx`**

```tsx
import { AlertBanner } from './AlertBanner';
import { DirectorPanel } from './DirectorPanel';
import { GuideCard } from './GuideCard';
import { MapView } from './MapView';
import { PhoneFrame } from './PhoneFrame';
import { ServiceSheet } from './ServiceSheet';
import { TopBar } from './TopBar';
import { TripSummary } from './TripSummary';
import { VoiceBar } from './VoiceBar';

export function App() {
  return (
    <div className="stage">
      <PhoneFrame>
        <TopBar />
        <MapView />
        <GuideCard />
        <VoiceBar />
        <ServiceSheet />
        <AlertBanner />
        <TripSummary />
      </PhoneFrame>
      <DirectorPanel />
    </div>
  );
}
```

- [ ] **Step 7: Дописать в конец `src/ui/styles.css`**

```css
/* Карточка гида */
.guide { z-index: 500; max-height: 34%; overflow: auto; padding: 12px 16px; border-top: 1px solid var(--line); background: var(--panel); }
.guide-idle { font-size: 14px; color: var(--muted); }
.guide-head { display: flex; align-items: center; gap: 8px; }
.guide-mode {
  flex-shrink: 0; padding: 2px 8px; border-radius: 999px; background: var(--panel-2);
  color: var(--accent); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em;
}
.guide-detailed .guide-mode { background: var(--accent); color: var(--accent-ink); }
.guide-notice .guide-mode { color: var(--ok); }
.guide-title { flex: 1; min-width: 0; margin: 0; font-size: 16px; }
.guide-muted { font-size: 11px; color: var(--muted); }
.guide-skip { border: 0; background: none; font-size: 16px; color: var(--muted); }
.guide-text { margin: 8px 0 0; font-size: 14px; line-height: 1.5; }
.guide-note, .guide-queue { margin: 6px 0 0; font-size: 12px; color: var(--muted); }

/* Оверлеи поверх карты */
.alert, .sheet, .summary {
  position: absolute; top: var(--overlay-top); left: 12px; right: 12px;
  padding: 12px; border-radius: var(--radius); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}
.alert { z-index: 900; border: 1px solid var(--danger); background: #2a1414; }
.alert-title { font-weight: 700; color: var(--danger); }
.alert-source { margin: 4px 0 10px; font-size: 12px; color: var(--muted); }
.alert-options { display: grid; gap: 8px; }
.option {
  display: flex; flex-direction: column; gap: 2px; padding: 10px; text-align: left;
  border: 1px solid var(--line); border-radius: 10px; background: var(--panel-2); font-size: 13px;
}
.option b { font-size: 14px; }
.option-best { border-color: var(--ok); }
.option-best b { color: var(--ok); }
.alert-note { margin: 8px 0 0; font-size: 12px; color: var(--muted); }

.sheet { z-index: 800; max-height: 55%; overflow: auto; border: 1px solid var(--line); background: var(--panel); }
.sheet-head { display: flex; align-items: flex-start; gap: 8px; }
.sheet-msg { flex: 1; margin: 0; font-size: 14px; line-height: 1.4; }
.sheet-close { border: 0; background: none; font-size: 16px; color: var(--muted); }
.sheet-list { display: grid; gap: 8px; margin: 10px 0 0; padding: 0; list-style: none; }
.svc { display: grid; gap: 4px; padding: 10px; border-radius: 10px; background: var(--panel-2); }
.svc-top { display: flex; justify-content: space-between; gap: 8px; }
.svc-name { font-size: 14px; font-weight: 600; }
.svc-rating { font-size: 13px; color: var(--accent); }
.svc-meta, .svc-menu { font-size: 12px; color: var(--muted); }
.svc .btn { justify-self: start; }

.summary { z-index: 950; padding: 16px; border: 1px solid var(--accent); background: var(--panel); text-align: center; }
.summary h2 { margin: 0 0 10px; }
.summary ul { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 0 0 8px; padding: 0; list-style: none; font-size: 12px; color: var(--muted); }
.summary b { display: block; font-size: 20px; color: var(--text); }
.summary p { font-size: 13px; color: var(--muted); }

/* Голосовой ввод */
.voice { z-index: 500; padding: 8px 12px 20px; background: var(--panel); }
.voice-reply { margin: 0 0 6px; font-size: 12px; color: var(--accent); }
.voice-row { display: flex; gap: 6px; }
.voice-input {
  flex: 1; min-width: 0; padding: 9px 14px; border: 1px solid var(--line); border-radius: 999px;
  background: var(--panel-2); color: var(--text); font: inherit; font-size: 13px;
}
.voice-input:focus { outline: none; border-color: var(--accent); }
.voice-mic, .voice-send { flex-shrink: 0; width: 38px; height: 38px; border: 1px solid var(--line); border-radius: 50%; background: var(--panel-2); }
.voice-mic.is-on { border-color: var(--danger); background: var(--danger); animation: pulse 1s infinite; }
@keyframes pulse { 50% { box-shadow: 0 0 0 6px rgba(255, 107, 94, 0.3); } }
```

- [ ] **Step 8: Проверить сборку и каждый экран вживую**

Run: `npm run build` → Expected: без ошибок.
В браузерной панели (перезагрузить страницу):
1. До старта карточка гида: «Нажмите «Старт» на панели ведущего».
2. «▶ Старт» → карточка «Аудиогид» с текстом приветствия; через время — «В пути · Новомосковск».
3. В поле ввода «Найди кафе» + Enter → шторка с кафе, ответ над полем; «Предзаказ» → «Готово (демо) ✓»; «✕» закрывает шторку.
4. «⚠ ДТП впереди» (до 59 км) → красный баннер с двумя вариантами; машина стоит; «Объезд с открытиями» → баннер исчез, серый пунктир старого маршрута, янтарный новый через Алексин.
5. В поле ввода «Расскажи про усадьбу Толмачёвых» → карточка «Ответ · Усадьба Толмачёвых» и пометка «Текст-заглушка — будет заменён.».
6. `read_console_messages` с `onlyErrors: true` — ошибок нет.

- [ ] **Step 9: Commit**

```powershell
git add src/ui
git commit -m "feat(ui): guide card, incident banner, service sheet, voice bar and trip summary" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Полный прогон сценария, README

**Files:**
- Create: `README.md`
- Modify: только если прогон выявил ошибки (исправления — отдельными коммитами с тестом, если ошибка в движке)

**Interfaces:**
- Consumes: всё приложение.
- Produces: проверенный сценарий показа и инструкция запуска.

- [ ] **Step 1: Прогнать все проверки**

Run: `npm test` → Expected: PASS, все файлы.
Run: `npm run build` → Expected: без ошибок, `dist/` создан.

- [ ] **Step 2: Пройти сценарий показа целиком во встроенном браузере**

Перезагрузить страницу `audiogid`, скорость ×20. Для каждого шага сделать скриншот и `get_page_text`:
1. «▶ Старт» → приветствие, затем «В пути · Новомосковск».
2. «🍽 Голод» на 10–40 км → «Чайная «Самовар и пряник»» в списке; «Предзаказ» → «Готово (демо) ✓».
3. На ~45 км само появляется «ДТП на Р-132 у Алешни», машина стоит; «Объезд с открытиями» (+21 мин · +31 км).
4. Около Тулы (~58 км) — «В пути · Тульский кремль»; «🅿 Остановиться», 3 с → «Подробно · Тульский кремль».
5. «🚗 Поехать» → позже «Алексин», затем «Ока».
6. Ввести «Расскажи про усадьбу Толмачёвых» → «Ответ · Усадьба Толмачёвых».
7. «😴 Усталость» → «Апарт-отель «Ока-Сити»» в списке, «Гостиница «Каменный мост»» (0 номеров) — нет.
8. Дождаться прибытия → «Вы прибыли!», ≈ 199 км, историй ≥ 7, сервисов 1, объездов 1; карточка «Подробно · Усадьба Толмачёвых».
9. «Проехать заново» → «11:30», «168 км».
10. Повторить шаги 1–3 с выбором «Прямо по Р-132» → в верхней полосе время растёт на 35 мин; после 92 км баннера нет, время согласуется.
11. `resize_window` preset `mobile` → рамки нет, панель ведущего — шторка снизу, открывается по нажатию; вернуть `desktop`.
12. `read_console_messages` с `onlyErrors: true` — ошибок нет.

Если какой-то шаг не совпадает с ожидаемым — остановиться, применить superpowers:systematic-debugging; для ошибки в движке сначала добавить падающий тест в соответствующий `*.test.ts`.

- [ ] **Step 3: Создать `README.md`**

````markdown
# Аудиогид — демо-прототип

Интеллектуальный помощник для автопутешествий: симуляция поездки Новомосковск → Тула → Калуга
с контекстным аудиогидом, предиктивными сервисами, предупреждением о ДТП с объездом и голосовыми командами.

## Запуск

Нужен Node.js 20+.

```powershell
npm install
npm run dev
```

Откройте http://localhost:5173 в Chrome (лучше всего работают озвучка и распознавание речи).

## Как показывать

Справа от телефона — панель ведущего со сценарием из 8 шагов. Скорость симуляции ×1…×30
(по умолчанию ×20: вся поездка — около 6 минут). Команды можно говорить в микрофон 🎤 или вводить текстом:
«Расскажи про Тулу», «Найди кафе», «Что впереди», «Пауза», «Поехали».

## Что важно знать

- Все кафе, отели, автосервисы и аптеки вымышленные, бронирования ничего не делают (демо).
- Тексты об объектах написаны по общеизвестным фактам и помечены `needsFactCheck` в `src/data/pois.ts`.
- Текст и координаты усадьбы Толмачёвых — заглушка (`placeholder: true`), их нужно заменить.
- Геометрия дорог скачана из OSRM (`npm run fetch-routes`) и лежит в `src/data/routes.json`.

## Разработка

```powershell
npm test          # тесты движка и данных
npm run build     # проверка типов и сборка в dist/
```

Спецификация: `docs/superpowers/specs/2026-09-24-audiogid-demo-design.md`.
````

- [ ] **Step 4: Commit**

```powershell
git add README.md
git commit -m "docs: README with run and demo instructions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

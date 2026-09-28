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

function makeData(incident: Partial<Incident> = {}, extraPois: Poi[] = []): TripData {
  return {
    routes: { main: MAIN, detour: DETOUR },
    branchKm: 33,
    pois: [
      ...extraPois,
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

  it('tells the last story in detail even if the stop comes a few km after the object', () => {
    const e = new TripEngine(makeData());
    e.start();
    driveTo(e, 4.5);
    e.skipGuide();
    expect(e.getState().guide.current?.key).toBe('a:short');
    driveTo(e, 9.5); // 3.9 км после «Тулы» — дальше радиуса 3 км
    e.stop();
    for (let i = 0; i < 3; i++) e.tick(1000);
    expect(e.getState().guide.current?.key).toBe('a:detailed');
  });

  it('tells only one detailed story per stop', () => {
    const e = new TripEngine(makeData({}, [poi('a2', 'Соседний объект', [], [0, 0.06], ['main', 'detour'])]));
    e.start();
    driveTo(e, 6.1);
    e.stop();
    for (let i = 0; i < 6; i++) e.tick(1000);
    const detailed = e.getState().guide.seen.filter((k) => k.endsWith(':detailed'));
    expect(detailed).toHaveLength(1);
  });

  it('keeps the destination story for the arrival even after a stop near the finish', () => {
    const e = new TripEngine(makeData(NO_INCIDENT));
    e.start();
    driveTo(e, makePolyline(MAIN).totalKm - 1);
    e.stop();
    for (let i = 0; i < 4; i++) e.tick(1000);
    expect(e.getState().guide.seen).not.toContain('dest:detailed');
    e.drive();
    driveTo(e, 500);
    const s = e.getState();
    expect([s.guide.current?.key, ...s.guide.queue.map((q) => q.key)]).toContain('dest:detailed');
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

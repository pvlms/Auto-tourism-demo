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
/** На ×20 машина уезжает за 3-км радиус, пока звучит рассказ: остановка всё равно продолжает его тему. */
export const RECENT_STORY_KM = 10;
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
  private lastStoryPoiId: string | null = null;
  private detailedThisStop = false;
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
    this.detailedThisStop = false;
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
    this.lastStoryPoiId = null;
    this.detailedThisStop = false;
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
    if (started && cur.poiId && cur.mode !== 'detailed') this.lastStoryPoiId = cur.poiId;
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

  /** Один подробный рассказ на остановку: о том, что только что звучало, иначе о ближайшем объекте. */
  private checkDetailed() {
    if (this.detailedThisStop) return;
    const s = this.s;
    const pois = this.poisOn[s.routeId];
    const recent = pois.find((p) => p.poi.id === this.lastStoryPoiId);
    const recentFits =
      recent !== undefined &&
      !recent.poi.isDestination &&
      Math.abs(recent.km - s.distanceKm) <= RECENT_STORY_KM &&
      !s.guide.seen.includes(`${recent.poi.id}:detailed`);
    const p = recentFits ? recent : detailedDue(pois, s.distanceKm, s.guide.seen);
    if (!p) return;
    this.detailedThisStop = true;
    this.guide((g) => enqueue(g, itemFor(p.poi, 'detailed')));
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

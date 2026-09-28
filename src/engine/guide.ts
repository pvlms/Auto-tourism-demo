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
/** Ответ на вопрос водителя прерывает короткие рассказы; подсказки ничего не прерывают. */
const ANSWER_INTERRUPTS: GuideMode[] = ['greeting', 'short', 'notice'];

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
  if (supersedes(g.current) || (item.mode === 'answer' && ANSWER_INTERRUPTS.includes(g.current.mode))) {
    return { current: item, queue, seen };
  }
  if (item.mode === 'answer') return { current: g.current, queue: [item, ...queue], seen };
  if (item.mode === 'notice') {
    // Подсказки — после уже ждущих ответов и подсказок, но перед рассказами.
    const firstStory = queue.findIndex((q) => !PRIORITY.includes(q.mode));
    const at = firstStory === -1 ? queue.length : firstStory;
    return { current: g.current, queue: [...queue.slice(0, at), item, ...queue.slice(at)], seen };
  }
  return { current: g.current, queue: [...queue, item], seen };
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
    .filter(
      (p) => !p.poi.isDestination && Math.abs(p.km - km) <= DETAILED_RADIUS_KM && !seen.includes(`${p.poi.id}:detailed`),
    )
    .sort((a, b) => Math.abs(a.km - km) - Math.abs(b.km - km));
  return near[0] ?? null;
}

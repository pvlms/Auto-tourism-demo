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

  it('lets the greeting finish before a notice', () => {
    let g = enqueue(initialGuide(), item('greeting', 'greeting'));
    g = enqueue(g, itemFor(poi('a'), 'short'));
    g = enqueue(g, item('notice:1', 'notice'));
    expect(g.current?.key).toBe('greeting');
    expect(g.queue.map((q) => q.key)).toEqual(['notice:1', 'a:short']);
  });

  it('never cuts a short story with a notice', () => {
    let g = enqueue(initialGuide(), itemFor(poi('a'), 'short'));
    g = enqueue(g, item('notice:1', 'notice'));
    expect(g.current?.key).toBe('a:short');
    expect(g.queue.map((q) => q.key)).toEqual(['notice:1']);
  });

  it('keeps notices in arrival order', () => {
    let g = enqueue(initialGuide(), itemFor(poi('a'), 'detailed'));
    g = enqueue(g, item('notice:1', 'notice'));
    g = enqueue(g, item('notice:2', 'notice'));
    expect(g.queue.map((q) => q.key)).toEqual(['notice:1', 'notice:2']);
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

  it('leaves the destination to the arrival', () => {
    expect(detailedDue([on('dest', 10, { isDestination: true })], 10, [])).toBeNull();
  });
});

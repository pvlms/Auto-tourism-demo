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

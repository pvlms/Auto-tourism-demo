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

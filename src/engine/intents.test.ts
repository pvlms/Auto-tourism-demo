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
    expect(p('Расскажи про Оку')).toEqual({ type: 'tell', poiId: 'oka' });
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
    expect(p('где стоянка')).toEqual({ type: 'unknown' });
    expect(p('хочу крем')).toEqual({ type: 'unknown' });
    expect(p('расскажи про океан')).toEqual({ type: 'tell', poiId: null });
    expect(p('какие сервисы есть в приложении')).toEqual({ type: 'unknown' });
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

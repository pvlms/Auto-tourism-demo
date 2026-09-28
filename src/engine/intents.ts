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
  ['autoservice', ['автосервис', 'шиномонтаж', 'ремонт', 'запчаст']],
  ['pharmacy', ['аптек', 'лекарств']],
];
// Опечатки допускаем только в длинных названиях: короткие стемы («кремл», «стояни») ловят обычные слова.
const FUZZY_MIN_STEM = 7;
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

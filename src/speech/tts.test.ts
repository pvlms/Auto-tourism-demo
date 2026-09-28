import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasRussianVoice, initTts, splitSentences } from './tts';

describe('initTts', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reports a Russian voice that is available right away', () => {
    vi.stubGlobal('window', {
      speechSynthesis: {
        getVoices: () => [{ lang: 'ru-RU', name: 'Google русский' }],
        addEventListener: () => {},
        cancel: () => {},
        speak: () => {},
      },
    });
    const onChange = vi.fn();
    initTts(onChange);
    expect(hasRussianVoice()).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

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

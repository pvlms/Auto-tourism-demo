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

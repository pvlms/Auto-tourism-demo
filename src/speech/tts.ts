const CHARS_PER_SECOND = 14;
const MIN_SILENT_MS = 2000;

let enabled = true;
let voice: SpeechSynthesisVoice | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let token = 0;
// Chrome теряет onend у фраз, которые собрал сборщик мусора, — держим ссылки до конца озвучки.
let pending: SpeechSynthesisUtterance[] = [];

export function splitSentences(text: string): string[] {
  return (text.match(/[^.!?…]+[.!?…]*/g) ?? []).map((s) => s.trim()).filter(Boolean);
}

export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (!ttsSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang === 'ru-RU' && /google/i.test(v.name)) ??
    voices.find((v) => v.lang.toLowerCase().startsWith('ru')) ??
    null
  );
}

export function initTts(onChange: () => void) {
  if (!ttsSupported()) return;
  voice = pickVoice();
  onChange(); // голоса могут быть доступны сразу, без события voiceschanged
  window.speechSynthesis.addEventListener('voiceschanged', () => {
    voice = pickVoice();
    onChange();
  });
}

export const hasRussianVoice = () => voice !== null;
export const isTtsEnabled = () => enabled;

export function setTtsEnabled(on: boolean) {
  enabled = on;
  if (!on) cancel();
}

export function cancel() {
  token++;
  if (timer) clearTimeout(timer);
  timer = undefined;
  if (ttsSupported()) window.speechSynthesis.cancel();
  pending = [];
}

export function speak(text: string, onEnd: () => void) {
  cancel();
  const mine = token;
  const finish = () => {
    if (mine !== token) return;
    pending = [];
    onEnd();
  };
  const parts = splitSentences(text);
  if (!enabled || !voice || parts.length === 0) {
    timer = setTimeout(finish, Math.max(MIN_SILENT_MS, (text.length / CHARS_PER_SECOND) * 1000));
    return;
  }
  parts.forEach((part, i) => {
    const u = new SpeechSynthesisUtterance(part);
    u.voice = voice;
    u.lang = 'ru-RU';
    u.rate = 1.05;
    if (i === parts.length - 1) {
      u.onend = finish;
      u.onerror = finish;
    }
    pending.push(u);
    window.speechSynthesis.speak(u);
  });
}

import { createContext, useContext, useSyncExternalStore } from 'react';
import type { TripEngine, TripState } from '../engine/trip';
import { cancel, hasRussianVoice, isTtsEnabled, setTtsEnabled, speak } from '../speech/tts';

export interface UiState {
  ttsEnabled: boolean;
  ttsAvailable: boolean;
}

export class TripStore {
  private listeners = new Set<() => void>();
  private raf = 0;
  private lastFrame = 0;
  private spokenKey: string | null = null;
  private ui: UiState = { ttsEnabled: isTtsEnabled(), ttsAvailable: hasRussianVoice() };

  constructor(readonly engine: TripEngine) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getState = (): TripState => this.engine.getState();
  getUi = (): UiState => this.ui;

  act<R>(fn: (engine: TripEngine) => R): R {
    const result = fn(this.engine);
    this.changed();
    return result;
  }

  setVoiceEnabled(on: boolean) {
    setTtsEnabled(on);
    this.spokenKey = null; // перечитать текущий рассказ в новом режиме
    this.refreshUi();
    this.changed();
  }

  refreshUi() {
    this.ui = { ttsEnabled: isTtsEnabled(), ttsAvailable: hasRussianVoice() };
    this.emit();
  }

  resetTrip() {
    cancel();
    this.spokenKey = null;
    this.act((e) => e.reset());
  }

  startLoop() {
    const frame = (t: number) => {
      const dt = this.lastFrame ? t - this.lastFrame : 0;
      this.lastFrame = t;
      const before = this.engine.getState();
      this.engine.tick(dt);
      if (this.engine.getState() !== before) this.changed();
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stopLoop() {
    cancelAnimationFrame(this.raf);
    this.lastFrame = 0;
  }

  private changed() {
    this.syncSpeech();
    this.emit();
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  private syncSpeech() {
    const current = this.engine.getState().guide.current;
    const key = current?.key ?? null;
    if (key === this.spokenKey) return;
    this.spokenKey = key;
    if (!current) {
      cancel();
      return;
    }
    speak(current.text, () => this.act((e) => e.guideFinished(current.key)));
  }
}

export const StoreContext = createContext<TripStore | null>(null);

export function useStore(): TripStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('StoreContext is missing');
  return store;
}

export function useTrip(): TripState {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getState);
}

export function useUi(): UiState {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getUi);
}

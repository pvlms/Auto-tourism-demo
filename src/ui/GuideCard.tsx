import { TRIP_DATA } from '../data';
import type { GuideMode } from '../engine/guide';
import { useStore, useTrip, useUi } from '../store/tripStore';

const MODE_LABEL: Record<GuideMode, string> = {
  greeting: 'Аудиогид',
  short: 'В пути',
  detailed: 'Подробно',
  answer: 'Ответ',
  notice: 'Подсказка',
};

export function GuideCard() {
  const s = useTrip();
  const ui = useUi();
  const store = useStore();
  const cur = s.guide.current;

  if (!cur) {
    return (
      <section className="guide guide-idle">
        {s.status === 'idle' ? 'Нажмите «Старт» на панели ведущего' : 'Слушаю дорогу…'}
      </section>
    );
  }

  const poi = cur.poiId ? TRIP_DATA.pois.find((p) => p.id === cur.poiId) : undefined;
  const muted = !ui.ttsAvailable ? 'озвучка недоступна' : !ui.ttsEnabled ? 'без звука' : null;

  return (
    <section className={`guide guide-${cur.mode}`}>
      <div className="guide-head">
        <span className="guide-mode">{MODE_LABEL[cur.mode]}</span>
        <h3 className="guide-title">{cur.title}</h3>
        {muted && <span className="guide-muted">{muted}</span>}
        <button className="guide-skip" onClick={() => store.act((e) => e.skipGuide())} aria-label="Пропустить">⏭</button>
      </div>
      <p className="guide-text">{cur.text}</p>
      {poi?.placeholder && <p className="guide-note">Текст-заглушка — будет заменён.</p>}
      {s.guide.queue.length > 0 && <p className="guide-queue">Далее: {s.guide.queue.map((q) => q.title).join(' · ')}</p>}
    </section>
  );
}

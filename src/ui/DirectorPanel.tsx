import { useState } from 'react';
import { MAX_TIME_SCALE, MIN_TIME_SCALE } from '../engine/trip';
import { useStore, useTrip, useUi } from '../store/tripStore';

const STEPS = [
  '«Старт» — приветствие и рассказ о Новомосковске.',
  '«Голод» — ближайшие кафе впереди (после 20 км — тульская чайная), «Предзаказ».',
  'Подъезд к Туле: само появится предупреждение о ДТП → «Объезд с открытиями».',
  'Тула: рассказ начнётся сам; «Остановиться» → подробный рассказ.',
  '«Поехать» — Алексин и Ока (только на объезде).',
  'Голос или текст: «Расскажи про усадьбу Толмачёвых».',
  '«Усталость» — отели Калуги со свободными номерами.',
  'Прибытие — подробный рассказ и итоги поездки.',
];

export function DirectorPanel() {
  const s = useTrip();
  const ui = useUi();
  const store = useStore();
  const [open, setOpen] = useState(false);
  const running = s.status !== 'idle' && s.status !== 'arrived';

  return (
    <aside className={`director ${open ? 'is-open' : ''}`}>
      <button className="director-toggle" onClick={() => setOpen((o) => !o)}>
        Панель ведущего {open ? '▾' : '▴'}
      </button>
      <div className="director-body">
        <h2>Панель ведущего</h2>

        <div className="director-row">
          {s.status === 'idle' && (
            <button className="btn btn-primary" onClick={() => store.act((e) => e.start())}>▶ Старт</button>
          )}
          {s.status === 'paused' && (
            <button className="btn" onClick={() => store.act((e) => e.resume())}>▶ Продолжить</button>
          )}
          {s.status !== 'idle' && s.status !== 'paused' && (
            <button className="btn" disabled={!running} onClick={() => store.act((e) => e.pause())}>⏸ Пауза</button>
          )}
          {s.status === 'stopped' ? (
            <button className="btn" onClick={() => store.act((e) => e.drive())}>🚗 Поехать</button>
          ) : (
            <button className="btn" disabled={s.status !== 'driving'} onClick={() => store.act((e) => e.stop())}>
              🅿 Остановиться
            </button>
          )}
        </div>

        <label className="director-speed">
          Скорость симуляции: ×{s.timeScale}
          <input
            type="range"
            min={MIN_TIME_SCALE}
            max={MAX_TIME_SCALE}
            value={s.timeScale}
            onChange={(ev) => store.act((e) => e.setTimeScale(Number(ev.target.value)))}
          />
        </label>

        <h3>Ситуации</h3>
        <div className="director-row">
          <button className="btn" disabled={!running} onClick={() => store.act((e) => e.triggerHunger())}>🍽 Голод</button>
          <button className="btn" disabled={!running} onClick={() => store.act((e) => e.triggerFatigue())}>😴 Усталость</button>
          <button className="btn btn-danger" disabled={!running} onClick={() => store.act((e) => e.triggerIncident())}>
            ⚠ ДТП впереди
          </button>
        </div>

        <div className="director-row">
          <button className="btn" onClick={() => store.resetTrip()}>↺ Сброс</button>
          <label className="toggle">
            <input type="checkbox" checked={ui.ttsEnabled} onChange={(ev) => store.setVoiceEnabled(ev.target.checked)} />
            Озвучка
          </label>
        </div>
        {!ui.ttsAvailable && <p className="hint warn">Русский голос недоступен — показываются только субтитры.</p>}

        <h3>Сценарий показа</h3>
        <ol className="steps">
          {STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="hint">Все кафе, отели и бронирования — вымышленные (демо).</p>
      </div>
    </aside>
  );
}

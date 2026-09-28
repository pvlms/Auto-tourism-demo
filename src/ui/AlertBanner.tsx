import { useStore, useTrip } from '../store/tripStore';

export function AlertBanner() {
  const s = useTrip();
  const store = useStore();
  const i = s.incident;
  if (i.status !== 'warning') return null;

  return (
    <div className="alert" role="alert">
      <div className="alert-title">⚠ {i.title}</div>
      <div className="alert-source">Источник: {i.source}</div>
      <div className="alert-options">
        {i.canDetour && (
          <button className="option option-best" onClick={() => store.act((e) => e.chooseDetour())}>
            <b>Объезд с открытиями</b>
            <span>+{i.extraMin} мин · +{i.extraKm} км</span>
            <span>По пути: {i.detourPoiNames.join(', ')}</span>
          </button>
        )}
        <button className="option" onClick={() => store.act((e) => e.chooseStraight())}>
          <b>Прямо по Р-132</b>
          <span>+{i.delayMin} мин в заторе</span>
        </button>
      </div>
      {!i.canDetour && <p className="alert-note">Съезд на объезд уже пройден.</p>}
    </div>
  );
}

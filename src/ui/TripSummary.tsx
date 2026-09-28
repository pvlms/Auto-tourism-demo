import { fmtDuration } from '../engine/format';
import { useStore, useTrip } from '../store/tripStore';

export function TripSummary() {
  const s = useTrip();
  const store = useStore();
  if (s.status !== 'arrived') return null;

  return (
    <div className="summary">
      <h2>Вы прибыли!</h2>
      <ul>
        <li><b>{Math.round(s.distanceKm)}</b>км</li>
        <li><b>{s.stats.stories}</b>историй</li>
        <li><b>{s.stats.services}</b>сервисов</li>
        <li><b>{s.stats.detours}</b>объездов</li>
      </ul>
      <p>В пути: {fmtDuration(s.tripMin)}</p>
      <button className="btn btn-primary" onClick={() => store.resetTrip()}>Проехать заново</button>
    </div>
  );
}

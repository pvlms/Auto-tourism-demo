import { TRIP_DATA } from '../data';
import { fmtClock, fmtDuration } from '../engine/format';
import { useTrip } from '../store/tripStore';

const DESTINATION = TRIP_DATA.pois.find((p) => p.isDestination)?.name ?? 'Финиш';

export function TopBar() {
  const s = useTrip();
  const leftKm = Math.max(0, s.totalKm - s.distanceKm);
  return (
    <header className="topbar">
      <div className="topbar-main">
        <span className="topbar-dest">{DESTINATION}</span>
        <span className="topbar-eta">
          {Math.round(leftKm)} км · {fmtDuration(s.etaMin)}
        </span>
      </div>
      <div className="topbar-side">
        <span className="topbar-speed">{Math.round(s.speedKmh)} км/ч</span>
        <span className="topbar-clock">{fmtClock(s.simClockMin)}</span>
      </div>
    </header>
  );
}

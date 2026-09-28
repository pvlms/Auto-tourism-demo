import type { ServiceKind } from '../data/types';
import { useStore, useTrip } from '../store/tripStore';

const ACTION: Record<ServiceKind, string> = {
  cafe: 'Предзаказ',
  hotel: 'Забронировать',
  autoservice: 'Проложить маршрут',
  pharmacy: 'Проложить маршрут',
};

export function ServiceSheet() {
  const s = useTrip();
  const store = useStore();
  const offer = s.offer;
  if (!offer) return null;

  return (
    <div className="sheet">
      <div className="sheet-head">
        <p className="sheet-msg">{offer.message}</p>
        <button className="sheet-close" onClick={() => store.act((e) => e.dismissOffer())} aria-label="Закрыть">✕</button>
      </div>
      <ul className="sheet-list">
        {offer.items.map(({ service: sv, aheadKm }) => {
          const done = s.booked.includes(sv.id);
          const meta = [
            `через ${Math.round(aheadKm)} км`,
            sv.details.hours,
            sv.kind === 'hotel' ? `свободно номеров: ${sv.details.freeRooms ?? 0}` : undefined,
            sv.details.pricePerNight ? `${sv.details.pricePerNight} ₽/ночь` : undefined,
          ].filter(Boolean);
          return (
            <li key={sv.id} className="svc">
              <div className="svc-top">
                <span className="svc-name">{sv.name}</span>
                <span className="svc-rating">★ {sv.rating.toFixed(1)}</span>
              </div>
              <div className="svc-meta">{meta.join(' · ')}</div>
              {sv.details.menu && (
                <div className="svc-menu">{sv.details.menu.map((m) => `${m.name} — ${m.price} ₽`).join(' · ')}</div>
              )}
              <button className="btn btn-small" disabled={done} onClick={() => store.act((e) => e.bookService(sv.id))}>
                {done ? 'Готово (демо) ✓' : ACTION[sv.kind]}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

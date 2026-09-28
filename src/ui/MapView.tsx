import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef } from 'react';
import { TRIP_DATA } from '../data';
import type { LatLng, ServiceKind } from '../data/types';
import { makePolyline, pointAt } from '../engine/geo';
import { useTrip } from '../store/tripStore';

const SERVICE_ICON: Record<ServiceKind, string> = { cafe: '☕', hotel: '🛏', autoservice: '🔧', pharmacy: '💊' };
const PASSED_REDRAW_KM = 0.5;

const divIcon = (className: string, html: string) =>
  L.divIcon({ className: '', html: `<div class="${className}">${html}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] });

export function MapView() {
  const s = useTrip();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const car = useRef<L.Marker | null>(null);
  const routeLayer = useRef<L.LayerGroup | null>(null);
  const placeLayer = useRef<L.LayerGroup | null>(null);
  const passed = useRef<L.Polyline | null>(null);
  const passedKm = useRef(-Infinity);
  const lines = useMemo(
    () => ({ main: makePolyline(TRIP_DATA.routes.main), detour: makePolyline(TRIP_DATA.routes.detour) }),
    [],
  );

  useEffect(() => {
    const start = TRIP_DATA.routes.main[0];
    const m = L.map(el.current!, { zoomControl: false }).setView(start, 12);
    // Стандартные тайлы OSM без ключа; тёмная тема — CSS-фильтром на .leaflet-tile-pane.
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© участники OpenStreetMap',
    }).addTo(m);
    routeLayer.current = L.layerGroup().addTo(m);
    placeLayer.current = L.layerGroup().addTo(m);
    car.current = L.marker(start, { icon: divIcon('map-car', '▲'), zIndexOffset: 1000 }).addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const routes = routeLayer.current;
    const places = placeLayer.current;
    if (!routes || !places) return;
    routes.clearLayers();
    places.clearLayers();
    if (s.routeId === 'detour') {
      L.polyline(TRIP_DATA.routes.main, { color: '#6b7785', weight: 3, dashArray: '6 8', opacity: 0.7 }).addTo(routes);
    }
    L.polyline(TRIP_DATA.routes[s.routeId], { color: '#f5a524', weight: 5, opacity: 0.9 }).addTo(routes);
    passed.current = L.polyline([], { color: '#3a4450', weight: 6, opacity: 0.95 }).addTo(routes);
    passedKm.current = -Infinity;
    for (const p of TRIP_DATA.pois.filter((x) => x.routes.includes(s.routeId))) {
      L.marker(p.position, { icon: divIcon('map-poi', '★'), title: p.name }).addTo(places);
    }
    for (const sv of TRIP_DATA.services.filter((x) => x.routes.includes(s.routeId))) {
      L.marker(sv.position, { icon: divIcon('map-service', SERVICE_ICON[sv.kind]), title: sv.name }).addTo(places);
    }
  }, [s.routeId]);

  useEffect(() => {
    car.current?.setLatLng(s.position);
    map.current?.panTo(s.position, { animate: false });
    if (passed.current && Math.abs(s.distanceKm - passedKm.current) >= PASSED_REDRAW_KM) {
      passedKm.current = s.distanceKm;
      const line = lines[s.routeId];
      const pts: LatLng[] = [];
      for (let i = 0; i < line.points.length && line.cum[i] <= s.distanceKm; i++) pts.push(line.points[i]);
      pts.push(pointAt(line, s.distanceKm));
      passed.current.setLatLngs(pts);
    }
  }, [s.position, s.distanceKm, s.routeId, lines]);

  return <div ref={el} className="map" />;
}

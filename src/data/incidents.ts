import type { Incident } from './types';

export const INCIDENT: Incident = {
  id: 'p132-accident',
  kind: 'accident',
  title: 'ДТП на Р-132 у Алешни, затор 4 км',
  source: 'ГИБДД · данные водителей · соцсети — проверено ИИ-фильтром',
  positionKm: 92,
  warnAtKm: 45,
  delayMin: 35,
  detourPoiIds: ['aleksin', 'oka'],
};

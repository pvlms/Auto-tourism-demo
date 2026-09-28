import type { Service } from './types';

// Все сервисы вымышленные (демо). Координаты — точки самих маршрутов.
export const SERVICES: Service[] = [
  {
    id: 's-cafe-don', kind: 'cafe', name: 'Кафе «Донской исток»', position: [54.0506, 38.1922], routes: ['main', 'detour'], rating: 4.4,
    details: { hours: '08:00–22:00', menu: [{ name: 'Солянка', price: 290 }, { name: 'Пельмени домашние', price: 350 }, { name: 'Морс', price: 90 }] },
  },
  {
    id: 's-cafe-samovar', kind: 'cafe', name: 'Чайная «Самовар и пряник»', position: [54.1289, 37.6812], routes: ['main', 'detour'], rating: 4.8,
    details: { hours: '09:00–21:00', menu: [{ name: 'Тульский пряник', price: 150 }, { name: 'Чай из самовара', price: 120 }, { name: 'Блины с творогом', price: 260 }] },
  },
  {
    id: 's-cafe-zaseka', kind: 'cafe', name: 'Придорожное кафе «Засека»', position: [54.273, 37.2585], routes: ['main'], rating: 4.2,
    details: { hours: 'круглосуточно', menu: [{ name: 'Борщ', price: 280 }, { name: 'Котлета с пюре', price: 340 }, { name: 'Компот', price: 80 }] },
  },
  {
    id: 's-cafe-zastava', kind: 'cafe', name: 'Трактир «Калужская застава»', position: [54.3722, 36.6715], routes: ['main'], rating: 4.6,
    details: { hours: '10:00–23:00', menu: [{ name: 'Щи суточные', price: 300 }, { name: 'Жаркое в горшочке', price: 450 }, { name: 'Квас', price: 100 }] },
  },
  {
    id: 's-cafe-zaokskaya', kind: 'cafe', name: 'Блинная «Заокская»', position: [54.4748, 37.4725], routes: ['detour'], rating: 4.5,
    details: { hours: '08:00–20:00', menu: [{ name: 'Блины с мясом', price: 280 }, { name: 'Блины со сметаной', price: 180 }, { name: 'Чай', price: 70 }] },
  },
  {
    id: 's-cafe-oka', kind: 'cafe', name: 'Кафе «Окский берег»', position: [54.508, 37.0665], routes: ['detour'], rating: 4.7,
    details: { hours: '11:00–23:00', menu: [{ name: 'Уха', price: 380 }, { name: 'Судак на гриле', price: 520 }, { name: 'Лимонад', price: 150 }] },
  },
  {
    id: 's-hotel-tula', kind: 'hotel', name: 'Гостиница «Оружейная слобода»', position: [54.1953, 37.6162], routes: ['main', 'detour'], rating: 4.5,
    details: { freeRooms: 3, pricePerNight: 4200 },
  },
  {
    id: 's-hotel-zvezdny', kind: 'hotel', name: 'Отель «Звёздный путь»', position: [54.4666, 36.2485], routes: ['main'], rating: 4.7,
    details: { freeRooms: 5, pricePerNight: 5100 },
  },
  {
    id: 's-hotel-most', kind: 'hotel', name: 'Гостиница «Каменный мост»', position: [54.5138, 36.2612], routes: ['main', 'detour'], rating: 4.9,
    details: { freeRooms: 0, pricePerNight: 6300 },
  },
  {
    id: 's-hotel-okacity', kind: 'hotel', name: 'Апарт-отель «Ока-Сити»', position: [54.515, 36.3383], routes: ['detour'], rating: 4.4,
    details: { freeRooms: 2, pricePerNight: 4600 },
  },
  {
    id: 's-auto-levsha', kind: 'autoservice', name: 'Автосервис «Левша»', position: [54.1709, 37.4865], routes: ['main'], rating: 4.3,
    details: { hours: '09:00–21:00' },
  },
  {
    id: 's-auto-zarechye', kind: 'autoservice', name: 'Шиномонтаж «Заречье 24/7»', position: [54.3961, 37.5055], routes: ['detour'], rating: 4.1,
    details: { hours: 'круглосуточно' },
  },
  {
    id: 's-pharm-road', kind: 'pharmacy', name: 'Аптека «Здоровье в пути»', position: [54.0789, 38.0507], routes: ['main', 'detour'], rating: 4.6,
    details: { hours: '08:00–23:00' },
  },
  {
    id: 's-pharm-okskaya', kind: 'pharmacy', name: 'Аптека «Окская»', position: [54.524, 37.1897], routes: ['detour'], rating: 4.5,
    details: { hours: '09:00–21:00' },
  },
];

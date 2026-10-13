import { areas } from '../supabase/functions/_shared/demo-data.ts';
import type { Category, Property, Stay } from '../supabase/functions/_shared/demo-domain.ts';

export const roomTypes = ['Private room', 'Twin sharing', 'Triple sharing', '4 sharing', '5 sharing', '6 sharing'];
export const propertyAmenities = ['Wi-Fi', 'Meals', 'Laundry', 'Power backup', 'Housekeeping', 'Parking', 'Gym', 'Study area', 'Hot water', 'CCTV', 'Lift'];
const stays: Stay[] = ['monthly', 'short', 'day'];
const lines = (value: string) => [...new Set(value.split('\n').map(s => s.trim()).filter(Boolean))];

// Build each listing from owner inputs, never from another property's contents.
export function propertyFromForm(f: FormData, roomKeys: string[], id: string): Property {
  const value = (key: string) => String(f.get(key) ?? '').trim();
  const amount = (key: string, min: number, max: number, fallback?: number) => {
    const raw = value(key);
    const n = raw === '' && fallback !== undefined ? fallback : Number(raw);
    if (raw === '' && fallback === undefined || !Number.isFinite(n) || n < min || n > max)
      throw new Error(`Check ${key.replaceAll('-', ' ')}.`);
    return n;
  };
  const area = value('area');
  if (!areas[area] || area === 'All Hyderabad') throw new Error('Choose a locality.');
  if (!value('name') || !value('address') || !value('description')) throw new Error('Add the property name, address and description.');
  const photos = lines(value('photos'));
  if (photos.length > 8 || photos.some(url => {try {return new URL(url).protocol !== 'https:';} catch {return true;}}))
    throw new Error('Use up to eight HTTPS photo links, one per line.');
  if (!photos.length) photos.push('https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1100&q=85');
  const rules = lines(value('rules'));
  if (!rules.length) throw new Error('Add at least one house rule.');
  const advances = {} as Property['advances'];
  for (const stay of stays) {
    const kind = value(`${stay}-kind`) as 'fixed' | 'percent';
    if (!['fixed', 'percent'].includes(kind)) throw new Error('Choose an advance type.');
    advances[stay] = {kind, value: amount(`${stay}-value`, 0, kind === 'percent' ? 100 : 200000)};
  }
  if (!f.has('overnight') && value('dayEnd') <= value('dayStart')) throw new Error('Check-out must follow check-in, or enable overnight use.');
  const rooms = roomKeys.map((key, index) => {
    const sharing = amount(`${key}-sharing`, 1, 6);
    const capacity = amount(`${key}-capacity`, 1, 500);
    const offline = amount(`${key}-offline`, 0, capacity);
    if (![sharing, capacity, offline].every(Number.isInteger)) throw new Error('Sharing and bed counts must be whole numbers.');
    const offered = stays.filter(s => f.has(`${key}-stay-${s}`));
    if (!offered.length) throw new Error(`Choose at least one stay type for room option ${index + 1}.`);
    return {id: `${id}-r${index + 1}`, name: roomTypes[sharing - 1], sharing, capacity, offline,
      monthly: amount(`${key}-monthly`, 500, 200000, offered.includes('monthly') ? undefined : 500),
      short: amount(`${key}-short`, 1, 50000, offered.includes('short') ? undefined : 1),
      day: amount(`${key}-day`, 1, 50000, offered.includes('day') ? undefined : 1),
      stays: offered, ac: f.has(`${key}-ac`), ...(value(`${key}-availableFrom`) ? {availableFrom: value(`${key}-availableFrom`)} : {})};
  });
  if (!rooms.length || rooms.length > 20) throw new Error('Add between 1 and 20 room options.');
  return {id, name: value('name'), area, address: value('address'), category: value('category') as Category,
    lat: amount('latitude', -90, 90, areas[area][0]), lng: amount('longitude', -180, 180, areas[area][1]),
    description: value('description'), landmark: value('landmark'), phone: value('phone'),
    image: photos[0], photos, amenities: propertyAmenities.filter(a => f.getAll('amenities').includes(a)), rules,
    deposit: amount('deposit', 0, 1000000), mealPrice: amount('mealPrice', 0, 50000), notice: amount('notice', 0, 365),
    policy: Number(value('policy')), dayStart: value('dayStart'), dayEnd: value('dayEnd'), overnight: f.has('overnight'),
    advances, rooms, verified: false, paused: false, rating: 0, reviews: 0};
}

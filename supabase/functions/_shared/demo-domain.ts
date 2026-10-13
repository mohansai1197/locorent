export type Stay = "monthly" | "short" | "day";
export type Role = "customer" | "owner" | "admin";
export type Category = "Men" | "Women" | "Co-living";
export type Status =
  | "confirmed"
  | "checked-in"
  | "cancelled"
  | "no-show"
  | "completed";
export interface Room {
  id: string;
  name: string;
  sharing: number;
  capacity: number;
  offline: number;
  availableFrom?: string;
  monthly: number;
  short: number;
  day: number;
  stays: Stay[];
  ac: boolean;
}
export interface Property {
  id: string;
  name: string;
  area: string;
  address: string;
  category: Category;
  lat: number;
  lng: number;
  rating: number;
  reviews: number;
  image: string;
  photos: string[];
  description: string;
  amenities: string[];
  landmark: string;
  rules: string[];
  deposit: number;
  mealPrice: number;
  notice: number;
  policy: number;
  dayStart: string;
  dayEnd: string;
  overnight: boolean;
  advances: Record<Stay, { kind: "fixed" | "percent"; value: number }>;
  rooms: Room[];
  verified: boolean;
  paused: boolean;
  pendingEdit?: string;
  phone?: string;
}
export interface Booking {
  id: string;
  customerName?: string;
  customerMobile?: string;
  demoRequestId?: string;
  propertyId: string;
  roomId: string;
  start: string;
  end: string;
  stay: Stay;
  meals: boolean;
  base: number;
  fee: number;
  advance: number;
  total: number;
  due: number;
  code: string;
  status: Status;
  policy: number;
  checkInTime: string;
  payout: "held" | "eligible" | "paid";
  refund: number;
  moveOutRequested?: string;
  moveOutConfirmed?: string;
  changeRequested?: string;
  supportContacted?: boolean;
  review?: { rating: number; text: string };
  created: string;
}
export interface Complaint {
  id: string;
  subject: string;
  message: string;
  bookingId?: string;
  status: "open" | "resolved";
}
export interface Message {
  id: string;
  propertyId: string;
  text: string;
  from: "customer" | "owner";
  time: string;
}
export interface AppState {
  properties: Property[];
  bookings: Booking[];
  favourites: string[];
  complaints: Complaint[];
  messages: Message[];
  feePercent: number;
  feeCap: number;
  session: { role: Role; name: string; mobile?: string } | null;
}
export const stayLabels: Record<Stay, string> = {
  monthly: "Monthly",
  short: "Short stay",
  day: "Day stay",
};
export const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
export function dateISO(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
export function addDays(date: string, count: number) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + count);
  return dateISO(d);
}
export function addMonth(date: string) {
  const d = new Date(`${date}T12:00:00`);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  d.setDate(
    Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()),
  );
  return dateISO(d);
}
export const formatDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
export function nights(start: string, end: string) {
  return Math.round(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
      86400000,
  );
}
export function quote(
  p: Property,
  room: Room,
  stay: Stay,
  start: string,
  end: string,
  meals: boolean,
  percent = 3,
  cap = 299,
) {
  const units = stay === "short" ? Math.max(1, nights(start, end)) : 1;
  const base =
    room[stay] * units +
    (meals
      ? stay === "monthly"
        ? p.mealPrice
        : Math.round(p.mealPrice / 30) * units
      : 0);
  const fee = Math.round(
    stay === "monthly"
      ? Math.min((base * percent) / 100, cap)
      : (base * percent) / 100,
  );
  const rule = p.advances[stay];
  const advance = Math.min(
    base,
    Math.round(rule.kind === "fixed" ? rule.value : (base * rule.value) / 100),
  );
  return {
    base,
    fee,
    advance,
    total: base + fee,
    payNow: advance + fee,
    due: base - advance,
  };
}
export function available(
  room: Room,
  bookings: Booking[],
  start: string,
  end: string,
  requestedStay?: Stay,
) {
  // Monthly residents occupy a bed until their move-out is confirmed.
  const windowEnd = requestedStay === "monthly" ? "9999-12-31" : end;
  const events = new Map<string, number>();
  const add = (date: string, delta: number) =>
    events.set(date, (events.get(date) || 0) + delta);
  if (!room.availableFrom || room.availableFrom > start) {
    add(start, room.offline);
    if (room.availableFrom && room.availableFrom < windowEnd)
      add(room.availableFrom, -room.offline);
  }
  for (const b of bookings) {
    const bookingEnd =
      b.stay === "monthly" ? b.moveOutConfirmed || "9999-12-31" : b.end;
    if (
      b.roomId === room.id &&
      (b.status === "confirmed" || b.status === "checked-in") &&
      b.start < windowEnd &&
      bookingEnd > start
    ) {
      add(b.start > start ? b.start : start, 1);
      if (bookingEnd < windowEnd) add(bookingEnd, -1);
    }
  }
  let occupied = 0;
  let peak = 0;
  for (const [, delta] of [...events].sort(([a], [b]) => a.localeCompare(b))) {
    occupied += delta;
    peak = Math.max(peak, occupied);
  }
  return Math.max(0, room.capacity - peak);
}
export function refundFor(b: Booking, now = new Date()) {
  const hours =
    (Date.parse(`${b.start}T${b.checkInTime}:00+05:30`) - now.getTime()) /
    3600000;
  return b.policy >= 0 && hours >= b.policy ? b.advance : 0;
}
export function distanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
) {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) *
      Math.cos(lat2 * rad) *
      Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

import type { AppState, Property } from "./demo-domain.ts";
import { addDays, addMonth, dateISO } from "./demo-domain.ts";
const imgs = [
  "photo-1522708323590-d24dbb6b0267",
  "photo-1505693416388-ac5ce068fe85",
  "photo-1502672260266-1c1ef2d93688",
  "photo-1560448204-e02f11c3d0e2",
  "photo-1540518614846-7eded433c457",
  "photo-1554995207-c18c203602cb",
];
const img = (n: number) =>
  `https://images.unsplash.com/${imgs[n % imgs.length]}?auto=format&fit=crop&w=1100&q=85`;
export const areas: Record<string, [number, number]> = {
  Gachibowli: [17.4401, 78.3489],
  Madhapur: [17.4483, 78.3915],
  Kondapur: [17.4622, 78.3568],
  Kukatpally: [17.4948, 78.3996],
  Ameerpet: [17.4375, 78.4483],
  Dilsukhnagar: [17.3688, 78.5247],
  "All Hyderabad": [17.4401, 78.3489],
};
const entries: [string, string, Property["category"], number, number][] = [
  ["The Blue Courtyard", "Gachibowli", "Co-living", 8500, 4.8],
  ["Olive House", "Gachibowli", "Women", 7200, 4.7],
  ["The Chapter Living", "Madhapur", "Men", 6800, 4.6],
  ["Northside Residences", "Kondapur", "Co-living", 9400, 4.9],
  ["Aster Women’s PG", "Kukatpally", "Women", 6200, 4.5],
  ["The Study House", "Ameerpet", "Men", 5500, 4.6],
  ["Eastwood PG", "Dilsukhnagar", "Men", 5800, 4.4],
  ["Mira Living", "Madhapur", "Women", 8900, 4.8],
];
export const sampleProperties: Property[] = entries.map(
  ([name, area, category, price, rating], i) => ({
    id: `p${i + 1}`,
    name,
    area,
    address: `${12 + i * 3}, ${area} Main Road, Hyderabad, Telangana`,
    category,
    lat: areas[area][0] + ((i % 3) - 1) * 0.006,
    lng: areas[area][1] + (i % 2 ? 0.007 : -0.004),
    rating,
    reviews: 23 + i * 13,
    image: img(i),
    photos: [img(i), img(i + 1), img(i + 2)],
    description:
      "A thoughtful place to settle in. Bright shared spaces, comfortable beds, and the everyday essentials, close to the places you need to be.",
    amenities: [
      "Wi-Fi",
      "Meals",
      "Laundry",
      "Power backup",
      "Housekeeping",
      ...(i % 2 === 0 ? ["Parking", "Gym"] : ["Study area"]),
    ],
    landmark:
      i === 0
        ? "University of Hyderabad"
        : i === 1
          ? "ISB Hyderabad"
          : i === 2
            ? "HITEC City offices"
            : i === 3
              ? "Botanical Garden"
              : i === 4
                ? "JNTU Hyderabad"
                : i === 5
                  ? "Ameerpet Metro"
                  : "Nearby colleges & workplaces",
    rules: [
      "Government ID required at check-in",
      "Visitors allowed in common areas only",
      "Quiet hours after 10 pm",
      "No smoking in rooms",
    ],
    deposit: price,
    mealPrice: 1800,
    notice: 30,
    policy: [24, 72, 168, -1][i % 4],
    dayStart: "09:00",
    dayEnd: "20:00",
    overnight: false,
    advances: {
      monthly: { kind: "fixed", value: 1000 },
      short: { kind: "percent", value: 25 },
      day: { kind: "percent", value: 50 },
    },
    rooms: [
      {
        id: `p${i + 1}-r1`,
        name: "Twin sharing",
        sharing: 2,
        capacity: 6,
        offline: 2,
        monthly: price,
        short: 650 + i * 40,
        day: 400 + i * 25,
        stays: ["monthly", "short", "day"],
        ac: true,
      },
      {
        id: `p${i + 1}-r2`,
        name: "Triple sharing",
        sharing: 3,
        capacity: 9,
        offline: 5,
        monthly: price - 1500,
        short: 480 + i * 30,
        day: 300 + i * 20,
        stays: ["monthly", "short"],
        ac: false,
      },
      {
        id: `p${i + 1}-r3`,
        name: "Private room",
        sharing: 1,
        capacity: 2,
        offline: 1,
        monthly: price + 5500,
        short: 1100 + i * 50,
        day: 750 + i * 35,
        stays: ["monthly", "short", "day"],
        ac: true,
      },
    ],
    verified: i !== 7,
    paused: false,
  }),
);
export function initialState(): AppState {
  const start = dateISO();
  return {
    properties: structuredClone(sampleProperties),
    bookings: [
      {
        id: "LR-10428",
        propertyId: "p1",
        roomId: "p1-r1",
        start,
        end: addMonth(start),
        stay: "monthly",
        meals: false,
        base: 8500,
        fee: 255,
        advance: 1000,
        total: 8755,
        due: 7500,
        code: "482619",
        status: "checked-in",
        policy: 24,
        checkInTime: "12:00",
        payout: "eligible",
        refund: 0,
        created: new Date().toISOString(),
      },
      {
        id: "LR-10429",
        propertyId: "p3",
        roomId: "p3-r1",
        start: addDays(start, 4),
        end: addDays(start, 7),
        stay: "short",
        meals: true,
        base: 2370,
        fee: 71,
        advance: 593,
        total: 2441,
        due: 1777,
        code: "731205",
        status: "confirmed",
        policy: 168,
        checkInTime: "12:00",
        payout: "held",
        refund: 0,
        created: new Date().toISOString(),
      },
    ],
    favourites: ["p2"],
    complaints: [],
    messages: [],
    feePercent: 3,
    feeCap: 299,
    session: null,
  };
}

import test from "node:test";
import assert from "node:assert/strict";
import { addMonth, available, quote, refundFor } from "../src/domain.ts";
import type { Booking, Property, Room } from "../src/domain.ts";
const room: Room = {
  id: "r1",
  name: "Twin",
  sharing: 2,
  capacity: 3,
  offline: 1,
  monthly: 12000,
  short: 600,
  day: 300,
  stays: ["monthly", "short", "day"],
  ac: true,
};
const p = {
  mealPrice: 1800,
  advances: {
    monthly: { kind: "fixed", value: 1000 },
    short: { kind: "percent", value: 25 },
    day: { kind: "percent", value: 50 },
  },
} as Property;
const b = {
  roomId: "r1",
  status: "checked-in",
  stay: "monthly",
  start: "2026-01-01",
  end: "2026-02-01",
  advance: 1000,
  fee: 240,
  policy: 24,
  checkInTime: "12:00",
} as Booking;
test("calendar monthly stays handle short months and leap years", () => {
  assert.equal(addMonth("2026-01-31"), "2026-02-28");
  assert.equal(addMonth("2028-01-31"), "2028-02-29");
});
test("platform fee capped independently of provider advance", () => {
  const q = quote(p, room, "monthly", "2026-01-01", "2026-02-01", false);
  assert.equal(q.fee, 299);
  assert.equal(q.payNow, 1299);
  assert.equal(q.due, 11000);
  assert.equal(q.total, q.payNow + q.due);
});
test("monthly occupancy continues until confirmed move-out", () => {
  assert.equal(available(room, [b], "2026-04-01", "2026-04-02"), 1);
  assert.equal(
    available(
      room,
      [{ ...b, moveOutRequested: "2026-02-01" }],
      "2026-04-01",
      "2026-04-02",
    ),
    1,
  );
  assert.equal(
    available(
      room,
      [{ ...b, moveOutConfirmed: "2026-02-01" }],
      "2026-04-01",
      "2026-04-02",
    ),
    2,
  );
});
test("cancelled bookings and expired short stays do not block inventory", () => {
  assert.equal(
    available(
      room,
      [{ ...b, status: "cancelled" }],
      "2026-01-01",
      "2026-01-02",
    ),
    2,
  );
  assert.equal(
    available(room, [{ ...b, stay: "short" }], "2026-02-01", "2026-02-02"),
    2,
  );
});
test("cancellation refunds advance only and observes cutoff", () => {
  assert.equal(refundFor(b, new Date("2025-12-30T00:00:00Z")), 1000);
  assert.equal(refundFor(b, new Date("2026-01-01T00:00:00Z")), 0);
  assert.equal(
    refundFor({ ...b, policy: -1 }, new Date("2025-12-30T00:00:00Z")),
    0,
  );
});
test("advance cannot exceed stay price; meals priced by stay length", () => {
  const q = quote(p, room, "short", "2026-01-01", "2026-01-03", true);
  assert.equal(q.base, 1320);
  assert.equal(q.advance, 330);
  assert.equal(q.fee, 40);
});

test("availability uses peak concurrent occupancy, not all reservations in window", () => {
  const short = { ...b, stay: "short" as const };
  assert.equal(
    available(
      room,
      [
        { ...short, start: "2026-01-01", end: "2026-01-03" },
        { ...short, start: "2026-01-03", end: "2026-01-05" },
      ],
      "2026-01-01",
      "2026-01-06",
    ),
    1,
  );
});
test("monthly requests account for future reservations and offline releases", () => {
  const full = { ...room, capacity: 1, offline: 0 };
  const future = {
    ...b,
    stay: "short" as const,
    start: "2026-06-01",
    end: "2026-06-03",
  };
  assert.equal(
    available(full, [future], "2026-04-01", "2026-05-01", "monthly"),
    0,
  );
  assert.equal(
    available(
      { ...full, offline: 1, availableFrom: "2026-03-31" },
      [],
      "2026-04-01",
      "2026-05-01",
      "monthly",
    ),
    1,
  );
});

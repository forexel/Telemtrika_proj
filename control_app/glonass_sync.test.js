import test from "node:test";
import assert from "node:assert/strict";
import { analyzeDay, clipEventToWindow, movementEvents } from "./glonass_sync.js";

const dt = value => ({ type: "datetime", v: value });
const event = (typeName, begin, end, distance = 0, from = [56.23023, 37.526005], to = [56.4, 37.7]) => ({
  typeName, dtBeg: dt(begin), dtEnd: dt(end), dtDelta: (Date.parse(end.split(".").reverse().join("-")) || 0), distance,
  latLonBeg: { x: from[0], y: from[1] }, latLonEnd: { x: to[0], y: to[1] },
});

test("uses trips once when GLONASS also returns overlapping movement variants", () => {
  const events = [
    event("Поездка", "07.09.2026 06:12:00", "07.09.2026 06:30:00", 30),
    event("Поездка", "07.09.2026 14:10:00", "07.09.2026 14:34:00", 34, [56.4, 37.7], [56.23023, 37.526005]),
    event("Движение. Двигатель заглушен", "07.09.2026 06:12:00", "07.09.2026 06:30:00", 30),
  ];
  assert.equal(movementEvents(events).length, 2);
  assert.equal(analyzeDay(events).distance, 64);
  assert.ok(analyzeDay(events).departure);
  assert.ok(analyzeDay(events).returned);
});

test("prefers exact movement events over duplicate trip summaries", () => {
  const events = [
    event("Движение", "07.09.2026 06:12:00", "07.09.2026 06:30:00", 15),
    event("Движение", "07.09.2026 06:30:00", "07.09.2026 06:45:00", 15),
    event("Поездка", "07.09.2026 06:12:00", "07.09.2026 06:45:00", 30),
  ];
  assert.deepEqual(movementEvents(events).map(item => item.typeName), ["Движение", "Движение"]);
  assert.equal(analyzeDay(events).distance, 30);
});

test("clips cross-midnight events and apportions distance", () => {
  const source = event("Поездка", "01.09.2026 20:30:00", "01.09.2026 21:30:00", 60);
  const clipped = clipEventToWindow(source, new Date("2026-09-01T21:00:00Z"), new Date("2026-09-02T21:00:00Z"));
  assert.equal(clipped.dtBeg.v, "01.09.2026 21:00:00");
  assert.equal(clipped.dtDelta, 1800);
  assert.equal(clipped.distance, 30);
});

test("does not accept a return that happened before leaving", () => {
  const events = [
    event("Поездка", "07.09.2026 05:00:00", "07.09.2026 05:20:00", 20, [56.4, 37.7], [56.23023, 37.526005]),
    event("Поездка", "07.09.2026 06:00:00", "07.09.2026 06:20:00", 20),
  ];
  assert.ok(analyzeDay(events).departure);
  assert.equal(analyzeDay(events).returned, null);
});

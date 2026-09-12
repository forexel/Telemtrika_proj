import test from "node:test";
import assert from "node:assert/strict";
import { analyzeDay, clipEventToWindow, inferParkingCenter, movementEvents } from "./glonass_sync.js";

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

test('named base departure overrides the common base and ignores the earlier commute', () => {
  const zone = (typeName, begin, end, name='Соболь 635') => ({...event(typeName,begin,end),objName:name});
  const events = [
    event('Поездка','07.09.2026 04:00:00','07.09.2026 05:00:00',20),
    zone('Выход с объекта','07.09.2026 06:15:00','07.09.2026 06:15:00'),
    event('Стоянка','07.09.2026 07:00:00','07.09.2026 13:00:00',0,[56.4,37.7],[56.4,37.7]),
    zone('Вход на объект','07.09.2026 14:30:00','07.09.2026 16:00:00'),
    zone('Выход с объекта','07.09.2026 03:00:00','07.09.2026 03:00:00','Другая база'),
  ];
  events[2].dtDelta=21600;
  const result=analyzeDay(events,{baseName:'Соболь 635'});
  assert.equal(result.departure.toISOString(),'2026-09-07T06:15:00.000Z');
  assert.equal(result.returned.toISOString(),'2026-09-07T14:30:00.000Z');
  assert.equal(result.outboundSeconds,45*60);
  assert.equal(analyzeDay(events,{baseName:'Несуществующая база'}).departure,null);
  assert.equal(analyzeDay(events,{baseName:'Несуществующая база'}).site,null);
});

test('base ID identifies the shared zone even after a name change', () => {
  const events = [
    {...event('Выход с объекта','10.09.2026 04:02:32','10.09.2026 04:02:32'),objID:25705,objName:'Новое название'},
    {...event('Вход на объект','10.09.2026 13:30:28','10.09.2026 17:00:00'),objID:25705,objName:'Новое название'},
    {...event('Выход с объекта','10.09.2026 02:00:00','10.09.2026 02:00:00'),objID:999,objName:'База соболь 635 и ларгус 817'},
  ];
  const result=analyzeDay(events,{baseName:'База соболь 635 и ларгус 817',baseId:25705});
  assert.equal(result.departure.toISOString(),'2026-09-10T04:02:32.000Z');
  assert.equal(result.returned.toISOString(),'2026-09-10T13:30:28.000Z');
});

test('infers a recurring night parking location', () => {
  const home=[56.3765,37.3317], work=[56.3407,37.5478];
  const events=[];
  for (const [day,next] of [['07','08'],['08','09'],['09','10']]) {
    const parking=event('Стоянка',`${day}.09.2026 21:00:00`,`${next}.09.2026 02:00:00`,0,home,home); parking.dtDelta=5*3600; events.push(parking);
    const daytime=event('Стоянка',`${next}.09.2026 06:00:00`,`${next}.09.2026 13:00:00`,0,work,work); daytime.dtDelta=7*3600; events.push(daytime);
  }
  const parking=inferParkingCenter(events);
  assert.ok(parking);
  assert.ok(Math.abs(parking.lat-home[0])<0.001);
  assert.ok(parking.nights>=2);
});

test('excludes night parking and selects the daytime work site', () => {
  const home=[56.3765,37.3317], work=[56.3407,37.5478];
  const nightBefore=event('Стоянка','11.09.2026 00:00:00','11.09.2026 04:00:00',0,home,home); nightBefore.dtDelta=4*3600;
  const outbound=event('Движение','11.09.2026 04:00:00','11.09.2026 05:00:00',30,home,work);
  const working=event('Стоянка','11.09.2026 05:00:00','11.09.2026 13:00:00',0,work,work); working.dtDelta=8*3600;
  const inbound=event('Движение','11.09.2026 13:00:00','11.09.2026 14:00:00',30,work,home);
  const nightAfter=event('Стоянка','11.09.2026 14:00:00','11.09.2026 21:00:00',0,home,home); nightAfter.dtDelta=7*3600;
  const result=analyzeDay([nightBefore,outbound,working,inbound,nightAfter],{baseCenter:{lat:home[0],lon:home[1]}});
  assert.equal(result.departure.toISOString(),'2026-09-11T04:00:00.000Z');
  assert.equal(result.returned.toISOString(),'2026-09-11T14:00:00.000Z');
  assert.ok(Math.abs(result.site.lat-work[0])<0.001);
  assert.equal(result.site.spanSeconds,8*3600);
});

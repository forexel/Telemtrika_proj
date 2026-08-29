import crypto from "node:crypto";

const BASE = [56.23023, 37.526005];
const UTC_FORMAT = /^([0-3]\d)\.([01]\d)\.(\d{4}) ([0-2]\d):([0-5]\d):([0-5]\d)$/;

function apiDate(value) {
  const d = new Date(value), p = n => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}
function parseApiDate(raw) {
  const value = typeof raw === "object" ? raw?.v : raw, m = String(value || "").match(UTC_FORMAT);
  return m ? new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6]))) : null;
}
function moscowDate(date) { return new Date(date.getTime() + 3 * 3600e3).toISOString().slice(0, 10); }
function moscowIso(date) { return date ? new Date(date.getTime() + 3 * 3600e3).toISOString().replace("Z", "+03:00") : null; }
function point(event, end = false) { const raw = event[end ? "latLonEnd" : "latLonBeg"] || {}; return raw.x == null || raw.y == null ? null : [Number(raw.x), Number(raw.y)]; }
function haversine(a, b) { const r = 6371.0088, rad = x => x * Math.PI / 180, dp = rad(b[0] - a[0]), dl = rad(b[1] - a[1]), p1 = rad(a[0]), p2 = rad(b[0]), h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2; return 2 * r * Math.asin(Math.sqrt(h)); }
function unique(values) { return [...new Set(values.filter(Boolean).map(value => String(value).trim()).filter(Boolean))]; }
function addressText(value) { return typeof value === "object" ? String(value?.v || value?.name || "") : String(value || ""); }

function dominantSite(stops) {
  const clusters = [];
  for (const event of stops) {
    const p = point(event), seconds = Number(event.dtDelta || 0);
    if (!p || seconds < 300 || haversine(p, BASE) < 0.8) continue;
    let cluster = clusters.find(item => haversine(p, item.center) <= 1.5);
    if (!cluster) { cluster = { items: [], seconds: 0, latSum: 0, lonSum: 0, weight: 0, center: p }; clusters.push(cluster); }
    cluster.items.push(event); cluster.seconds += seconds; cluster.latSum += p[0] * seconds; cluster.lonSum += p[1] * seconds; cluster.weight += seconds; cluster.center = [cluster.latSum / cluster.weight, cluster.lonSum / cluster.weight];
  }
  if (!clusters.length) return null;
  const chosen = clusters.sort((a, b) => b.seconds - a.seconds)[0];
  chosen.items.sort((a, b) => parseApiDate(a.dtBeg) - parseApiDate(b.dtBeg));
  const begin = parseApiDate(chosen.items[0].dtBeg), end = parseApiDate(chosen.items.at(-1).dtEnd);
  return { lat: chosen.center[0], lon: chosen.center[1], arrival: begin, departure: end, spanSeconds: Math.max(0, Math.round((end - begin) / 1000)) };
}

function analyzeDay(events) {
  const moves = events.filter(event => event.typeName === "Движение"), stops = events.filter(event => ["Стоянка", "Стоянка. Двигатель запущен"].includes(event.typeName)), site = dominantSite(stops);
  const departures = moves.filter(event => point(event) && point(event, true) && haversine(point(event), BASE) <= 0.8 && haversine(point(event, true), BASE) > 0.8);
  const returns = moves.filter(event => point(event) && point(event, true) && haversine(point(event), BASE) > 2 && haversine(point(event, true), BASE) <= 0.8);
  const departure = departures.map(event => parseApiDate(event.dtBeg)).filter(Boolean).sort((a, b) => a - b)[0] || null;
  const returned = returns.map(event => parseApiDate(event.dtEnd)).filter(Boolean).sort((a, b) => b - a)[0] || null;
  const outboundSeconds = departure && site ? Math.max(0, Math.round((site.arrival - departure) / 1000)) : null;
  const returnSeconds = returned && site ? Math.max(0, Math.round((returned - site.departure) / 1000)) : null;
  const overlap = (event, begin, end) => { const a = parseApiDate(event.dtBeg), b = parseApiDate(event.dtEnd); return !a || !b || !begin || !end ? 0 : Math.max(0, (Math.min(b, end) - Math.max(a, begin)) / 1000); };
  const outboundMoving = moves.reduce((sum, event) => sum + overlap(event, departure, site?.arrival), 0), returnMoving = moves.reduce((sum, event) => sum + overlap(event, site?.departure, returned), 0);
  const speeding = events.filter(event => event.typeName === "Превышение скорости"), gps = events.filter(event => event.typeName === "Потеря gps-спутников");
  return {
    departure, returned, site, outboundSeconds, returnSeconds,
    outboundStops: outboundSeconds == null ? null : Math.max(0, Math.round(outboundSeconds - outboundMoving)),
    returnStops: returnSeconds == null ? null : Math.max(0, Math.round(returnSeconds - returnMoving)),
    distance: moves.reduce((sum, event) => sum + Number(event.distance || 0), 0),
    maxSpeed: Math.max(0, ...moves.map(event => Number(event.maxSpeed || 0))), speeding: speeding.length,
    idle: events.filter(event => event.typeName === "Стоянка. Двигатель запущен").reduce((sum, event) => sum + Number(event.dtDelta || 0), 0),
    gpsLoss: gps.reduce((sum, event) => sum + Number(event.dtDelta || 0), 0),
  };
}

export async function syncGlonassFacts({ db, settings, dateFrom, dateTo, vehicleId = 0, onProgress = null }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) throw new Error("Период должен быть указан в формате ГГГГ-ММ-ДД");
  const fromLocal = new Date(`${dateFrom}T00:00:00+03:00`), toLocalExclusive = new Date(new Date(`${dateTo}T00:00:00+03:00`).getTime() + 86400e3);
  if ((toLocalExclusive - fromLocal) / 86400e3 > 31) throw new Error("За один запуск можно загрузить не более 31 дня");
  const loginUrl = new URL(settings.glonass_login_url);
  loginUrl.searchParams.set("apikey", settings.glonass_api_key); loginUrl.searchParams.set("name", settings.glonass_username); loginUrl.searchParams.set("pwd", settings.glonass_password); loginUrl.searchParams.set("indented", "false");
  const loginResponse = await fetch(loginUrl, { signal: AbortSignal.timeout(30000) });
  if (!loginResponse.ok) throw new Error(`Авторизация ГЛОНАСС: HTTP ${loginResponse.status}`);
  const login = await loginResponse.json(), userId = login.user?.id;
  if (!userId) throw new Error("ГЛОНАСС не вернул идентификатор пользователя");
  const vehicles = db.prepare(`SELECT v.* FROM vehicles v WHERE v.active=1 AND v.match_status='matched' AND (?=0 OR v.id=?) ORDER BY v.id`).all(vehicleId, vehicleId);
  const upsert = db.prepare(`INSERT INTO vehicle_days(work_date,vehicle_id,work_object,base_departure,site_arrival,site_departure,base_return,outbound_seconds,outbound_stops_seconds,return_seconds,return_stops_seconds,site_seconds,shift_seconds,distance_km,max_speed_kmh,speeding_events,idle_engine_seconds,gps_loss_seconds,actual_lat,actual_lon,confirmation_status,data_control,deviation_comment,source,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(work_date,vehicle_id) DO UPDATE SET work_object=excluded.work_object,base_departure=excluded.base_departure,site_arrival=excluded.site_arrival,site_departure=excluded.site_departure,base_return=excluded.base_return,outbound_seconds=excluded.outbound_seconds,outbound_stops_seconds=excluded.outbound_stops_seconds,return_seconds=excluded.return_seconds,return_stops_seconds=excluded.return_stops_seconds,site_seconds=excluded.site_seconds,shift_seconds=excluded.shift_seconds,distance_km=excluded.distance_km,max_speed_kmh=excluded.max_speed_kmh,speeding_events=excluded.speeding_events,idle_engine_seconds=excluded.idle_engine_seconds,gps_loss_seconds=excluded.gps_loss_seconds,actual_lat=excluded.actual_lat,actual_lon=excluded.actual_lon,confirmation_status=excluded.confirmation_status,data_control=excluded.data_control,deviation_comment=excluded.deviation_comment,source='glonass',updated_at=excluded.updated_at`);
  const deleteSegments = db.prepare("DELETE FROM vehicle_segments WHERE work_date=? AND vehicle_id=?");
  const insertSegment = db.prepare(`INSERT INTO vehicle_segments(work_date,vehicle_id,event_type,event_start,event_end,duration_seconds,distance_km,max_speed_kmh,start_lat,start_lon,end_lat,end_lon,address_start,address_end,is_base,source) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'glonass')`);
  let daysSaved = 0, segmentsSaved = 0, vehicleIndex = 0, errors = [];
  for (const vehicle of vehicles) {
    vehicleIndex += 1;
    if (onProgress) onProgress({ vehicle_index: vehicleIndex, vehicle_total: vehicles.length, vehicle: `${vehicle.name} ${vehicle.plate}` });
    const endpoint = new URL(`http://${vehicle.glonass_server}:2231/api/vm/calculator`);
    endpoint.searchParams.set("apikey", settings.glonass_api_key); endpoint.searchParams.set("user_id", userId); endpoint.searchParams.set("pwd_md5", crypto.createHash("md5").update(settings.glonass_password).digest("hex")); endpoint.searchParams.set("indented", "false");
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(120000), body: JSON.stringify({ unitID: Number(vehicle.glonass_unit_id), dtBeg: { type: "datetime", v: apiDate(fromLocal) }, dtEnd: { type: "datetime", v: apiDate(new Date(toLocalExclusive.getTime() - 1000)) }, keys: ["eventNoGPS", "eventObjInOut", "eventSpeedExcess", "eventTrip", "driver", "tachograph", "totalLastPoint"], inValues: { event_UseAddress: true, eventSpeedExcess_SpeedLimit: 90, eventTrip_MinStopTime: 300 } }) });
    if (!response.ok) { errors.push(`${vehicle.name} ${vehicle.plate}: ГЛОНАСС HTTP ${response.status}`); continue; }
    const body = await response.json(), allEvents = body.recordLists?.events || [];
    for (let cursor = new Date(fromLocal); cursor < toLocalExclusive; cursor = new Date(cursor.getTime() + 86400e3)) {
      const day = moscowDate(cursor), assigned = db.prepare("SELECT GROUP_CONCAT(DISTINCT work_object) objects FROM assignments WHERE work_date=? AND vehicle_id=?").get(day, vehicle.id)?.objects || "";
      const events = allEvents.filter(event => { const d = parseApiDate(event.dtBeg); return d && moscowDate(d) === day; }), fact = analyzeDay(events);
      if (!assigned && fact.distance < 1) continue;
      const controls = unique([fact.speeding ? `Скорость выше 90 км/ч — ${fact.speeding}` : "", fact.gpsLoss ? `Потеря GPS — ${Math.round(fact.gpsLoss)} сек` : ""]).join("; ");
      const status = !assigned ? "unplanned" : fact.site ? "trip_confirmed" : fact.distance >= 5 ? "partial" : "not_confirmed";
      const comment = !assigned ? "Движение зафиксировано, но разнарядка на этот автомобиль не найдена." : fact.site ? "Факт автомобиля применяется ко всем сотрудникам этой бригады." : fact.distance >= 5 ? "Есть движение, но рабочая точка не выделена." : "Разнарядка есть, значимого выезда по ГЛОНАСС не найдено.";
      db.exec("BEGIN");
      try {
        upsert.run(day, vehicle.id, assigned, moscowIso(fact.departure), moscowIso(fact.site?.arrival), moscowIso(fact.site?.departure), moscowIso(fact.returned), fact.outboundSeconds, fact.outboundStops, fact.returnSeconds, fact.returnStops, fact.site?.spanSeconds || null, fact.departure && fact.returned ? Math.round((fact.returned - fact.departure) / 1000) : null, fact.distance, fact.maxSpeed, fact.speeding, fact.idle, fact.gpsLoss, fact.site?.lat || null, fact.site?.lon || null, status, controls, comment, "glonass", new Date().toISOString());
        deleteSegments.run(day, vehicle.id);
        for (const event of events) {
          const eventType = event.typeName === "Движение" ? "movement" : event.typeName === "Стоянка" ? "stop" : event.typeName === "Стоянка. Двигатель запущен" ? "idle" : event.typeName === "Превышение скорости" ? "speeding" : event.typeName === "Потеря gps-спутников" ? "gps_loss" : "";
          if (!eventType) continue;
          const begin = parseApiDate(event.dtBeg), end = parseApiDate(event.dtEnd), start = point(event), finish = point(event, true), reference = start || finish;
          if (!begin || !end) continue;
          insertSegment.run(day, vehicle.id, eventType, moscowIso(begin), moscowIso(end), Number(event.dtDelta || Math.max(0, (end - begin) / 1000)), Number(event.distance || 0), Number(event.maxSpeed || 0), start?.[0] ?? null, start?.[1] ?? null, finish?.[0] ?? null, finish?.[1] ?? null, addressText(event.addressBeg), addressText(event.addressEnd), reference && haversine(reference, BASE) <= 0.8 ? 1 : 0);
          segmentsSaved += 1;
        }
        db.exec("COMMIT");
      } catch (error) { db.exec("ROLLBACK"); throw error; }
      daysSaved += 1;
    }
  }
  return { vehicles: vehicles.length, days_saved: daysSaved, segments_saved: segmentsSaved, errors };
}

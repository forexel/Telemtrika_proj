import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { syncGlonassFacts } from "./glonass_sync.js";

const { DatabaseSync } = await import("node:sqlite");
const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, "public");
const port = Number(process.env.PORT || 18221);
const host = process.env.HOST || "0.0.0.0";
const settingsPath = process.env.TELEMETRIKA_SETTINGS_PATH || path.join(here, "data", "settings.json");
const databasePath = process.env.TELEMETRIKA_DB_PATH || path.join(here, "data", "telemetrika.sqlite");
const seedPath = process.env.TELEMETRIKA_SEED_PATH || path.join(here, "seed", "sobol_088_july_2026.json");
const loginName = process.env.TELEMETRIKA_LOGIN;
const loginPassword = process.env.TELEMETRIKA_PASSWORD;
const sessionSecret = process.env.TELEMETRIKA_SESSION_SECRET;
if (!loginName || !loginPassword || !sessionSecret) throw new Error("Задайте TELEMETRIKA_LOGIN, TELEMETRIKA_PASSWORD и TELEMETRIKA_SESSION_SECRET");
const sessionCookie = "telemetrika_session";
const sessionLifetimeSeconds = 12 * 60 * 60;
const attempts = new Map();

const defaults = {
  google_sheet_url: "https://docs.google.com/spreadsheets/d/11CjtJE1CxmlMol33efG7bYH6dU2KXG-jNJlEw_Z7Rs8/edit",
  google_sheet_urls: [],
  vehicle_sheet_name: "Справочник",
  vehicle_model_column: "E",
  vehicle_plate_column: "E",
  assignments_sheet_name: "Ввод",
  glonass_login_url: "http://api.mssglonass.ru/api/vm/login.php",
  glonass_api_key: "",
  glonass_username: "",
  glonass_password: "",
  timezone: "Europe/Moscow",
};

await fsp.mkdir(path.dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`
  PRAGMA journal_mode=WAL;
  PRAGMA foreign_keys=ON;
  CREATE TABLE IF NOT EXISTS vehicles (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    plate TEXT NOT NULL,
    normalized_plate TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL DEFAULT 'google',
    source_row INTEGER,
    manual_override INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    match_status TEXT NOT NULL DEFAULT 'not_checked',
    glonass_name TEXT,
    glonass_car_id TEXT,
    glonass_unit_id TEXT,
    glonass_server TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY,
    work_date TEXT NOT NULL,
    work_object TEXT NOT NULL,
    employee_name TEXT NOT NULL,
    work_type TEXT,
    vehicle_label TEXT,
    vehicle_id INTEGER REFERENCES vehicles(id),
    note TEXT,
    source TEXT NOT NULL DEFAULT 'google',
    source_row INTEGER,
    UNIQUE(work_date, work_object, employee_name, source)
  );
  CREATE TABLE IF NOT EXISTS employees (
    name TEXT PRIMARY KEY,
    position TEXT,
    source_row INTEGER,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS vehicle_days (
    id INTEGER PRIMARY KEY,
    work_date TEXT NOT NULL,
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
    work_object TEXT,
    base_departure TEXT,
    site_arrival TEXT,
    site_departure TEXT,
    base_return TEXT,
    outbound_seconds INTEGER,
    outbound_stops_seconds INTEGER,
    return_seconds INTEGER,
    return_stops_seconds INTEGER,
    site_seconds INTEGER,
    shift_seconds INTEGER,
    distance_km REAL,
    max_speed_kmh REAL,
    speeding_events INTEGER,
    idle_engine_seconds INTEGER,
    gps_loss_seconds INTEGER,
    actual_lat REAL,
    actual_lon REAL,
    confirmation_status TEXT,
    data_control TEXT,
    deviation_comment TEXT,
    source TEXT NOT NULL DEFAULT 'glonass',
    updated_at TEXT NOT NULL,
    UNIQUE(work_date, vehicle_id)
  );
  CREATE TABLE IF NOT EXISTS control_reference (
    id INTEGER PRIMARY KEY,
    work_date TEXT NOT NULL,
    vehicle_label TEXT NOT NULL,
    work_object TEXT,
    base_departure TEXT,
    site_arrival TEXT,
    site_departure TEXT,
    base_return TEXT,
    raw_json TEXT,
    UNIQUE(work_date, vehicle_label, work_object)
  );
  CREATE TABLE IF NOT EXISTS vehicle_segments (
    id INTEGER PRIMARY KEY,
    work_date TEXT NOT NULL,
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
    event_type TEXT NOT NULL,
    event_start TEXT NOT NULL,
    event_end TEXT NOT NULL,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    distance_km REAL NOT NULL DEFAULT 0,
    max_speed_kmh REAL NOT NULL DEFAULT 0,
    start_lat REAL,
    start_lon REAL,
    end_lat REAL,
    end_lon REAL,
    address_start TEXT,
    address_end TEXT,
    is_base INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'glonass'
  );
  CREATE TABLE IF NOT EXISTS sync_runs (
    id INTEGER PRIMARY KEY,
    source TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL,
    details TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_vehicle_days_date_vehicle ON vehicle_days(work_date, vehicle_id);
  CREATE INDEX IF NOT EXISTS idx_assignments_date_vehicle ON assignments(work_date, vehicle_id);
  CREATE INDEX IF NOT EXISTS idx_assignments_employee_date ON assignments(employee_name, work_date);
  CREATE INDEX IF NOT EXISTS idx_reference_date ON control_reference(work_date);
  CREATE INDEX IF NOT EXISTS idx_segments_date_vehicle ON vehicle_segments(work_date, vehicle_id, event_start);
  PRAGMA optimize;
`);
try { db.exec("ALTER TABLE vehicles ADD COLUMN manual_override INTEGER NOT NULL DEFAULT 0"); } catch {}
db.exec(`CREATE TABLE IF NOT EXISTS vehicle_rules (
  vehicle_id INTEGER PRIMARY KEY REFERENCES vehicles(id),
  source_vehicle_id INTEGER REFERENCES vehicles(id),
  departure_start INTEGER NOT NULL DEFAULT 0
)`);
const ruleColumns = db.prepare("PRAGMA table_info(vehicle_rules)").all();
if (!ruleColumns.some(column => column.name === "base_name")) {
  db.exec("ALTER TABLE vehicle_rules ADD COLUMN base_name TEXT NOT NULL DEFAULT ''");
  db.prepare("UPDATE vehicle_rules SET base_name='Соболь 635' WHERE vehicle_id IN (SELECT id FROM vehicles WHERE normalized_plate=?)").run(normalizePlate("А635СО777"));
}
if (!ruleColumns.some(column => column.name === "base_id")) {
  db.exec("ALTER TABLE vehicle_rules ADD COLUMN base_id INTEGER");
  db.prepare("UPDATE vehicle_rules SET base_name='База соболь 635 и ларгус 817',base_id=25705 WHERE vehicle_id IN (SELECT id FROM vehicles WHERE normalized_plate IN (?,?)) AND (base_name='' OR base_name='Соболь 635')").run(normalizePlate("А635СО777"),normalizePlate("Т817НМ777"));
}
if (!db.prepare("PRAGMA table_info(vehicle_days)").all().some(column => column.name === "base_zone_name")) db.exec("ALTER TABLE vehicle_days ADD COLUMN base_zone_name TEXT NOT NULL DEFAULT ''");
if (!db.prepare("PRAGMA table_info(vehicle_days)").all().some(column => column.name === "base_zone_id")) db.exec("ALTER TABLE vehicle_days ADD COLUMN base_zone_id INTEGER");
// Resolve telemetry at read time so changing an exception also updates historical reports.
for (const table of ["vehicle_days", "vehicle_segments"]) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name);
  const baseFields = new Set(["base_departure", "base_return", "outbound_seconds", "outbound_stops_seconds", "return_seconds", "return_stops_seconds", "shift_seconds"]);
  const projection = columns.map(column => column === "vehicle_id" ? "v.id AS vehicle_id" : table === "vehicle_days" && baseFields.has(column) ? `CASE WHEN COALESCE(sr.base_name,r.base_name,'')=COALESCE(d.base_zone_name,'') AND COALESCE(sr.base_id,r.base_id,0)=COALESCE(d.base_zone_id,0) THEN d.${column} ELSE NULL END AS ${column}` : `d.${column}`).join(",");
  db.exec(`CREATE TEMP VIEW effective_${table} AS SELECT ${projection} FROM vehicles v LEFT JOIN vehicle_rules r ON r.vehicle_id=v.id LEFT JOIN vehicle_rules sr ON sr.vehicle_id=r.source_vehicle_id JOIN ${table} d ON d.vehicle_id=COALESCE(r.source_vehicle_id,v.id)`);
}
db.exec(`UPDATE vehicle_days SET confirmation_status='unplanned',deviation_comment='Движение зафиксировано, но разнарядка на этот автомобиль не найдена.' WHERE source='glonass' AND distance_km>=1 AND NOT EXISTS (SELECT 1 FROM assignments a WHERE a.work_date=vehicle_days.work_date AND a.vehicle_id=vehicle_days.vehicle_id)`);

async function ensureSettings() {
  await fsp.mkdir(path.dirname(settingsPath), { recursive: true });
  try { await fsp.access(settingsPath); }
  catch {
    await saveSettings({
      ...defaults,
      glonass_api_key: process.env.GLONASS_API_KEY || "",
      glonass_username: process.env.GLONASS_USERNAME || "",
      glonass_password: process.env.GLONASS_PASSWORD || "",
    });
  }
}
async function loadSettings() { await ensureSettings(); return { ...defaults, ...JSON.parse(await fsp.readFile(settingsPath, "utf8")) }; }
async function saveSettings(settings) {
  await fsp.mkdir(path.dirname(settingsPath), { recursive: true });
  const temporary = `${settingsPath}.tmp`;
  await fsp.writeFile(temporary, JSON.stringify(settings, null, 2), { mode: 0o600 });
  await fsp.rename(temporary, settingsPath); await fsp.chmod(settingsPath, 0o600);
}
function json(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers }); res.end(body);
}
async function readJson(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 256 * 1024) throw new Error("Слишком большой запрос"); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
function safeEqual(left, right) { const a = Buffer.from(String(left)), b = Buffer.from(String(right)); return a.length === b.length && crypto.timingSafeEqual(a, b); }
function sign(value) { return crypto.createHmac("sha256", sessionSecret).update(value).digest("base64url"); }
function makeSession() { const expires = String(Math.floor(Date.now() / 1000) + sessionLifetimeSeconds); return `${expires}.${sign(expires)}`; }
function cookies(req) { return Object.fromEntries((req.headers.cookie || "").split(";").map(part => part.trim()).filter(Boolean).map(part => { const index = part.indexOf("="); return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))]; })); }
function authenticated(req) { const [expires, signature] = (cookies(req)[sessionCookie] || "").split("."); return Boolean(expires && signature && Number(expires) >= Date.now() / 1000 && safeEqual(signature, sign(expires))); }
function requireAuth(req, res) { if (authenticated(req)) return true; json(res, 401, { error: "Требуется вход" }); return false; }

function normalizePlate(value) {
  const map = { A: "А", B: "В", E: "Е", K: "К", M: "М", H: "Н", O: "О", P: "Р", C: "С", T: "Т", Y: "У", X: "Х" };
  return String(value || "").toUpperCase().replace(/[ABEKMHOPCTYX]/g, letter => map[letter]).replace(/[^А-Я0-9]/g, "");
}
function normalizeText(value) { return String(value || "").toLowerCase().replace(/ё/g, "е").replace(/[^а-яa-z0-9]/g, ""); }
function threeDigitCode(value) { return String(value || "").match(/\d{3}/)?.[0] || ""; }
function identityCodes(value) {
  return new Set([...String(value || "").matchAll(/\d{3,4}/g)].map(match => match[0]));
}
function modelFamily(value) {
  const text = normalizeText(value);
  const families = [["bobcat", /bobcat|бобкат/], ["kamaz", /kamaz|камаз/], ["sobol", /sobol|собол/], ["largus", /largus|ларгус/], ["mtz", /mtz|мтз/], ["hitachi", /hitachi|хитачи/], ["changan", /changan|чанган/], ["logan", /logan|логан/], ["niva", /niva|нива/], ["vesta", /vesta|веста/], ["granta", /granta|гранта/]];
  return families.find(([, pattern]) => pattern.test(text))?.[0] || "";
}
function canonicalPlate(value) {
  const normalized = normalizePlate(value);
  return normalized.match(/\d{2}[АВЕКМНОРСТУХ]{2}\d{4}/)?.[0] || normalized.match(/[АВЕКМНОРСТУХ]\d{3}[АВЕКМНОРСТУХ]{2}\d{2,3}/)?.[0] || normalized;
}
function isoDate(value) { const match = String(value || "").match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/); return match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : ""; }
function sheetId(url) { const match = String(url || "").match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/); if (!match) throw new Error("Не удалось определить ID Google-таблицы"); return match[1]; }
function columnNumber(column) { return String(column || "").toUpperCase().split("").reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0); }
function toColumn(number) { let result = ""; while (number > 0) { number -= 1; result = String.fromCharCode(65 + number % 26) + result; number = Math.floor(number / 26); } return result; }
function isVehicleHeader(value) { return ["автомобиль", "автомобили", "техника", "модель", "марка", "госномер", "номер"].includes(normalizeText(value)); }
function vehicleNameFromLabel(value) {
  const label = String(value || "").trim();
  return label.replace(/[\s_-]+(?:\d{2}[АВЕКМНОРСТУХABEKMHOPCTYX]{2}\d{4}|[АВЕКМНОРСТУХABEKMHOPCTYX]\d{3}[АВЕКМНОРСТУХABEKMHOPCTYX]{2}\d{2,3}|\d{3,4})\s*$/iu, "").trim() || label || "Автомобиль";
}
function parseCsv(text) {
  const rows = []; let row = [], value = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) { if (char === '"' && text[i + 1] === '"') { value += '"'; i += 1; } else if (char === '"') quoted = false; else value += char; }
    else if (char === '"') quoted = true; else if (char === ",") { row.push(value); value = ""; }
    else if (char === "\n") { row.push(value.replace(/\r$/, "")); rows.push(row); row = []; value = ""; } else value += char;
  }
  if (value || row.length) { row.push(value); rows.push(row); } return rows;
}
async function fetchSheetRange(sheetUrl, sheetName, range) {
  const id = sheetId(sheetUrl), url = new URL(`https://docs.google.com/spreadsheets/d/${id}/gviz/tq`);
  url.searchParams.set("tqx", "out:csv"); url.searchParams.set("sheet", sheetName); url.searchParams.set("range", range);
  const response = await fetch(url, { signal: AbortSignal.timeout(25000), headers: { "User-Agent": "telemetrika-control/0.2" } });
  if (!response.ok) throw new Error(`Google Sheets вернул HTTP ${response.status}`); return parseCsv(await response.text());
}
async function fetchGlonass(settings) {
  if (!settings.glonass_api_key || !settings.glonass_username || !settings.glonass_password) return { configured: false, cars: [] };
  const url = new URL(settings.glonass_login_url);
  url.searchParams.set("apikey", settings.glonass_api_key); url.searchParams.set("name", settings.glonass_username); url.searchParams.set("pwd", settings.glonass_password); url.searchParams.set("indented", "false"); url.searchParams.set("parse_params", "false");
  const response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { "User-Agent": "telemetrika-control/0.2" } });
  if (!response.ok) throw new Error(`MSS GLONASS вернул HTTP ${response.status}`); const body = await response.json(); return { configured: true, cars: Array.isArray(body.cars) ? body.cars : [] };
}
function matchVehicle(plate, name, cars) {
  const normalized = normalizePlate(plate), code = threeDigitCode(plate);
  let candidates = cars.filter(car => { const params = car.params && typeof car.params === "object" ? car.params : {}; const state = normalizePlate(car.stateNumber || params.stateNum || ""), display = normalizePlate(`${car.displayableName || ""} ${car.name || ""}`); return normalized && (state === normalized || display.includes(normalized)); });
  if (!candidates.length && code) { const modelToken = normalizeText(name).replace(/газ\d+/g, ""); candidates = cars.filter(car => threeDigitCode(`${car.stateNumber || ""} ${car.displayableName || ""}`) === code && (!modelToken || normalizeText(`${car.displayableName || ""} ${car.name || ""}`).includes(modelToken.slice(0, 5)))); }
  if (!candidates.length) {
    const identities = identityCodes(plate), family = modelFamily(`${name} ${plate}`);
    if (identities.size) candidates = cars.filter(car => {
      const text = `${car.stateNumber || ""} ${car.displayableName || ""} ${car.name || ""}`;
      return [...identityCodes(text)].some(code => identities.has(code)) && (!family || modelFamily(text) === family);
    });
  }
  if (candidates.length !== 1) return { status: candidates.length ? "ambiguous" : "not_found", car: null }; return { status: "matched", car: candidates[0] };
}
function ensureVehicleExceptions() {
  const source = db.prepare("SELECT id FROM vehicles WHERE normalized_plate=? AND active=1").get(normalizePlate("А635СО777"));
  const target = db.prepare("SELECT id FROM vehicles WHERE normalized_plate=? AND active=1").get(normalizePlate("Т817НМ777"));
  if (source) db.prepare("INSERT OR IGNORE INTO vehicle_rules(vehicle_id,departure_start,base_name,base_id) VALUES(?,1,'База соболь 635 и ларгус 817',25705)").run(source.id);
  if (target) db.prepare("INSERT OR IGNORE INTO vehicle_rules(vehicle_id,source_vehicle_id,departure_start,base_name,base_id) VALUES(?,?,1,'База соболь 635 и ларгус 817',25705)").run(target.id,source?.id || null);
}
function listVehicles(includeInactive = false) { ensureVehicleExceptions(); return db.prepare(`SELECT id,name,plate,source,source_row,manual_override,active,match_status,glonass_name,glonass_unit_id,glonass_server,(SELECT source_vehicle_id FROM vehicle_rules WHERE vehicle_id=vehicles.id) source_vehicle_id,(SELECT departure_start FROM vehicle_rules WHERE vehicle_id=vehicles.id) departure_start,(SELECT base_name FROM vehicle_rules WHERE vehicle_id=vehicles.id) base_name,(SELECT base_id FROM vehicle_rules WHERE vehicle_id=vehicles.id) base_id,updated_at FROM vehicles ${includeInactive ? "" : "WHERE active=1"} ORDER BY active DESC,name COLLATE NOCASE,plate`).all(); }
function resolveVehicle(label, vehicles = db.prepare("SELECT id,name,plate FROM vehicles WHERE active=1").all()) {
  const normalized = normalizePlate(label), exact = vehicles.filter(v => normalizePlate(v.plate) === normalized || normalizePlate(`${v.name} ${v.plate}`).includes(normalized));
  if (exact.length === 1) return exact[0].id; const code = threeDigitCode(label); if (!code) return null;
  const coded = vehicles.filter(v => threeDigitCode(v.plate) === code && (!normalizeText(label).includes("соболь") || normalizeText(v.name).includes("соболь"))); return coded.length === 1 ? coded[0].id : null;
}
async function refreshVehicleMatches(settings, ids = []) {
  const glonass = await fetchGlonass(settings);
  if (!glonass.configured) return glonass;
  const now = new Date().toISOString(), where = ids.length ? `AND id IN (${ids.map(() => "?").join(",")})` : "";
  const vehicles = db.prepare(`SELECT * FROM vehicles WHERE active=1 ${where}`).all(...ids);
  const update = db.prepare("UPDATE vehicles SET match_status=?,glonass_name=?,glonass_car_id=?,glonass_unit_id=?,glonass_server=?,updated_at=? WHERE id=?");
  for (const vehicle of vehicles) { const match = matchVehicle(vehicle.plate, vehicle.name, glonass.cars), car = match.car; update.run(match.status, car ? (car.displayableName || car.name || "") : "", car ? String(car.id || "") : "", car ? String(car.unitID || "") : "", car ? String(car.server || "") : "", now, vehicle.id); }
  return glonass;
}

async function syncGoogle() {
  const settings = await loadSettings(), started = new Date().toISOString();
  const run = db.prepare("INSERT INTO sync_runs(source,started_at,status) VALUES(?,?,?)").run("google", started, "running");
  try {
    const modelNumber = columnNumber(settings.vehicle_model_column), plateNumber = columnNumber(settings.vehicle_plate_column), first = Math.min(modelNumber, plateNumber), last = Math.max(modelNumber, plateNumber);
    const sourceUrls = [...new Set((Array.isArray(settings.google_sheet_urls) && settings.google_sheet_urls.length ? settings.google_sheet_urls : [settings.google_sheet_url]).map(value => String(value || "").trim()).filter(Boolean))];
    if (!sourceUrls.length) throw new Error("Не указаны Google-таблицы");
    const sources = await Promise.all(sourceUrls.map(async (sourceUrl, sourceIndex) => {
      const [vehicleRows, assignmentRows, employeeRows] = await Promise.all([
        fetchSheetRange(sourceUrl, settings.vehicle_sheet_name, `${toColumn(first)}:${toColumn(last)}`),
        fetchSheetRange(sourceUrl, settings.assignments_sheet_name, "A:F"),
        fetchSheetRange(sourceUrl, settings.vehicle_sheet_name, "A:C"),
      ]);
      return { sourceUrl, sourceIndex, vehicleRows, assignmentRows, employeeRows };
    }));
    const now = new Date().toISOString();
    const parsed = sources.flatMap(source => source.assignmentRows.slice(1).map((row, index) => ({ work_date: isoDate(row[0]), work_object: String(row[1] || "").trim(), employee_name: String(row[2] || "").trim(), work_type: String(row[3] || "").trim(), vehicle_label: String(row[4] || "").trim(), note: String(row[5] || "").trim(), source_row: source.sourceIndex * 100000 + index + 2 }))).filter(row => row.work_date && row.work_object && row.employee_name);
    const importedDates = [...new Set(parsed.map(row => row.work_date))];
    const upsertVehicle = db.prepare(`INSERT INTO vehicles(name,plate,normalized_plate,source,source_row,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(normalized_plate) DO UPDATE SET name=CASE WHEN vehicles.manual_override=1 THEN vehicles.name ELSE excluded.name END,plate=CASE WHEN vehicles.manual_override=1 THEN vehicles.plate ELSE excluded.plate END,active=CASE WHEN vehicles.manual_override=1 THEN vehicles.active ELSE 1 END,source_row=excluded.source_row,updated_at=excluded.updated_at`);
    const upsertEmployee = db.prepare(`INSERT INTO employees(name,position,source_row,updated_at) VALUES(?,?,?,?) ON CONFLICT(name) DO UPDATE SET position=excluded.position,source_row=excluded.source_row,updated_at=excluded.updated_at`);
    db.exec("BEGIN");
    try {
      const modelIndex = modelNumber - first, plateIndex = plateNumber - first;
      db.exec("DELETE FROM assignments WHERE source='seed_glonass'; DELETE FROM employees;");
      if (importedDates.length) db.prepare(`DELETE FROM assignments WHERE source='google' AND work_date IN (${importedDates.map(() => "?").join(",")})`).run(...importedDates);
      for (const source of sources) {
        source.vehicleRows.forEach((row, index) => {
          const rowInSheet = index + 1, sourceRow = source.sourceIndex * 100000 + rowInSheet;
          const rawName = String(row[modelIndex] || "").trim(), rawPlate = String(row[plateIndex] || "").trim();
          const singleLabelColumn = modelNumber === plateNumber;
          const name = singleLabelColumn ? vehicleNameFromLabel(rawPlate) : rawName;
          const plate = singleLabelColumn ? canonicalPlate(rawPlate) : rawPlate;
          if (!normalizePlate(plate) || isVehicleHeader(plate) || (!singleLabelColumn && isVehicleHeader(name))) return;
          const knownVehicles = db.prepare("SELECT id,name,plate,active,manual_override FROM vehicles").all();
          const knownId = singleLabelColumn ? resolveVehicle(rawPlate, knownVehicles) : null;
          if (knownId) {
            const known = knownVehicles.find(vehicle => vehicle.id === knownId);
            if (known?.manual_override) return;
            db.prepare("UPDATE vehicles SET name=?,plate=?,normalized_plate=?,source='google',active=1,source_row=?,updated_at=? WHERE id=?").run(name || "Автомобиль", plate, normalizePlate(plate), sourceRow, now, knownId);
            return;
          }
          upsertVehicle.run(name || "Автомобиль", plate, normalizePlate(plate), "google", sourceRow, now);
        });
        source.employeeRows.forEach((row, index) => { const name = String(row[1] || "").trim(), position = String(row[2] || "").trim(); if (name && position) upsertEmployee.run(name, position, source.sourceIndex * 100000 + index + 1, now); });
      }
      const vehicles = db.prepare("SELECT id,name,plate FROM vehicles WHERE active=1").all();
      const grouped = new Map(); for (const row of parsed) { const key = `${row.work_date}|${row.work_object}`; if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(row); }
      const insertAssignment = db.prepare("INSERT OR IGNORE INTO assignments(work_date,work_object,employee_name,work_type,vehicle_label,vehicle_id,note,source,source_row) VALUES(?,?,?,?,?,?,?,?,?)");
      for (const group of grouped.values()) {
        const directIds = [...new Set(group.map(row => resolveVehicle(row.vehicle_label, vehicles)).filter(Boolean))];
        const crewVehicleIds = directIds.filter(id => {
          const vehicle = vehicles.find(item => item.id === id);
          return /соболь|ларгус|газель|уаз/i.test(`${vehicle?.name || ""} ${vehicle?.plate || ""}`);
        });
        const sharedCrewVehicle = directIds.length === 1 ? directIds[0] : crewVehicleIds.length === 1 ? crewVehicleIds[0] : null;
        for (const row of group) {
          const direct = resolveVehicle(row.vehicle_label, vehicles), vehicleId = direct || (!row.vehicle_label ? sharedCrewVehicle : null);
          insertAssignment.run(row.work_date, row.work_object, row.employee_name, row.work_type, row.vehicle_label, vehicleId, row.note, "google", row.source_row);
        }
      }
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
    let glonass = { configured: false, cars: [] }, glonassError = null;
    try { glonass = await refreshVehicleMatches(settings); } catch (error) { glonassError = error.message || "Не удалось обновить сопоставление ГЛОНАСС"; }
    const details = { sources: sourceUrls.length, vehicles: listVehicles().length, employees: db.prepare("SELECT COUNT(*) n FROM employees").get().n, assignments: db.prepare("SELECT COUNT(*) n FROM assignments WHERE source='google'").get().n, glonass_configured: glonass.configured, glonass_count: glonass.cars.length, glonass_error: glonassError };
    db.prepare("UPDATE sync_runs SET finished_at=?,status=?,details=? WHERE id=?").run(new Date().toISOString(), glonassError ? "partial" : "ok", JSON.stringify(details), run.lastInsertRowid); return details;
  } catch (error) { db.prepare("UPDATE sync_runs SET finished_at=?,status='error',details=? WHERE id=?").run(new Date().toISOString(), error.message, run.lastInsertRowid); throw error; }
}

function commentsText(day) { return (day.efficiency?.comments || []).map(item => item.text).join(" "); }
async function seedGlonassFacts() {
  if (db.prepare("SELECT COUNT(*) n FROM vehicle_days").get().n > 0) return;
  try {
    const report = JSON.parse(await fsp.readFile(seedPath, "utf8")), now = new Date().toISOString(), plate = "Н088РТ797";
    db.prepare(`INSERT INTO vehicles(name,plate,normalized_plate,source,match_status,glonass_name,glonass_unit_id,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(normalized_plate) DO UPDATE SET glonass_name=excluded.glonass_name,glonass_unit_id=excluded.glonass_unit_id,match_status='matched',updated_at=excluded.updated_at`).run("Соболь ГАЗ-27527", plate, normalizePlate(plate), "google", "matched", report.vehicle.api_name, String(report.vehicle.unit_id || ""), now);
    const vehicleId = db.prepare("SELECT id FROM vehicles WHERE normalized_plate=?").get(normalizePlate(plate)).id;
    const upsertDay = db.prepare(`INSERT INTO vehicle_days(work_date,vehicle_id,work_object,base_departure,site_arrival,site_departure,base_return,outbound_seconds,outbound_stops_seconds,return_seconds,return_stops_seconds,site_seconds,shift_seconds,distance_km,max_speed_kmh,speeding_events,idle_engine_seconds,gps_loss_seconds,actual_lat,actual_lon,confirmation_status,data_control,deviation_comment,source,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(work_date,vehicle_id) DO UPDATE SET work_object=excluded.work_object,base_departure=excluded.base_departure,site_arrival=excluded.site_arrival,site_departure=excluded.site_departure,base_return=excluded.base_return,outbound_seconds=excluded.outbound_seconds,outbound_stops_seconds=excluded.outbound_stops_seconds,return_seconds=excluded.return_seconds,return_stops_seconds=excluded.return_stops_seconds,site_seconds=excluded.site_seconds,shift_seconds=excluded.shift_seconds,distance_km=excluded.distance_km,max_speed_kmh=excluded.max_speed_kmh,speeding_events=excluded.speeding_events,idle_engine_seconds=excluded.idle_engine_seconds,gps_loss_seconds=excluded.gps_loss_seconds,actual_lat=excluded.actual_lat,actual_lon=excluded.actual_lon,confirmation_status=excluded.confirmation_status,data_control=excluded.data_control,deviation_comment=excluded.deviation_comment,updated_at=excluded.updated_at`);
    const insertAssignment = db.prepare("INSERT OR IGNORE INTO assignments(work_date,work_object,employee_name,work_type,vehicle_label,vehicle_id,note,source) VALUES(?,?,?,?,?,?,?,?)");
    db.exec("BEGIN");
    try {
      for (const day of report.days || []) {
        if (!day.plan || !day.actual) continue;
        const actual = day.actual, site = actual.site || {}, efficiency = day.efficiency || {}, controls = [actual.speeding_events ? `Скорость выше 90 км/ч — ${actual.speeding_events}` : "", actual.gps_loss_seconds ? `Потеря GPS — ${actual.gps_loss_seconds} сек` : ""].filter(Boolean).join("; ");
        upsertDay.run(day.date, vehicleId, day.plan.object || "", actual.base_departure || null, site.arrival || null, site.departure || null, actual.base_return || null, efficiency.outbound_seconds || null, efficiency.outbound_stop_seconds || 0, efficiency.return_seconds || null, efficiency.return_stop_seconds || 0, site.span_seconds || null, efficiency.shift_window_seconds || null, actual.distance_km || 0, actual.max_speed_kmh || 0, actual.speeding_events || 0, actual.idle_engine_seconds || 0, actual.gps_loss_seconds || 0, site.lat || null, site.lon || null, day.status || "", controls, commentsText(day), "glonass", now);
        for (const employee of day.plan.crew || []) insertAssignment.run(day.date, day.plan.object || "", employee, (day.plan.work_types || []).join(", "), "Соболь 088", vehicleId, (day.plan.notes || []).join(", "), "seed_glonass");
      }
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  } catch (error) { if (error.code !== "ENOENT") console.error("Seed import failed", error); }
}

function filters(url) {
  const vehicleIds = [...new Set(url.searchParams.getAll("vehicle_id").map(Number).filter(Number.isInteger).filter(id => id > 0))];
  return {
    from: url.searchParams.get("date_from") || "1900-01-01",
    to: url.searchParams.get("date_to") || "2999-12-31",
    vehicleId: vehicleIds[0] || 0,
    vehicleIds,
    noVehicles: url.searchParams.get("vehicle_none") === "1",
    activeOnly: url.searchParams.get("active_only") === "1",
    employees: url.searchParams.getAll("employee").filter(Boolean),
  };
}
function driverFromEntries(entries, vehicleId, activeVehicles) {
  return [...new Set(String(entries || "").split(",").map(entry => { const divider = entry.indexOf("|"); if (divider < 0) return ""; const name = entry.slice(0, divider), label = entry.slice(divider + 1); return resolveVehicle(label, activeVehicles) === vehicleId ? name : ""; }).filter(Boolean))].join(", ");
}
function segmentMap(from, to, vehicleId = 0) {
  const result = new Map(), rows = db.prepare(`SELECT * FROM effective_vehicle_segments WHERE work_date BETWEEN ? AND ? AND (?=0 OR vehicle_id=?) ORDER BY work_date,event_start`).all(from, to, vehicleId, vehicleId);
  for (const row of rows) { const key = `${row.work_date}|${row.vehicle_id}`; if (!result.has(key)) result.set(key, []); result.get(key).push(row); }
  return result;
}
function geoDistanceKm(a, b) {
  if (!a || !b || a.some(value => value == null) || b.some(value => value == null)) return Infinity;
  const rad = value => value * Math.PI / 180, radius = 6371.0088, dp = rad(b[0] - a[0]), dl = rad(b[1] - a[1]), p1 = rad(a[0]), p2 = rad(b[0]);
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}
function confirmedWorkSeconds(row, segments) {
  if (row.actual_lat == null || row.actual_lon == null) return Number(row.site_seconds || 0);
  const windowStart = row.site_arrival ? new Date(row.site_arrival) : null, windowEnd = row.site_departure ? new Date(row.site_departure) : null;
  return Math.round((segments || []).filter(segment => ['stop','idle'].includes(segment.event_type) && !segment.is_base && geoDistanceKm([segment.start_lat ?? segment.end_lat, segment.start_lon ?? segment.end_lon], [row.actual_lat, row.actual_lon]) <= 1.5).reduce((sum, segment) => {
    if (!windowStart || !windowEnd) return sum + Number(segment.duration_seconds || 0);
    const start = new Date(segment.event_start), end = new Date(segment.event_end);
    if ([start,end,windowStart,windowEnd].some(value => Number.isNaN(value.valueOf()))) return sum;
    return sum + Math.max(0, (Math.min(end, windowEnd) - Math.max(start, windowStart)) / 1000);
  }, 0));
}
function roadAssessment(hasFact, confirmationStatus, travel, stops) {
  if (!hasFact) return "Факт не загружен";
  if (confirmationStatus === "not_confirmed") return "Поездки не было";
  if (travel == null) return "Недостаточно данных";
  const stopped = Number(stops || 0);
  if (stopped > 30 * 60) return "Длительные остановки";
  if (stopped > 10 * 60) return "Есть задержка в пути";
  return "Без заметных задержек";
}
function workdayMetrics(row) {
  const rule = db.prepare("SELECT COALESCE(source.departure_start,r.departure_start,0) departure_start FROM vehicle_rules r LEFT JOIN vehicle_rules source ON source.vehicle_id=r.source_vehicle_id WHERE r.vehicle_id=?").get(row.vehicle_id);
  const startOfDay = rule?.departure_start ? (row.base_departure ? new Date(row.base_departure) : null) : new Date(`${row.work_date}T08:00:00+03:00`);
  const endOfNorm = new Date(`${row.work_date}T17:00:00+03:00`);
  const baseReturn = row.base_return ? new Date(row.base_return) : null;
  return {
    startLabel: rule?.departure_start ? (row.base_departure?.slice(11,16) || "Не зафиксирован") : "08:00",
    baseReturn,
    endOfNorm,
    workdaySeconds: startOfDay && baseReturn && !Number.isNaN(baseReturn.valueOf()) ? Math.max(0, Math.round((baseReturn - startOfDay) / 1000)) : null,
    overtimeSeconds: baseReturn && !Number.isNaN(baseReturn.valueOf()) ? Math.max(0, Math.round((baseReturn - endOfNorm) / 1000)) : null,
  };
}
function peopleList() {
  return db.prepare(`SELECT name FROM employees WHERE TRIM(name)!='' UNION SELECT employee_name name FROM assignments WHERE TRIM(employee_name)!='' ORDER BY name COLLATE NOCASE`).all().map(row => row.name);
}
function vehicleReport(url) {
  ensureVehicleExceptions();
  const { from, to, vehicleIds, noVehicles, activeOnly } = filters(url);
  const search = String(url.searchParams.get("search") || "").trim();
  const where = ["d.work_date BETWEEN ? AND ?", "v.active=1"];
  const whereParams = [from, to];
  if (noVehicles) where.push("0=1");
  else if (vehicleIds.length) {
    where.push(`d.vehicle_id IN (${vehicleIds.map(() => "?").join(",")})`);
    whereParams.push(...vehicleIds);
  }
  // A positive daily distance is derived from GLONASS movement events, so it is
  // both the activity signal and a much cheaper filter than probing segments
  // again for every report row.
  if (activeOnly) where.push("COALESCE(d.distance_km,0)>0");
  if (search) {
    const like = `%${search}%`;
    where.push(`(
      v.name LIKE ? COLLATE NOCASE OR v.plate LIKE ? COLLATE NOCASE OR
      EXISTS (SELECT 1 FROM assignments search_assignment
        WHERE search_assignment.work_date=d.work_date AND search_assignment.vehicle_id=d.vehicle_id
          AND (search_assignment.work_object LIKE ? COLLATE NOCASE
            OR search_assignment.employee_name LIKE ? COLLATE NOCASE
            OR search_assignment.vehicle_label LIKE ? COLLATE NOCASE))
    )`);
    whereParams.push(like, like, like, like, like);
  }
  const whereSql = where.join(" AND ");
  const part = url.searchParams.get("part") || "all";
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("page_size")) || 50));
  const requestedPage = Math.max(1, Math.floor(Number(url.searchParams.get("page")) || 1));
  const paginated = url.searchParams.has("page");
  const summary = () => {
    const row = db.prepare(`SELECT COUNT(*) days,COUNT(DISTINCT d.vehicle_id) vehicles,
      COALESCE(SUM(d.distance_km),0) distance_km,COALESCE(SUM(d.site_seconds),0) site_seconds,
      COALESCE(SUM(CASE WHEN d.confirmation_status='not_confirmed' OR TRIM(COALESCE(d.data_control,''))!='' THEN 1 ELSE 0 END),0) issues
      FROM effective_vehicle_days d JOIN vehicles v ON v.id=d.vehicle_id WHERE ${whereSql}`).get(...whereParams);
    return { ...row, days: Number(row.days || 0), vehicles: Number(row.vehicles || 0), issues: Number(row.issues || 0) };
  };
  if (part === "summary") {
    const totals = summary(), total = totals.days, pages = Math.ceil(total / pageSize);
    return { rows: [], pagination: { page: Math.min(requestedPage, Math.max(1, pages)), page_size: pageSize, total, pages }, totals, vehicles: listVehicles().map(({ id, name, plate }) => ({ id, name, plate })) };
  }
  let page = requestedPage, total = null, totals = {};
  if (part === "all") {
    totals = summary(); total = totals.days;
    page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)));
  }
  const limitSql = paginated ? " LIMIT ? OFFSET ?" : "";
  const rowParams = [...whereParams, ...(paginated ? [pageSize, (page - 1) * pageSize] : [])];
  const selected = db.prepare(`SELECT d.*,v.name vehicle_name,v.plate vehicle_plate,v.glonass_name
    FROM effective_vehicle_days d JOIN vehicles v ON v.id=d.vehicle_id
    WHERE ${whereSql}
    ORDER BY d.work_date DESC,v.name${limitSql}`).all(...rowParams);
  const activeVehicles = db.prepare("SELECT id,name,plate FROM vehicles WHERE active=1").all();
  const assignmentMap = new Map(), segmentMapForPage = new Map();
  if (selected.length) {
    const pairWhere = selected.map(() => "(work_date=? AND vehicle_id=?)").join(" OR ");
    const pairParams = selected.flatMap(row => [row.work_date, row.vehicle_id]);
    for (const assignment of db.prepare(`SELECT work_date,vehicle_id,work_object,employee_name,work_type,vehicle_label,source FROM assignments WHERE ${pairWhere}`).all(...pairParams)) {
      const key = `${assignment.work_date}|${assignment.vehicle_id}`;
      if (!assignmentMap.has(key)) assignmentMap.set(key, []);
      assignmentMap.get(key).push(assignment);
    }
    for (const segment of db.prepare(`SELECT work_date,vehicle_id,event_type,is_base,start_lat,start_lon,end_lat,end_lon,duration_seconds,distance_km FROM effective_vehicle_segments WHERE ${pairWhere}`).all(...pairParams)) {
      const key = `${segment.work_date}|${segment.vehicle_id}`;
      if (!segmentMapForPage.has(key)) segmentMapForPage.set(key, []);
      segmentMapForPage.get(key).push(segment);
    }
  }
  const employeePositions = new Map(db.prepare("SELECT name,position FROM employees").all().map(employee => [employee.name, employee.position || ""]));
  const preferredValues = (items, getter) => {
    const google = items.filter(item => item.source === "google").map(getter).filter(Boolean);
    return [...new Set((google.length ? google : items.map(getter).filter(Boolean)))];
  };
  const rows = selected.map(rawRow => {
    const key = `${rawRow.work_date}|${rawRow.vehicle_id}`;
    const assignments = assignmentMap.get(key) || [], pageSegments = segmentMapForPage.get(key) || [];
    const objects = preferredValues(assignments, item => String(item.work_object || "").trim());
    const crew = preferredValues(assignments, item => String(item.employee_name || "").trim());
    const workTypes = preferredValues(assignments, item => String(item.work_type || "").trim());
    const vehicleEntries = preferredValues(assignments.filter(item => String(item.vehicle_label || "").trim()), item => `${item.employee_name}|${item.vehicle_label}`);
    const masters = [...new Set(assignments.filter(item => item.source === "google" && /мастер/i.test(employeePositions.get(item.employee_name) || "")).map(item => item.employee_name))];
    const row = {
      ...rawRow,
      objects: objects.join(",") || rawRow.work_object,
      object_count: objects.length,
      crew: crew.join(","),
      work_types: workTypes.join(","),
      vehicle_entries: vehicleEntries.join(","),
      masters: masters.join(","),
      movement_segments: pageSegments.filter(segment => segment.event_type === "movement").length,
      segment_count: pageSegments.filter(segment => ["movement", "stop", "idle"].includes(segment.event_type)).length,
      work_stops: pageSegments.filter(segment => ["stop", "idle"].includes(segment.event_type) && !segment.is_base && segment.duration_seconds >= 300).length,
    };
    const { startLabel, baseReturn, endOfNorm, workdaySeconds, overtimeSeconds } = workdayMetrics(row);
    const comments = [row.deviation_comment].filter(Boolean);
    if (!row.base_departure) comments.push("Нет зафиксированного выезда с базы.");
    if (baseReturn && baseReturn < endOfNorm) comments.push("Возврат на базу раньше 17:00.");
    if (!comments.length) comments.push("Отклонений от обычного не выявлено.");
    return {
      ...row,
      driver: driverFromEntries(row.vehicle_entries, row.vehicle_id, activeVehicles),
      work_seconds: confirmedWorkSeconds(row, pageSegments),
      workday_start: startLabel,
      workday_seconds: workdaySeconds,
      overtime_seconds: overtimeSeconds,
      outbound_assessment: roadAssessment(true, row.confirmation_status, row.outbound_seconds, row.outbound_stops_seconds),
      return_assessment: roadAssessment(true, row.confirmation_status, row.return_seconds, row.return_stops_seconds),
      report_comment: [...new Set(comments)].join(" "),
    };
  });
  return {
    rows,
    pagination: { page, page_size: pageSize, total, pages: total == null ? null : Math.ceil(total / pageSize) },
    totals,
    vehicles: part === "all" ? listVehicles().map(({ id, name, plate }) => ({ id, name, plate })) : [],
  };
}
function peopleReport(url) {
  ensureVehicleExceptions();
  const { from, to, employees } = filters(url), employeeWhere = employees.length ? ` AND employee_name IN (${employees.map(() => "?").join(",")})` : "";
  const rows = db.prepare(`
    WITH object_rows AS (
      SELECT
        work_date,
        employee_name,
        work_object,
        COALESCE(
          NULLIF(GROUP_CONCAT(DISTINCT CASE WHEN source='google' THEN NULLIF(work_type,'') END),''),
          GROUP_CONCAT(DISTINCT NULLIF(work_type,''))
        ) work_type,
        COALESCE(
          NULLIF(GROUP_CONCAT(DISTINCT CASE WHEN source='google' THEN NULLIF(note,'') END),''),
          GROUP_CONCAT(DISTINCT NULLIF(note,''))
        ) note,
        COALESCE(
          NULLIF(GROUP_CONCAT(DISTINCT CASE WHEN source='google' THEN NULLIF(vehicle_label,'') END),''),
          GROUP_CONCAT(DISTINCT NULLIF(vehicle_label,''))
        ) vehicle_label,
        CASE WHEN COUNT(DISTINCT vehicle_id)=1 THEN MAX(vehicle_id) END vehicle_id,
        COUNT(DISTINCT vehicle_id) vehicle_count,
        CASE
          WHEN SUM(CASE WHEN source='google' THEN 1 ELSE 0 END)>0
          THEN SUM(CASE WHEN source='google' THEN 1 ELSE 0 END)
          ELSE COUNT(*)
        END assignment_rows
      FROM assignments
      WHERE work_date BETWEEN ? AND ? ${employeeWhere}
      GROUP BY work_date,employee_name,work_object
    ),
    daily AS (
      SELECT
        work_date,
        employee_name,
        GROUP_CONCAT(DISTINCT NULLIF(work_object,'')) work_object,
        GROUP_CONCAT(DISTINCT NULLIF(work_type,'')) work_type,
        GROUP_CONCAT(DISTINCT NULLIF(note,'')) note,
        GROUP_CONCAT(DISTINCT NULLIF(vehicle_label,'')) vehicle_label,
        CASE WHEN COUNT(DISTINCT vehicle_id)=1 THEN MAX(vehicle_id) END vehicle_id,
        COUNT(DISTINCT vehicle_id) vehicle_count,
        SUM(assignment_rows) assignment_rows
      FROM object_rows
      GROUP BY work_date,employee_name
    )
    SELECT daily.*,emp.position employee_position,v.name vehicle_name,v.plate vehicle_plate,
      d.id fact_id,d.base_departure,d.site_arrival,d.site_departure,d.base_return,
      d.outbound_seconds,d.outbound_stops_seconds,d.return_seconds,d.return_stops_seconds,
      d.site_seconds,d.shift_seconds,d.distance_km,d.speeding_events,d.actual_lat,d.actual_lon,
      d.confirmation_status,d.data_control,d.deviation_comment,
      COALESCE(
        (SELECT GROUP_CONCAT(DISTINCT a.employee_name || '|' || a.vehicle_label) FROM assignments a
          WHERE a.work_date=daily.work_date AND a.vehicle_id=daily.vehicle_id AND a.source='google' AND TRIM(COALESCE(a.vehicle_label,''))!=''),
        (SELECT GROUP_CONCAT(DISTINCT a.employee_name || '|' || a.vehicle_label) FROM assignments a
          WHERE a.work_date=daily.work_date AND a.vehicle_id=daily.vehicle_id AND TRIM(COALESCE(a.vehicle_label,''))!='')
      ) vehicle_entries,
      (SELECT GROUP_CONCAT(DISTINCT a.employee_name) FROM assignments a
        WHERE a.work_date=daily.work_date AND a.vehicle_id=daily.vehicle_id AND a.source='google') crew,
      (SELECT GROUP_CONCAT(DISTINCT a.employee_name) FROM assignments a
        JOIN employees master ON master.name=a.employee_name
        WHERE a.work_date=daily.work_date AND a.vehicle_id=daily.vehicle_id AND a.source='google' AND (master.position LIKE '%Мастер%' OR master.position LIKE '%мастер%')) masters
    FROM daily
    LEFT JOIN employees emp ON emp.name=daily.employee_name
    LEFT JOIN vehicles v ON v.id=daily.vehicle_id
    LEFT JOIN effective_vehicle_days d ON d.work_date=daily.work_date AND d.vehicle_id=daily.vehicle_id
    ORDER BY daily.work_date DESC,daily.employee_name
  `).all(from, to, ...employees);
  const activeVehicles = db.prepare("SELECT id,name,plate FROM vehicles WHERE active=1").all(), segments = segmentMap(from, to);
  const enrichedRows = rows.map(row => {
    const { startLabel, baseReturn, endOfNorm, workdaySeconds, overtimeSeconds } = workdayMetrics(row);
    const transitDifferenceSeconds = row.outbound_seconds != null && row.return_seconds != null ? Number(row.outbound_seconds) - Number(row.return_seconds) : null;
    const comments = [row.deviation_comment].filter(Boolean);
    if (!row.vehicle_id) comments.push("В разнарядке нельзя однозначно определить автомобиль.");
    else if (!row.fact_id) comments.push("Факт ГЛОНАСС по назначенному автомобилю ещё не загружен.");
    if (baseReturn && baseReturn < endOfNorm) comments.push(`Возврат на базу раньше 17:00.`);
    if (!comments.length) comments.push("Отклонений от обычного не выявлено.");
    const driver = driverFromEntries(row.vehicle_entries, row.vehicle_id, activeVehicles);
    return {
      ...row,
      driver,
      work_seconds: confirmedWorkSeconds(row, segments.get(`${row.work_date}|${row.vehicle_id}`) || []),
      workday_start: startLabel,
      workday_seconds: workdaySeconds,
      overtime_seconds: overtimeSeconds,
      transit_difference_seconds: transitDifferenceSeconds,
      outbound_assessment: roadAssessment(Boolean(row.fact_id), row.confirmation_status, row.outbound_seconds, row.outbound_stops_seconds),
      return_assessment: roadAssessment(Boolean(row.fact_id), row.confirmation_status, row.return_seconds, row.return_stops_seconds),
      report_comment: [...new Set(comments)].join(" "),
    };
  });
  const people = peopleList();
  return { rows: enrichedRows, totals: { rows: rows.length, assignments: rows.reduce((sum, row) => sum + Number(row.assignment_rows || 0), 0), people: new Set(rows.map(r => r.employee_name)).size, linked: rows.filter(r => r.vehicle_id).length, fact: rows.filter(r => r.fact_id).length }, people };
}

function analyticsReport(url) {
  const mode = url.searchParams.get("mode") === "person" ? "person" : "vehicle", { from, to, vehicleId, employees } = filters(url);
  let rows = [], title = "Выберите объект анализа";
  if (mode === "vehicle" && vehicleId) {
    const report = vehicleReport(url), segments = segmentMap(from, to, vehicleId); rows = report.rows.map(row => ({ ...row, segments: segments.get(`${row.work_date}|${row.vehicle_id}`) || [] }));
    const vehicle = listVehicles(true).find(item => item.id === vehicleId); title = vehicle ? `${vehicle.name} · ${vehicle.plate}` : title;
  } else if (mode === "person" && employees[0]) {
    const report = peopleReport(url), segments = segmentMap(from, to);
    rows = report.rows.map(row => ({ ...row, segments: segments.get(`${row.work_date}|${row.vehicle_id}`) || [] })); title = employees[0];
  }
  rows = rows.map(row => {
    const hasSite = row.actual_lat != null && row.actual_lon != null;
    const workSeconds = hasSite ? confirmedWorkSeconds(row, row.segments || []) : Number(row.work_seconds ?? row.site_seconds ?? 0);
    return { ...row, work_seconds: workSeconds };
  });
  const movementSeconds = rows.reduce((sum, row) => { const seconds = (row.segments || []).filter(item => item.event_type === "movement").reduce((part, item) => part + Number(item.duration_seconds || 0), 0); return sum + (seconds || Number(row.outbound_seconds || 0) + Number(row.return_seconds || 0)); }, 0);
  const siteSeconds = rows.reduce((sum, row) => sum + Number(row.work_seconds || 0), 0), distance = rows.reduce((sum, row) => sum + Number(row.distance_km || 0), 0), speeding = rows.reduce((sum, row) => sum + Number(row.speeding_events || 0), 0);
  const departureMinutes = rows.map(row => row.base_departure ? Number(row.base_departure.slice(11,13)) * 60 + Number(row.base_departure.slice(14,16)) : null).filter(value => value != null);
  const noTrip = rows.filter(row => row.confirmation_status === "not_confirmed").length, averageDeparture = departureMinutes.length ? Math.round(departureMinutes.reduce((a,b) => a+b,0) / departureMinutes.length) : null;
  const topDay = [...rows].sort((a,b) => Number(b.distance_km || 0) - Number(a.distance_km || 0))[0];
  const insights = [
    rows.length ? `За период зафиксировано ${rows.length} рабочих дней и ${distance.toFixed(1)} км пробега.` : "За выбранный период фактических дней нет.",
    siteSeconds ? `На подтверждённых рабочих точках проведено ${(siteSeconds / 3600).toFixed(1)} ч.` : "Рабочие остановки на объектах не подтверждены.",
    noTrip ? `${noTrip} плановых выездов не подтверждены движением ГЛОНАСС.` : "Плановые выезды с фактом не содержат дней без движения.",
    topDay?.distance_km ? `Максимальный пробег — ${Number(topDay.distance_km).toFixed(1)} км (${topDay.work_date}).` : "",
  ].filter(Boolean);
  return {
    mode, title, rows, insights,
    totals: { days: rows.length, distance_km: distance, site_seconds: siteSeconds, movement_seconds: movementSeconds, speeding_events: speeding, no_trip_days: noTrip, average_departure_minutes: averageDeparture },
    vehicles: listVehicles().map(({ id,name,plate }) => ({ id,name,plate })),
    people: peopleList(),
  };
}
function vehicleSegments(url) { const date = url.searchParams.get("date") || "", vehicleId = Number(url.searchParams.get("vehicle_id") || 0); if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !vehicleId) throw new Error("Укажите дату и автомобиль"); return { rows: db.prepare("SELECT * FROM effective_vehicle_segments WHERE work_date=? AND vehicle_id=? ORDER BY event_start").all(date, vehicleId) }; }

// A named base needs one preceding day to recover a zone interval that started
// before midnight. Six report days plus that lookback stay within the API's
// seven-day calculator limit.
const SYNC_CHUNK_DAYS = 6;
const syncState = { running: false, phase: "idle", started_at: null, finished_at: null, date_from: null, date_to: null, chunk: 0, chunks: 0, vehicle: "", vehicle_index: 0, vehicle_total: 0, result: null, error: null };
let syncPromise = null;
function dateOnly(value) { return new Date(value).toISOString().slice(0,10); }
function addDays(value, days) { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return dateOnly(date); }
function todayMoscow() { return dateOnly(new Date(Date.now() + 3 * 3600e3)); }
async function runFullSync(dateFrom, dateTo, source = "manual") {
  if (syncState.running) return syncPromise;
  Object.assign(syncState, { running: true, phase: "google", started_at: new Date().toISOString(), finished_at: null, date_from: dateFrom, date_to: dateTo, chunk: 0, chunks: Math.ceil((new Date(`${dateTo}T00:00:00Z`) - new Date(`${dateFrom}T00:00:00Z`) + 86400e3) / 86400e3 / SYNC_CHUNK_DAYS), vehicle: "", vehicle_index: 0, vehicle_total: 0, result: null, error: null });
  const run = db.prepare("INSERT INTO sync_runs(source,started_at,status,details) VALUES(?,?,?,?)").run(`full_${source}`, syncState.started_at, "running", JSON.stringify({ date_from: dateFrom, date_to: dateTo }));
  syncPromise = (async () => {
    try {
      let google = null, google_error = null;
      try { google = await syncGoogle(); } catch (error) { google_error = error.message || "Не удалось обновить Google Sheets"; }
      ensureVehicleExceptions();
      if (source === "manual_full") {
        dateFrom = db.prepare("SELECT MIN(work_date) date FROM (SELECT work_date FROM assignments UNION ALL SELECT work_date FROM vehicle_days)").get()?.date || dateFrom;
        Object.assign(syncState, { date_from: dateFrom, chunks: Math.ceil((new Date(`${dateTo}T00:00:00Z`) - new Date(`${dateFrom}T00:00:00Z`) + 86400e3) / 86400e3 / SYNC_CHUNK_DAYS) });
      }
      const settings = await loadSettings(), chunks = [];
      let cursor = dateFrom, chunk = 0;
      while (cursor <= dateTo) {
        const end = addDays(cursor, SYNC_CHUNK_DAYS - 1) > dateTo ? dateTo : addDays(cursor, SYNC_CHUNK_DAYS - 1); chunk += 1;
        Object.assign(syncState, { phase: "glonass", chunk, vehicle: "", vehicle_index: 0, vehicle_total: 0 });
        chunks.push(await syncGlonassFacts({ db, settings, dateFrom: cursor, dateTo: end, onProgress: progress => Object.assign(syncState, progress) }));
        cursor = addDays(end, 1);
      }
      const result = { google, google_error, chunks, days_saved: chunks.reduce((sum,item) => sum + item.days_saved,0), segments_saved: chunks.reduce((sum,item) => sum + item.segments_saved,0) };
      const status = google_error ? "partial" : "ok";
      Object.assign(syncState, { running: false, phase: "done", finished_at: new Date().toISOString(), result, error: google_error });
      db.prepare("UPDATE sync_runs SET finished_at=?,status=?,details=? WHERE id=?").run(syncState.finished_at, status, JSON.stringify(result), run.lastInsertRowid);
      return result;
    } catch (error) {
      Object.assign(syncState, { running: false, phase: "error", finished_at: new Date().toISOString(), error: error.message });
      db.prepare("UPDATE sync_runs SET finished_at=?,status='error',details=? WHERE id=?").run(syncState.finished_at, error.message, run.lastInsertRowid); throw error;
    }
  })();
  syncPromise.catch(error => console.error("Full sync failed", error));
  return syncPromise;
}
function startFullSync(dateFrom, dateTo, source = "manual") { if (syncState.running) return false; runFullSync(dateFrom, dateTo, source).catch(() => {}); return true; }
async function runVehicleSync(vehicleId, dateFrom, dateTo, source = "manual") {
  if (syncState.running) return syncPromise;
  const vehicle = db.prepare("SELECT * FROM vehicles WHERE id=? AND active=1 AND match_status='matched'").get(vehicleId);
  if (!vehicle) throw new Error("Автомобиль ещё не сопоставлен с ГЛОНАСС");
  const totalChunks = Math.ceil((new Date(`${dateTo}T00:00:00Z`) - new Date(`${dateFrom}T00:00:00Z`) + 86400e3) / 86400e3 / SYNC_CHUNK_DAYS);
  Object.assign(syncState, { running: true, phase: "glonass", started_at: new Date().toISOString(), finished_at: null, date_from: dateFrom, date_to: dateTo, chunk: 0, chunks: totalChunks, vehicle: `${vehicle.name} ${vehicle.plate}`, vehicle_index: 0, vehicle_total: 1, result: null, error: null });
  const run = db.prepare("INSERT INTO sync_runs(source,started_at,status,details) VALUES(?,?,?,?)").run(`vehicle_${source}`, syncState.started_at, "running", JSON.stringify({ vehicle_id: vehicleId, date_from: dateFrom, date_to: dateTo }));
  syncPromise = (async () => {
    try {
      const settings = await loadSettings(), chunks = [];
      let cursor = dateFrom, chunk = 0;
      while (cursor <= dateTo) {
        const end = addDays(cursor, SYNC_CHUNK_DAYS - 1) > dateTo ? dateTo : addDays(cursor, SYNC_CHUNK_DAYS - 1); chunk += 1;
        Object.assign(syncState, { chunk, vehicle_index: 0, vehicle_total: 1 });
        chunks.push(await syncGlonassFacts({ db, settings, dateFrom: cursor, dateTo: end, vehicleId, onProgress: progress => Object.assign(syncState, progress) }));
        cursor = addDays(end, 1);
      }
      const result = { vehicle_id: vehicleId, chunks, days_saved: chunks.reduce((sum, item) => sum + item.days_saved, 0), segments_saved: chunks.reduce((sum, item) => sum + item.segments_saved, 0), errors: chunks.flatMap(item => item.errors || []) };
      const status = result.errors.length ? "partial" : "ok";
      Object.assign(syncState, { running: false, phase: "done", finished_at: new Date().toISOString(), result, error: result.errors.join("; ") || null });
      db.prepare("UPDATE sync_runs SET finished_at=?,status=?,details=? WHERE id=?").run(syncState.finished_at, status, JSON.stringify(result), run.lastInsertRowid);
      return result;
    } catch (error) {
      Object.assign(syncState, { running: false, phase: "error", finished_at: new Date().toISOString(), error: error.message });
      db.prepare("UPDATE sync_runs SET finished_at=?,status='error',details=? WHERE id=?").run(syncState.finished_at, error.message, run.lastInsertRowid); throw error;
    }
  })();
  syncPromise.catch(error => console.error("Vehicle sync failed", error));
  return syncPromise;
}
function startVehicleSync(vehicleId, source = "manual") {
  if (syncState.running) return false;
  const to = todayMoscow(), firstAssignment = db.prepare("SELECT MIN(work_date) date FROM assignments WHERE vehicle_id=?").get(vehicleId)?.date;
  runVehicleSync(vehicleId, firstAssignment || addDays(to, -6), to, source).catch(() => {}); return true;
}
function scheduleNightlySync() {
  const now = new Date(), next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 0)); if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  setTimeout(() => { const to = todayMoscow(); startFullSync(addDays(to, -6), to, "nightly"); scheduleNightlySync(); }, next - now);
}

async function serveStatic(req, res, pathname) {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, ""), target = path.resolve(publicDir, relative);
  if (!target.startsWith(path.resolve(publicDir))) return json(res, 403, { error: "Доступ запрещён" });
  try { const stat = await fsp.stat(target), file = stat.isDirectory() ? path.join(target, "index.html") : target, extension = path.extname(file), types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".json": "application/json; charset=utf-8" }; res.writeHead(200, { "Content-Type": types[extension] || "application/octet-stream", "Cache-Control": "no-store" }); fs.createReadStream(file).pipe(res); }
  catch { if (!pathname.startsWith("/api/")) return serveStatic(req, res, "/"); json(res, 404, { error: "Не найдено" }); }
}

async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`), pathname = url.pathname;
  try {
    if (pathname === "/api/health") return json(res, 200, { ok: true, database: true });
    if (pathname === "/api/auth/session") return json(res, 200, { authenticated: authenticated(req), login: authenticated(req) ? loginName : null });
    if (pathname === "/api/auth/login" && req.method === "POST") {
      const ip = req.socket.remoteAddress || "unknown", current = attempts.get(ip) || { count: 0, until: 0 };
      if (current.until > Date.now()) return json(res, 429, { error: "Слишком много попыток. Подождите несколько минут." });
      const body = await readJson(req);
      const cleanCredential = value => String(value || "").trim().replace(/^`+|`+$/g, "");
      if (!safeEqual(cleanCredential(body.login), loginName) || !safeEqual(cleanCredential(body.password), loginPassword)) { current.count += 1; if (current.count >= 5) { current.until = Date.now() + 5 * 60 * 1000; current.count = 0; } attempts.set(ip, current); return json(res, 401, { error: "Неверный логин или пароль" }); }
      attempts.delete(ip); return json(res, 200, { ok: true }, { "Set-Cookie": `${sessionCookie}=${encodeURIComponent(makeSession())}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${sessionLifetimeSeconds}` });
    }
    if (pathname === "/api/auth/logout" && req.method === "POST") return json(res, 200, { ok: true }, { "Set-Cookie": `${sessionCookie}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0` });
    if (pathname.startsWith("/api/") && !requireAuth(req, res)) return;
    if (pathname === "/api/settings" && req.method === "GET") { const settings = await loadSettings(), { glonass_api_key, glonass_password, glonass_username, ...safe } = settings; return json(res, 200, { ...safe, glonass_api_key_configured: Boolean(glonass_api_key), glonass_password_configured: Boolean(glonass_password), glonass_username_configured: Boolean(glonass_username) }); }
    if (pathname === "/api/settings" && req.method === "PUT") {
      const current = await loadSettings(), body = await readJson(req), next = { ...current }, allowed = ["google_sheet_url", "vehicle_sheet_name", "vehicle_model_column", "vehicle_plate_column", "assignments_sheet_name", "glonass_login_url", "timezone"];
      for (const key of allowed) if (typeof body[key] === "string") next[key] = body[key].trim(); for (const key of ["glonass_username", "glonass_api_key", "glonass_password"]) if (typeof body[key] === "string" && body[key]) next[key] = body[key].trim();
      if (Array.isArray(body.google_sheet_urls)) next.google_sheet_urls = [...new Set(body.google_sheet_urls.map(value => String(value || "").trim()).filter(Boolean))];
      else if (typeof body.google_sheet_urls === "string") next.google_sheet_urls = [...new Set(body.google_sheet_urls.split(/\r?\n/).map(value => value.trim()).filter(Boolean))];
      if (next.google_sheet_urls?.length) next.google_sheet_url = next.google_sheet_urls[0];
      if (!/^[A-Z]{1,3}$/i.test(next.vehicle_model_column) || !/^[A-Z]{1,3}$/i.test(next.vehicle_plate_column)) throw new Error("Колонки должны быть указаны буквами, например J и K");
      const sourceUrls = next.google_sheet_urls?.length ? next.google_sheet_urls : [next.google_sheet_url]; sourceUrls.forEach(sheetId); await saveSettings(next); return json(res, 200, { ok: true });
    }
    if (pathname === "/api/settings/test-glonass" && req.method === "POST") {
      const current = await loadSettings(), body = await readJson(req), test = { ...current };
      for (const key of ["glonass_login_url","glonass_username","glonass_password","glonass_api_key"]) if (typeof body[key] === "string" && body[key].trim()) test[key] = body[key].trim();
      const loginUrl = new URL(test.glonass_login_url); loginUrl.searchParams.set("apikey", test.glonass_api_key); loginUrl.searchParams.set("name", test.glonass_username); loginUrl.searchParams.set("pwd", test.glonass_password); loginUrl.searchParams.set("indented", "false");
      const response = await fetch(loginUrl, { signal: AbortSignal.timeout(30000) }); if (!response.ok) throw new Error(`ГЛОНАСС HTTP ${response.status}`); const result = await response.json(); if (!result.user?.id) throw new Error("ГЛОНАСС не подтвердил пользователя"); return json(res, 200, { ok: true });
    }
    if (pathname === "/api/vehicles" && req.method === "GET") { if (!db.prepare("SELECT COUNT(*) n FROM vehicles").get().n) await syncGoogle(); const vehicles = listVehicles(url.searchParams.get("all") === "1"), matchedCount = db.prepare("SELECT COUNT(*) n FROM vehicles WHERE active=1 AND match_status='matched'").get().n; return json(res, 200, { vehicles, matched_count: matchedCount }); }
    if (pathname === "/api/vehicles" && req.method === "POST") {
      const body = await readJson(req), name = String(body.name || "").trim(), plate = canonicalPlate(body.plate), normalized = normalizePlate(plate);
      if (!name || !normalized) return json(res, 400, { error: "Укажите название и госномер" });
      const now = new Date().toISOString();
      db.prepare(`INSERT INTO vehicles(name,plate,normalized_plate,source,manual_override,active,updated_at) VALUES(?,?,?,?,1,1,?) ON CONFLICT(normalized_plate) DO UPDATE SET name=excluded.name,plate=excluded.plate,source='manual',manual_override=1,active=1,updated_at=excluded.updated_at`).run(name, plate, normalized, "manual", now);
      const id = db.prepare("SELECT id FROM vehicles WHERE normalized_plate=?").get(normalized).id;
      await refreshVehicleMatches(await loadSettings(), [id]);
      const syncStarted = db.prepare("SELECT match_status FROM vehicles WHERE id=?").get(id)?.match_status === "matched" ? startVehicleSync(id, "added") : false;
      return json(res, 201, { ok: true, sync_started: syncStarted, vehicle: listVehicles(true).find(item => item.id === id) });
    }
    const ruleMatch = pathname.match(/^\/api\/vehicles\/(\d+)\/rule$/);
    if (ruleMatch && req.method === "PUT") {
      const id = Number(ruleMatch[1]), body = await readJson(req), source = Number(body.source_vehicle_id) || null;
      if (!db.prepare("SELECT id FROM vehicles WHERE id=? AND active=1").get(id)) return json(res,404,{error:"Автомобиль не найден"});
      if (source && (source === id || !db.prepare("SELECT id FROM vehicles WHERE id=? AND active=1").get(source) || db.prepare("SELECT 1 FROM vehicle_rules WHERE vehicle_id=? AND source_vehicle_id IS NOT NULL OR source_vehicle_id=?").get(source,id))) return json(res,400,{error:"Источник должен быть отдельным активным автомобилем без цепочки исключений"});
      db.prepare("INSERT INTO vehicle_rules(vehicle_id,source_vehicle_id,departure_start,base_name,base_id) VALUES(?,?,?,?,?) ON CONFLICT(vehicle_id) DO UPDATE SET source_vehicle_id=excluded.source_vehicle_id,departure_start=excluded.departure_start,base_name=excluded.base_name,base_id=excluded.base_id").run(id,source,body.departure_start ? 1 : 0,String(body.base_name ?? db.prepare("SELECT base_name FROM vehicle_rules WHERE vehicle_id=?").get(id)?.base_name ?? "").trim(),body.base_id === undefined ? db.prepare("SELECT base_id FROM vehicle_rules WHERE vehicle_id=?").get(id)?.base_id || null : Number(body.base_id) || null);
      return json(res,200,{ok:true});
    }
    const vehicleMatch = pathname.match(/^\/api\/vehicles\/(\d+)$/);
    const vehicleCheckMatch = pathname.match(/^\/api\/vehicles\/(\d+)\/check$/);
    if (vehicleCheckMatch && req.method === "POST") { const id = Number(vehicleCheckMatch[1]); if (!db.prepare("SELECT id FROM vehicles WHERE id=?").get(id)) return json(res,404,{error:"Автомобиль не найден"}); await refreshVehicleMatches(await loadSettings(), [id]); const syncStarted = db.prepare("SELECT match_status FROM vehicles WHERE id=?").get(id)?.match_status === "matched" ? startVehicleSync(id, "checked") : false; return json(res,200,{ok:true,sync_started:syncStarted,vehicle:listVehicles(true).find(item=>item.id===id)}); }
    if (vehicleMatch && req.method === "PUT") { const id = Number(vehicleMatch[1]), body = await readJson(req), name = String(body.name || "").trim(), plate = canonicalPlate(body.plate), normalized = normalizePlate(plate), current = db.prepare("SELECT * FROM vehicles WHERE id=?").get(id); if (!current) return json(res, 404, { error: "Автомобиль не найден" }); if (!name || !normalized) return json(res, 400, { error: "Укажите название и госномер" }); const duplicate = db.prepare("SELECT id FROM vehicles WHERE normalized_plate=? AND id!=?").get(normalized,id); if (duplicate) return json(res, 409, { error: "Автомобиль с таким госномером уже существует" }); db.prepare("UPDATE vehicles SET name=?,plate=?,normalized_plate=?,source='manual',manual_override=1,active=1,match_status='not_checked',updated_at=? WHERE id=?").run(name,plate,normalized,new Date().toISOString(),id); await refreshVehicleMatches(await loadSettings(), [id]); const syncStarted = db.prepare("SELECT match_status FROM vehicles WHERE id=?").get(id)?.match_status === "matched" ? startVehicleSync(id, "edited") : false; return json(res, 200, { ok: true, sync_started: syncStarted, vehicle: listVehicles(true).find(item => item.id === id) }); }
    if (vehicleMatch && req.method === "DELETE") { db.prepare("UPDATE vehicles SET active=0,updated_at=? WHERE id=?").run(new Date().toISOString(), Number(vehicleMatch[1])); return json(res, 200, { ok: true }); }
    if (pathname === "/api/sync/google" && req.method === "POST") return json(res, 200, { ok: true, ...(await syncGoogle()) });
    if (pathname === "/api/sync/glonass" && req.method === "POST") { const body = await readJson(req), settings = await loadSettings(); return json(res, 200, { ok: true, ...(await syncGlonassFacts({ db, settings, dateFrom: body.date_from, dateTo: body.date_to, vehicleId: Number(body.vehicle_id || 0) })) }); }
    if (pathname === "/api/sync/all" && req.method === "POST") { const body = await readJson(req), dateTo = body.mode === "recent" || body.mode === "full" ? todayMoscow() : String(body.date_to || todayMoscow()), dateFrom = body.mode === "recent" ? addDays(dateTo,-2) : body.mode === "full" ? (db.prepare("SELECT MIN(work_date) date FROM (SELECT work_date FROM assignments UNION ALL SELECT work_date FROM vehicle_days)").get()?.date || addDays(dateTo,-6)) : String(body.date_from || ""); if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo) || dateFrom > dateTo) return json(res, 400, { error: "Проверьте период синхронизации" }); const started = startFullSync(dateFrom, dateTo, body.mode === "full" ? "manual_full" : "manual"); return json(res, started ? 202 : 409, started ? { ok: true, started: true, state: syncState } : { error: "Синхронизация уже выполняется", state: syncState }); }
    if (pathname === "/api/sync/progress" && req.method === "GET") return json(res, 200, { ...syncState, last: db.prepare("SELECT * FROM sync_runs WHERE source LIKE 'full_%' OR source LIKE 'vehicle_%' ORDER BY id DESC LIMIT 1").get() || null });
    if (pathname === "/api/reports/vehicles" && req.method === "GET") return json(res, 200, vehicleReport(url));
    if (pathname === "/api/reports/vehicle-segments" && req.method === "GET") return json(res, 200, vehicleSegments(url));
    if (pathname === "/api/reports/people" && req.method === "GET") return json(res, 200, peopleReport(url));
    if (pathname === "/api/reports/analytics" && req.method === "GET") return json(res, 200, analyticsReport(url));
    if (pathname === "/api/sync/status" && req.method === "GET") return json(res, 200, { last: db.prepare("SELECT * FROM sync_runs WHERE source LIKE 'full_%' OR source LIKE 'vehicle_%' ORDER BY id DESC LIMIT 1").get() || null });
    return serveStatic(req, res, pathname);
  } catch (error) { console.error(error); json(res, 500, { error: error.message || "Внутренняя ошибка" }); }
}

await ensureSettings();
if (process.env.TELEMETRIKA_IMPORT_DEMO_SEED === "1") await seedGlonassFacts();
scheduleNightlySync();
http.createServer(handler).listen(port, host, () => console.log(`Telemetrika control: http://${host}:${port}`));

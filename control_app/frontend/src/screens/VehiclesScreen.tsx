import React, { useEffect, useMemo, useRef, useState } from "react";
import { api, query } from "../api";
import { Button, Checkbox, DateInput, EmptyState, KpiCard, SearchInput, Toast, VehicleStatusBadge, Spinner } from "../components/ui";
import { dateRu, duration, exportTable, monthAgo, numberRu, reportStatus, time, today } from "../format";

interface Props { refreshToken: number; onViewAnalytics: (vehicleId: string) => void; }
const th = "text-left text-xs font-medium text-[#6B7280] bg-[#F9FAFB] px-3 py-2.5 whitespace-nowrap border-b border-[#E5E7EB]";
const td = "px-3 py-3 text-xs text-[#1F2937] border-b border-[#E5E7EB] whitespace-nowrap align-middle";
const tdMuted = "px-3 py-3 text-xs text-[#9CA3AF] border-b border-[#E5E7EB] whitespace-nowrap align-middle";

function VehicleMultiSelect({ vehicles, value, onChange }: { vehicles: any[]; value: string[] | null; onChange: (value: string[] | null) => void }) {
  const [open, setOpen] = useState(false);
  const allIds = vehicles.map(vehicle => String(vehicle.id));
  const checked = (id: string) => value === null || value.includes(id);
  const label = value === null ? "Все автомобили" : value.length ? `Выбрано: ${value.length}` : "Ничего не выбрано";
  const toggle = (id: string) => {
    const current = value === null ? allIds : value;
    const next = current.includes(id) ? current.filter(item => item !== id) : [...current, id];
    onChange(next.length === allIds.length ? null : next);
  };
  return <div className="relative min-w-[260px]">
    <label className="mb-1 block text-xs font-medium text-[#374151]">Автомобили</label>
    <button type="button" onClick={() => setOpen(current => !current)} className="flex h-10 w-full items-center justify-between rounded-md border border-[#D1D5DB] bg-white px-3 text-left text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#2563A6]">
      <span className="truncate">{label}</span><span className="ml-3 text-[#6B7280]">⌄</span>
    </button>
    {open && <div className="absolute left-0 top-full z-40 mt-1 w-[320px] rounded-md border border-[#D1D5DB] bg-white shadow-lg">
      <div className="flex gap-3 border-b border-[#E5E7EB] px-3 py-2 text-xs font-medium">
        <button type="button" className="text-[#2563A6]" onClick={() => onChange(null)}>Выбрать все</button>
        <button type="button" className="text-[#C43D32]" onClick={() => onChange([])}>Очистить все</button>
      </div>
      <div className="max-h-72 overflow-y-auto py-1">
        {vehicles.map(vehicle => <label key={vehicle.id} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-[#1F2937]">
          <input type="checkbox" checked={checked(String(vehicle.id))} onChange={() => toggle(String(vehicle.id))} className="h-4 w-4 accent-[#2563A6]" />
          <span className="truncate">{vehicle.name} · {vehicle.plate}</span>
        </label>)}
      </div>
      <div className="border-t border-[#E5E7EB] p-2 text-right"><button type="button" onClick={() => setOpen(false)} className="rounded bg-[#2563A6] px-3 py-1.5 text-xs font-medium text-white">Готово</button></div>
    </div>}
  </div>;
}

function Pagination({ page, pages, loading, onPage }: { page: number; pages: number; loading: boolean; onPage: (page: number) => void }) {
  const [target, setTarget] = useState(String(page));
  useEffect(() => setTarget(String(page)), [page]);
  const items = useMemo(() => {
    const visible = new Set([1, 2, pages - 1, pages, page - 2, page - 1, page, page + 1, page + 2].filter(value => value >= 1 && value <= pages));
    const sorted = [...visible].sort((a, b) => a - b), result: Array<number | string> = [];
    sorted.forEach((value, index) => { if (index && value - sorted[index - 1] > 1) result.push(`gap-${value}`); result.push(value); });
    return result;
  }, [page, pages]);
  const go = () => { const next = Math.min(pages, Math.max(1, Math.floor(Number(target) || 1))); setTarget(String(next)); onPage(next); };
  return <div className="flex flex-wrap items-center justify-center gap-2 border-t border-[#E5E7EB] bg-white px-6 py-4">
    <button type="button" disabled={loading || page <= 1} onClick={() => onPage(page - 1)} className="h-9 rounded-md border border-[#D1D5DB] px-3 text-sm disabled:opacity-40">← Назад</button>
    {items.map(item => typeof item === "string" ? <span key={item} className="px-1 text-[#9CA3AF]">…</span> : <button type="button" key={item} disabled={loading} onClick={() => onPage(item)} className={`h-9 min-w-9 rounded-md border px-2 text-sm ${item === page ? "border-[#2563A6] bg-[#2563A6] font-medium text-white" : "border-[#D1D5DB] bg-white text-[#374151]"}`}>{item}</button>)}
    <button type="button" disabled={loading || page >= pages} onClick={() => onPage(page + 1)} className="h-9 rounded-md border border-[#D1D5DB] px-3 text-sm disabled:opacity-40">Далее →</button>
    <span className="ml-3 text-sm text-[#6B7280]">Перейти на</span>
    <input aria-label="Номер страницы" type="number" min={1} max={pages} value={target} onChange={event => setTarget(event.target.value)} onKeyDown={event => { if (event.key === "Enter") go(); }} className="h-9 w-20 rounded-md border border-[#D1D5DB] px-2 text-center text-sm" />
    <button type="button" disabled={loading} onClick={go} className="h-9 rounded-md border border-[#D1D5DB] px-3 text-sm font-medium">Перейти</button>
    <span className="text-sm text-[#6B7280]">из {pages}</span>
  </div>;
}

function kmDistance(a: any[], b: any[]) { if (a.some(v => v == null) || b.some(v => v == null)) return Infinity; const rad = (v: number) => v * Math.PI / 180, r = 6371.0088, dp = rad(b[0] - a[0]), dl = rad(b[1] - a[1]), h = Math.sin(dp / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dl / 2) ** 2; return 2 * r * Math.asin(Math.sqrt(h)); }
function eventType(segment: any, row: any) { if (segment.event_type === "movement") return "drive"; if (segment.is_base) return "base"; const nearSite = kmDistance([segment.start_lat ?? segment.end_lat, segment.start_lon ?? segment.end_lon], [row.actual_lat, row.actual_lon]) <= 1.5; return nearSite ? "work" : segment.event_type === "idle" ? "idle" : "stop"; }
const eventColors: Record<string, string> = { drive: "bg-[#2563A6]", work: "bg-[#2E7D32]", stop: "bg-[#9CA3AF]", idle: "bg-[#E0A100]", base: "bg-[#374151]" };
const eventLabels: Record<string, string> = { drive: "В пути", work: "Работа на объекте", stop: "Остановка", idle: "Простой с двигателем", base: "База" };

function TripTimeline({ row, loading, error }: { row: any; loading?: boolean; error?: string }) {
  const segments = (row.segments || []).filter((s: any) => ["movement", "stop", "idle"].includes(s.event_type));
  return <div className="px-6 py-4 bg-[#F9FAFB] border-t border-[#E5E7EB]">
    <div className="text-xs font-medium text-[#6B7280] mb-3">Фактические эпизоды дня</div>
    {loading ? <div className="flex items-center gap-2 text-xs text-[#6B7280]"><Spinner size={16} /> Загружаю поездки дня…</div> : error ? <div className="text-xs text-[#C43D32]">{error}</div> : segments.length ? <div className="grid gap-1.5">{segments.map((segment: any, index: number) => { const type = eventType(segment, row); return <div key={segment.id || index} className="flex items-center gap-3 text-xs">
      <span className="text-[#6B7280] w-24 shrink-0">{time(segment.event_start)}–{time(segment.event_end)}</span>
      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${eventColors[type]}`} />
      <span className="text-[#1F2937] font-medium w-44">{eventLabels[type]}</span>
      <span className="text-[#6B7280]">{duration(segment.duration_seconds)}</span>
      {segment.event_type === "movement" && <span className="text-[#6B7280]">{numberRu(segment.distance_km)} км</span>}
      <span className="text-[#9CA3AF] truncate">{segment.address_end || segment.address_start || "Координаты зафиксированы"}</span>
    </div>; })}</div> : <div className="text-xs text-[#9CA3AF]">Подробные эпизоды за этот день не загружены.</div>}
  </div>;
}

export default function VehiclesScreen({ refreshToken, onViewAnalytics }: Props) {
  const [dateFrom, setDateFrom] = useState(monthAgo());
  const [dateTo, setDateTo] = useState(today());
  const [vehicleIds, setVehicleIds] = useState<string[] | null>(null);
  const [onlyActive, setOnlyActive] = useState(true);
  const [page, setPage] = useState(1);
  const [applied, setApplied] = useState<{ date_from: string; date_to: string; vehicle_id: string[] | null; active_only: boolean }>({ date_from: dateFrom, date_to: dateTo, vehicle_id: null, active_only: onlyActive });
  const [search, setSearch] = useState("");
  const [data, setData] = useState<any>({ rows: [], totals: {}, vehicles: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestKey, setRequestKey] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tripSegments, setTripSegments] = useState<Record<string, any[]>>({});
  const [tripLoading, setTripLoading] = useState<string | null>(null);
  const [tripErrors, setTripErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);
  const pageCache = useRef(new Map<string, any[]>());

  useEffect(() => { let cancelled = false; setError("");
    const filter: any = { ...applied, vehicle_none: applied.vehicle_id?.length === 0, page, page_size: 50, search };
    const cacheKey = JSON.stringify(filter);
    const cached = pageCache.current.get(cacheKey);
    if (cached) setData((current: any) => ({ ...current, rows: cached }));
    else setLoading(true);
    const timer = setTimeout(() => {
      const rowsRequest = api<any>(`reports/vehicles?${query({ ...filter, part: "rows" })}`).then(result => {
        if (cancelled) return;
        pageCache.current.set(cacheKey, result.rows || []);
        setData((current: any) => ({ ...current, rows: result.rows || [], pagination: { ...current.pagination, page: result.pagination?.page || page, page_size: result.pagination?.page_size || 50 } }));
      }).catch(e => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setLoading(false); });
      const summaryRequest = api<any>(`reports/vehicles?${query({ ...filter, part: "summary" })}`).then(result => {
        if (cancelled) return;
        setData((current: any) => ({ ...current, totals: result.totals || {}, vehicles: result.vehicles || [], pagination: result.pagination || current.pagination }));
        const lastPage = Math.max(1, result.pagination?.pages || 1);
        if (page > lastPage) setPage(lastPage);
        else if (page < lastPage) {
          const nextFilter = { ...filter, page: page + 1, part: "rows" }, nextKey = JSON.stringify({ ...filter, page: page + 1 });
          if (!pageCache.current.has(nextKey)) api<any>(`reports/vehicles?${query(nextFilter)}`).then(next => pageCache.current.set(nextKey, next.rows || [])).catch(() => {});
        }
      }).catch(e => { if (!cancelled) setError(e.message); });
      void Promise.allSettled([rowsRequest, summaryRequest]);
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [applied, page, search, requestKey, refreshToken]);
  useEffect(() => { pageCache.current.clear(); }, [requestKey, refreshToken]);
  useEffect(() => { setTripSegments({}); setExpanded(null); }, [requestKey, refreshToken, applied]);
  const rows = data.rows;
  const toggle = async (row: any) => { const key = `${row.work_date}|${row.vehicle_id}`; if (expanded === key) return setExpanded(null); setExpanded(key); if (tripSegments[key]) return; setTripLoading(key); setTripErrors(current => ({...current,[key]:""})); try { const result = await api<any>(`reports/vehicle-segments?${query({ date: row.work_date, vehicle_id: row.vehicle_id })}`); setTripSegments(current => ({...current,[key]:result.rows || []})); } catch (e) { const message = e instanceof Error ? e.message : "Не удалось загрузить поездки"; setTripErrors(current => ({...current,[key]:message})); setToast(message); } finally { setTripLoading(null); } };

  return <div className="flex flex-col h-full">
    <div className="bg-white border-b border-[#E5E7EB] px-6 py-4"><div className="flex flex-wrap items-end gap-3">
      <DateInput label="С" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
      <DateInput label="По" value={dateTo} onChange={e => setDateTo(e.target.value)} />
      <VehicleMultiSelect vehicles={data.vehicles} value={vehicleIds} onChange={setVehicleIds} />
      <div className="pb-0.5"><Checkbox label="Только активные" sublabel="Есть пробег и движение" checked={onlyActive} onChange={setOnlyActive} /></div>
      <Button onClick={() => { setPage(1); setApplied({ date_from: dateFrom, date_to: dateTo, vehicle_id: vehicleIds, active_only: onlyActive }); setRequestKey(v => v + 1); }}>Применить фильтр</Button>
      <Button variant="secondary" onClick={() => { setDateFrom(monthAgo()); setDateTo(today()); setVehicleIds(null); setOnlyActive(true); setSearch(""); setPage(1); setApplied({date_from:monthAgo(),date_to:today(),vehicle_id:null,active_only:true}); setRequestKey(v => v + 1); }}>Сбросить</Button>
    </div></div>
    <div className="bg-[#F3F4F6] px-6 py-4 border-b border-[#E5E7EB]"><div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
      <KpiCard label="Активных автомобилей" value={data.totals.vehicles || 0} />
      <KpiCard label="Автомобиле-дней" value={data.totals.days || 0} />
      <KpiCard label="Общий пробег" value={`${numberRu(data.totals.distance_km)} км`} />
      <KpiCard label="Работа на объектах" value={duration(data.totals.site_seconds)} />
      <KpiCard label="Есть отклонения" value={data.totals.issues || 0} accent="text-[#E0A100]" />
      <KpiCard label="Строк в отчёте" value={data.pagination?.total || 0} />
    </div></div>
    <div className="flex-1 overflow-hidden flex flex-col bg-white">
      <div className="flex items-center justify-between px-6 py-3 border-b border-[#E5E7EB]"><span className="text-sm text-[#6B7280]">Показано: {rows.length} из {data.pagination?.total || 0} строк</span><div className="flex items-center gap-3"><SearchInput placeholder="Найти машину, водителя или объект" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="w-72" /><Button variant="secondary" onClick={() => { exportTable("vehicles-table", "автомобили", "Отчёт по автомобилям"); setToast("Таблица XLS скачана"); }} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="1.5"/><path d="M12 10v7m0 0-3-3m3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}>Выгрузить страницу XLS</Button></div></div>
      <div className="flex-1 overflow-auto scrollable">
        {loading ? <div className="py-20 flex justify-center text-[#6B7280]"><Spinner size={24} /></div> : error ? <EmptyState title="Не удалось загрузить отчёт" description={error} /> : !rows.length ? <EmptyState title="Ничего не найдено" description="Измените период или отключите фильтр активных автомобилей" /> :
        <table id="vehicles-table" className="w-full border-collapse" style={{ minWidth: 3650 }}><thead className="sticky top-0 z-10"><tr>
          <th className={`${th} sticky left-0 z-20 bg-[#F9FAFB]`} style={{ minWidth: 120 }}>Дата</th>
          <th className={th} style={{ minWidth: 200 }}>Объект</th>
          <th className={th} style={{ minWidth: 180 }}>Вид работ</th>
          <th className={th} style={{ minWidth: 150 }}>Автомобиль</th>
          <th className={th} style={{ minWidth: 110 }}>Госномер</th>
          <th className={th} style={{ minWidth: 120 }}>Водитель</th>
          <th className={th} style={{ minWidth: 120 }}>Мастер</th>
          <th className={th} style={{ minWidth: 220 }}>Бригада</th>
          <th className={th} style={{ minWidth: 90 }}>Начало дня</th>
          <th className={th} style={{ minWidth: 110 }}>Выезд с базы</th>
          <th className={th} style={{ minWidth: 140 }}>Прибытие на объект</th>
          <th className={th} style={{ minWidth: 120 }}>Путь на объект</th>
          <th className={th} style={{ minWidth: 160 }}>Остановки по пути на объект</th>
          <th className={th} style={{ minWidth: 150 }}>Оценка пути на объект</th>
          <th className={th} style={{ minWidth: 140 }}>Выезд с объекта</th>
          <th className={th} style={{ minWidth: 120 }}>Возврат на базу</th>
          <th className={th} style={{ minWidth: 110 }}>Путь на базу</th>
          <th className={th} style={{ minWidth: 170 }}>Остановки по пути на базу</th>
          <th className={th} style={{ minWidth: 150 }}>Оценка пути на базу</th>
          <th className={th} style={{ minWidth: 130 }}>Время на объектах</th>
          <th className={th} style={{ minWidth: 110 }}>Рабочий день</th>
          <th className={th} style={{ minWidth: 110 }}>Переработка</th>
          <th className={th} style={{ minWidth: 90 }}>Пробег</th>
          <th className={th} style={{ minWidth: 160 }}>Подтверждение</th>
          <th className={th} style={{ minWidth: 180 }}>Контроль</th>
          <th className={th} style={{ minWidth: 360 }}>Комментарий</th>
        </tr></thead><tbody>{rows.map((row: any) => { const key = `${row.work_date}|${row.vehicle_id}`, hasPlan = Boolean(row.objects || row.work_object); return <React.Fragment key={key}><tr tabIndex={0} aria-label={`Открыть статистику: ${row.vehicle_name} ${row.vehicle_plate}`} onClick={() => onViewAnalytics(String(row.vehicle_id))} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onViewAnalytics(String(row.vehicle_id)); } }} className={`cursor-pointer focus:outline focus:outline-2 focus:outline-[#2563A6] ${expanded === key ? "bg-[#F0F7FF]" : "bg-white"}`}>
          <td className={`${td} !p-0 sticky left-0 ${expanded === key ? "bg-[#F0F7FF]" : "bg-white"}`}><div className="flex min-h-[58px] items-stretch"><button type="button" aria-label={expanded === key ? "Скрыть поездки дня" : "Показать поездки дня"} aria-expanded={expanded === key} onClick={e => { e.stopPropagation(); toggle(row); }} className="flex w-12 shrink-0 items-center justify-center border-r border-[#E5E7EB] text-2xl font-bold text-[#2563A6]">{expanded === key ? "▾" : "▸"}</button><span className="flex items-center px-3">{dateRu(row.work_date)}</span></div></td>
          <td className={td}><span className="block max-w-[180px] whitespace-normal">{row.objects || row.work_object || "Нет разнарядки"}</span></td>
          <td className={td}><span className="block max-w-[160px] whitespace-normal">{row.work_types || (hasPlan ? "Вид работ не указан" : "Нет разнарядки")}</span></td>
          <td className={td}><b>{row.vehicle_name}</b></td>
          <td className={td}>{row.vehicle_plate}</td>
          <td className={td}>{row.driver || (hasPlan ? "Не указан" : "Нет разнарядки")}</td>
          <td className={td}>{row.masters || (hasPlan ? "Не указан" : "Нет разнарядки")}</td>
          <td className={td}><span className="block max-w-[200px] whitespace-normal">{row.crew || (hasPlan ? "Не указана" : "Нет разнарядки")}</span></td>
          <td className={td}>{row.workday_start || "08:00"}</td>
          <td className={row.base_departure ? td : tdMuted}>{time(row.base_departure)}</td>
          <td className={row.site_arrival ? td : tdMuted}>{time(row.site_arrival)}</td>
          <td className={row.outbound_seconds != null ? td : tdMuted}>{duration(row.outbound_seconds)}</td>
          <td className={row.outbound_stops_seconds != null ? td : tdMuted}>{duration(row.outbound_stops_seconds)}</td>
          <td className={row.outbound_assessment ? td : tdMuted}>{row.outbound_assessment || "—"}</td>
          <td className={row.site_departure ? td : tdMuted}>{time(row.site_departure)}</td>
          <td className={row.base_return ? td : tdMuted}>{time(row.base_return)}</td>
          <td className={row.return_seconds != null ? td : tdMuted}>{duration(row.return_seconds)}</td>
          <td className={row.return_stops_seconds != null ? td : tdMuted}>{duration(row.return_stops_seconds)}</td>
          <td className={row.return_assessment ? td : tdMuted}>{row.return_assessment || "—"}</td>
          <td className={(row.work_seconds ?? row.site_seconds) != null ? td : tdMuted}>{duration(row.work_seconds ?? row.site_seconds)}</td>
          <td className={row.workday_seconds != null ? td : tdMuted}>{duration(row.workday_seconds)}</td>
          <td className={td}>{duration(row.overtime_seconds)}</td>
          <td className={row.distance_km != null ? td : tdMuted}>{row.distance_km == null ? "—" : `${numberRu(row.distance_km)} км`}</td>
          <td className={td}><VehicleStatusBadge status={reportStatus(row.confirmation_status)} /></td>
          <td className={td}><span className={row.data_control ? "text-[#C43D32] whitespace-normal" : "text-[#2E7D32]"}>{row.data_control || "Без замечаний"}</span></td>
          <td className={td}><span className="block max-w-[340px] whitespace-normal leading-relaxed text-[#6B7280]">{row.report_comment || row.deviation_comment || "Отклонений не выявлено"}</span></td>
        </tr>{expanded === key && <tr data-no-export><td colSpan={26} className="p-0"><TripTimeline row={{...row,segments:tripSegments[key]}} loading={tripLoading===key} error={tripErrors[key]} /></td></tr>}</React.Fragment>; })}</tbody></table>}
        {!loading && !error && <Pagination page={data.pagination?.page || page} pages={Math.max(1, data.pagination?.pages || 1)} loading={loading} onPage={setPage} />}
      </div>
    </div>
    {toast && <Toast message={toast} type="success" onClose={() => setToast(null)} />}
  </div>;
}

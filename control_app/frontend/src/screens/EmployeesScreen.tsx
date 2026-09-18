import React, { useState, useMemo, useEffect, useRef } from "react";
import { Button, KpiCard, SearchInput, DateInput, VehicleStatusBadge, EmptyState, Toast, Spinner } from "../components/ui";
import { api, query } from "../api";
import { dateRu, duration, exportRows, monthAgo, numberRu, reportStatus, time, today } from "../format";

type EmployeeRow = any;

interface EmployeesScreenProps {
  onViewAnalytics: (employeeId: string) => void;
  refreshToken: number;
}

const th = "text-left text-xs font-medium text-[#6B7280] bg-[#F9FAFB] px-3 py-2.5 whitespace-nowrap border-b border-[#E5E7EB]";
const td = "px-3 py-3 text-xs text-[#1F2937] border-b border-[#E5E7EB] whitespace-nowrap align-middle";
const tdMuted = "px-3 py-3 text-xs text-[#9CA3AF] border-b border-[#E5E7EB] whitespace-nowrap align-middle";
const employeeExportHeaders = ["Дата","Сотрудник","Должность","Объект","Вид работ","Автомобиль","Госномер","Водитель","Мастер","Бригада","Начало дня","Окончание дня","Выезд с базы","Прибытие на объект","Путь на объект","Остановки по пути на объект","Оценка пути на объект","Выезд с объекта","Возврат на базу","Путь на базу","Остановки по пути на базу","Оценка пути на базу","Время на объектах","Рабочий день","Переработка","Пробег","Подтверждение","Контроль","Комментарий"];
const statusLabels: Record<string,string> = { confirmed:"Работа подтверждена",partial:"Подтверждено частично",unconfirmed:"Выезд не подтверждён","no-schedule":"Поездка без разнарядки","no-vehicle":"Автомобиль не определён","base-work":"Работа на базе" };

function EmployeeMultiSelect({ selected, onChange, employees }: { selected: string[]; onChange: (v: string[]) => void; employees: string[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const filtered = employees.filter(e => e.toLowerCase().includes(q.toLowerCase()));
  const label = selected.length === 0 ? "Все сотрудники" : selected.length === employees.length ? "Все сотрудники" : `Выбрано: ${selected.length}`;

  const toggleAll = () => {
    if (selected.length === employees.length) onChange([]);
    else onChange([...employees]);
  };
  const toggle = (name: string) => {
    if (selected.includes(name)) onChange(selected.filter(s => s !== name));
    else onChange([...selected, name]);
  };

  return (
    <div className="relative flex flex-col gap-1">
      <label className="text-xs font-medium text-[#374151]">Сотрудники</label>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="h-10 w-52 text-left rounded-md border border-[#D1D5DB] bg-white px-3 text-sm text-[#1F2937] flex items-center justify-between gap-2 hover:border-[#2563A6] transition"
      >
        <span>{label}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-[#9CA3AF]">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-30 bg-white border border-[#E5E7EB] rounded-lg shadow-lg w-64 flex flex-col">
          <div className="p-2 border-b border-[#E5E7EB]">
            <input
              autoFocus
              className="w-full h-8 rounded border border-[#D1D5DB] px-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#2563A6]"
              placeholder="Поиск..."
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#E5E7EB]">
            <button onClick={toggleAll} className="text-xs text-[#2563A6] hover:underline">
              {selected.length === employees.length ? "Сбросить" : "Выбрать всех"}
            </button>
            <button onClick={() => onChange([])} className="text-xs text-[#6B7280] hover:underline">Сбросить</button>
          </div>
          <div className="overflow-y-auto max-h-48 py-1">
            {filtered.map(e => (
              <label key={e} className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#F3F4F6] cursor-pointer">
                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${selected.includes(e) ? "bg-[#2563A6] border-[#2563A6]" : "border-[#D1D5DB]"}`}>
                  {selected.includes(e) && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </div>
                <span className="text-xs text-[#1F2937]">{e}</span>
                <input type="checkbox" className="sr-only" checked={selected.includes(e)} onChange={() => toggle(e)} />
              </label>
            ))}
          </div>
          <div className="p-2 border-t border-[#E5E7EB]">
            <Button size="sm" className="w-full justify-center" onClick={() => setOpen(false)}>Показать</Button>
          </div>
        </div>
      )}
    </div>
  );
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
    <button type="button" disabled={loading || page <= 1} onClick={() => onPage(page - 1)} className="h-9 cursor-pointer rounded-md border border-[#D1D5DB] px-3 text-sm disabled:cursor-default disabled:opacity-40">← Назад</button>
    {items.map(item => typeof item === "string" ? <span key={item} className="px-1 text-[#9CA3AF]">…</span> : <button type="button" key={item} disabled={loading} onClick={() => onPage(item)} className={`h-9 min-w-9 cursor-pointer rounded-md border px-2 text-sm disabled:cursor-default ${item === page ? "border-[#2563A6] bg-[#2563A6] font-medium text-white" : "border-[#D1D5DB] bg-white text-[#374151]"}`}>{item}</button>)}
    <button type="button" disabled={loading || page >= pages} onClick={() => onPage(page + 1)} className="h-9 cursor-pointer rounded-md border border-[#D1D5DB] px-3 text-sm disabled:cursor-default disabled:opacity-40">Далее →</button>
    <span className="ml-3 text-sm text-[#6B7280]">Перейти на</span>
    <input aria-label="Номер страницы" type="number" min={1} max={pages} value={target} onChange={event => setTarget(event.target.value)} onKeyDown={event => { if (event.key === "Enter") go(); }} className="h-9 w-20 rounded-md border border-[#D1D5DB] px-2 text-center text-sm" />
    <button type="button" disabled={loading} onClick={go} className="h-9 cursor-pointer rounded-md border border-[#D1D5DB] px-3 text-sm font-medium disabled:cursor-default">Перейти</button>
    <span className="text-sm text-[#6B7280]">из {pages}</span>
  </div>;
}

function formatEmployeeRows(rows: any[]): EmployeeRow[] {
  return rows.map((row: any) => ({
    id: `${row.work_date}|${row.employee_name}`, date: dateRu(row.work_date), employee: row.employee_name, position: row.employee_position || "Не указана", object: row.work_object || "", workType: row.work_type || "—", vehicle: row.vehicle_name || "—", plate: row.vehicle_plate || "—", driver: row.driver || "—", master: row.masters || "—", brigade: row.crew || "—", startDay: row.workday_start || "08:00", endDay: row.workday_end || "17:00", departBase: row.works_at_base ? "—" : time(row.base_departure), arriveObject: row.works_at_base ? "—" : time(row.site_arrival), routeTime: row.works_at_base ? "—" : duration(row.outbound_seconds), stopsEnRoute: row.works_at_base ? "—" : duration(row.outbound_stops_seconds), routeRating: row.outbound_assessment || "—", departObject: row.works_at_base ? "—" : time(row.site_departure), returnBase: row.works_at_base ? "—" : time(row.base_return), returnTime: row.works_at_base ? "—" : duration(row.return_seconds), stopsReturn: row.works_at_base ? "—" : duration(row.return_stops_seconds), returnRating: row.return_assessment || "—", onObject: duration(row.work_seconds ?? row.site_seconds), workDay: duration(row.workday_seconds), overtime: duration(row.overtime_seconds), mileage: row.works_at_base ? "—" : row.fact_id ? `${numberRu(row.distance_km)} км` : "—", status: row.works_at_base ? "base-work" : row.vehicle_id ? reportStatus(row.confirmation_status) as any : "no-vehicle", control: row.works_at_base ? "Без замечаний" : row.data_control || (row.fact_id ? "Без замечаний" : "—"), comment: row.report_comment || "", mergedCount: Number(row.assignment_rows) > 1 ? Number(row.assignment_rows) : undefined,
  }));
}

function employeeExportValues(row: EmployeeRow) {
  return [row.date,row.employee,row.position,row.object,row.workType,row.vehicle,row.plate,row.driver,row.master,row.brigade,row.startDay,row.endDay,row.departBase,row.arriveObject,row.routeTime,row.stopsEnRoute,row.routeRating,row.departObject,row.returnBase,row.returnTime,row.stopsReturn,row.returnRating,row.onObject,row.workDay,row.overtime,row.mileage,statusLabels[row.status] || row.status,row.control,row.comment];
}

export default function EmployeesScreen({ onViewAnalytics, refreshToken }: EmployeesScreenProps) {
  const [dateFrom, setDateFrom] = useState(monthAgo());
  const [dateTo, setDateTo] = useState(today());
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [employeeRows, setEmployeeRows] = useState<EmployeeRow[]>([]);
  const [allEmployees, setAllEmployees] = useState<string[]>([]);
  const [totals, setTotals] = useState<any>({});
  const [requestKey, setRequestKey] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<any>({ page: 1, page_size: 50, total: 0, pages: 1 });
  const [applied, setApplied] = useState({ date_from: dateFrom, date_to: dateTo, employees: [] as string[] });
  const pageCache = useRef(new Map<string, EmployeeRow[]>());

  useEffect(() => {
    let cancelled = false; setError("");
    const filter = { date_from: applied.date_from, date_to: applied.date_to, employee: applied.employees, page, page_size: 50, search };
    const cacheKey = JSON.stringify(filter), cached = pageCache.current.get(cacheKey);
    if (cached) setEmployeeRows(cached); else setLoading(true);
    const timer = setTimeout(() => {
      const rowsRequest = api<any>(`reports/people?${query({ ...filter, part: "rows" })}`).then(result => {
        if (cancelled) return;
        const formatted = formatEmployeeRows(result.rows || []); pageCache.current.set(cacheKey, formatted); setEmployeeRows(formatted);
        setPagination((current: any) => ({ ...current, page: result.pagination?.page || page, page_size: result.pagination?.page_size || 50 }));
      }).catch(e => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setLoading(false); });
      const summaryRequest = api<any>(`reports/people?${query({ ...filter, part: "summary" })}`).then(result => {
        if (cancelled) return;
        setTotals(result.totals || {}); setAllEmployees(result.people || []); setPagination(result.pagination || { page: 1, page_size: 50, total: 0, pages: 1 });
        const lastPage = Math.max(1, result.pagination?.pages || 1);
        if (page > lastPage) setPage(lastPage);
        else if (page < lastPage) {
          const nextFilter = { ...filter, page: page + 1 }, nextKey = JSON.stringify(nextFilter);
          if (!pageCache.current.has(nextKey)) api<any>(`reports/people?${query({ ...nextFilter, part: "rows" })}`).then(next => pageCache.current.set(nextKey, formatEmployeeRows(next.rows || []))).catch(() => {});
        }
      }).catch(e => { if (!cancelled) setError(e.message); });
      void Promise.allSettled([rowsRequest, summaryRequest]);
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [applied, page, search, requestKey, refreshToken]);
  useEffect(() => { pageCache.current.clear(); }, [requestKey, refreshToken]);

  const exportAll = async () => {
    setExporting(true);
    try {
      const result = await api<any>(`reports/people?${query({ date_from: applied.date_from, date_to: applied.date_to, employee: applied.employees, search, part: "all" })}`);
      const rows = formatEmployeeRows(result.rows || []);
      exportRows(employeeExportHeaders, rows.map(employeeExportValues), "сотрудники", "Отчёт по сотрудникам");
      setToast(`В XLS выгружено строк: ${rows.length}`);
    } catch (error) { setToast(error instanceof Error ? error.message : "Не удалось сформировать XLS"); }
    finally { setExporting(false); }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="bg-white border-b border-[#E5E7EB] px-6 py-4">
        <div className="flex flex-wrap items-end gap-3">
          <DateInput label="С" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <DateInput label="По" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          <EmployeeMultiSelect selected={selectedEmployees} onChange={setSelectedEmployees} employees={allEmployees} />
          <Button onClick={() => { setPage(1); setApplied({ date_from: dateFrom, date_to: dateTo, employees: selectedEmployees }); setRequestKey(v => v + 1); }} icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.5" /><path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          }>Показать</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="bg-[#F3F4F6] px-6 py-4 border-b border-[#E5E7EB]">
        <div className="grid grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard label="Сотрудников" value={totals.people || 0} />
          <KpiCard label="Строк разнарядки" value={totals.assignments || 0} />
          <KpiCard label="Связано с автомобилем" value={totals.linked || 0} />
          <KpiCard label="Есть факт ГЛОНАСС" value={totals.fact || 0} />
          <KpiCard label="Требует проверки" value={totals.review || 0} accent="text-[#E0A100]" />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-hidden flex flex-col bg-white">
        <div className="flex items-center justify-between px-6 py-3 border-b border-[#E5E7EB]">
          <span className="text-sm text-[#6B7280]">Показано: {employeeRows.length} из {pagination.total || 0} строк</span>
          <div className="flex items-center gap-3"><SearchInput
            placeholder="Найти сотрудника или объект"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-72"
          /><Button variant="secondary" disabled={exporting} onClick={exportAll} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="1.5"/><path d="M12 10v7m0 0-3-3m3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}>{exporting ? "Готовлю XLS…" : "Выгрузить XLS"}</Button></div>
        </div>

        <div className="flex-1 overflow-auto scrollable">
          {loading ? <div className="py-20 flex justify-center text-[#6B7280]"><Spinner size={24} /></div> : employeeRows.length === 0 ? (
            <EmptyState title={error ? "Не удалось загрузить отчёт" : "Ничего не найдено"} description={error || "Попробуйте изменить фильтры"} />
          ) : (
            <table id="employees-table" className="w-full border-collapse" style={{ minWidth: 3410 }}>
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className={`${th} sticky left-0 z-20 bg-[#F9FAFB]`} style={{ minWidth: 80 }}>Дата</th>
                  <th className={`${th} sticky z-20 bg-[#F9FAFB]`} style={{ left: 80, minWidth: 140 }}>Сотрудник</th>
                  <th className={th} style={{ minWidth: 130 }}>Должность</th>
                  <th className={th} style={{ minWidth: 180 }}>Объект</th>
                  <th className={th} style={{ minWidth: 160 }}>Вид работ</th>
                  <th className={th} style={{ minWidth: 140 }}>Автомобиль</th>
                  <th className={th} style={{ minWidth: 100 }}>Госномер</th>
                  <th className={th} style={{ minWidth: 100 }}>Водитель</th>
                  <th className={th} style={{ minWidth: 100 }}>Мастер</th>
                  <th className={th} style={{ minWidth: 180 }}>Бригада</th>
                  <th className={th} style={{ minWidth: 90 }}>Начало дня</th>
                  <th className={th} style={{ minWidth: 110 }}>Окончание дня</th>
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
                  <th className={th} style={{ minWidth: 80 }}>Пробег</th>
                  <th className={th} style={{ minWidth: 160 }}>Подтверждение</th>
                  <th className={th} style={{ minWidth: 180 }}>Контроль</th>
                  <th className={th} style={{ minWidth: 360 }}>Комментарий</th>
                </tr>
              </thead>
              <tbody>
                {employeeRows.map(row => (
                  <EmployeeTableRow key={row.id} row={row} onViewAnalytics={() => onViewAnalytics(row.employee)} />
                ))}
              </tbody>
            </table>
          )}
        </div>
        {!loading && !error && <Pagination page={pagination.page || page} pages={Math.max(1, pagination.pages || 1)} loading={loading} onPage={setPage} />}
      </div>

      {toast && <Toast message={toast} type="success" onClose={() => setToast(null)} />}
    </div>
  );
}

function EmployeeTableRow({ row, onViewAnalytics }: { row: EmployeeRow; onViewAnalytics: () => void }) {
  const noVehicle = row.status === "no-vehicle" || row.status === "base-work";

  return (
    <tr
      tabIndex={0}
      aria-label={`Открыть аналитику сотрудника: ${row.employee}`}
      onClick={onViewAnalytics}
      onKeyDown={event => {
        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onViewAnalytics();
        }
      }}
      className="cursor-pointer bg-white focus:outline focus:outline-2 focus:outline-[#2563A6]"
    >
      <td className={`${td} sticky left-0 bg-white`} style={{ minWidth: 80 }}>{row.date}</td>
      <td className={`${td} sticky bg-white`} style={{ left: 80, minWidth: 140 }}>
        <div className="font-medium">{row.employee}</div>
        {row.mergedCount && <div className="text-[10px] text-[#9CA3AF] mt-0.5">Объединено назначений: {row.mergedCount}</div>}
      </td>
      <td className={td}>{row.position}</td>
      <td className={td}>
        <span className="block max-w-[160px] truncate" title={row.object}>{row.object}</span>
      </td>
      <td className={td}>
        <span className="block max-w-[140px] truncate" title={row.workType}>{row.workType}</span>
      </td>
      <td className={noVehicle ? tdMuted : td}>{row.vehicle}</td>
      <td className={noVehicle ? tdMuted : td}>{row.plate}</td>
      <td className={td}>{row.driver}</td>
      <td className={td}>{row.master}</td>
      <td className={td}>
        <span className="block max-w-[160px] truncate" title={row.brigade}>{row.brigade}</span>
      </td>
      <td className={td}>{row.startDay}</td>
      <td className={td}>{row.endDay}</td>
      <td className={noVehicle ? tdMuted : td}>{row.departBase}</td>
      <td className={noVehicle ? tdMuted : td}>{row.arriveObject}</td>
      <td className={noVehicle ? tdMuted : td}>{row.routeTime}</td>
      <td className={noVehicle ? tdMuted : td}>{row.stopsEnRoute}</td>
      <td className={noVehicle ? tdMuted : td}>{row.routeRating}</td>
      <td className={noVehicle ? tdMuted : td}>{row.departObject}</td>
      <td className={noVehicle ? tdMuted : td}>{row.returnBase}</td>
      <td className={noVehicle ? tdMuted : td}>{row.returnTime}</td>
      <td className={noVehicle ? tdMuted : td}>{row.stopsReturn}</td>
      <td className={noVehicle ? tdMuted : td}>{row.returnRating}</td>
      <td className={noVehicle ? tdMuted : td}>{row.onObject}</td>
      <td className={noVehicle ? tdMuted : td}>{row.workDay}</td>
      <td className={td}>{row.overtime || "—"}</td>
      <td className={noVehicle ? tdMuted : td}>{row.mileage}</td>
      <td className={td}>
        <VehicleStatusBadge status={row.status} />
      </td>
      <td className={td}>
        {row.control === "Без замечаний" ? (
          <span className="text-[#2E7D32] text-xs">{row.control}</span>
        ) : row.control === "—" ? (
          <span className="text-[#9CA3AF]">—</span>
        ) : (
          <span className="text-[#C43D32] text-xs">{row.control}</span>
        )}
      </td>
      <td className={td}>
        {row.comment ? (
          <span className="text-[#6B7280] text-xs block max-w-[340px] whitespace-normal leading-relaxed">{row.comment}</span>
        ) : <span className="text-[#9CA3AF]">—</span>}
      </td>
    </tr>
  );
}

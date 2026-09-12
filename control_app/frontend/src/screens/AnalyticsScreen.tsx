import React, { useEffect, useState } from "react";
import { api, query } from "../api";
import { Button, DateInput, EmptyState, KpiCard, Select, Spinner } from "../components/ui";
import { clockMinutes, dateRu, duration, monthAgo, numberRu, reportStatus, time, today } from "../format";

const HOUR_START = 8, HOUR_END = 22;
const HOURS = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);
const colors: Record<string, string> = { drive: "#2563A6", work: "#2E7D32", probable: "#7C6FAF", stop: "#9CA3AF", idle: "#E0A100", base: "#374151" };
const labels: Record<string, string> = { drive: "В пути", work: "Работа на объекте", probable: "Предполагаемая рабочая точка", stop: "Остановка / ожидание", idle: "Простой с двигателем", base: "База / ночная парковка" };
const badges: Record<string, [string, string]> = { confirmed: ["bg-[#E8F5E9] text-[#2E7D32]", "Подтверждён"], partial: ["bg-[#FFF4CC] text-[#B37D00]", "Частично"], unconfirmed: ["bg-[#FDE8E6] text-[#C43D32]", "Не подтверждён"], "no-schedule": ["bg-[#E8F1FA] text-[#2563A6]", "Без разнарядки"] };
interface Props { refreshToken: number; target: { mode: "vehicle" | "person"; value: string } | null; onBack?: () => void; }

const decimalTime = (value?: string | null) => value ? Number(value.slice(11, 13)) + Number(value.slice(14, 16)) / 60 : 0;
function distanceKm(a: any[], b: any[]) { if (a.some(v => v == null) || b.some(v => v == null)) return Infinity; const rad = (v: number) => v * Math.PI / 180, r = 6371, dp = rad(b[0] - a[0]), dl = rad(b[1] - a[1]), h = Math.sin(dp / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dl / 2) ** 2; return 2 * r * Math.asin(Math.sqrt(h)); }
function overlapsSiteWindow(segment: any, row: any) {
  if (!row.site_arrival || !row.site_departure) return false;
  const start = Date.parse(segment.event_start), end = Date.parse(segment.event_end);
  const siteStart = Date.parse(row.site_arrival), siteEnd = Date.parse(row.site_departure);
  return [start, end, siteStart, siteEnd].every(Number.isFinite) && end > siteStart && start < siteEnd;
}
function kind(segment: any, row: any) { if (segment.event_type === "movement") return "drive"; if (segment.is_base) return "base"; const atWork = overlapsSiteWindow(segment, row) && distanceKm([segment.start_lat ?? segment.end_lat, segment.start_lon ?? segment.end_lon], [row.actual_lat, row.actual_lon]) <= 1.5; return atWork ? row.confirmation_status === "unplanned" ? "probable" : "work" : segment.event_type === "idle" ? "idle" : "stop"; }

function EmployeeDailyCharts({ rows }: { rows: any[] }) {
  const days = rows.filter(row => row.fact_id || row.base_return).slice().sort((a, b) => b.work_date.localeCompare(a.work_date));
  const maxWorkday = Math.max(9 * 3600, ...days.map(row => Number(row.workday_seconds || 0)));
  if (!days.length) return <div className="bg-white border border-[#E5E7EB] rounded-lg"><EmptyState title="Нет фактического времени" description="Для выбранного сотрудника пока нет связанных поездок ГЛОНАСС" /></div>;
  return <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
    <div className="bg-white border border-[#E5E7EB] rounded-lg p-5">
      <div className="min-h-[76px]"><h3 className="text-base font-semibold text-[#243746]">Время на объектах</h3><p className="text-xs text-[#6B7280] mt-1">Зелёное — сумма подтверждённых рабочих интервалов; вся полоса — рабочий день сотрудника.</p></div>
      <div className="space-y-3">{days.map(row => { const workday = Number(row.workday_seconds || 0), site = Number(row.work_seconds ?? row.site_seconds ?? 0), percent = workday ? Math.min(100, site / workday * 100) : 0; return <div key={row.work_date} className="grid grid-cols-[72px_1fr_52px] gap-3 items-center"><b className="text-xs text-[#243746]">{dateRu(row.work_date)}</b><div className="h-5 bg-[#E5E7EB] rounded overflow-hidden" title={`Рабочий день ${duration(workday)}`}><div className="h-full bg-[#2E7D32] rounded" style={{width:`${percent}%`}} /></div><b className="text-xs text-right text-[#2E7D32]">{duration(site)}</b></div>; })}</div>
    </div>
    <div className="bg-white border border-[#E5E7EB] rounded-lg p-5">
      <div className="min-h-[76px]"><h3 className="text-base font-semibold text-[#243746]">Рабочее время</h3><p className="text-xs text-[#6B7280] mt-1">От 08:00 до фактического возвращения автомобиля на базу.</p></div>
      <div className="space-y-3">{days.map(row => { const workday = Number(row.workday_seconds || 0), percent = maxWorkday ? Math.min(100, workday / maxWorkday * 100) : 0; return <div key={row.work_date} className="grid grid-cols-[72px_1fr_52px] gap-3 items-center"><b className="text-xs text-[#243746]">{dateRu(row.work_date)}</b><div className="h-5 bg-[#E5E7EB] rounded overflow-hidden"><div className="h-full bg-[#2563A6] rounded" style={{width:`${percent}%`}} /></div><b className="text-xs text-right text-[#2563A6]">{duration(workday)}</b></div>; })}</div>
    </div>
  </div>;
}

export default function AnalyticsScreen({ refreshToken, target, onBack }: Props) {
  const [mode, setMode] = useState<"vehicle" | "person">(target?.mode || "vehicle");
  const [subject, setSubject] = useState(target?.value || "");
  const [dateFrom, setDateFrom] = useState(monthAgo());
  const [dateTo, setDateTo] = useState(today());
  const [data, setData] = useState<any>({ rows: [], totals: {}, vehicles: [], people: [], insights: [] });
  const [loading, setLoading] = useState(true);
  const [requestKey, setRequestKey] = useState(0);
  const [tooltip, setTooltip] = useState<any>(null);

  useEffect(() => { if (target) { setMode(target.mode); setSubject(target.value); setRequestKey(v => v + 1); } }, [target]);
  useEffect(() => {
    setLoading(true);
    api<any>(`reports/analytics?${query({ mode, vehicle_id: mode === "vehicle" ? subject : "", employee: mode === "person" ? [subject] : [], date_from: dateFrom, date_to: dateTo })}`).then(result => {
      setData(result);
      if (!subject) { const next = mode === "vehicle" ? result.vehicles?.[0]?.id : result.people?.[0]; if (next) setSubject(String(next)); }
    }).finally(() => setLoading(false));
  }, [requestKey, refreshToken, mode, subject]);

  const rows = [...(data.rows || [])].sort((a: any, b: any) => b.work_date.localeCompare(a.work_date));
  const summaryConfirmed = rows.filter((r: any) => ["trip_confirmed", "consistent"].includes(r.confirmation_status)).length;

  return <div className="flex flex-col h-full overflow-auto scrollable">
    <div className="bg-white border-b border-[#E5E7EB] px-6 py-4 shrink-0"><div className="flex flex-wrap items-end gap-3">
      <Select label="Тип анализа" value={mode} onChange={e => { setMode(e.target.value as any); setSubject(""); }} className="w-44"><option value="vehicle">Автомобиль</option><option value="person">Сотрудник</option></Select>
      <Select label={mode === "vehicle" ? "Автомобиль" : "Сотрудник"} value={subject} onChange={e => setSubject(e.target.value)} className="w-72">
        {mode === "vehicle" ? (data.vehicles || []).map((v: any) => <option key={v.id} value={v.id}>{v.name} · {v.plate}</option>) : (data.people || []).map((name: string) => <option key={name} value={name}>{name}</option>)}
      </Select>
      <DateInput label="С" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /><DateInput label="По" value={dateTo} onChange={e => setDateTo(e.target.value)} />
      <Button onClick={() => setRequestKey(v => v + 1)}>Показать</Button>
    </div></div>
    {loading ? <div className="py-24 flex justify-center"><Spinner size={28} /></div> : <div className="flex-1 px-6 py-5 flex flex-col gap-5">
      <div className="flex items-center gap-3">{onBack && <Button variant="secondary" size="sm" onClick={onBack}>← Назад к списку</Button>}<div><div className="text-xs text-[#6B7280] mb-0.5">Объект анализа</div><h2 className="text-xl font-semibold text-[#243746]">{data.title}</h2></div></div>
      {mode === "person" && <EmployeeDailyCharts rows={rows} />}
      <div className="grid grid-cols-4 lg:grid-cols-7 gap-3">
        <KpiCard label="Дней с фактом" value={data.totals.days || 0} /><KpiCard label="Пробег" value={`${numberRu(data.totals.distance_km)} км`} /><KpiCard label="Работа на объектах" value={duration(data.totals.site_seconds)} /><KpiCard label="В движении" value={duration(data.totals.movement_seconds)} /><KpiCard label="Средний выезд" value={clockMinutes(data.totals.average_departure_minutes)} /><KpiCard label="Превышения > 90 км/ч" value={data.totals.speeding_events || 0} accent={data.totals.speeding_events ? "text-[#C43D32]" : undefined} /><KpiCard label="Не подтверждено" value={data.totals.no_trip_days || 0} accent={data.totals.no_trip_days ? "text-[#C43D32]" : undefined} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="bg-white border border-[#E5E7EB] rounded-lg p-4 flex flex-col gap-3"><h3 className="text-sm font-semibold text-[#243746]">Что требует внимания</h3>{(data.insights || []).map((text: string, i: number) => <div key={i} className="flex items-start gap-2"><span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${i > 1 ? "bg-[#E0A100]" : "bg-[#2563A6]"}`} /><span className="text-xs text-[#374151] leading-relaxed">{text}</span></div>)}</div>
        <div className="bg-white border border-[#E5E7EB] rounded-lg p-4 flex flex-col gap-3"><h3 className="text-sm font-semibold text-[#243746]">Как читать ленту</h3>{Object.entries(labels).map(([type, label]) => <div key={type} className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: colors[type] }} /><span className="text-xs">{label}</span></div>)}<p className="text-xs text-[#9CA3AF]">Зелёным считается только стоянка рядом с подтверждённой рабочей точкой.</p></div>
        <div className="bg-[#E8F1FA] border border-[#BFDBFE] rounded-lg p-4"><h3 className="text-sm font-semibold text-[#2563A6] mb-2">Итог периода</h3><div className="text-xs text-[#1E40AF] space-y-1"><div>Всего дней: <b>{rows.length}</b></div><div>Подтверждено: <b>{summaryConfirmed}</b></div><div>Без разнарядки: <b>{rows.filter((r: any) => r.confirmation_status === "unplanned").length}</b></div><div>Средний выезд: <b>{clockMinutes(data.totals.average_departure_minutes)}</b></div></div></div>
      </div>
      <div className="bg-white border border-[#E5E7EB] rounded-lg overflow-hidden"><div className="px-4 py-3 border-b flex justify-between"><div><h3 className="text-sm font-semibold text-[#243746]">Подробная лента рабочего дня</h3><p className="text-xs text-[#6B7280] mt-0.5">Детализация движения, работы на объекте, остановок и пребывания на базе</p></div><span className="text-xs text-[#6B7280]">Новые записи сверху</span></div>
        <div className="min-w-[1100px]"><div className="flex items-center border-b px-4 py-2 gap-2 sticky top-0 bg-white z-10"><div className="w-52 shrink-0"/><div className="flex-1 flex">{HOURS.map(h => <span key={h} className="flex-1 text-[10px] text-[#9CA3AF]">{String(h).padStart(2,"0")}:00</span>)}</div><div className="w-36 shrink-0"/></div>
        {!rows.length ? <EmptyState title="Нет данных для ленты" description="Выберите другой объект или период" /> : <div className="divide-y divide-[#F3F4F6]">{rows.map((row: any) => { const status = reportStatus(row.confirmation_status), [badgeClass,badgeLabel] = badges[status] || badges.partial; const segments = (row.segments || []).filter((s: any) => ["movement","stop","idle"].includes(s.event_type)); return <div key={`${row.work_date}|${row.vehicle_id}`} className="flex items-center gap-2 px-4 py-3 hover:bg-[#FAFAFA]"><div className="w-52 shrink-0"><b className="text-xs">{dateRu(row.work_date)}</b><div className="text-[10px] text-[#6B7280] truncate">{row.objects || row.work_object || row.vehicle_name}</div><div className="text-[10px] text-[#9CA3AF]">Выезд {time(row.base_departure)} · объект {time(row.site_arrival)}–{time(row.site_departure)} · база {time(row.base_return)}</div></div>
          <div className="relative h-8 bg-[#F3F4F6] rounded overflow-hidden flex-1">{segments.map((segment: any, index: number) => { const type = kind(segment,row), start = decimalTime(segment.event_start), end = decimalTime(segment.event_end), left = Math.max(0,(start-HOUR_START)/(HOUR_END-HOUR_START)*100), width = Math.max(.3,(Math.min(HOUR_END,end)-Math.max(HOUR_START,start))/(HOUR_END-HOUR_START)*100); return <div key={segment.id || index} className="absolute top-0 h-full cursor-pointer opacity-90 hover:opacity-100" style={{left:`${left}%`,width:`${width}%`,backgroundColor:colors[type]}} onMouseEnter={e=>setTooltip({x:e.clientX,y:e.clientY,type,segment})} onMouseLeave={()=>setTooltip(null)} />; })}</div>
          <div className="w-36 text-right"><div className="text-xs text-[#6B7280]">{numberRu(row.distance_km)} км</div><div className={`text-xs ${row.confirmation_status === "unplanned" ? "text-[#7C6FAF]" : "text-[#2E7D32]"}`}>{row.confirmation_status === "unplanned" ? "предп. работа" : "работа"} {duration(row.work_seconds ?? row.site_seconds)}</div><span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] ${badgeClass}`}>{badgeLabel}</span></div></div>; })}</div>}</div>
      </div>
    </div>}
    {tooltip && <div className="fixed z-50 pointer-events-none bg-[#1F2937] text-white text-xs rounded-lg px-3 py-2 shadow-xl" style={{left:tooltip.x+12,top:tooltip.y-60}}><b>{labels[tooltip.type]}</b><div className="text-white/70">{time(tooltip.segment.event_start)}–{time(tooltip.segment.event_end)} · {duration(tooltip.segment.duration_seconds)}</div>{tooltip.segment.distance_km > 0 && <div className="text-white/70">{numberRu(tooltip.segment.distance_km)} км</div>}</div>}
  </div>;
}

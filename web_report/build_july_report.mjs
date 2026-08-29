import fs from "node:fs/promises";

const root = "/Users/d.yudin/Documents/ChatGPT/Telemtrika_proj";
const data = JSON.parse(await fs.readFile(`${root}/api_results/sobol_088_july_2026/analysis.json`, "utf8"));
const embedded = JSON.stringify(data).replaceAll("</script", "<\\/script");
const out = `${root}/web_report/sobol_088_july_2026_efficiency.html`;

const html = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Соболь 088 — эффективность за июль 2026</title>
  <style>
    :root{--navy:#18364b;--blue:#27698e;--ink:#172630;--muted:#62727d;--line:#d8e0e5;--bg:#eef3f5;--paper:#fff;--green:#216746;--green-bg:#e4f3e9;--amber:#855d00;--amber-bg:#fff2c9;--red:#982f2a;--red-bg:#fae2df;--gray-bg:#edf1f3;--shadow:0 12px 35px rgba(30,55,70,.09);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink)}button,input,select{font:inherit}.page{max-width:1720px;margin:auto;padding:26px}.hero{display:grid;grid-template-columns:1.4fr .6fr;gap:28px;padding:31px 34px;border-radius:20px;color:#fff;background:linear-gradient(130deg,#17394f,#286b8e 70%,#4b8d9c);box-shadow:0 20px 48px rgba(23,57,79,.2)}.eyebrow{text-transform:uppercase;letter-spacing:.14em;font-size:11px;font-weight:800;opacity:.74}.hero h1{font-size:clamp(31px,4vw,48px);line-height:1.04;margin:8px 0 11px}.hero p{margin:0;max-width:900px;line-height:1.55;color:rgba(255,255,255,.84)}.hero-meta{text-align:right;align-self:center}.hero-meta strong{display:block;font-size:20px}.hero-meta span{display:block;margin-top:6px;font-size:13px;color:rgba(255,255,255,.72)}
    .actions{display:flex;flex-wrap:wrap;gap:9px;margin:17px 0}.actions button,.actions a{border:1px solid #c6d1d8;border-radius:9px;background:#fff;color:#244a62;text-decoration:none;padding:9px 13px;font-size:13px;font-weight:700;cursor:pointer}.actions button:hover,.actions a:hover{background:#f7fafb;border-color:#7899ad}.section{background:var(--paper);border:1px solid var(--line);border-radius:16px;margin:17px 0;box-shadow:var(--shadow);overflow:hidden}.section-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-end;padding:21px 23px 13px}.section-head h2{font-size:21px;margin:0}.section-head p{font-size:13px;color:var(--muted);margin:5px 0 0;line-height:1.45}
    .kpis{display:grid;grid-template-columns:repeat(6,minmax(135px,1fr));gap:11px;padding:0 21px 22px}.kpi{padding:15px;border:1px solid var(--line);border-radius:12px;background:#fbfcfd;min-height:102px}.kpi span{display:block;color:var(--muted);font-size:12px;line-height:1.25}.kpi strong{display:block;font-size:25px;letter-spacing:-.04em;margin:7px 0 4px}.kpi small{color:var(--muted);font-size:11px;line-height:1.25}.kpi.good{background:#f3faf5;border-color:#c7e1cf}.kpi.warn{background:#fffaf0;border-color:#ead6a8}
    .insights{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;padding:0 21px 22px}.insight{border:1px solid var(--line);border-radius:12px;padding:15px;background:#fbfcfd}.insight b{display:block;margin-bottom:7px}.insight p{margin:0;color:#4e5e68;font-size:13px;line-height:1.48}.insight.good{border-left:5px solid #4d9a6a}.insight.warn{border-left:5px solid #d3a33b}.insight.info{border-left:5px solid #4f8cae}
    .toolbar{display:flex;flex-wrap:wrap;gap:9px;padding:0 21px 13px}.toolbar input,.toolbar select{border:1px solid #c8d2d9;border-radius:8px;padding:8px 10px;background:#fff;color:var(--ink)}.toolbar input{min-width:270px}.table-wrap{overflow:auto;padding:0 15px 20px}.main-table{border-collapse:separate;border-spacing:0;width:100%;min-width:2500px;font-size:12px}.main-table th{position:sticky;top:0;z-index:1;background:#d8e8f3;color:#1c3545;text-align:center;font-weight:800;white-space:nowrap}.main-table th,.main-table td{padding:9px 10px;border-right:1px solid #ced8de;border-bottom:1px solid #ced8de;vertical-align:middle}.main-table th:first-child,.main-table td:first-child{border-left:1px solid #ced8de}.main-table thead tr:first-child th{border-top:1px solid #ced8de}.main-table td{background:#fff;text-align:center}.main-table tbody tr:hover td{background:#f5f9fb}.main-table td.left{text-align:left;line-height:1.38;min-width:270px}.main-table td.people{text-align:left;min-width:170px}.main-table td.comment-cell{text-align:left;min-width:330px;line-height:1.42}.comment-list{margin:0;padding-left:17px}.comment-list li+li{margin-top:5px}.comment-attention{color:var(--red);font-weight:700}.comment-info{color:#5d521f}.comment-positive,.comment-ok{color:var(--green)}.muted{color:var(--muted)}.nowrap{white-space:nowrap}.weekend{color:#9a413c}.no-plan td{color:#78858d;background:#fafbfc}.status{display:inline-block;border-radius:999px;padding:5px 8px;font-size:11px;font-weight:800;white-space:nowrap}.status-consistent{background:var(--green-bg);color:var(--green)}.status-trip_confirmed{background:#e2eef7;color:#245b7b}.status-not_confirmed,.status-partial{background:var(--red-bg);color:var(--red)}.status-unplanned{background:var(--amber-bg);color:var(--amber)}.status-no_plan{background:var(--gray-bg);color:#65727a}.assessment{font-weight:800}.assessment.good{color:var(--green)}.assessment.watch{color:var(--amber)}.assessment.bad{color:var(--red)}.coord{color:#326d8c;text-decoration:none}.coord:hover{text-decoration:underline}
    .bars{display:grid;gap:8px;padding:0 21px 22px}.bar-row{display:grid;grid-template-columns:84px minmax(230px,1fr) 76px;gap:11px;align-items:center;font-size:12px}.bar-track{height:18px;border-radius:7px;background:#edf1f3;overflow:hidden}.bar-fill{height:100%;border-radius:7px;background:linear-gradient(90deg,#4e91b4,#2d6d91)}.bar-value{text-align:right;font-weight:750}.legend{padding:0 21px 20px;color:var(--muted);font-size:12px}.method{padding:0 22px 22px}.method-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:11px}.method-card{border:1px solid var(--line);border-radius:11px;padding:14px;background:#fbfcfd}.method-card b{display:block;margin-bottom:6px}.method-card p{margin:0;color:var(--muted);font-size:13px;line-height:1.5}.notice{margin:0 22px 22px;padding:12px 14px;border-left:4px solid #d2a33b;background:#fff8df;color:#6d551f;font-size:13px;line-height:1.5}.footer{text-align:center;color:var(--muted);font-size:12px;padding:18px}
    @media(max-width:1100px){.page{padding:13px}.hero{grid-template-columns:1fr}.hero-meta{text-align:left}.kpis{grid-template-columns:repeat(3,1fr)}.insights{grid-template-columns:repeat(2,1fr)}.method-grid{grid-template-columns:1fr}}
    @media(max-width:650px){.kpis{grid-template-columns:repeat(2,1fr)}.insights{grid-template-columns:1fr}.section-head{align-items:flex-start}.toolbar input{min-width:100%}}
    @media print{body{background:#fff}.page{max-width:none;padding:0}.actions,.toolbar{display:none}.hero,.section{box-shadow:none}.section{break-inside:avoid}.main-table{font-size:8px;min-width:0}.main-table th,.main-table td{padding:4px}.no-plan{display:none}.kpis{grid-template-columns:repeat(6,1fr)}}
  </style>
</head>
<body>
<main class="page">
  <header class="hero">
    <div><div class="eyebrow">План из Google Sheets · факт MSS GLONASS</div><h1>Соболь 088: эффективность использования</h1><p>Сопоставление разнарядки и фактических поездок за 1–30 июля 2026 года. Времена показаны по Москве (UTC+3), рабочая точка определена по устойчивым стоянкам вне базы.</p></div>
    <div class="hero-meta"><strong>СЭС_СОБОЛЬ_н088рт797</strong><span>14 дней в разнарядке · 30 календарных дней проверено</span><span>Автономный отчёт — можно переслать одним HTML-файлом</span></div>
  </header>

  <nav class="actions" aria-label="Действия"><button onclick="window.print()">Печать / PDF</button><button onclick="downloadCsv()">Скачать таблицу CSV</button><button onclick="downloadPage()">Скачать копию HTML</button><a href="#table">К таблице</a><a href="#method">Методика</a></nav>

  <section class="section">
    <div class="section-head"><div><h2>Итог месяца</h2><p>Ключевые показатели по машине и назначенным рабочим дням</p></div></div>
    <div class="kpis" id="kpis"></div>
  </section>

  <section class="section">
    <div class="section-head"><div><h2>Что видно по машине</h2><p>Выводы, которые можно использовать для контроля и настройки будущего агента</p></div></div>
    <div class="insights" id="insights"></div>
  </section>

  <section class="section" id="table">
    <div class="section-head"><div><h2>План / факт по дням</h2><p>Последняя колонка автоматически описывает отклонения от обычных поездок и возможные зоны роста</p></div><div class="muted" id="visibleCount"></div></div>
    <div class="toolbar"><select id="scope"><option value="planned">Только дни с разнарядкой</option><option value="all">Все дни 1–30 июля</option><option value="issues">Только зоны роста</option></select><select id="statusFilter"><option value="">Все статусы</option><option value="consistent">Объект подтверждён повторными поездками</option><option value="trip_confirmed">Поездка подтверждена, объект требует координат</option><option value="unplanned">Движение вне плана</option><option value="not_confirmed">Не подтверждено</option></select><input id="search" type="search" placeholder="Поиск по объекту, сотруднику, работе или комментарию"></div>
    <div class="table-wrap"><table class="main-table"><thead><tr><th>Дата</th><th>Плановый объект</th><th>Ответственный<br>по строке техники</th><th>Мастер / состав</th><th>Работы и примечания</th><th>Выезд<br>с базы</th><th>Оценка<br>выезда</th><th>Прибытие<br>на объект</th><th>Путь<br>туда</th><th>Остановки<br>по пути</th><th>Оценка<br>дороги</th><th>На<br>объекте</th><th>Сравнение<br>с аналогом</th><th>Возврат<br>на базу</th><th>Пробег,<br>км</th><th>Подтверждение<br>объекта</th><th>Фактическая точка</th><th>Контроль данных</th><th>Комментарий /<br>зона роста</th></tr></thead><tbody id="tbody"></tbody></table></div>
  </section>

  <section class="section">
    <div class="section-head"><div><h2>Время на объекте</h2><p>Продолжительность фактического окна на доминирующей рабочей точке</p></div></div>
    <div class="bars" id="bars"></div><div class="legend">Шкала нормирована по самому длинному дню. Это присутствие автомобиля, а не доказательство работы каждого сотрудника.</div>
  </section>

  <section class="section" id="method">
    <div class="section-head"><div><h2>Методика и границы точности</h2><p>Что в отчёте является фактом, а что — аналитическим выводом</p></div></div>
    <div class="method"><div class="method-grid"><article class="method-card"><b>Разнарядка</b><p>Из листа «Ввод» взяты дата, объект, сотрудник со строкой «Соболь 088», полный состав строк этого объекта, виды работ и примечания.</p></article><article class="method-card"><b>База и маршрут</b><p>Выезд и возврат определены по положению относительно базы ВЭС Деденево. Рабочая точка — доминирующий кластер стоянок от 5 минут вне базы, объединённый в радиусе 1,5 км.</p></article><article class="method-card"><b>Что значит «обычно»</b><p>Это медиана других поездок этой машины на тот же объект. Она помогает найти выбросы, но не заменяет утверждённый норматив выезда, дороги или длительности работ.</p></article><article class="method-card"><b>Соответствие объекту</b><p>Для повторных назначений проверяется совпадение фактической точки между днями. Для разового объекта подтверждается поездка и длительная стоянка, но точное название нельзя доказать без координат объекта.</p></article></div></div>
    <p class="notice"><b>Важно:</b> ГЛОНАСС подтверждает присутствие автомобиля. Он не подтверждает персональное присутствие каждого сотрудника и сам по себе не доказывает выполнение конкретного вида работ. Для этого нужны координаты объектов, персональный сигнал (СКУД/QR/мобильное приложение) и правила оценки эффективного времени.</p>
  </section>
  <footer class="footer">Источники: лист «Ввод» Google Sheets и read-only API MSS GLONASS · сформировано локально без ключей доступа и полного GPS-трека</footer>
</main>
<script>const REPORT=${embedded};</script>
<script>
  const fmtNumber=(n,d=1)=>Number(n||0).toLocaleString('ru-RU',{minimumFractionDigits:d,maximumFractionDigits:d});
  const esc=v=>String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const time=iso=>iso?iso.slice(11,16):'—';
  const seconds=(a,b)=>a&&b?(new Date(b)-new Date(a))/1000:null;
  const dur=s=>{if(s==null||!isFinite(s))return '—';s=Math.max(0,Math.round(s));const h=Math.floor(s/3600),m=Math.floor(s%3600/60);return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')};
  const timesWord=n=>{n=Math.abs(Number(n)||0);const m10=n%10,m100=n%100;return m10===1&&m100!==11?'раз':m10>=2&&m10<=4&&!(m100>=12&&m100<=14)?'раза':'раз';};
  const dateFmt=iso=>new Date(iso+'T00:00:00').toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'});
  const statusLabels={consistent:'Объект подтверждён серией поездок',trip_confirmed:'Поездка подтверждена; нужны координаты объекта',partial:'Частично',not_confirmed:'Не подтверждено',unplanned:'Движение вне плана',no_plan:'Нет разнарядки'};
  const planned=REPORT.days.filter(r=>r.plan), summary=REPORT.summary;
  const shifts=planned.map(r=>seconds(r.actual.base_departure,r.actual.base_return)).filter(Number.isFinite);
  const siteSpans=planned.map(r=>r.actual.site?.span_seconds||0);
  const totalShift=shifts.reduce((a,b)=>a+b,0), avgSite=summary.planned_site_seconds/summary.planned_days;
  const siteShare=totalShift?summary.planned_site_seconds/totalShift*100:0;
  const noPlanSilent=REPORT.days.filter(r=>!r.plan&&r.actual.distance_km<5).length;
  const kpis=[
    ['Дней в разнарядке',summary.planned_days,'из 30 проверенных','good'],
    ['Поездка подтверждена',summary.confirmed_trip_days+' / '+summary.planned_days,'100% назначенных дней','good'],
    ['Дорога без задержек',summary.road_ok_days+' / '+summary.planned_days,'1 небольшое отклонение, 1 задержка','good'],
    ['Позже обычного',summary.late_vs_typical_days+' день','среди повторных поездок',''],
    ['Среднее на объекте',dur(avgSite),'доля окна смены '+fmtNumber(siteShare,0)+'%',''],
    ['Скорость выше 90 км/ч',summary.speeding_events+' '+timesWord(summary.speeding_events),'за назначенные дни','warn']
  ];
  document.getElementById('kpis').innerHTML=kpis.map(k=>'<div class="kpi '+k[3]+'"><span>'+esc(k[0])+'</span><strong>'+esc(k[1])+'</strong><small>'+esc(k[2])+'</small></div>').join('');

  const greenDays=planned.filter(r=>r.plan.object.startsWith('Зеленково'));
  const maxOut=[...planned].sort((a,b)=>(seconds(b.actual.base_departure,b.actual.site?.arrival)||0)-(seconds(a.actual.base_departure,a.actual.site?.arrival)||0))[0];
  const insights=[
    ['good','Машину использовали по разнарядке','Во все 14 назначенных дней есть выезд, длительное присутствие вне базы и возврат. В остальные '+noPlanSilent+' дней значимого движения нет. Внеплановых поездок не видно.'],
    ['good','12 из 14 поездок — без заметной задержки','Оценка учитывает полное время до рабочей точки, чистое движение и остановки. Ещё 1 день имеет небольшое отклонение, 1 день требует проверки.'],
    ['warn','3 июля потеряно около 1 ч 40 мин по пути','Машина выехала в 08:00, но прибыла в 11:29. Чистое движение заняло 1:49, остальное — остановки; дорога на 1:19 дольше обычной для Зеленково.'],
    ['warn','1 июля выехали позже обычного','По повторным поездкам в Зеленково типичный выезд — около 08:09. В этот день машина выехала в 08:47; сама дорога затем прошла без большого отклонения.'],
    ['info','Одинаковое назначение даёт ориентир 6 ч 20 мин','Для 10 дней в Зеленково с назначением «Монтаж муфты концевой» медиана присутствия — 6:20, диапазон 5:34–7:03. 3 и 4 июля были короче типичного на 35 и 46 минут.'],
    ['info','Это оценка машины, не производительности бригады','В таблице нет объёма работ, нормативной длительности и отметки о выполнении. Поэтому можно оценить дисциплину поездки и присутствие, но нельзя доказать, что работу сделали быстро или качественно.'],
    ['info','Объект подтверждён там, где поездки повторяются','Зеленково подтверждается 10 совпадающими точками, Ермолино — двумя. Для разовых объектов 29–30 июля нужны координаты из справочника.'],
    ['warn','52 эпизода выше порога 90 км/ч','Это события API, а не автоматически доказанные нарушения ПДД. Их следует использовать как список для проверки после согласования порога и минимальной длительности.']
  ];
  document.getElementById('insights').innerHTML=insights.map(x=>'<article class="insight '+x[0]+'"><b>'+esc(x[1])+'</b><p>'+esc(x[2])+'</p></article>').join('');

  const scope=document.getElementById('scope'),statusFilter=document.getElementById('statusFilter'),search=document.getElementById('search');
  function enrich(r){const a=r.actual,s=a.site,p=r.plan;const out=seconds(a.base_departure,s?.arrival),back=seconds(s?.departure,a.base_return),shift=seconds(a.base_departure,a.base_return);return {...r,out,back,shift,share:shift&&s?s.span_seconds/shift*100:null};}
  const deltaText=s=>s==null?'':(s>=0?'+':'−')+Math.round(Math.abs(s)/60)+' мин';
  const assessmentTone=value=>['Заметная задержка','Позже обычного','Короче обычного','Проверить остановки'].includes(value)?'bad':['Небольшое отклонение','Дольше обычного','Раньше обычного'].includes(value)?'watch':'good';
  function rowHtml(raw){
    const r=enrich(raw),p=r.plan,a=r.actual,s=a.site,e=r.efficiency||{};
    const weekend=['сб','вс'].includes(r.weekday);
    const textWork=p?[...p.work_types,...p.notes].join('; '):'—';
    const people=p?((p.masters.length?'Мастер: '+p.masters.join(', ')+' · ':'')+'бригада '+p.crew.length+' чел.'):'—';
    const coordinate=s?'<a class="coord" target="_blank" rel="noreferrer" href="https://www.openstreetmap.org/?mlat='+s.lat+'&mlon='+s.lon+'#map=14/'+s.lat+'/'+s.lon+'">'+fmtNumber(s.lat,5)+', '+fmtNumber(s.lon,5)+'</a><br><span class="muted">'+esc((s.addresses||[])[0]||'')+'</span>':'—';
    const checks=[];if(a.speeding_events)checks.push('Скорость выше 90 км/ч — '+a.speeding_events+' '+timesWord(a.speeding_events));if(a.gps_loss_seconds)checks.push('Потеря GPS — '+dur(a.gps_loss_seconds));if(a.idle_engine_seconds>1800)checks.push('Холостой ход — '+dur(a.idle_engine_seconds));
    const depNote=e.departure_assessment?'<span class="assessment '+assessmentTone(e.departure_assessment)+'">'+esc(e.departure_assessment)+'</span>'+(e.peer_days>=3?'<br><span class="muted">'+deltaText(e.departure_delta_minutes*60)+' к обычному</span>':''):'—';
    const roadNote=e.road_assessment?'<span class="assessment '+assessmentTone(e.road_assessment)+'">'+esc(e.road_assessment)+'</span>'+(e.peer_days>=3?'<br><span class="muted">'+deltaText(e.outbound_delta_seconds)+' к обычному</span>':''):'—';
    const siteNote=e.site_assessment?'<span class="assessment '+assessmentTone(e.site_assessment)+'">'+esc(e.site_assessment)+'</span>'+(e.peer_days>=3?'<br><span class="muted">'+deltaText(e.site_delta_seconds)+'</span>':''):'—';
    const comments=e.comments?.length?'<ul class="comment-list">'+e.comments.map(c=>'<li class="comment-'+esc(c.level)+'">'+esc(c.text)+'</li>').join('')+'</ul>':'—';
    return '<tr class="'+(!p?'no-plan ':'')+'"><td class="nowrap '+(weekend?'weekend':'')+'"><b>'+dateFmt(r.date)+'</b> '+r.weekday+'</td><td class="left">'+esc(p?.object||'—')+'</td><td>'+esc(p?.assigned_person||'—')+(p?.assigned_role?'<br><span class="muted">'+esc(p.assigned_role)+'</span>':'')+'</td><td class="people">'+esc(people)+'</td><td class="left">'+esc(textWork)+'</td><td>'+time(a.base_departure)+'</td><td>'+depNote+'</td><td>'+time(s?.arrival)+'</td><td>'+dur(e.outbound_seconds)+'</td><td>'+dur(e.outbound_stop_seconds)+'</td><td>'+roadNote+'</td><td><b>'+dur(s?.span_seconds)+'</b></td><td>'+siteNote+'</td><td>'+time(a.base_return)+'</td><td>'+fmtNumber(a.distance_km,1)+'</td><td><span class="status status-'+r.status+'">'+esc(statusLabels[r.status])+'</span></td><td>'+coordinate+'</td><td>'+ (checks.length?checks.join('<br>'):'—') +'</td><td class="comment-cell">'+comments+'</td></tr>';
  }
  function filtered(){const q=search.value.trim().toLowerCase();return REPORT.days.filter(r=>{if(scope.value==='planned'&&!r.plan)return false;if(scope.value==='issues'&&!r.efficiency?.comments?.some(c=>c.level==='attention')&&!['not_confirmed','partial','unplanned','trip_confirmed'].includes(r.status))return false;if(statusFilter.value&&r.status!==statusFilter.value)return false;const hay=(JSON.stringify(r.plan||{})+' '+JSON.stringify(r.efficiency?.comments||[])).toLowerCase();return !q||hay.includes(q);});}
  function render(){const rows=filtered();document.getElementById('tbody').innerHTML=rows.map(rowHtml).join('');document.getElementById('visibleCount').textContent='Показано: '+rows.length;}
  [scope,statusFilter,search].forEach(el=>el.addEventListener(el===search?'input':'change',render));render();

  const maxSite=Math.max(...siteSpans);
  document.getElementById('bars').innerHTML=planned.map(r=>'<div class="bar-row"><b>'+dateFmt(r.date)+' '+r.weekday+'</b><div class="bar-track"><div class="bar-fill" style="width:'+((r.actual.site?.span_seconds||0)/maxSite*100).toFixed(1)+'%"></div></div><span class="bar-value">'+dur(r.actual.site?.span_seconds)+'</span></div>').join('');

  const csvCell=v=>'"'+String(v??'').replaceAll('"','""')+'"';
  function csvRows(){const head=['Дата','Объект','Ответственный','Роль','Мастер','Состав бригады','Виды работ','Примечания','Выезд с базы','Оценка выезда','Прибытие на объект','Путь туда','Остановки по пути','Отклонение дороги от обычной','Оценка дороги','Время на объекте','Отклонение времени на объекте','Оценка длительности','Возврат на базу','Пробег км','Подтверждение объекта','Широта','Долгота','Сколько раз скорость была выше 90 км/ч','Потеря GPS','Комментарий / зона роста'];return [head,...planned.map(raw=>{const r=enrich(raw),p=r.plan,a=r.actual,s=a.site,e=r.efficiency||{};return [r.date,p.object,p.assigned_person,p.assigned_role,p.masters.join('; '),p.crew.join('; '),p.work_types.join('; '),p.notes.join('; '),time(a.base_departure),e.departure_assessment,time(s?.arrival),dur(e.outbound_seconds),dur(e.outbound_stop_seconds),e.peer_days>=3?deltaText(e.outbound_delta_seconds):'',e.road_assessment,dur(s?.span_seconds),e.peer_days>=3?deltaText(e.site_delta_seconds):'',e.site_assessment,time(a.base_return),a.distance_km,statusLabels[r.status],s?.lat||'',s?.lon||'',a.speeding_events,dur(a.gps_loss_seconds),(e.comments||[]).map(c=>c.text).join(' ')];})];}
  function downloadBlob(content,type,name){const u=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
  function downloadCsv(){downloadBlob('\ufeff'+csvRows().map(r=>r.map(csvCell).join(';')).join('\\r\\n'),'text/csv;charset=utf-8','sobol-088-july-2026-plan-fact.csv');}
  function downloadPage(){downloadBlob('<!doctype html>\\n'+document.documentElement.outerHTML,'text/html;charset=utf-8','sobol-088-july-2026-efficiency.html');}
</script>
</body></html>`;

await fs.writeFile(out, html, "utf8");
console.log(out);

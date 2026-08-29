import fs from "node:fs/promises";

const projectRoot = "/Users/d.yudin/Documents/ChatGPT/Telemtrika_proj";
const analysis = JSON.parse(await fs.readFile(`${projectRoot}/api_results/sobol_088_analysis.json`, "utf8"));
const safeData = JSON.stringify(analysis).replaceAll("</script", "<\\/script");

const html = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Соболь 088 — телеметрия за 10.08.2026</title>
  <style>
    :root {
      --ink: #172533;
      --muted: #5d6b78;
      --line: #d7dee5;
      --blue: #244f73;
      --blue-soft: #dbe8f6;
      --pink-soft: #ead4df;
      --yellow-soft: #fff0bd;
      --green-soft: #dcefd6;
      --cyan-soft: #d9e8ec;
      --paper: #ffffff;
      --bg: #eef2f5;
      --danger: #a12622;
      --warning: #8a5a00;
      --success: #2c6a47;
      font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink); }
    button, input, select { font: inherit; }
    .shell { max-width: 1640px; margin: 0 auto; padding: 28px; }
    .hero {
      display: grid; grid-template-columns: 1.45fr .55fr; gap: 24px;
      padding: 30px; color: white; border-radius: 18px;
      background: linear-gradient(135deg, #173b58 0%, #2f6e91 68%, #5594a8 100%);
      box-shadow: 0 18px 44px rgba(23, 59, 88, .2);
    }
    .eyebrow { font-size: 12px; text-transform: uppercase; letter-spacing: .14em; opacity: .72; font-weight: 700; }
    h1 { margin: 8px 0 10px; font-size: clamp(28px, 4vw, 46px); line-height: 1.04; }
    .hero p { margin: 0; max-width: 850px; color: rgba(255,255,255,.82); line-height: 1.55; }
    .hero-meta { display: grid; align-content: center; gap: 8px; text-align: right; }
    .hero-meta strong { font-size: 20px; }
    .hero-meta span { color: rgba(255,255,255,.7); font-size: 13px; }
    .toolbar { display: flex; flex-wrap: wrap; gap: 10px; margin: 18px 0; }
    .toolbar button, .toolbar a {
      border: 1px solid #c8d2db; background: white; color: #26465f; text-decoration: none;
      padding: 9px 13px; border-radius: 9px; cursor: pointer; font-weight: 650; font-size: 13px;
    }
    .toolbar button:hover, .toolbar a:hover { border-color: #6d8fa8; background: #f7fafc; }
    .panel { background: var(--paper); border: 1px solid var(--line); border-radius: 15px; margin: 18px 0; box-shadow: 0 5px 18px rgba(35,55,72,.06); overflow: hidden; }
    .panel-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; padding: 20px 22px 12px; }
    .panel-head h2 { margin: 0; font-size: 21px; }
    .panel-head p { margin: 4px 0 0; color: var(--muted); font-size: 13px; }
    .table-wrap { overflow: auto; padding: 0 18px 20px; }
    table { border-collapse: separate; border-spacing: 0; width: 100%; font-size: 13px; }
    th { position: sticky; top: 0; z-index: 1; text-align: center; font-weight: 750; color: #1d2a34; }
    th, td { padding: 10px 11px; border-right: 1px solid #a9b4bd; border-bottom: 1px solid #a9b4bd; vertical-align: middle; }
    th:first-child, td:first-child { border-left: 1px solid #a9b4bd; }
    thead tr:first-child th { border-top: 1px solid #a9b4bd; }
    tbody tr:hover td { background-color: #f7fafc; }
    .summary-table { min-width: 1440px; }
    .summary-table th { min-width: 125px; line-height: 1.15; }
    .summary-table td { text-align: center; background: #fbfcfd; }
    .summary-table td.object, .summary-table td.comment { text-align: left; min-width: 260px; line-height: 1.45; }
    .h-blue { background: #b9cdea; } .h-pink { background: var(--pink-soft); }
    .h-yellow { background: var(--yellow-soft); } .h-cyan { background: var(--cyan-soft); }
    .h-green { background: var(--green-soft); }
    .v-yellow { background: #fff9e5 !important; font-weight: 700; }
    .v-green { background: #edf8e9 !important; font-weight: 800; font-size: 15px; }
    .v-cyan { background: #eef5f7 !important; font-weight: 700; }
    .method { margin: 0 20px 20px; padding: 11px 13px; border-left: 4px solid #d3a529; background: #fff8dc; color: #6c5420; font-size: 13px; line-height: 1.5; }
    .kpis { display: grid; grid-template-columns: repeat(5, minmax(145px,1fr)); gap: 12px; padding: 0 20px 22px; }
    .kpi { border: 1px solid var(--line); border-radius: 11px; padding: 14px; min-height: 92px; background: #fbfcfd; }
    .kpi span { display: block; color: var(--muted); font-size: 12px; margin-bottom: 7px; }
    .kpi strong { font-size: 23px; letter-spacing: -.03em; }
    .kpi small { display: block; color: var(--muted); margin-top: 5px; }
    .grid-two { display: grid; grid-template-columns: 1.2fr .8fr; gap: 18px; }
    .chart-box { padding: 0 20px 20px; }
    canvas { display: block; width: 100%; height: 310px; border: 1px solid var(--line); border-radius: 10px; background: #fff; }
    .legend { display: flex; flex-wrap: wrap; gap: 15px; padding-top: 9px; font-size: 12px; color: var(--muted); }
    .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; margin-right: 5px; }
    .remarks { display: grid; gap: 10px; padding: 0 20px 20px; }
    .remark { display: grid; grid-template-columns: 94px 1fr; gap: 12px; padding: 13px; border: 1px solid var(--line); border-radius: 10px; }
    .badge { align-self: start; text-align: center; padding: 5px 7px; border-radius: 999px; font-size: 11px; font-weight: 800; }
    .badge-important { background: #f9d4d2; color: #8b1e1a; }
    .badge-check { background: #fff0bd; color: #745000; }
    .badge-note { background: #dcebf5; color: #24516e; }
    .badge-limit { background: #e7e0f2; color: #5b3e76; }
    .badge-control { background: #dcefd6; color: #2b6041; }
    .remark strong { display: block; margin-bottom: 4px; }
    .remark p { margin: 3px 0; color: #45535f; line-height: 1.45; font-size: 13px; }
    .remark .action { color: #214e68; }
    .filters { display: flex; flex-wrap: wrap; gap: 9px; padding: 0 20px 12px; }
    .filters input, .filters select { border: 1px solid #c9d2da; border-radius: 8px; padding: 8px 10px; background: white; }
    .filters input { min-width: 260px; }
    .data-table { min-width: 1000px; }
    .data-table th { background: #dbe8f6; }
    .data-table td { border-color: #d4dbe1; }
    .right { text-align: right; } .center { text-align: center; }
    .danger { color: var(--danger); font-weight: 800; }
    .pagination { display: flex; justify-content: space-between; align-items: center; padding: 0 20px 20px; color: var(--muted); font-size: 13px; }
    .pagination button { border: 1px solid #c9d2da; background: white; border-radius: 7px; padding: 7px 11px; cursor: pointer; }
    .source { padding: 18px 22px; background: #f7f9fb; color: var(--muted); font-size: 12px; line-height: 1.55; border-top: 1px solid var(--line); }
    details > summary { cursor: pointer; font-weight: 750; padding: 18px 22px; }
    @media (max-width: 1000px) {
      .shell { padding: 14px; } .hero { grid-template-columns: 1fr; padding: 22px; }
      .hero-meta { text-align: left; } .kpis { grid-template-columns: repeat(2,1fr); }
      .grid-two { grid-template-columns: 1fr; }
    }
    @media print {
      body { background: white; } .shell { max-width: none; padding: 0; }
      .toolbar, .filters, .pagination, #trackPanel, #chartPanel { display: none !important; }
      .panel, .hero { box-shadow: none; break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="hero">
      <div>
        <div class="eyebrow">Телеметрический разбор · 10 августа 2026</div>
        <h1>Соболь 088</h1>
        <p>Фактический маршрут, время на рабочей площадке и замечания по данным GLONASS. Все времена ниже показаны по Москве (UTC+3).</p>
      </div>
      <div class="hero-meta">
        <strong>СЭС_СОБОЛЬ_н088рт797</strong>
        <span>ГАЗ Соболь · unit 592643 · car 466111</span>
        <span>Данные сохранены локально, внешние сервисы не используются</span>
      </div>
    </section>

    <nav class="toolbar" aria-label="Действия с отчётом">
      <button onclick="window.print()">Печать / PDF</button>
      <button onclick="downloadSummaryCsv()">Скачать сводку CSV</button>
      <button onclick="downloadEventsCsv()">Скачать события CSV</button>
      <button onclick="downloadTrackCsv()">Скачать полный трек CSV</button>
      <a href="#remarks">Перейти к замечаниям</a>
    </nav>

    <section class="panel">
      <div class="panel-head">
        <div><h2>Операционная строка</h2><p>Формат, близкий к вашей таблице разнарядки</p></div>
      </div>
      <div class="table-wrap">
        <table class="summary-table">
          <thead><tr>
            <th class="h-blue">Бригадный автомобиль</th><th class="h-blue">Водитель</th><th class="h-blue">Мастер бригады</th>
            <th class="h-blue">Наименование объекта</th><th class="h-blue">Вид работ</th><th class="h-blue">Комментарий</th>
            <th class="h-pink">Время выезда с базы</th><th class="h-pink">Время приезда на объект</th>
            <th class="h-pink">Время выезда с объекта</th><th class="h-pink">Время приезда на базу</th>
            <th class="h-yellow">Время в пути до объекта</th><th class="h-yellow">Время в пути до базы</th>
            <th class="h-cyan">Разница времени в пути</th><th class="h-green">Время на объекте</th>
          </tr></thead>
          <tbody><tr id="summaryRow"></tr></tbody>
        </table>
      </div>
      <p class="method">Выезд и возврат рассчитаны по пересечению геозоны базы №6838. Внешняя рабочая точка не заведена в системе как объект, поэтому время на площадке восстановлено по кластеру длительных стоянок.</p>
      <div class="kpis" id="kpis"></div>
    </section>

    <div class="grid-two">
      <section class="panel" id="chartPanel">
        <div class="panel-head"><div><h2>Скорость в течение дня</h2><p>Красным отмечается участок выше 90 км/ч; метки показывают ключевые этапы</p></div></div>
        <div class="chart-box"><canvas id="speedChart" aria-label="График скорости"></canvas><div class="legend" id="chartLegend"></div></div>
      </section>
      <section class="panel" id="remarks">
        <div class="panel-head"><div><h2>Что бросается в глаза</h2><p>Факты отделены от интерпретации и рекомендаций</p></div></div>
        <div class="remarks" id="remarksList"></div>
      </section>
    </div>

    <section class="panel">
      <div class="panel-head"><div><h2>События за день</h2><p>Движения, стоянки, превышение скорости и потеря GPS</p></div></div>
      <div class="filters"><input id="eventSearch" type="search" placeholder="Поиск по типу или адресу"><select id="eventType"><option value="">Все типы</option></select></div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Тип</th><th>Начало</th><th>Окончание</th><th>Длительность</th><th>Пробег, км</th><th>Макс., км/ч</th><th>Адрес / объект</th><th>Координаты</th></tr></thead><tbody id="eventsBody"></tbody></table></div>
    </section>

    <section class="panel" id="trackPanel">
      <div class="panel-head"><div><h2>Полный трек</h2><p>1 946 полученных точек; CSV содержит все строки без пагинации</p></div></div>
      <div class="filters"><select id="trackFilter"><option value="all">Все точки</option><option value="moving">Только движение</option><option value="ignition">Зажигание включено</option><option value="speeding">Скорость &gt; 90 км/ч</option><option value="lowVoltage">Напряжение &lt; 10 В</option></select><select id="pageSize"><option>50</option><option selected>100</option><option>250</option></select></div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Время</th><th>Широта</th><th>Долгота</th><th>Скорость</th><th>Зажигание</th><th>Спутники</th><th>GSM</th><th>Напряжение</th></tr></thead><tbody id="trackBody"></tbody></table></div>
      <div class="pagination"><span id="pageInfo"></span><div><button id="prevPage">← Назад</button> <button id="nextPage">Вперёд →</button></div></div>
    </section>

    <section class="panel">
      <details><summary>Методика и ограничения</summary><div class="source">
        Период отчёта: московский календарный день 10.08.2026, переданный API как 09.08.2026 21:00:00–10.08.2026 20:59:59 UTC.
        Выезд с базы определён по последнему пересечению границы прямоугольной геозоны перед прибытием на площадку; возврат — по событию «Вход на объект».
        Нули в топливных полях не трактуются как нулевой расход: для машины отсутствует источник уровня топлива. Наименование внешней площадки нельзя установить надёжно, пока она не заведена как объект или не сопоставлена с разнарядкой.
      </div></details>
    </section>
  </main>

  <script>const REPORT_DATA = ${safeData};</script>
  <script>
    const s = REPORT_DATA.summary;
    const time = iso => iso ? iso.slice(11, 19) : '—';
    const duration = seconds => {
      seconds = Math.max(0, Math.round(Number(seconds || 0)));
      const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), sec = seconds % 60;
      return [h,m,sec].map((n,i) => String(n).padStart(2,'0')).join(':');
    };
    const num = (v, digits=1) => Number(v).toLocaleString('ru-RU',{minimumFractionDigits:digits,maximumFractionDigits:digits});
    const esc = value => String(value ?? '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    const mapLink = (lat,lon,label) => lat && lon ? '<a target="_blank" rel="noreferrer" href="https://www.openstreetmap.org/?mlat='+lat+'&mlon='+lon+'#map=16/'+lat+'/'+lon+'">'+esc(label)+'</a>' : '—';

    document.getElementById('summaryRow').innerHTML = [
      '<td><strong>'+esc(s.vehicle)+'</strong></td>', '<td>'+esc(s.driver)+'</td>', '<td>—</td>',
      '<td class="object">'+esc(s.work_object)+'</td>', '<td>—</td>', '<td class="comment">'+esc(s.comment)+'</td>',
      '<td>'+time(s.base_departure_msk)+'</td>', '<td>'+time(s.site_arrival_msk)+'</td>',
      '<td>'+time(s.site_departure_msk)+'</td>', '<td>'+time(s.base_return_msk)+'</td>',
      '<td class="v-yellow">'+duration(s.outbound_seconds)+'</td>', '<td class="v-yellow">'+duration(s.return_seconds)+'</td>',
      '<td class="v-cyan">'+duration(s.transit_difference_seconds)+'</td>', '<td class="v-green">'+duration(s.site_seconds)+'</td>',
    ].join('');

    const kpis = [
      ['Пробег', num(s.distance_km,2)+' км', 'за календарный день'],
      ['Время движения', duration(s.run_seconds), 'сумма движений'],
      ['Холостой ход', duration(s.engine_idle_seconds), 'двигатель включён, скорость 0'],
      ['Максимальная скорость', num(s.max_speed_kmh,1)+' км/ч', '1 событие выше 90'],
      ['Средняя в движении', num(s.avg_moving_speed_kmh,1)+' км/ч', 'по расчёту API'],
      ['Рабочее окно', time(s.work_begin_msk)+'–'+time(s.work_end_msk), duration(29719)],
      ['Потеря GPS', duration(s.gps_loss_seconds), '1 событие'],
      ['Телеметрические точки', s.track_points.toLocaleString('ru-RU'), 'pointCount: '+s.server_point_count],
      ['Напряжение', num(s.voltage_min,3)+'–'+num(s.voltage_max,3)+' В', 'среднее '+num(s.voltage_avg,2)+' В'],
      ['Топливные данные', 'Нет датчика', 'нули не являются расходом'],
    ];
    document.getElementById('kpis').innerHTML = kpis.map(k => '<div class="kpi"><span>'+esc(k[0])+'</span><strong>'+esc(k[1])+'</strong><small>'+esc(k[2])+'</small></div>').join('');

    const badgeClass = severity => severity === 'Важно' ? 'badge-important' : severity === 'Проверить' ? 'badge-check' : severity === 'Ограничение' ? 'badge-limit' : severity === 'Контроль данных' ? 'badge-control' : 'badge-note';
    document.getElementById('remarksList').innerHTML = REPORT_DATA.remarks.map(r => '<article class="remark"><span class="badge '+badgeClass(r.severity)+'">'+esc(r.severity)+'</span><div><strong>'+esc(r.observation)+'</strong><p>'+esc(r.evidence)+'</p><p>'+esc(r.interpretation)+'</p><p class="action">→ '+esc(r.action)+'</p></div></article>').join('');

    const eventSearch = document.getElementById('eventSearch');
    const eventType = document.getElementById('eventType');
    [...new Set(REPORT_DATA.events.map(e => e.type))].sort().forEach(type => eventType.insertAdjacentHTML('beforeend','<option>'+esc(type)+'</option>'));
    function renderEvents(){
      const query = eventSearch.value.trim().toLowerCase(), type = eventType.value;
      const rows = REPORT_DATA.events.filter(e => (!type || e.type===type) && (!query || (e.type+' '+e.address).toLowerCase().includes(query)));
      document.getElementById('eventsBody').innerHTML = rows.map(e => '<tr><td><strong>'+esc(e.type)+'</strong></td><td>'+time(e.start_msk)+'</td><td>'+time(e.end_msk)+'</td><td>'+duration(e.duration_seconds)+'</td><td class="right">'+num(e.distance_km,3)+'</td><td class="right '+(e.max_speed_kmh>90?'danger':'')+'">'+num(e.max_speed_kmh,1)+'</td><td>'+esc(e.address||'—')+'</td><td>'+mapLink(e.lat,e.lon,e.lat&&e.lon?num(e.lat,5)+', '+num(e.lon,5):'—')+'</td></tr>').join('');
    }
    eventSearch.addEventListener('input',renderEvents); eventType.addEventListener('change',renderEvents); renderEvents();

    let page = 0;
    const trackFilter = document.getElementById('trackFilter'), pageSize = document.getElementById('pageSize');
    function filteredTrack(){
      const mode = trackFilter.value;
      return REPORT_DATA.track.filter(p => mode==='all' || (mode==='moving'&&p.speed_kmh>0) || (mode==='ignition'&&p.ignition===1) || (mode==='speeding'&&p.speed_kmh>90) || (mode==='lowVoltage'&&p.voltage<10));
    }
    function renderTrack(){
      const rows=filteredTrack(), size=Number(pageSize.value), pages=Math.max(1,Math.ceil(rows.length/size)); page=Math.min(page,pages-1);
      const visible=rows.slice(page*size,(page+1)*size);
      document.getElementById('trackBody').innerHTML=visible.map(p=>'<tr><td>'+time(p.time_msk)+'</td><td class="right">'+num(p.lat,6)+'</td><td class="right">'+num(p.lon,6)+'</td><td class="right '+(p.speed_kmh>90?'danger':'')+'">'+num(p.speed_kmh,2)+'</td><td class="center">'+(p.ignition?'Вкл':'Выкл')+'</td><td class="right">'+p.satellites+'</td><td class="right">'+p.gsm+'</td><td class="right '+(p.voltage<10?'danger':'')+'">'+num(p.voltage,3)+'</td></tr>').join('');
      document.getElementById('pageInfo').textContent='Показано '+visible.length+' из '+rows.length.toLocaleString('ru-RU')+' · страница '+(page+1)+' из '+pages;
      document.getElementById('prevPage').disabled=page===0; document.getElementById('nextPage').disabled=page>=pages-1;
    }
    trackFilter.addEventListener('change',()=>{page=0;renderTrack()}); pageSize.addEventListener('change',()=>{page=0;renderTrack()});
    document.getElementById('prevPage').onclick=()=>{page--;renderTrack()}; document.getElementById('nextPage').onclick=()=>{page++;renderTrack()}; renderTrack();

    function csvCell(value){ const text=String(value??''); return /[;"\\n]/.test(text)?'"'+text.replaceAll('"','""')+'"':text; }
    function downloadCsv(name,headers,rows){
      const content='\\ufeff'+[headers,...rows].map(row=>row.map(csvCell).join(';')).join('\\n');
      const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'})); const a=document.createElement('a'); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url);
    }
    window.downloadSummaryCsv=()=>downloadCsv('sobol_088_summary_2026-08-10.csv',['Машина','Водитель','Объект','Выезд с базы','Приезд на объект','Выезд с объекта','Приезд на базу','Путь туда, сек','Путь обратно, сек','Разница, сек','На объекте, сек','Пробег, км'],[[s.vehicle,s.driver,s.work_object,s.base_departure_msk,s.site_arrival_msk,s.site_departure_msk,s.base_return_msk,s.outbound_seconds,s.return_seconds,s.transit_difference_seconds,s.site_seconds,s.distance_km]]);
    window.downloadEventsCsv=()=>downloadCsv('sobol_088_events_2026-08-10.csv',['Тип','Начало МСК','Окончание МСК','Длительность, сек','Пробег, км','Макс. скорость','Адрес','Широта','Долгота'],REPORT_DATA.events.map(e=>[e.type,e.start_msk,e.end_msk,e.duration_seconds,e.distance_km,e.max_speed_kmh,e.address,e.lat,e.lon]));
    window.downloadTrackCsv=()=>downloadCsv('sobol_088_track_2026-08-10.csv',['Время МСК','Широта','Долгота','Скорость','Зажигание','Спутники','GSM','Напряжение','Получено МСК'],REPORT_DATA.track.map(p=>[p.time_msk,p.lat,p.lon,p.speed_kmh,p.ignition,p.satellites,p.gsm,p.voltage,p.received_msk]));

    function drawChart(){
      const canvas=document.getElementById('speedChart'), rect=canvas.getBoundingClientRect(), dpr=window.devicePixelRatio||1;
      canvas.width=Math.max(600,Math.round(rect.width*dpr)); canvas.height=Math.round(310*dpr); const ctx=canvas.getContext('2d'); ctx.scale(dpr,dpr);
      const w=canvas.width/dpr,h=canvas.height/dpr,pad={l:48,r:15,t:18,b:35},cw=w-pad.l-pad.r,ch=h-pad.t-pad.b;
      ctx.clearRect(0,0,w,h); ctx.font='11px system-ui'; ctx.strokeStyle='#dce2e7'; ctx.fillStyle='#61717e'; ctx.lineWidth=1;
      for(let y=0;y<=100;y+=20){ const py=pad.t+ch-(y/100)*ch; ctx.beginPath();ctx.moveTo(pad.l,py);ctx.lineTo(w-pad.r,py);ctx.stroke();ctx.fillText(y,12,py+4); }
      const points=REPORT_DATA.track, maxX=points.length-1;
      const plot=(color,predicate)=>{ctx.strokeStyle=color;ctx.lineWidth=1.6;ctx.beginPath();let started=false;points.forEach((p,i)=>{if(!predicate(p)){started=false;return}const x=pad.l+(i/maxX)*cw,y=pad.t+ch-(Math.min(100,p.speed_kmh)/100)*ch;if(!started){ctx.moveTo(x,y);started=true}else ctx.lineTo(x,y)});ctx.stroke();};
      plot('#2e6f95',()=>true); plot('#c73832',p=>p.speed_kmh>90);
      const start=new Date(points[0].time_msk+'Z').getTime(), end=new Date(points.at(-1).time_msk+'Z').getTime();
      [['Выезд',s.base_departure_msk,'#7b4a9e'],['Объект',s.site_arrival_msk,'#2c6a47'],['С объекта',s.site_departure_msk,'#c27b22'],['База',s.base_return_msk,'#7b4a9e']].forEach(([label,iso,color])=>{const x=pad.l+((new Date(iso+'Z').getTime()-start)/(end-start))*cw;ctx.strokeStyle=color;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(x,pad.t);ctx.lineTo(x,pad.t+ch);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=color;ctx.save();ctx.translate(x+3,pad.t+8);ctx.rotate(-Math.PI/2);ctx.fillText(label,0,0);ctx.restore();});
      ctx.fillStyle='#61717e'; ['00:00','06:00','12:00','18:00','24:00'].forEach((label,i)=>ctx.fillText(label,pad.l+(i/4)*cw-13,h-10));
    }
    document.getElementById('chartLegend').innerHTML='<span><i class="dot" style="background:#2e6f95"></i>Скорость</span><span><i class="dot" style="background:#c73832"></i>Выше 90 км/ч</span><span><i class="dot" style="background:#7b4a9e"></i>Граница базы</span><span><i class="dot" style="background:#2c6a47"></i>Рабочая площадка</span>';
    addEventListener('resize',drawChart); requestAnimationFrame(drawChart);
  </script>
</body>
</html>`;

await fs.mkdir(`${projectRoot}/web_report`, { recursive: true });
const output = `${projectRoot}/web_report/sobol_088_2026-08-10.html`;
await fs.writeFile(output, html, "utf8");
console.log(output);

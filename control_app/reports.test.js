import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { syncGlonassFacts } from './glonass_sync.js';
import { DatabaseSync } from 'node:sqlite';

test('reports paginate, share telemetry and preserve configurable workday starts', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'telemetrika-test-'));
  const port = 19387, root = `http://127.0.0.1:${port}/api/`;
  const child = spawn(process.execPath, ['server.js'], { cwd: import.meta.dirname, env: {...process.env, HOST:'127.0.0.1',PORT:String(port),TELEMETRIKA_LOGIN:'test',TELEMETRIKA_PASSWORD:'test',TELEMETRIKA_SESSION_SECRET:'integration-test', TELEMETRIKA_DB_PATH:path.join(dir,'db.sqlite'),TELEMETRIKA_SETTINGS_PATH:path.join(dir,'settings.json'),TELEMETRIKA_IMPORT_DEMO_SEED:'0'}, stdio:'pipe' });
  let logs=''; child.stderr.on('data',chunk=>logs+=chunk);
  let db;
  try {
    let ready=false;
    for(let i=0;i<100;i++){try{if((await fetch(root+'health')).ok){ready=true;break;}}catch{} await new Promise(resolve=>setTimeout(resolve,30));}
    assert.ok(ready,logs);
    db = new DatabaseSync(path.join(dir,'db.sqlite'));
    const insert=db.prepare("INSERT INTO vehicles(id,name,plate,normalized_plate,updated_at) VALUES(?,?,?,?,?)");
    insert.run(1,'Соболь','А635СО777','А635СО777','now');
    insert.run(2,'Ларгус','Т817НМ777','Т817НМ777','now');
    db.prepare("INSERT INTO assignments(work_date,work_object,employee_name,source) VALUES('2026-09-01','База','Сотрудник базы','google')").run();
    for(let i=1;i<=3;i++){
      const date=`2026-09-0${i}`;
      db.prepare("INSERT INTO vehicle_days(work_date,vehicle_id,base_departure,base_return,distance_km,updated_at,base_zone_name,base_zone_id) VALUES(?,1,?,?,20,'now','База соболь 635 и ларгус 817',25705)").run(date,`${date}T09:00:00+03:00`,`${date}T18:00:00+03:00`);
      db.prepare("INSERT INTO vehicle_segments(work_date,vehicle_id,event_type,event_start,event_end,duration_seconds,distance_km) VALUES(?,1,'movement',?,?,3600,20)").run(date,`${date}T09:00:00+03:00`,`${date}T10:00:00+03:00`);
    }
    const login=await fetch(root+'auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:'test',password:'test'})});
    const cookie=login.headers.get('set-cookie').split(';')[0];
    const api=async(url,body)=>{const response=await fetch(root+url,{method:body?'PUT':'GET',headers:{Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};};
    const vehicles=(await api('vehicles')).data.vehicles;
    assert.equal(vehicles.find(v=>v.id===2).source_vehicle_id,1);
    assert.equal(vehicles.find(v=>v.id===1).base_id,25705);
    assert.equal(vehicles.find(v=>v.id===2).base_id,25705);
    const first=(await api('reports/vehicles?page=1&page_size=2&active_only=1')).data;
    assert.equal(first.rows.length,2);assert.equal(first.pagination.total,6);assert.equal(first.totals.distance_km,120);
    const fastRows=(await api('reports/vehicles?part=rows&page=1&page_size=2&active_only=1')).data;
    assert.equal(fastRows.rows.length,2);assert.equal(fastRows.pagination.total,null);
    const summary=(await api('reports/vehicles?part=summary&page=1&page_size=2&active_only=1')).data;
    assert.equal(summary.rows.length,0);assert.equal(summary.pagination.total,6);assert.equal(summary.totals.distance_km,120);
    assert.equal((await api('reports/vehicles?vehicle_id=1&vehicle_id=2')).data.rows.length,6);
    assert.equal((await api('reports/vehicles?vehicle_none=1')).data.rows.length,0);
    const source=(await api('reports/vehicles?vehicle_id=1')).data.rows;
    const target=(await api('reports/vehicles?vehicle_id=2')).data.rows;
    assert.equal(target.length,3);assert.equal(target[0].workday_seconds,9*3600);assert.equal(target[0].base_departure,source[0].base_departure);
    assert.equal((await api('reports/vehicle-segments?date=2026-09-01&vehicle_id=2')).data.rows.length,1);
    assert.equal((await api('reports/vehicles?page=1&search=Ларгус')).data.pagination.total,3);
    const baseWorker=(await api('reports/people?date_from=2026-09-01&date_to=2026-09-01&employee=%D0%A1%D0%BE%D1%82%D1%80%D1%83%D0%B4%D0%BD%D0%B8%D0%BA%20%D0%B1%D0%B0%D0%B7%D1%8B')).data.rows[0];
    assert.equal(baseWorker.workday_start,'08:00');assert.equal(baseWorker.workday_end,'17:00');assert.equal(baseWorker.workday_seconds,9*3600);assert.equal(baseWorker.overtime_seconds,0);assert.equal(baseWorker.works_at_base,true);
    assert.equal((await api('vehicles/1/rule',{source_vehicle_id:2})).status,400);
    assert.equal((await api('vehicles/1/rule',{departure_start:false})).status,200);
    assert.equal((await api('reports/vehicles?vehicle_id=2')).data.rows[0].workday_seconds,10*3600);
    db.prepare("UPDATE vehicles SET match_status='matched',glonass_unit_id=CASE id WHEN 1 THEN '605025' ELSE '609202' END,glonass_server='example.invalid'").run();
    const realFetch=globalThis.fetch, requested=[];
    try {
      globalThis.fetch=async (_url,options)=>{if(options?.method==='POST'){const payload=JSON.parse(options.body);requested.push(payload.unitID);assert.deepEqual(payload.inValues.eventObjInOut_ObjIDs,[25705]);return {ok:true,json:async()=>({recordLists:{events:[]}})};}return {ok:true,json:async()=>({user:{id:1}})};};
      await syncGlonassFacts({db,settings:{glonass_login_url:'https://example.invalid',glonass_password:'test'},dateFrom:'2026-09-01',dateTo:'2026-09-01',vehicleId:2});
      assert.deepEqual(requested,[605025]);
    } finally {globalThis.fetch=realFetch;}
    await api('vehicles/2/rule',{source_vehicle_id:null,departure_start:false});
    assert.equal((await api('reports/vehicles?vehicle_id=2')).data.rows.length,0);
  } finally {db?.close();if(child.exitCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited;}await rm(dir,{recursive:true,force:true});}
});

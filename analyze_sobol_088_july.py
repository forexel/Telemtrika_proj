#!/usr/bin/env python3
"""Сопоставить разнарядку и расчётные события Соболя 088 за 1–30 июля 2026."""

from __future__ import annotations

import json
import math
import re
import statistics
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parent
INPUT_ROWS = Path("/private/tmp/telemetrika_input_values.json")
REFERENCE_ROWS = Path("/private/tmp/telemetrika_Справочник_values.json")
API_DIR = ROOT / "api_results" / "sobol_088_july_2026"
OUTPUT = API_DIR / "analysis.json"
UTC_FMT = "%d.%m.%Y %H:%M:%S"
MSK = timezone(timedelta(hours=3))
BASE = (56.23023, 37.526005)


def excel_date(value: int | float) -> date:
    return (datetime(1899, 12, 30) + timedelta(days=value)).date()


def api_dt(value) -> datetime:
    if isinstance(value, dict):
        value = value.get("v")
    return datetime.strptime(value, UTC_FMT).replace(tzinfo=timezone.utc)


def point(event: dict, which: str = "Beg") -> tuple[float, float] | None:
    raw = event.get(f"latLon{which}") or {}
    if raw.get("x") is None or raw.get("y") is None:
        return None
    return float(raw["x"]), float(raw["y"])


def haversine(a: tuple[float, float], b: tuple[float, float]) -> float:
    r = 6371.0088
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp = p2 - p1
    dl = math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def clean(value) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def unique(values) -> list[str]:
    return list(dict.fromkeys(value for value in map(clean, values) if value))


def load_plans() -> dict[str, dict]:
    rows = json.loads(INPUT_ROWS.read_text(encoding="utf-8"))[1:]
    reference = json.loads(REFERENCE_ROWS.read_text(encoding="utf-8"))
    roles = {clean(row[1]): clean(row[2]) for row in reference if len(row) > 2 and row[1]}
    grouped: dict[tuple[str, str], list[list]] = defaultdict(list)
    for row in rows:
        row = (row + [None] * 6)[:6]
        if not isinstance(row[0], (int, float)):
            continue
        day = excel_date(row[0]).isoformat()
        grouped[(day, clean(row[1]))].append(row)

    plans = {}
    for (day, obj), group in grouped.items():
        assigned = [row for row in group if re.search(r"соболь\s*0?88", clean(row[4]), re.I)]
        if not assigned or not (date(2026, 7, 1).isoformat() <= day <= date(2026, 7, 30).isoformat()):
            continue
        crew = [clean(row[2]) for row in group if clean(row[2])]
        plans[day] = {
            "object": obj,
            "assigned_person": clean(assigned[0][2]),
            "assigned_role": roles.get(clean(assigned[0][2]), ""),
            "masters": [name for name in crew if roles.get(name) == "Мастер СМУ"],
            "crew": crew,
            "work_types": unique(row[3] for row in group),
            "notes": unique(row[5] for row in group),
        }
    return plans


def load_events() -> list[dict]:
    events = []
    for path in sorted(API_DIR.glob("batch_*.json")):
        body = json.loads(path.read_text(encoding="utf-8"))["body"]
        events.extend(body.get("recordLists", {}).get("events", []))
    return events


def dominant_site(stops: list[dict]) -> dict | None:
    clusters: list[dict] = []
    for event in stops:
        p = point(event)
        if not p or haversine(p, BASE) < 0.8 or float(event.get("dtDelta") or 0) < 300:
            continue
        cluster = next((c for c in clusters if haversine(p, c["center"]) <= 1.5), None)
        seconds = float(event.get("dtDelta") or 0)
        if cluster is None:
            cluster = {"items": [], "seconds": 0.0, "lat_sum": 0.0, "lon_sum": 0.0, "weight": 0.0, "center": p}
            clusters.append(cluster)
        cluster["items"].append(event)
        cluster["seconds"] += seconds
        cluster["lat_sum"] += p[0] * seconds
        cluster["lon_sum"] += p[1] * seconds
        cluster["weight"] += seconds
        cluster["center"] = (cluster["lat_sum"] / cluster["weight"], cluster["lon_sum"] / cluster["weight"])
    if not clusters:
        return None
    chosen = max(clusters, key=lambda c: c["seconds"])
    items = sorted(chosen["items"], key=lambda e: api_dt(e["dtBeg"]))
    addresses = unique(e.get("address") or e.get("objAddressOrName") for e in items)
    return {
        "lat": round(chosen["center"][0], 6),
        "lon": round(chosen["center"][1], 6),
        "arrival": api_dt(items[0]["dtBeg"]).astimezone(MSK).isoformat(),
        "departure": api_dt(items[-1]["dtEnd"]).astimezone(MSK).isoformat(),
        "span_seconds": int((api_dt(items[-1]["dtEnd"]) - api_dt(items[0]["dtBeg"])).total_seconds()),
        "stopped_seconds": int(chosen["seconds"]),
        "addresses": addresses[:3],
        "stop_count": len(items),
    }


def summarize_day(day: date, all_events: list[dict], plan: dict | None) -> dict:
    events = [e for e in all_events if api_dt(e["dtBeg"]).astimezone(MSK).date() == day]
    moves = [e for e in events if e.get("typeName") == "Движение"]
    stops = [e for e in events if e.get("typeName") in {"Стоянка", "Стоянка. Двигатель запущен"}]
    site = dominant_site(stops)

    departures = [e for e in moves if point(e) and point(e, "End") and haversine(point(e), BASE) <= 0.8 and haversine(point(e, "End"), BASE) > 0.8]
    returns = [e for e in moves if point(e) and point(e, "End") and haversine(point(e), BASE) > 2 and haversine(point(e, "End"), BASE) <= 0.8]
    departure = min((api_dt(e["dtBeg"]) for e in departures), default=None)
    returned = max((api_dt(e["dtEnd"]) for e in returns), default=None)
    distance = sum(float(e.get("distance") or 0) for e in moves)
    run_seconds = sum(float(e.get("dtDelta") or 0) for e in moves)
    idle_seconds = sum(float(e.get("dtDelta") or 0) for e in events if e.get("typeName") == "Стоянка. Двигатель запущен")
    max_speed = max((float(e.get("maxSpeed") or 0) for e in moves), default=0)
    speed_events = [e for e in events if e.get("typeName") == "Превышение скорости"]
    gps_events = [e for e in events if e.get("typeName") == "Потеря gps-спутников"]

    if plan and distance < 5:
        status, status_detail = "not_confirmed", "Разнарядка есть, но значимого выезда по ГЛОНАСС нет"
    elif plan and site:
        status, status_detail = "trip_confirmed", "Выезд и длительное присутствие вне базы подтверждены"
    elif plan:
        status, status_detail = "partial", "Выезд есть, устойчивую рабочую точку выделить не удалось"
    elif distance >= 5:
        status, status_detail = "unplanned", "Есть движение автомобиля без строки в разнарядке"
    else:
        status, status_detail = "no_plan", "Разнарядки и значимого движения нет"

    return {
        "date": day.isoformat(),
        "weekday": ["пн", "вт", "ср", "чт", "пт", "сб", "вс"][day.weekday()],
        "plan": plan,
        "actual": {
            "base_departure": departure.astimezone(MSK).isoformat() if departure else None,
            "base_return": returned.astimezone(MSK).isoformat() if returned else None,
            "site": site,
            "distance_km": round(distance, 2),
            "driving_seconds": int(run_seconds),
            "idle_engine_seconds": int(idle_seconds),
            "max_speed_kmh": round(max_speed, 1),
            "speeding_events": len(speed_events),
            "gps_loss_seconds": int(sum(float(e.get("dtDelta") or 0) for e in gps_events)),
            "movement_segments": len(moves),
        },
        "status": status,
        "status_detail": status_detail,
    }


def add_object_consistency(days: list[dict]) -> None:
    by_object: dict[str, list[dict]] = defaultdict(list)
    for row in days:
        if row["plan"] and row["actual"]["site"]:
            by_object[row["plan"]["object"]].append(row)
    for obj, rows in by_object.items():
        centers = [(r["actual"]["site"]["lat"], r["actual"]["site"]["lon"]) for r in rows]
        anchor = min(centers, key=lambda c: sum(haversine(c, other) for other in centers))
        for row, center in zip(rows, centers):
            delta = haversine(center, anchor)
            row["actual"]["site"]["distance_from_object_anchor_km"] = round(delta, 2)
            if len(rows) >= 2 and delta <= 3:
                row["status"] = "consistent"
                row["status_detail"] = f"Маршрут подтверждён; рабочая точка совпадает с другими выездами на этот объект (±{delta:.1f} км)"


def event_overlap_seconds(event: dict, begin: datetime, end: datetime) -> float:
    event_begin = api_dt(event["dtBeg"]).astimezone(MSK)
    event_end = api_dt(event["dtEnd"]).astimezone(MSK)
    return max(0.0, (min(event_end, end) - max(event_begin, begin)).total_seconds())


def add_efficiency_metrics(days: list[dict], events: list[dict]) -> None:
    planned = [row for row in days if row["plan"] and row["actual"]["site"]]
    moves = [event for event in events if event.get("typeName") == "Движение"]
    for row in planned:
        actual, site = row["actual"], row["actual"]["site"]
        departure = datetime.fromisoformat(actual["base_departure"])
        arrival = datetime.fromisoformat(site["arrival"])
        site_departure = datetime.fromisoformat(site["departure"])
        returned = datetime.fromisoformat(actual["base_return"])
        outbound = int((arrival - departure).total_seconds())
        return_trip = int((returned - site_departure).total_seconds())
        outbound_moving = int(sum(event_overlap_seconds(event, departure, arrival) for event in moves))
        return_moving = int(sum(event_overlap_seconds(event, site_departure, returned) for event in moves))
        row["efficiency"] = {
            "outbound_seconds": outbound,
            "outbound_moving_seconds": outbound_moving,
            "outbound_stop_seconds": max(0, outbound - outbound_moving),
            "return_seconds": return_trip,
            "return_moving_seconds": return_moving,
            "return_stop_seconds": max(0, return_trip - return_moving),
            "shift_window_seconds": int((returned - departure).total_seconds()),
        }

    by_object: dict[str, list[dict]] = defaultdict(list)
    for row in planned:
        by_object[row["plan"]["object"]].append(row)
    for rows in by_object.values():
        out_median = statistics.median(row["efficiency"]["outbound_seconds"] for row in rows)
        site_median = statistics.median(row["actual"]["site"]["span_seconds"] for row in rows)
        departure_minutes = []
        arrival_minutes = []
        return_minutes = []
        for row in rows:
            departure = datetime.fromisoformat(row["actual"]["base_departure"])
            arrival = datetime.fromisoformat(row["actual"]["site"]["arrival"])
            returned = datetime.fromisoformat(row["actual"]["base_return"])
            departure_minutes.append(departure.hour * 60 + departure.minute + departure.second / 60)
            arrival_minutes.append(arrival.hour * 60 + arrival.minute + arrival.second / 60)
            return_minutes.append(returned.hour * 60 + returned.minute + returned.second / 60)
        departure_median = statistics.median(departure_minutes)
        arrival_median = statistics.median(arrival_minutes)
        return_median = statistics.median(return_minutes)
        for row in rows:
            efficiency = row["efficiency"]
            departure = datetime.fromisoformat(row["actual"]["base_departure"])
            arrival = datetime.fromisoformat(row["actual"]["site"]["arrival"])
            returned = datetime.fromisoformat(row["actual"]["base_return"])
            departure_value = departure.hour * 60 + departure.minute + departure.second / 60
            arrival_value = arrival.hour * 60 + arrival.minute + arrival.second / 60
            return_value = returned.hour * 60 + returned.minute + returned.second / 60
            efficiency["peer_days"] = len(rows)
            efficiency["outbound_typical_seconds"] = int(out_median)
            efficiency["outbound_delta_seconds"] = int(efficiency["outbound_seconds"] - out_median)
            efficiency["site_typical_seconds"] = int(site_median)
            efficiency["site_delta_seconds"] = int(row["actual"]["site"]["span_seconds"] - site_median)
            efficiency["departure_typical_minutes"] = round(departure_median, 1)
            efficiency["departure_delta_minutes"] = round(departure_value - departure_median, 1)
            efficiency["arrival_typical_minutes"] = round(arrival_median, 1)
            efficiency["arrival_delta_minutes"] = round(arrival_value - arrival_median, 1)
            efficiency["return_typical_minutes"] = round(return_median, 1)
            efficiency["return_delta_minutes"] = round(return_value - return_median, 1)

            if len(rows) < 3:
                efficiency["departure_assessment"] = "Мало аналогов"
            elif abs(efficiency["departure_delta_minutes"]) <= 20:
                efficiency["departure_assessment"] = "В обычное время"
            elif efficiency["departure_delta_minutes"] > 20:
                efficiency["departure_assessment"] = "Позже обычного"
            else:
                efficiency["departure_assessment"] = "Раньше обычного"

            delay = efficiency["outbound_delta_seconds"]
            stops = efficiency["outbound_stop_seconds"]
            if len(rows) < 3:
                efficiency["road_assessment"] = "Без длительной остановки" if stops <= 20 * 60 else "Проверить остановки"
            elif delay > 30 * 60 or stops > 45 * 60:
                efficiency["road_assessment"] = "Заметная задержка"
            elif delay > 15 * 60 or stops > 30 * 60:
                efficiency["road_assessment"] = "Небольшое отклонение"
            else:
                efficiency["road_assessment"] = "Без заметной задержки"

            site_delta = efficiency["site_delta_seconds"]
            if len(rows) < 3:
                efficiency["site_assessment"] = "Мало аналогов"
            elif site_delta < -30 * 60:
                efficiency["site_assessment"] = "Короче обычного"
            elif site_delta > 30 * 60:
                efficiency["site_assessment"] = "Дольше обычного"
            else:
                efficiency["site_assessment"] = "Обычная длительность"

            comments = []
            if len(rows) >= 3:
                if efficiency["departure_delta_minutes"] > 20:
                    comments.append({"level": "attention", "text": f"Выехали на {round(efficiency['departure_delta_minutes'])} мин позже обычного для этого объекта."})
                elif efficiency["departure_delta_minutes"] < -20:
                    comments.append({"level": "positive", "text": f"Выехали на {round(abs(efficiency['departure_delta_minutes']))} мин раньше обычного."})
                if efficiency["arrival_delta_minutes"] > 30:
                    comments.append({"level": "attention", "text": f"Прибыли на объект на {round(efficiency['arrival_delta_minutes'])} мин позже обычного."})
                elif efficiency["arrival_delta_minutes"] < -30:
                    comments.append({"level": "positive", "text": f"Прибыли на объект на {round(abs(efficiency['arrival_delta_minutes']))} мин раньше обычного."})
                if efficiency["outbound_delta_seconds"] > 15 * 60:
                    comments.append({"level": "attention", "text": f"Дорога до точки заняла на {round(efficiency['outbound_delta_seconds'] / 60)} мин дольше обычного."})
                if efficiency["outbound_stop_seconds"] > 30 * 60:
                    comments.append({"level": "attention", "text": f"По пути накопилось {round(efficiency['outbound_stop_seconds'] / 60)} мин без движения — проверить остановки или дополнительный заезд."})
                if efficiency["site_delta_seconds"] < -30 * 60:
                    comments.append({"level": "attention", "text": f"На объекте были на {round(abs(efficiency['site_delta_seconds']) / 60)} мин меньше обычного — проверить объём и завершение работ."})
                elif efficiency["site_delta_seconds"] > 30 * 60:
                    comments.append({"level": "info", "text": f"На объекте были на {round(efficiency['site_delta_seconds'] / 60)} мин дольше обычного — проверить, был ли больший объём или задержка."})
                if efficiency["return_delta_minutes"] > 30:
                    comments.append({"level": "info", "text": f"Вернулись на базу на {round(efficiency['return_delta_minutes'])} мин позже обычного."})
                elif efficiency["return_delta_minutes"] < -30:
                    comments.append({"level": "info", "text": f"Вернулись на базу на {round(abs(efficiency['return_delta_minutes']))} мин раньше обычного."})
            else:
                comments.append({"level": "info", "text": "Недостаточно аналогичных поездок для оценки относительно обычного времени."})
                if efficiency["outbound_stop_seconds"] > 20 * 60:
                    comments.append({"level": "attention", "text": f"По пути накопилось {round(efficiency['outbound_stop_seconds'] / 60)} мин без движения."})
            if not comments:
                comments.append({"level": "ok", "text": "Существенных отклонений от аналогичных поездок не видно."})
            efficiency["comments"] = comments


def main() -> None:
    plans = load_plans()
    events = load_events()
    days = [summarize_day(date(2026, 7, n), events, plans.get(date(2026, 7, n).isoformat())) for n in range(1, 31)]
    add_object_consistency(days)
    add_efficiency_metrics(days, events)
    planned = [row for row in days if row["plan"]]
    output = {
        "generated_at": datetime.now(MSK).isoformat(timespec="seconds"),
        "period": {"from": "2026-07-01", "to": "2026-07-30", "timezone": "Europe/Moscow (UTC+3)"},
        "vehicle": {"name": "Соболь 088", "api_name": "СЭС_СОБОЛЬ_н088рт797", "unit_id": 592643},
        "methodology": {
            "base": {"name": "База ВЭС Деденево", "lat": BASE[0], "lon": BASE[1], "radius_km": 0.8},
            "site": "Доминирующий кластер стоянок вне базы; стоянки от 5 минут объединены в радиусе 1,5 км.",
            "matching": "Для повторяющихся объектов проверяется стабильность фактической точки между днями. Точное совпадение названия требует координат объектов в справочнике.",
        },
        "summary": {
            "calendar_days": len(days),
            "planned_days": len(planned),
            "consistent_days": sum(row["status"] == "consistent" for row in planned),
            "confirmed_trip_days": sum(row["status"] in {"consistent", "trip_confirmed"} for row in planned),
            "not_confirmed_days": sum(row["status"] == "not_confirmed" for row in planned),
            "unplanned_movement_days": sum(row["status"] == "unplanned" for row in days),
            "planned_distance_km": round(sum(row["actual"]["distance_km"] for row in planned), 1),
            "all_distance_km": round(sum(row["actual"]["distance_km"] for row in days), 1),
            "planned_site_seconds": sum((row["actual"]["site"] or {}).get("span_seconds", 0) for row in planned),
            "planned_driving_seconds": sum(row["actual"]["driving_seconds"] for row in planned),
            "planned_idle_engine_seconds": sum(row["actual"]["idle_engine_seconds"] for row in planned),
            "speeding_events": sum(row["actual"]["speeding_events"] for row in days),
            "gps_loss_seconds": sum(row["actual"]["gps_loss_seconds"] for row in days),
            "road_delay_days": sum(row.get("efficiency", {}).get("road_assessment") == "Заметная задержка" for row in planned),
            "road_ok_days": sum(row.get("efficiency", {}).get("road_assessment") in {"Без заметной задержки", "Без длительной остановки"} for row in planned),
            "late_vs_typical_days": sum(row.get("efficiency", {}).get("departure_assessment") == "Позже обычного" for row in planned),
        },
        "days": days,
    }
    OUTPUT.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()

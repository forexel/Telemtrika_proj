#!/usr/bin/env python3
"""Собрать структурированный анализ телеметрии Соболь 088 за 10.08.2026."""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parent
RESULTS = ROOT / "api_results"
UTC_FORMAT = "%d.%m.%Y %H:%M:%S"


def load_body(name: str):
    return json.loads((RESULTS / name).read_text(encoding="utf-8"))["body"]


def dt_value(value):
    if isinstance(value, dict):
        value = value.get("v")
    return datetime.strptime(value, UTC_FORMAT) if value else None


def msk_iso(value):
    parsed = dt_value(value) if not isinstance(value, datetime) else value
    return (parsed + timedelta(hours=3)).isoformat(timespec="seconds") if parsed else None


def duration(seconds: int | float) -> str:
    seconds = int(round(seconds))
    hours, remainder = divmod(seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"


def main() -> None:
    calc = load_body("sobol_088_calculator.json")
    api_events = load_body("sobol_088_events.json")
    track = load_body("sobol_088_track.json")
    point_count = load_body("sobol_088_point_count.json")
    values = calc["values"]
    calc_events = calc["recordLists"]["events"]

    # База ВЭС Деденево (объект 6838 из API).
    base = {"id": 6838, "lat": 56.23023, "lon": 37.526005, "lat_size": 0.0018, "lon_size": 0.003238}

    def inside_base(point):
        return (
            abs(point["lat"] - base["lat"]) <= base["lat_size"] / 2
            and abs(point["lon"] - base["lon"]) <= base["lon_size"] / 2
        )

    work_begin = dt_value(api_events["values"]["workBeginDT"])
    work_end = dt_value(api_events["values"]["workEndDT"])
    work_start_index = next(i for i, point in enumerate(track) if dt_value(point["dt"]) >= work_begin)
    transitions = []
    for index in range(work_start_index + 1, len(track)):
        was_inside = inside_base(track[index - 1])
        is_inside = inside_base(track[index])
        if was_inside != is_inside:
            transitions.append(("entry" if is_inside else "exit", dt_value(track[index]["dt"]), index))

    long_remote_stops = [
        event for event in calc_events
        if event.get("typeName") == "Стоянка"
        and event.get("dtDelta", 0) >= 3600
        and not inside_base({"lat": event["latLonBeg"]["x"], "lon": event["latLonBeg"]["y"]})
    ]
    site_arrival = min(dt_value(event["dtBeg"]) for event in long_remote_stops)
    site_departure = max(dt_value(event["dtEnd"]) for event in long_remote_stops)
    base_exit = max(moment for kind, moment, _ in transitions if kind == "exit" and moment < site_arrival)
    base_entries = [
        dt_value(event["dtBeg"])
        for event in api_events["recordLists"]["events"]
        if event.get("type") == 9 and dt_value(event["dtBeg"]) > site_departure
    ]
    base_return = min(base_entries)

    first_site_stop = min(long_remote_stops, key=lambda event: dt_value(event["dtBeg"]))
    site_lat = first_site_stop["latLonBeg"]["x"]
    site_lon = first_site_stop["latLonBeg"]["y"]
    outbound_seconds = (site_arrival - base_exit).total_seconds()
    return_seconds = (base_return - site_departure).total_seconds()
    site_seconds = (site_departure - site_arrival).total_seconds()

    speed_event = next((event for event in calc_events if event.get("typeName") == "Превышение скорости"), None)
    gps_event = next((event for event in calc_events if event.get("typeName") == "Потеря gps-спутников"), None)
    local_moves = [
        event for event in calc_events
        if event.get("typeName") == "Движение"
        and dt_value(event["dtBeg"]) >= site_arrival
        and dt_value(event["dtEnd"]) <= site_departure
    ]

    summary = {
        "date": "2026-08-10",
        "timezone": "Europe/Moscow (UTC+3)",
        "vehicle": "Соболь 088",
        "api_name": values["carName"],
        "model": values["model"],
        "car_id": values["carID"],
        "unit_id": values["unitID"],
        "server": values["server"],
        "driver": "Не определён (тахограф: без карты)",
        "master": "",
        "work_object": f"Рабочая точка вне геозоны, МО, Дмитровский г.о. ({site_lat:.6f}, {site_lon:.6f})",
        "work_type": "",
        "comment": "Точка работ не заведена в API как объект; время рассчитано по кластеру длительных стоянок.",
        "base_departure_msk": msk_iso(base_exit),
        "site_arrival_msk": msk_iso(site_arrival),
        "site_departure_msk": msk_iso(site_departure),
        "base_return_msk": msk_iso(base_return),
        "outbound_seconds": outbound_seconds,
        "return_seconds": return_seconds,
        "transit_difference_seconds": abs(outbound_seconds - return_seconds),
        "site_seconds": site_seconds,
        "work_begin_msk": msk_iso(work_begin),
        "work_end_msk": msk_iso(work_end),
        "distance_km": values["distance"],
        "run_seconds": values["runTime"],
        "engine_idle_seconds": values["stopOnTime"],
        "max_speed_kmh": values["maxSpeed"],
        "avg_moving_speed_kmh": values["avgSpeed"],
        "gps_loss_seconds": gps_event.get("dtDelta", 0) if gps_event else 0,
        "track_points": len(track),
        "server_point_count": point_count["result"][0]["count"],
        "fuel_sensor_available": values["fuelLevelSource"] != 0,
        "voltage_min": values["voltageMin"],
        "voltage_avg": values["voltageAvg"],
        "voltage_max": values["voltageMax"],
    }

    remarks = [
        {
            "severity": "Важно",
            "observation": "Рабочая площадка не заведена как геозона/объект API.",
            "evidence": f"Внешняя стоянка {duration(site_seconds)} около {site_lat:.6f}, {site_lon:.6f}, но objCount учитывает только базу 6838.",
            "interpretation": "Автоматическое поле «Наименование объекта» нельзя надёжно заполнить без справочника заданий или геозоны площадки.",
            "action": "Завести рабочие объекты в GLONASS или сопоставлять координаты с утренней разнарядкой.",
        },
        {
            "severity": "Важно",
            "observation": "Водитель не идентифицирован.",
            "evidence": "Весь пробег 28,13 км относится к записи тахографа «Без карты»; список drivers пуст.",
            "interpretation": "Телеметрия не позволяет автоматически назначить водителя для отчёта эффективности.",
            "action": "Проверить использование карты водителя или связывать машину с водителем из разнарядки.",
        },
        {
            "severity": "Проверить",
            "observation": "Зафиксировано превышение установленного порога 90 км/ч.",
            "evidence": (
                f"{msk_iso(dt_value(speed_event['dtBeg']))[11:]}–{msk_iso(dt_value(speed_event['dtEnd']))[11:]}, "
                f"максимум {speed_event['maxSpeed']:.1f} км/ч, длительность {speed_event['dtDelta']} с."
                if speed_event else "Событие отсутствует."
            ),
            "interpretation": "Кратковременное превышение на 2,5 км/ч выше порога.",
            "action": "Уточнить допустимый корпоративный порог и учитывать только устойчивые превышения.",
        },
        {
            "severity": "Проверить",
            "observation": "Потеря GPS на рабочей площадке.",
            "evidence": (
                f"{msk_iso(dt_value(gps_event['dtBeg']))[11:]}–{msk_iso(dt_value(gps_event['dtEnd']))[11:]}, "
                f"длительность {duration(gps_event['dtDelta'])}." if gps_event else "Событие отсутствует."
            ),
            "interpretation": "Интервал стоянки достоверен по окружающим точкам, но координаты внутри интервала отсутствуют.",
            "action": "Контролировать повторяемость потерь GPS по этой машине.",
        },
        {
            "severity": "Наблюдение",
            "observation": "Перед окончательным выездом машина долго находилась на базе.",
            "evidence": f"Работа/зажигание начались в {msk_iso(work_begin)[11:]}, окончательный выезд из геозоны — {msk_iso(base_exit)[11:]}; холостой ход с включённым двигателем {duration(values['stopOnTime'])}.",
            "interpretation": "Подготовка на базе заняла около 1 ч 07 мин; двигатель суммарно работал на стоянке 18 мин 27 с.",
            "action": "При оценке эффективности разделять подготовку на базе и фактическое время в пути.",
        },
        {
            "severity": "Наблюдение",
            "observation": "На площадке была короткая перестановка.",
            "evidence": (
                f"{msk_iso(dt_value(local_moves[0]['dtBeg']))[11:]}–{msk_iso(dt_value(local_moves[0]['dtEnd']))[11:]}, "
                f"{local_moves[0]['distance']:.3f} км, максимум {local_moves[0]['maxSpeed']:.1f} км/ч."
                if local_moves else "Короткие перемещения не найдены."
            ),
            "interpretation": "Похоже на перестановку внутри одной рабочей зоны; без геозоны возможно ошибочно принять за отдельный выезд.",
            "action": "Объединять близкие длительные стоянки в одну рабочую площадку.",
        },
        {
            "severity": "Ограничение",
            "observation": "Данные по топливу отсутствуют.",
            "evidence": "fuelLevelSource=0, fuelBeg/fuelEnd/fuelIn/fuelOut=0, ёмкость бака не задана.",
            "interpretation": "Нулевые значения означают отсутствие источника, а не нулевой расход.",
            "action": "Не использовать топливные поля этой машины в KPI до подключения/настройки датчика или CAN.",
        },
        {
            "severity": "Проверить",
            "observation": "Минимальное бортовое напряжение опускалось ниже 10 В.",
            "evidence": f"Минимум {values['voltageMin']:.3f} В, среднее {values['voltageAvg']:.2f} В, максимум {values['voltageMax']:.3f} В.",
            "interpretation": "Возможно кратковременная просадка при запуске; одной суточной выборки недостаточно для диагноза АКБ.",
            "action": "Сравнить минимум за несколько дней и проверить длительность просадки.",
        },
        {
            "severity": "Контроль данных",
            "observation": "Количество точек в двух методах различается на 2.",
            "evidence": f"getPoints вернул {len(track)} точек, pointCount — {point_count['result'][0]['count']}.",
            "interpretation": "Небольшое расхождение может быть связано с граничными/служебными точками или фильтрацией формата JSON.",
            "action": "Для детальных расчётов использовать фактически полученный трек, а pointCount — как контроль полноты.",
        },
    ]

    events = []
    for event in calc_events:
        events.append({
            "type": event.get("typeName", ""),
            "start_msk": msk_iso(event.get("dtBeg")),
            "end_msk": msk_iso(event.get("dtEnd")),
            "duration_seconds": event.get("dtDelta", 0),
            "distance_km": event.get("distance", 0),
            "max_speed_kmh": event.get("maxSpeed", 0),
            "address": event.get("objAddressOrName") or event.get("address", ""),
            "lat": event.get("latLonBeg", {}).get("x"),
            "lon": event.get("latLonBeg", {}).get("y"),
        })

    track_rows = []
    for point in track:
        track_rows.append({
            "time_msk": msk_iso(point["dt"]),
            "lat": point.get("lat"),
            "lon": point.get("lon"),
            "speed_kmh": point.get("speed"),
            "ignition": point.get("ignition"),
            "satellites": point.get("sat"),
            "gsm": point.get("gsm"),
            "voltage": point.get("voltage"),
            "received_msk": msk_iso(point.get("received")),
        })

    output = {"summary": summary, "remarks": remarks, "events": events, "track": track_rows}
    path = RESULTS / "sobol_088_analysis.json"
    path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(path)


if __name__ == "__main__":
    main()

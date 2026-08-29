#!/usr/bin/env python3
"""Загрузить расчётные события Соболя 088 за июль 2026 пакетами по пять дней."""

from __future__ import annotations

import hashlib
import json
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from glonass_probe import DEFAULT_LOGIN_URL, ROOT, env, load_env, request_json_or_text
from readonly_probe import post_json


OUT = ROOT / "api_results" / "sobol_088_july_2026"
MOSCOW = timezone(timedelta(hours=3))
UTC_FMT = "%d.%m.%Y %H:%M:%S"


def main() -> int:
    load_env(ROOT / ".env")
    api_key = env("GLONASS_API_KEY", required=True)
    username = env("GLONASS_USERNAME", required=True)
    password = env("GLONASS_PASSWORD", required=True)
    timeout = float(env("GLONASS_TIMEOUT_SECONDS") or "60")

    status, login = request_json_or_text(
        env("GLONASS_LOGIN_URL") or DEFAULT_LOGIN_URL,
        {"apikey": api_key, "name": username, "pwd": password, "indented": "false"},
        timeout,
    )
    if status != 200 or not isinstance(login, dict):
        raise RuntimeError(f"Авторизация не выполнена: HTTP {status}")

    car = next(
        car for car in login.get("cars", [])
        if str(car.get("unitID")) == "592643" or "088" in str(car.get("displayableName", ""))
    )
    user_id = login["user"]["id"]
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "vehicle.json").write_text(
        json.dumps(
            {
                "name": car.get("displayableName") or car.get("name"),
                "car_id": car.get("id"),
                "unit_id": car.get("unitID"),
                "server": car.get("server"),
                "user_id": user_id,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    periods = []
    cursor = datetime(2026, 7, 1, tzinfo=MOSCOW)
    end_all = datetime(2026, 7, 31, tzinfo=MOSCOW)
    while cursor < end_all:
        end = min(cursor + timedelta(days=5), end_all)
        periods.append((cursor.astimezone(timezone.utc), (end - timedelta(seconds=1)).astimezone(timezone.utc)))
        cursor = end

    for index, (begin_utc, end_utc) in enumerate(periods, start=1):
        name = f"batch_{index:02d}"
        output_path = OUT / f"{name}.json"
        if output_path.exists():
            print(f"{name}: уже загружен, пропускаю", flush=True)
            continue
        status, body = post_json(
            f"sobol_088_july_2026/{name}",
            f"http://{car['server']}:2231/api/vm/calculator",
            {
                "apikey": api_key,
                "user_id": user_id,
                "pwd_md5": hashlib.md5(password.encode("utf-8")).hexdigest(),
                "indented": "true",
            },
            {
                "unitID": car["unitID"],
                "dtBeg": {"type": "datetime", "v": begin_utc.strftime(UTC_FMT)},
                "dtEnd": {"type": "datetime", "v": end_utc.strftime(UTC_FMT)},
                "keys": [
                    "eventNoGPS",
                    "eventObjInOut",
                    "eventSpeedExcess",
                    "eventTrip",
                    "driver",
                    "tachograph",
                    "totalLastPoint",
                ],
                "inValues": {
                    "event_UseAddress": True,
                    "eventSpeedExcess_SpeedLimit": 90,
                    "eventTrip_MinStopTime": 300,
                },
            },
            timeout,
        )
        if status != 200 or not isinstance(body, dict):
            raise RuntimeError(f"{name}: HTTP {status}")
        print(f"{name}: {begin_utc} — {end_utc}, получен", flush=True)
        if index < len(periods):
            print("Пауза 61 секунда по лимиту API для одной машины…", flush=True)
            time.sleep(61)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

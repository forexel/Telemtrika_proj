#!/usr/bin/env python3
"""Последовательная проверка всех read-only методов MSS GLONASS API."""

from __future__ import annotations

import json
import hashlib
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from glonass_probe import (
    DEFAULT_LOGIN_URL,
    ROOT,
    env,
    load_env,
    redact_data,
    request_json_or_text,
    safe_params,
)


RESULT_DIR = ROOT / "api_results"


def save_result(name: str, status: int, body: Any) -> Path:
    RESULT_DIR.mkdir(exist_ok=True)
    path = RESULT_DIR / f"{name}.json"
    payload = {"http_status": status, "body": redact_data(body)}
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def describe(body: Any) -> str:
    if isinstance(body, dict):
        return "JSON object; поля: " + ", ".join(map(str, body.keys()))
    if isinstance(body, list):
        return f"JSON array; элементов: {len(body)}"
    return f"текст; символов: {len(str(body))}"


def call(name: str, url: str, params: dict[str, Any], timeout: float) -> tuple[int, Any]:
    print(f"\n--- {name} ---")
    status, body = request_json_or_text(url, params, timeout)
    path = save_result(name, status, body)
    print(f"HTTP {status}; {describe(body)}")
    print(f"Сохранено: {path}")
    return status, body


def post_json(name: str, url: str, params: dict[str, Any], payload: dict[str, Any], timeout: float) -> tuple[int, Any]:
    """Отправить JSON POST, не показывая секреты в URL и выводе."""
    clean_params = {key: value for key, value in params.items() if value not in (None, "")}
    request = Request(
        f"{url}?{urlencode(clean_params)}",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Accept": "application/json", "Content-Type": "application/json", "User-Agent": "glonass-api-probe/1.0"},
        method="POST",
    )
    print(f"\n--- {name} ---")
    print(f"POST {url}")
    print("Параметры:", json.dumps(safe_params(clean_params), ensure_ascii=False))
    try:
        with urlopen(request, timeout=timeout) as response:
            status = response.status
            content_type = response.headers.get("Content-Type", "")
            raw = response.read()
    except HTTPError as error:
        status = error.code
        content_type = error.headers.get("Content-Type", "") if error.headers else ""
        raw = error.read()
    except URLError as error:
        raise RuntimeError(f"Не удалось подключиться к API: {getattr(error, 'reason', error)}") from None
    charset = "utf-8"
    if "charset=" in content_type.lower():
        charset = content_type.lower().split("charset=", 1)[1].split(";", 1)[0].strip()
    text = raw.decode(charset, errors="replace")
    try:
        body: Any = json.loads(text)
    except json.JSONDecodeError:
        body = text
    path = save_result(name, status, body)
    print(f"HTTP {status}; {describe(body)}")
    print(f"Сохранено: {path}")
    return status, body


def main() -> int:
    load_env(ROOT / ".env")
    api_key = env("GLONASS_API_KEY", required=True)
    username = env("GLONASS_USERNAME", required=True)
    password = env("GLONASS_PASSWORD", required=True)
    timeout = float(env("GLONASS_TIMEOUT_SECONDS") or "30")

    login_status, login_body = request_json_or_text(
        env("GLONASS_LOGIN_URL") or DEFAULT_LOGIN_URL,
        {
            "apikey": api_key,
            "name": username,
            "pwd": password,
            "indented": "false",
            "parse_params": "false",
        },
        timeout,
    )
    if login_status != 200 or not isinstance(login_body, dict):
        print(f"Login неуспешен: HTTP {login_status}; {describe(login_body)}")
        return 1

    user_id = login_body.get("user", {}).get("id")
    cars = [
        car for car in login_body.get("cars", [])
        if isinstance(car, dict) and car.get("unitID") and car.get("server")
    ]
    if not user_id or len(cars) < 5:
        print(f"Недостаточно данных: user_id={user_id!r}, машин={len(cars)}")
        return 1

    inventory = {
        "user_id": user_id,
        "car_count": len(cars),
        "servers": dict(Counter(str(car["server"]) for car in cars)),
        "cars": [
            {
                "car_id": car.get("id"),
                "unit_id": car.get("unitID"),
                "name": car.get("displayableName") or car.get("name"),
                "state_number": car.get("stateNumber") or car.get("params", {}).get("stateNum")
                    if isinstance(car.get("params"), dict) else car.get("stateNumber"),
                "server": car.get("server"),
            }
            for car in cars
        ],
    }
    RESULT_DIR.mkdir(exist_ok=True)
    inventory_path = RESULT_DIR / "inventory.json"
    inventory_path.write_text(json.dumps(inventory, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Авторизация: HTTP 200; user_id={user_id}; машин={len(cars)}")
    print(f"Серверы: {inventory['servers']}")
    print(f"Инвентарь: {inventory_path}")

    # Берём разные машины для каждого запроса, чтобы не превышать лимит
    # «не чаще одного запроса в минуту по каждой машине».
    selected = sorted(cars, key=lambda car: int(car.get("id", 0)), reverse=True)[:5]
    now = datetime.now(timezone.utc).replace(microsecond=0)
    hour_ago = now - timedelta(hours=1)
    day_ago = now - timedelta(days=1)
    fmt = "%d.%m.%Y %H:%M:%S"

    car = selected[0]
    call(
        "position",
        f"http://{car['server']}:2231/vm/position",
        {
            "apikey": api_key,
            "userID": user_id,
            "pwd": password,
            "unitIDs": car["unitID"],
            "add": "move,address,moveCalc,fuelLevel,states",
            "params": "indented,dtAsString",
        },
        timeout,
    )

    car = selected[1]
    call(
        "track",
        f"http://{car['server']}:2231/api/vm/getPoints",
        {
            "apikey": api_key,
            "user_id": user_id,
            "pwd": password,
            "unit_id": car["unitID"],
            "dt_begin": int(hour_ago.timestamp()),
            "dt_end": int(now.timestamp()),
            "format": "json-short",
            "options": "format_dt",
        },
        timeout,
    )

    car = selected[2]
    call(
        "events",
        f"http://{car['server']}:2231/api/vm/events",
        {
            "apikey": api_key,
            "user_id": user_id,
            "pwd": password,
            "unit_id": car["unitID"],
            "dt_begin": int(day_ago.timestamp()),
            "dt_end": int(now.timestamp()),
            "event_types": "all",
            "use_addresses": "false",
            "indented": "true",
        },
        timeout,
    )

    car = selected[3]
    call(
        "point_count",
        f"http://{car['server']}:2231/vm/pointCount",
        {
            "apikey": api_key,
            "userID": user_id,
            "pwd": password,
            "dt": now.strftime("%d.%m.%Y"),
            "unitIDs": car["unitID"],
        },
        timeout,
    )

    # help=true не относится к конкретной машине и не требует расчёта.
    calculator_server = selected[0]["server"]
    call(
        "calculator_help",
        f"http://{calculator_server}:2231/api/vm/calculator",
        {"help": "true"},
        timeout,
    )

    car = selected[4]
    post_json(
        "calculator_calculation",
        f"http://{car['server']}:2231/api/vm/calculator",
        {
            "apikey": api_key,
            "user_id": user_id,
            "pwd_md5": hashlib.md5(password.encode("utf-8")).hexdigest(),
            "indented": "true",
        },
        {
            "unitID": car["unitID"],
            "dtBeg": {"type": "datetime", "v": hour_ago.strftime(fmt)},
            "dtEnd": {"type": "datetime", "v": now.strftime(fmt)},
            "keys": ["eventFuelInOut"],
            "inValues": {"event_UseAddress": False},
        },
        timeout,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

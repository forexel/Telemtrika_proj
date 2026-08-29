#!/usr/bin/env python3
"""Экспорт актуального списка автомобилей MSS GLONASS без секретов."""

from __future__ import annotations

import csv
import json
from datetime import datetime, timezone

from glonass_probe import DEFAULT_LOGIN_URL, ROOT, env, load_env, request_json_or_text


OUT_DIR = ROOT / "api_results"


def clean(value):
    return str(value or "").strip()


def main() -> int:
    load_env(ROOT / ".env")
    status, body = request_json_or_text(
        env("GLONASS_LOGIN_URL") or DEFAULT_LOGIN_URL,
        {
            "apikey": env("GLONASS_API_KEY", required=True),
            "name": env("GLONASS_USERNAME", required=True),
            "pwd": env("GLONASS_PASSWORD", required=True),
            "indented": "false",
            "parse_params": "false",
        },
        float(env("GLONASS_TIMEOUT_SECONDS") or "30"),
    )
    if status != 200 or not isinstance(body, dict):
        raise RuntimeError(f"Авторизация не выполнена: HTTP {status}")

    vehicles = []
    for car in body.get("cars", []):
        if not isinstance(car, dict):
            continue
        params = car.get("params") if isinstance(car.get("params"), dict) else {}
        vehicles.append({
            "display_name": clean(car.get("displayableName") or car.get("name")),
            "system_name": clean(car.get("name")),
            "state_number": clean(car.get("stateNumber") or params.get("stateNum")),
            "car_id": car.get("id"),
            "unit_id": car.get("unitID"),
            "server": clean(car.get("server")),
            "model": clean(car.get("model")),
        })
    vehicles.sort(key=lambda item: (item["display_name"].casefold(), str(item["car_id"])))
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "count": len(vehicles),
        "vehicles": vehicles,
    }
    OUT_DIR.mkdir(exist_ok=True)
    json_path = OUT_DIR / "glonass_vehicles_current.json"
    csv_path = OUT_DIR / "glonass_vehicles_current.csv"
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    with csv_path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(vehicles[0].keys()) if vehicles else ["display_name"])
        writer.writeheader()
        writer.writerows(vehicles)
    print(json_path)
    print(csv_path)
    print(f"Автомобилей: {len(vehicles)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

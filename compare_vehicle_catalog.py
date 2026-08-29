#!/usr/bin/env python3
"""Сопоставить J:K листа «Справочник» с актуальным списком MSS GLONASS."""

from __future__ import annotations

import json
import re
import csv
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SHEET_VALUES = Path("/private/tmp/vehicle_catalog_jk.json")
GLONASS_VALUES = ROOT / "api_results" / "glonass_vehicles_current.json"
OUTPUT = ROOT / "api_results" / "vehicle_catalog_comparison.json"
CSV_OUTPUT = ROOT / "api_results" / "vehicle_catalog_comparison.csv"
LATIN_TO_CYRILLIC = str.maketrans("ABEKMHOPCTYX", "АВЕКМНОРСТУХ")


def norm(value: str) -> str:
    value = str(value or "").upper().translate(LATIN_TO_CYRILLIC)
    return re.sub(r"[^А-Я0-9]", "", value)


def variants(value: str) -> set[str]:
    normalized = norm(value)
    result = {normalized} if normalized else set()
    match = re.fullmatch(r"(\d{2})([АВЕКМНОРСТУХ]{2})(\d{4})", normalized)
    if match:
        region, letters, digits = match.groups()
        result.add(f"{digits}{letters}{region}")
    return result


def short_code(plate: str) -> str:
    normalized = norm(plate)
    match = re.fullmatch(r"[АВЕКМНОРСТУХ](\d{3})[АВЕКМНОРСТУХ]{2}\d{2,3}", normalized)
    if match:
        return match.group(1)
    match = re.fullmatch(r"\d{2}[АВЕКМНОРСТУХ]{2}(\d{4})", normalized)
    if match:
        return match.group(1)
    groups = re.findall(r"\d+", normalized)
    return max(groups, key=len) if groups else ""


def vehicle_text(vehicle: dict) -> str:
    return norm(" ".join([vehicle.get("display_name", ""), vehicle.get("system_name", ""), vehicle.get("state_number", "")]))


def main() -> None:
    sheet_rows = json.loads(SHEET_VALUES.read_text(encoding="utf-8"))
    vehicles = json.loads(GLONASS_VALUES.read_text(encoding="utf-8"))["vehicles"]
    rows = []
    used_ids = set()
    for row_number, source in enumerate(sheet_rows, start=1):
        model = str((source + [None, None])[0] or "").strip()
        plate = str((source + [None, None])[1] or "").strip()
        if row_number <= 2 or not (model or plate):
            continue
        plate_variants = variants(plate)
        exact = []
        for vehicle in vehicles:
            api_variants = variants(vehicle.get("state_number", ""))
            display_norm = norm(vehicle.get("display_name", ""))
            if plate_variants & api_variants or any(item and item in display_norm for item in plate_variants):
                exact.append(vehicle)

        candidates = exact
        method = "plate"
        if not candidates:
            code = short_code(plate)
            candidates = [vehicle for vehicle in vehicles if code and code in vehicle_text(vehicle)]
            method = "short_code"
        if len(candidates) == 1:
            vehicle = candidates[0]
            used_ids.add(vehicle["car_id"])
            api_plate_variants = variants(vehicle.get("state_number", ""))
            if method == "plate" and api_plate_variants and plate_variants & api_plate_variants:
                status = "exact"
                note = "Госномер совпадает с полем ГЛОНАСС."
            elif method == "plate":
                status = "matched_display"
                note = "Номер найден в отображаемом названии ГЛОНАСС; отдельное поле госномера не заполнено или отличается."
            else:
                status = "matched_code"
                note = "Найдено по короткому номеру/коду машины; требуется разовая проверка соответствия."
            if vehicle.get("state_number") and not (plate_variants & api_plate_variants):
                status = "conflict"
                note = f"Название похоже, но поле госномера ГЛОНАСС содержит «{vehicle['state_number']}»."
            rows.append({
                "sheet_row": row_number,
                "sheet_model": model,
                "sheet_plate": plate,
                "status": status,
                "glonass_display_name": vehicle["display_name"],
                "glonass_state_number": vehicle["state_number"],
                "car_id": vehicle["car_id"],
                "unit_id": vehicle["unit_id"],
                "server": vehicle["server"],
                "note": note,
            })
        elif len(candidates) > 1:
            rows.append({
                "sheet_row": row_number,
                "sheet_model": model,
                "sheet_plate": plate,
                "status": "ambiguous",
                "glonass_display_name": " | ".join(vehicle["display_name"] for vehicle in candidates),
                "glonass_state_number": "",
                "car_id": None,
                "unit_id": None,
                "server": "",
                "note": "Найдено несколько кандидатов; нужна ручная привязка по car_id/unit_id.",
            })
        else:
            rows.append({
                "sheet_row": row_number,
                "sheet_model": model,
                "sheet_plate": plate,
                "status": "not_found",
                "glonass_display_name": "",
                "glonass_state_number": "",
                "car_id": None,
                "unit_id": None,
                "server": "",
                "note": "В текущем списке ГЛОНАСС совпадение не найдено.",
            })

    output = {
        "sheet_count": len(rows),
        "matched_count": sum(row["status"] not in {"not_found", "ambiguous"} for row in rows),
        "not_found_count": sum(row["status"] == "not_found" for row in rows),
        "ambiguous_count": sum(row["status"] == "ambiguous" for row in rows),
        "rows": rows,
        "glonass_not_selected": [vehicle for vehicle in vehicles if vehicle["car_id"] not in used_ids],
    }
    OUTPUT.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    with CSV_OUTPUT.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0].keys()) if rows else ["sheet_row"])
        writer.writeheader()
        writer.writerows(rows)
    print(OUTPUT)
    print(CSV_OUTPUT)
    print(json.dumps({key: output[key] for key in ["sheet_count", "matched_count", "not_found_count", "ambiguous_count"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()

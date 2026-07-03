import csv
import re
from pathlib import Path

import openpyxl


def normalize_name(value: str) -> str:
    text = str(value or "").lower().replace("ё", "е")
    text = re.sub(r"[^а-яa-z\s-]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def cell_text(value) -> str:
    return "" if value is None else str(value).strip()


def cell_hours(value) -> float:
    if value is None or isinstance(value, bool):
        return 0.0
    if isinstance(value, (int, float)):
        v = float(value)
        return v if 0 <= v <= 24 else 0.0
    text = str(value).strip().replace(",", ".")
    if re.fullmatch(r"\d+(\.\d+)?", text):
        v = float(text)
        return v if 0 <= v <= 24 else 0.0
    return 0.0


def is_employee_row(row_text: str, profiles) -> dict | None:
    row_norm = normalize_name(row_text)
    if not row_norm:
        return None
    for profile in profiles:
        name = normalize_name(profile.get("timesheet_name") or profile.get("full_name"))
        if name and name in row_norm and len(name.split()) >= 2:
            return profile
    return None


def find_hours_in_row(row) -> float:
    # take the most likely hours value (max numeric <=24)
    values = []
    for v in row:
        h = cell_hours(v)
        if h > 0:
            values.append(h)
    if not values:
        return 0.0
    return max(values)


def read_rows(path: Path):
    suffix = path.suffix.lower()
    rows = []
    if suffix in {".xlsx", ".xlsm"}:
        wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
        for sheet in wb.worksheets:
            for row in sheet.iter_rows(values_only=True):
                rows.append(list(row))
    elif suffix == ".csv":
        with path.open("r", encoding="utf-8-sig", newline="") as f:
            rows.extend(list(csv.reader(f)))
    else:
        raise RuntimeError("Нужен файл .xlsx, .xlsm или .csv")
    return rows


def parse_timesheet(path: Path, profiles):
    rows = read_rows(path)

    result = {p["id"]: {"profile": p, "hours": 0.0, "rows": 0} for p in profiles}
    current_profile_id = None

    for row in rows:
        row_text = " ".join(cell_text(v) for v in row if v is not None)

        match = is_employee_row(row_text, profiles)
        if match:
            current_profile_id = match["id"]
            continue

        if current_profile_id and current_profile_id in result:
            h = find_hours_in_row(row)
            if h > 0:
                result[current_profile_id]["hours"] += h
                result[current_profile_id]["rows"] += 1

    output = []
    for pid, data in result.items():
        if data["hours"] > 0:
            p = data["profile"]
            output.append({
                "profile_id": pid,
                "telegram_id": p.get("telegram_id"),
                "full_name": p.get("full_name"),
                "hours": round(data["hours"], 2),
                "matched_rows": data["rows"],
            })

    return sorted(output, key=lambda x: x["full_name"])


def format_hours(value: float) -> str:
    if float(value).is_integer():
        return str(int(value))
    return str(value).replace(".", ",")
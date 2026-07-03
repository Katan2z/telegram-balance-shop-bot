import csv
import re
from pathlib import Path

import openpyxl
import supabase_storage as db

CURRENT_PERIOD = "current"


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
        value = float(value)
        return value if 0 <= value <= 24 else 0.0
    text = str(value).strip().replace(",", ".")
    if re.fullmatch(r"\d+(\.\d+)?", text):
        value = float(text)
        return value if 0 <= value <= 24 else 0.0
    return 0.0


def name_parts(value: str):
    return [p for p in normalize_name(value).split() if len(p) > 1]


def profile_matches_row(profile, row_text: str) -> bool:
    row = normalize_name(row_text)
    for name in [profile.get("timesheet_name"), profile.get("full_name")]:
        parts = name_parts(name)
        if len(parts) >= 2 and all(part in row for part in parts[:2]):
            return True
    return False


def read_rows(path: Path):
    suffix = path.suffix.lower()
    rows = []
    if suffix in {".xlsx", ".xlsm"}:
        workbook = openpyxl.load_workbook(path, data_only=True, read_only=True)
        for sheet in workbook.worksheets:
            for row in sheet.iter_rows(values_only=True):
                rows.append(list(row))
    elif suffix == ".csv":
        with path.open("r", encoding="utf-8-sig", newline="") as file:
            rows.extend(list(csv.reader(file)))
    else:
        raise RuntimeError("Нужен файл .xlsx, .xlsm или .csv")
    return rows


def find_columns(rows):
    employee_col = None
    hours_col = None
    for row in rows[:40]:
        for index, value in enumerate(row):
            text = normalize_name(value)
            if text == "сотрудник":
                employee_col = index
            if "отработанн" in text and "час" in text:
                hours_col = index
        if employee_col is not None and hours_col is not None:
            return employee_col, hours_col
    return 3, 5


def save_current(result):
    if not result:
        return
    payload = []
    for item in result:
        payload.append({
            "employee_profile_id": item["profile_id"],
            "telegram_id": item.get("telegram_id"),
            "period": CURRENT_PERIOD,
            "hours": item["hours"],
            "updated_at": db.now(),
        })
    try:
        db.request("POST", "employee_timesheets?on_conflict=employee_profile_id,period", headers=db.headers("resolution=merge-duplicates,return=minimal"), json=payload)
    except Exception as error:
        print(f"Timesheet save skipped: {error}")


def parse_timesheet(path: Path, profiles):
    rows = read_rows(path)
    employee_col, hours_col = find_columns(rows)
    result = []
    seen = set()

    for row in rows:
        employee_cell = cell_text(row[employee_col]) if len(row) > employee_col else ""
        if not employee_cell:
            continue
        employee_norm = normalize_name(employee_cell)
        if employee_norm in {"сотрудник", "итого", "worked at night"}:
            continue
        if "worked at night" in employee_norm or "итого" in employee_norm:
            continue

        matched_profile = None
        for profile in profiles:
            if profile_matches_row(profile, employee_cell):
                matched_profile = profile
                break
        if not matched_profile:
            continue

        hours_value = row[hours_col] if len(row) > hours_col else None
        hours = cell_hours(hours_value)
        if hours <= 0:
            continue

        pid = matched_profile.get("id")
        if pid in seen:
            continue
        seen.add(pid)
        result.append({
            "profile_id": pid,
            "telegram_id": matched_profile.get("telegram_id"),
            "full_name": matched_profile.get("full_name"),
            "hours": round(hours, 2),
            "matched_rows": 1,
        })

    result = sorted(result, key=lambda item: item["full_name"])
    save_current(result)
    return result


def format_hours(value: float) -> str:
    if float(value).is_integer():
        return str(int(value))
    return str(value).replace(".", ",")

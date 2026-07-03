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
    names = [profile.get("timesheet_name"), profile.get("full_name")]
    for name in names:
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
    # fallback for your current CHBR table: D = employee, F = worked hours
    return 3, 5


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

        row_text = employee_cell
        matched_profile = None
        for profile in profiles:
            if profile_matches_row(profile, row_text):
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

    return sorted(result, key=lambda item: item["full_name"])


def format_hours(value: float) -> str:
    if float(value).is_integer():
        return str(int(value))
    return str(value).replace(".", ",")

import csv
import re
from pathlib import Path

import openpyxl
import supabase_storage as db

CURRENT_PERIOD = "current"
MAX_PERIOD_HOURS = 1000.0
MAX_SHIFT_HOURS = 24.0


def normalize_name(value: str) -> str:
    text = str(value or "").lower().replace("ё", "е")
    text = re.sub(r"[^а-яa-z\s-]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def cell_text(value) -> str:
    return "" if value is None else str(value).strip()


def numeric_hours(value, maximum: float) -> float:
    if value is None or isinstance(value, bool):
        return 0.0
    if isinstance(value, (int, float)):
        number = float(value)
        return number if 0 <= number <= maximum else 0.0
    text = str(value).strip().replace(",", ".")
    if re.fullmatch(r"\d+(\.\d+)?", text):
        number = float(text)
        return number if 0 <= number <= maximum else 0.0
    return 0.0


def period_hours(value) -> float:
    return numeric_hours(value, MAX_PERIOD_HOURS)


def shift_hours(value) -> float:
    return numeric_hours(value, MAX_SHIFT_HOURS)


def name_parts(value: str):
    return [part for part in normalize_name(value).split() if len(part) > 1]


def profile_matches_row(profile, row_text: str) -> bool:
    row = normalize_name(row_text)
    if not row:
        return False

    for name in [profile.get("timesheet_name"), profile.get("full_name")]:
        parts = name_parts(name)
        if len(parts) < 2:
            continue
        if all(part in row for part in parts[:2]):
            return True
    return False


def match_profile(row_text: str, profiles):
    for profile in profiles:
        if profile_matches_row(profile, row_text):
            return profile
    return None


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
    for row in rows[:60]:
        for index, value in enumerate(row):
            text = normalize_name(value)
            if text == "сотрудник":
                employee_col = index
            if "отработанн" in text and "час" in text:
                hours_col = index
        if employee_col is not None and hours_col is not None:
            return employee_col, hours_col
    return 3, 5


def row_text(row) -> str:
    return " ".join(cell_text(value) for value in row if value is not None)


def likely_shift_hours(row, preferred_col: int) -> float:
    if preferred_col is not None and len(row) > preferred_col:
        preferred = shift_hours(row[preferred_col])
        if preferred > 0:
            return preferred

    values = [shift_hours(value) for value in row]
    values = [value for value in values if value > 0]
    return max(values) if values else 0.0


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
        db.request(
            "POST",
            "employee_timesheets?on_conflict=employee_profile_id,period",
            headers=db.headers("resolution=merge-duplicates,return=minimal"),
            json=payload,
        )
    except Exception as error:
        print(f"Timesheet save skipped: {error}")


def parse_timesheet(path: Path, profiles):
    rows = read_rows(path)
    employee_col, hours_col = find_columns(rows)

    state = {
        profile.get("id"): {
            "profile": profile,
            "direct_hours": 0.0,
            "shift_hours": 0.0,
            "matched_rows": 0,
        }
        for profile in profiles
        if profile.get("id") is not None
    }

    current_profile_id = None

    for row in rows:
        text = row_text(row)
        normalized = normalize_name(text)
        if not normalized:
            continue

        matched_profile = match_profile(text, profiles)
        if matched_profile:
            current_profile_id = matched_profile.get("id")
            if current_profile_id not in state:
                continue

            direct_value = row[hours_col] if len(row) > hours_col else None
            direct_hours = period_hours(direct_value)
            if direct_hours > 0:
                state[current_profile_id]["direct_hours"] = direct_hours
                state[current_profile_id]["matched_rows"] += 1
            continue

        if current_profile_id is None or current_profile_id not in state:
            continue

        if "worked at night" in normalized or normalized in {"итого", "сотрудник"}:
            continue

        hours = likely_shift_hours(row, hours_col)
        if hours > 0:
            state[current_profile_id]["shift_hours"] += hours
            state[current_profile_id]["matched_rows"] += 1

    result = []
    for item in state.values():
        profile = item["profile"]
        hours = item["direct_hours"] or item["shift_hours"]
        if hours <= 0:
            continue
        result.append({
            "profile_id": profile.get("id"),
            "telegram_id": profile.get("telegram_id"),
            "full_name": profile.get("full_name"),
            "hours": round(hours, 2),
            "matched_rows": item["matched_rows"],
        })

    result = sorted(result, key=lambda item: item.get("full_name") or "")
    save_current(result)
    return result


def format_hours(value: float) -> str:
    if float(value).is_integer():
        return str(int(value))
    return str(value).replace(".", ",")

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


def is_name_match(row_text: str, employee_name: str) -> bool:
    row = normalize_name(row_text)
    name = normalize_name(employee_name)
    if not row or not name:
        return False
    if name in row:
        return True
    parts = [part for part in name.split() if len(part) > 1]
    return len(parts) >= 2 and all(part in row for part in parts[:2])


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


def parse_timesheet(path: Path, profiles):
    rows = read_rows(path)
    result = []
    for profile in profiles:
        full_name = profile.get("full_name") or "Сотрудник"
        lookup_name = profile.get("timesheet_name") or full_name
        total = 0.0
        matched_rows = 0
        for row in rows:
            row_text = " ".join(cell_text(value) for value in row if value is not None)
            if not is_name_match(row_text, lookup_name):
                continue
            hours = sum(cell_hours(value) for value in row)
            if hours > 0:
                total += hours
                matched_rows += 1
        if matched_rows:
            result.append({
                "profile_id": profile.get("id"),
                "telegram_id": profile.get("telegram_id"),
                "full_name": full_name,
                "hours": round(total, 2),
                "matched_rows": matched_rows,
            })
    return sorted(result, key=lambda item: item["full_name"])


def format_hours(value: float) -> str:
    if float(value).is_integer():
        return str(int(value))
    return str(value).replace(".", ",")

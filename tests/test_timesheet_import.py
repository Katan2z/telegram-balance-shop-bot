import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import sys
from types import SimpleNamespace

sys.modules.setdefault("supabase_storage", SimpleNamespace())
from timesheet_import import parse_timesheet


class TimesheetParserTests(unittest.TestCase):
    @patch("timesheet_import.save_current")
    def test_csv_matches_employee_and_reads_current_hours(self, save_current):
        profiles = [{"id": 7, "telegram_id": 42, "full_name": "Иванов Иван"}]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "timesheet.csv"
            path.write_text("Сотрудник,Отработанные часы\nИванов Иван,168.5\n", encoding="utf-8-sig")
            rows = parse_timesheet(path, profiles)

        self.assertEqual(1, len(rows))
        self.assertEqual(7, rows[0]["profile_id"])
        self.assertEqual(168.5, rows[0]["hours"])
        save_current.assert_called_once_with(rows)

    @patch("timesheet_import.save_current")
    def test_invalid_or_excessive_hours_are_ignored(self, save_current):
        profiles = [{"id": 7, "telegram_id": 42, "full_name": "Иванов Иван"}]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "timesheet.csv"
            path.write_text("Сотрудник,Отработанные часы\nИванов Иван,1001\n", encoding="utf-8-sig")
            rows = parse_timesheet(path, profiles)

        self.assertEqual([], rows)
        save_current.assert_called_once_with([])


if __name__ == "__main__":
    unittest.main()

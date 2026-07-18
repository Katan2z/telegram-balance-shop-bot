import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ScheduleTests(unittest.TestCase):
    def test_app_exposes_telegram_user_id_to_modules(self):
        source = (ROOT / "docs" / "app.js").read_text(encoding="utf-8")
        self.assertIn("window.userId = userId", source)

    def test_deadline_is_previous_wednesday_moscow_time(self):
        migration = (ROOT / "docs" / "migrations" / "20260718_employee_schedule.sql").read_text(encoding="utf-8")
        self.assertIn("(p_week_start - 5) + time '23:59'", migration)
        self.assertIn("at time zone 'Europe/Moscow'", migration)

    def test_launch_week_has_sunday_deadline_exception(self):
        migration = (ROOT / "docs" / "migrations" / "20260718_schedule_deadline_exception.sql").read_text(encoding="utf-8")
        self.assertIn("p_week_start = date '2026-07-20'", migration)
        self.assertIn("date '2026-07-19' + time '23:59'", migration)
        self.assertIn("else ((p_week_start - 5) + time '23:59')", migration)

    def test_employee_cannot_edit_another_profile(self):
        migration = (ROOT / "docs" / "migrations" / "20260718_employee_schedule.sql").read_text(encoding="utf-8")
        self.assertIn("v_employee.telegram_id <> p_actor_id", migration)
        self.assertIn("Employees can edit only their own row", migration)

    def test_excel_has_seven_days_comment_and_signature(self):
        source = (ROOT / "docs" / "schedule.js").read_text(encoding="utf-8")
        day_keys = re.findall(r'\["(mon|tue|wed|thu|fri|sat|sun)",', source)
        self.assertEqual(day_keys[:7], ["mon", "tue", "wed", "thu", "fri", "sat", "sun"])
        self.assertIn('"Комментарий", "Ознакомлен\\n(роспись)"', source)
        self.assertIn("workbook.xlsx.writeBuffer()", source)

    def test_admin_and_employee_values_are_separate(self):
        migration = (ROOT / "docs" / "migrations" / "20260718_employee_schedule.sql").read_text(encoding="utf-8")
        self.assertIn("availability jsonb", migration)
        self.assertIn("final_schedule jsonb", migration)


if __name__ == "__main__":
    unittest.main()

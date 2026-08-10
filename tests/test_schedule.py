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
        self.assertIn("p_week_start = date '2026-07-27'", migration)
        self.assertIn("date '2026-07-19' + time '23:59'", migration)
        self.assertIn("else ((p_week_start - 5) + time '23:59')", migration)

    def test_target_week_moves_forward_after_wednesday(self):
        source = (ROOT / "docs" / "schedule.js").read_text(encoding="utf-8")
        self.assertIn("isoDay > 3 ? 7 : 0", source)

    def test_management_positions_are_excluded(self):
        migration = (ROOT / "docs" / "migrations" / "20260718_schedule_week_and_admin_filter.sql").read_text(encoding="utf-8")
        self.assertIn("(менеджер|заместител|управляющ)", migration)
        self.assertIn("ep.telegram_id <> 818748106", migration)
        self.assertIn("public.managers m where m.telegram_id = ep.telegram_id", migration)

    def test_corrected_collection_week_is_27_july(self):
        migration = (ROOT / "docs" / "migrations" / "20260718_schedule_week_and_admin_filter.sql").read_text(encoding="utf-8")
        self.assertIn("date '2026-07-27'", migration)
        self.assertIn("employee_input_override = false", migration)

    def test_admin_can_open_and_close_employee_input(self):
        migration = (ROOT / "docs" / "migrations" / "20260718_schedule_manual_access.sql").read_text(encoding="utf-8")
        source = (ROOT / "docs" / "schedule.js").read_text(encoding="utf-8")
        self.assertIn("employee_input_override boolean", migration)
        self.assertIn("schedule_set_input_access", migration)
        self.assertIn("Открыть сотрудникам", source)
        self.assertIn("Закрыть сотрудникам", source)

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

    def test_excel_falls_back_to_employee_availability(self):
        source = (ROOT / "docs" / "schedule.js").read_text(encoding="utf-8")
        self.assertIn('entry.final_schedule?.[key] || entry.availability?.[key] || ""', source)
        self.assertIn("scheduleExportDayValue(entry, key)", source)

    def test_admin_cells_show_availability_without_hint_row(self):
        source = (ROOT / "docs" / "schedule.js").read_text(encoding="utf-8")
        self.assertIn('entry.final_schedule?.[key] || entry.availability?.[key] || ""', source)
        self.assertNotIn('class="schedule-availability"', source)

    def test_admin_and_employee_values_are_separate(self):
        migration = (ROOT / "docs" / "migrations" / "20260718_employee_schedule.sql").read_text(encoding="utf-8")
        self.assertIn("availability jsonb", migration)
        self.assertIn("final_schedule jsonb", migration)

    def test_permanent_preferences_and_configurable_day_off_limit(self):
        migration = (ROOT / "docs" / "migrations" / "20260810_schedule_preferences.sql").read_text(encoding="utf-8")
        self.assertIn("create table if not exists public.schedule_preferences", migration)
        self.assertIn("work_type in ('PT1', 'PT2', 'FT')", migration)
        self.assertIn("regular_days_off jsonb", migration)
        self.assertIn("max_regular_days_off smallint not null default 4", migration)
        self.assertIn("schedule_save_preferences", migration)
        self.assertIn("schedule_save_settings", migration)

    def test_day_off_limit_is_checked_atomically_and_regular_days_are_exempt(self):
        migration = (ROOT / "docs" / "migrations" / "20260810_schedule_preferences.sql").read_text(encoding="utf-8")
        self.assertIn("pg_advisory_xact_lock", migration)
        self.assertIn("v_used >= v_limit", migration)
        self.assertIn("not coalesce((v_regular_days_off ->> v_day)::boolean, false)", migration)
        self.assertIn("sp.regular_days_off ->> v_day", migration)

    def test_employee_schedule_uses_quick_day_and_time_controls(self):
        source = (ROOT / "docs" / "schedule.js").read_text(encoding="utf-8")
        self.assertIn('data-day-mode="work"', source)
        self.assertIn('data-day-mode="off"', source)
        self.assertIn('type="time" data-time-from', source)
        self.assertIn('type="time" data-time-to', source)
        self.assertIn("day_off_counts", source)

    def test_schedule_managers_can_edit_preferences(self):
        migration = (ROOT / "docs" / "migrations" / "20260810_schedule_preferences.sql").read_text(encoding="utf-8")
        self.assertGreaterEqual(migration.count("public.schedule_is_admin(p_actor_id)"), 2)
        self.assertIn("Only schedule managers can edit preferences", migration)


if __name__ == "__main__":
    unittest.main()

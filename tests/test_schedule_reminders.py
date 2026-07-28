import unittest
from datetime import datetime, timezone
import schedule_reminders as reminders
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ScheduleReminderTests(unittest.TestCase):
    def test_target_week_matches_schedule_rule(self):
        self.assertEqual(reminders.target_week(datetime(2026, 7, 28, 12)), "2026-08-03")
        self.assertEqual(reminders.target_week(datetime(2026, 7, 30, 12)), "2026-08-10")

    def test_management_profiles_are_excluded(self):
        self.assertTrue(reminders.is_management_profile({"telegram_id": 15, "position": "Менеджер"}, set()))
        self.assertTrue(reminders.is_management_profile({"telegram_id": 16, "position": "Заместитель директора"}, set()))
        self.assertTrue(reminders.is_management_profile({"telegram_id": 17, "position": "Управляющий"}, set()))
        self.assertTrue(reminders.is_management_profile({"telegram_id": 99, "position": "Повар"}, set(), {99}))
        self.assertFalse(reminders.is_management_profile({"telegram_id": 18, "position": "Член бригады"}, set()))

    def test_reminder_contains_clickable_mentions(self):
        text = reminders.reminder_text("2026-08-03", [{"telegram_id": 123, "full_name": "Иванов Иван"}])
        self.assertIn('href="tg://user?id=123"', text)
        self.assertIn("03.08–09.08", text)
        self.assertIn("Иванов Иван", text)

    def test_four_hour_limit_survives_restart(self):
        saved = "2026-07-28T08:00:00+00:00"
        self.assertFalse(reminders.reminder_is_due(saved, datetime(2026, 7, 28, 11, 59, tzinfo=timezone.utc)))
        self.assertTrue(reminders.reminder_is_due(saved, datetime(2026, 7, 28, 12, 0, tzinfo=timezone.utc)))

    def test_manual_command_does_not_reset_automatic_timer(self):
        source = (ROOT / "bot_supabase.py").read_text(encoding="utf-8")
        self.assertIn('@router.message(Command("raspes"))', source)
        self.assertIn("record_send=False", source)
        self.assertIn("if record_send:\n        db.set_setting(SCHEDULE_NOTIFY_LAST_SENT_KEY", source)


if __name__ == "__main__":
    unittest.main()

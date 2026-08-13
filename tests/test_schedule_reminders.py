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

    def test_automatic_reminders_start_on_sunday(self):
        self.assertFalse(reminders.reminder_window_open(datetime(2026, 8, 15, 12)))  # Saturday
        self.assertTrue(reminders.reminder_window_open(datetime(2026, 8, 16, 12)))   # Sunday
        self.assertTrue(reminders.reminder_window_open(datetime(2026, 8, 19, 12)))   # Wednesday
        self.assertFalse(reminders.reminder_window_open(datetime(2026, 8, 20, 12)))  # Thursday
        source = (ROOT / "bot_supabase.py").read_text(encoding="utf-8")
        self.assertIn("reminders.reminder_window_open(moscow_now())", source)

    def test_manual_command_does_not_reset_automatic_timer(self):
        source = (ROOT / "bot_supabase.py").read_text(encoding="utf-8")
        self.assertIn('@router.message(Command("raspes"))', source)
        self.assertIn("record_send=False", source)
        self.assertIn("if record_send:\n        db.set_setting(SCHEDULE_NOTIFY_LAST_SENT_KEY", source)

    def test_bot_reads_schedule_through_public_rpc(self):
        source = (ROOT / "bot_supabase.py").read_text(encoding="utf-8")
        self.assertIn('"rpc/schedule_get_week"', source)
        self.assertNotIn('"schedule_entries?week_id=', source)
        self.assertNotIn('"schedule_weeks?week_start=', source)

    def test_topic_is_saved_and_reused(self):
        source = (ROOT / "bot_supabase.py").read_text(encoding="utf-8")
        self.assertIn('SCHEDULE_NOTIFY_THREAD_SETTING_KEY = "schedule_notify_thread_id"', source)
        self.assertIn("str(message.message_thread_id or 0)", source)
        self.assertIn("message_thread_id=message.message_thread_id", source)

    def test_announcement_escapes_text_and_mentions_every_employee(self):
        messages = reminders.announcement_messages(
            "Сбор <сейчас>",
            [
                {"telegram_id": 1, "full_name": "Первый"},
                {"telegram_id": 2, "full_name": "Второй"},
            ],
        )
        result = "\n".join(messages)
        self.assertIn("Сбор &lt;сейчас&gt;", result)
        self.assertIn('tg://user?id=1', result)
        self.assertIn('tg://user?id=2', result)

    def test_announcement_prefers_real_username_mentions(self):
        messages = reminders.announcement_messages(
            "Собрание",
            [{"telegram_id": 1, "full_name": "Иванов Иван", "username": "ivanov"}],
        )
        self.assertIn("@ivanov", messages[0])
        self.assertNotIn("tg://user?id=1", messages[0])
        source = (ROOT / "bot_supabase.py").read_text(encoding="utf-8")
        self.assertIn('users?select=telegram_id,username', source)

    def test_announcement_is_split_before_telegram_limit(self):
        employees = [{"telegram_id": index, "full_name": "Сотрудник " + ("я" * 40)} for index in range(1, 80)]
        messages = reminders.announcement_messages("Объявление", employees, limit=500)
        self.assertGreater(len(messages), 1)
        self.assertTrue(all(len(message) <= 500 for message in messages))


if __name__ == "__main__":
    unittest.main()

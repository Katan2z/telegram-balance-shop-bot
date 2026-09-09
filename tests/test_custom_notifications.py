import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class CustomNotificationTests(unittest.TestCase):
    def test_bot_runs_custom_notification_worker(self):
        bot = (ROOT / "bot_supabase.py").read_text(encoding="utf-8")
        runner = (ROOT / "bot_runner.py").read_text(encoding="utf-8")
        self.assertIn("async def custom_notification_loop", bot)
        self.assertIn('tg://user?id=', bot)
        self.assertIn("app.custom_notification_loop(bot)", runner)

    def test_panel_has_notification_editor(self):
        panel = (ROOT / "docs/control/live-sections.js").read_text(encoding="utf-8")
        self.assertIn('id="newNotification"', panel)
        self.assertIn('id="notificationForm"', panel)
        self.assertIn("admin_notifications", panel)

    def test_migration_is_additive(self):
        sql = (ROOT / "docs/migrations/20260909_custom_notifications.sql").read_text(encoding="utf-8").lower()
        self.assertIn("create table if not exists", sql)
        self.assertNotIn("drop table", sql)


if __name__ == "__main__":
    unittest.main()

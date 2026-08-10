import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class NotificationSettingsTests(unittest.TestCase):
    def test_private_bot_has_quick_notification_settings(self):
        source = (ROOT / "bot_supabase.py").read_text(encoding="utf-8")
        self.assertIn('@router.message(Command("settings"))', source)
        self.assertIn('callback_data="notify_settings"', source)
        self.assertIn('F.data.startswith("notify_toggle:")', source)
        self.assertIn("MANAGER_TASK_NOTIFY_ENABLED_KEY", source)
        self.assertIn("INSTRUCTOR_TASK_NOTIFY_ENABLED_KEY", source)
        self.assertIn("SCHEDULE_NOTIFY_ENABLED_KEY", source)

    def test_instructor_chat_command_saves_chat_and_topic(self):
        source = (ROOT / "bot_supabase.py").read_text(encoding="utf-8")
        self.assertIn('@router.message(Command("uved_instr"))', source)
        self.assertIn("INSTRUCTOR_NOTIFY_CHAT_SETTING_KEY", source)
        self.assertIn("INSTRUCTOR_NOTIFY_THREAD_SETTING_KEY", source)
        self.assertIn("str(message.message_thread_id or 0)", source)

    def test_task_loop_routes_instructor_assignees_separately(self):
        source = (ROOT / "bot_supabase.py").read_text(encoding="utf-8")
        self.assertIn("instructor_ids = db.instructor_ids()", source)
        self.assertIn("is_instructor_task", source)
        self.assertIn("instructor_task_destination()", source)
        self.assertIn("manager_task_destination()", source)

    def test_task_form_selects_audience_before_assignee(self):
        source = (ROOT / "docs" / "admin-tasks.js").read_text(encoding="utf-8")
        self.assertIn('id="taskAudience"', source)
        self.assertIn('value="managers"', source)
        self.assertIn('value="instructors"', source)
        self.assertIn('supabaseFetch("instructors?select=telegram_id")', source)
        self.assertIn("audienceSelect.onchange = tasksRenderAssignees", source)

    def test_no_database_migration_is_required_for_audience(self):
        source = (ROOT / "docs" / "admin-tasks.js").read_text(encoding="utf-8")
        creation = source[source.index('await taskFetch("admin_tasks"'):]
        self.assertNotIn("audience:", creation.split("});", 1)[0])
        self.assertIn("assigned_to: Number(assignedTo)", creation)


if __name__ == "__main__":
    unittest.main()

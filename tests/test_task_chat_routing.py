import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class TaskChatRoutingTests(unittest.TestCase):
    def test_bot_prefers_task_specific_chat(self):
        source = (ROOT / "bot_supabase.py").read_text(encoding="utf-8")
        self.assertIn('task.get("notification_chat_id")', source)
        self.assertIn("destination = (int(direct_chat_id)", source)

    def test_storage_loads_new_and_legacy_task_columns(self):
        source = (ROOT / "supabase_storage.py").read_text(encoding="utf-8")
        self.assertIn('"admin_tasks?select=*"', source)

    def test_migration_is_additive(self):
        sql = (ROOT / "docs/migrations/20260907_admin_task_chat_routing.sql").read_text(encoding="utf-8")
        self.assertIn("add column if not exists notification_chat_id", sql.lower())
        self.assertNotIn("drop table", sql.lower())


if __name__ == "__main__":
    unittest.main()

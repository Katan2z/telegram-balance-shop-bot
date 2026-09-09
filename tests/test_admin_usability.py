import json
import unittest
from pathlib import Path


class AdminUsabilityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.index = Path("docs/control/index.html").read_text(encoding="utf-8")
        cls.app = Path("docs/control/app.js").read_text(encoding="utf-8")
        cls.data = Path("docs/control/live-data.js").read_text(encoding="utf-8")
        cls.sections = Path("docs/control/live-sections.js").read_text(encoding="utf-8")

    def test_installable_brand_assets_are_wired(self):
        manifest = json.loads(Path("docs/control/manifest.webmanifest").read_text(encoding="utf-8"))
        self.assertEqual(manifest["display"], "standalone")
        self.assertIn('rel="manifest"', self.index)
        self.assertIn('rel="icon"', self.index)
        self.assertTrue(Path("docs/control/icon.svg").exists())

    def test_remembered_session_uses_refresh_token_and_can_be_cleared(self):
        self.assertIn('id="rememberDevice"', self.index)
        self.assertIn("localStorage", self.app)
        self.assertIn("grant_type=refresh_token", self.app)
        self.assertIn("clearAdminSession()", self.app)

    def test_task_recipients_support_one_selected_or_all(self):
        self.assertIn('id="taskAudience"', self.app)
        for value in ('value="one"', 'value="selected"', 'value="all"'):
            self.assertIn(value, self.app)
        self.assertIn("selected.map(assigned_to", self.data)

    def test_feedback_delete_is_guarded_by_admin_rpc(self):
        migration = Path("docs/migrations/20260909_feedback_management.sql").read_text(encoding="utf-8")
        self.assertIn("public.schedule_is_admin(p_actor_id)", migration)
        self.assertIn("public.feedback_delete", migration)
        self.assertIn('api("rpc/feedback_delete"', self.sections)

    def test_shop_errors_are_visible_inside_the_dialog(self):
        self.assertIn('id="shopItemError" role="alert"', self.sections)
        self.assertIn("errorBox.textContent", self.sections)


if __name__ == "__main__":
    unittest.main()

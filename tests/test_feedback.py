import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class FeedbackTests(unittest.TestCase):
    def test_feedback_storage_is_private_and_manager_read_is_guarded(self):
        migration = (ROOT / "docs" / "migrations" / "20260813_bot_feedback.sql").read_text(encoding="utf-8")
        self.assertIn("alter table public.bot_feedback enable row level security", migration)
        self.assertIn("revoke all on public.bot_feedback from anon, authenticated", migration)
        self.assertIn("public.schedule_is_admin(p_actor_id)", migration)
        self.assertIn("Only managers can read feedback", migration)

    def test_only_active_employees_can_submit_and_name_is_recorded(self):
        migration = (ROOT / "docs" / "migrations" / "20260813_bot_feedback.sql").read_text(encoding="utf-8")
        self.assertIn("activation_status = 'active'", migration)
        self.assertIn("employee_name", migration)
        self.assertIn("v_employee.full_name", migration)

    def test_feedback_ui_submits_and_only_admin_loads_list(self):
        source = (ROOT / "docs" / "feedback.js").read_text(encoding="utf-8")
        self.assertIn('feedbackRpc("feedback_submit"', source)
        self.assertIn('feedbackRpc("feedback_list"', source)
        self.assertIn('permissions?.can?.("manageEmployees")', source)
        self.assertIn("item.employee_name", source)

    def test_feedback_is_reachable_from_home_quick_actions(self):
        navigation = (ROOT / "docs" / "navigation.js").read_text(encoding="utf-8")
        index = (ROOT / "docs" / "index.html").read_text(encoding="utf-8")
        self.assertIn('{ tab: "feedback"', navigation)
        self.assertIn('title: "Жалобы и предложения"', navigation)
        self.assertIn('navigation.js?v=20260814-feedback3', index)

    def test_feedback_navigation_refreshes_for_every_role(self):
        source = (ROOT / "docs" / "feedback.js").read_text(encoding="utf-8")
        navigation = (ROOT / "docs" / "navigation.js").read_text(encoding="utf-8")
        self.assertIn('CustomEvent("bk8:feedback-ready")', source)
        self.assertIn('addEventListener("bk8:feedback-ready", setupSimpleNavigation)', navigation)
        self.assertNotIn('if (!feedbackCanManage()) return;\n  feedbackBuildSection()', source)


if __name__ == "__main__":
    unittest.main()

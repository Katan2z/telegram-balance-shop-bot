import unittest
from datetime import datetime, timezone
from pathlib import Path

import monthly_maintenance as maintenance


ROOT = Path(__file__).resolve().parents[1]


class MonthlyMaintenanceTests(unittest.TestCase):
    def test_month_context_uses_moscow_calendar(self):
        key, start = maintenance.month_context(datetime(2026, 9, 7, 12, tzinfo=timezone.utc))
        self.assertEqual(key, "2026-08")
        self.assertEqual(start.isoformat(), "2026-09-01T00:00:00+03:00")

    def test_late_reset_preserves_only_current_month_transactions(self):
        users = [
            {"telegram_id": 1, "balance": 17},
            {"telegram_id": 2, "balance": 8},
        ]
        transactions = [
            {"user_id": 1, "amount": 5},
            {"user_id": 1, "amount": 2},
            {"user_id": 2, "amount": 3},
            {"user_id": 2, "amount": -1},
        ]
        plan = {item["telegram_id"]: item for item in maintenance.build_reset_plan(users, transactions)}
        self.assertEqual(plan[1]["new_balance"], 7)
        self.assertEqual(plan[1]["burned"], 10)
        self.assertEqual(plan[1]["coin_checkpoint"], 1)
        self.assertEqual(plan[2]["new_balance"], 2)
        self.assertEqual(plan[2]["burned"], 6)

    def test_reset_never_creates_missing_balance(self):
        plan = maintenance.build_reset_plan(
            [{"telegram_id": 1, "balance": 2}],
            [{"user_id": 1, "amount": 10}],
        )
        self.assertEqual(plan[0]["new_balance"], 2)
        self.assertEqual(plan[0]["burned"], 0)

    def test_workflows_use_one_runner_and_watchdog(self):
        runtime = (ROOT / ".github" / "workflows" / "bot.yml").read_text(encoding="utf-8")
        watchdog = (ROOT / ".github" / "workflows" / "bot-timesheet.yml").read_text(encoding="utf-8")
        runner = (ROOT / "bot_runner.py").read_text(encoding="utf-8")
        self.assertIn("run: python bot_runner.py", runtime)
        self.assertNotIn("python bot_supabase.py", runtime)
        self.assertIn('cron: "17 */4 * * *"', watchdog)
        self.assertIn("python monthly_maintenance.py", watchdog)
        self.assertIn("gh workflow run bot.yml --ref main", watchdog)
        self.assertNotIn("monthly_reset_loop", runner)

    def test_watchdog_exposes_manual_spasibki_only_reset(self):
        watchdog_path = ROOT / ".github" / "workflows" / "bot-timesheet.yml"
        watchdog = watchdog_path.read_text(encoding="utf-8")
        self.assertIn("reset_spasibki:", watchdog)
        self.assertIn("type: boolean", watchdog)
        self.assertIn("db.reset_spasibki_balances()", watchdog)


if __name__ == "__main__":
    unittest.main()

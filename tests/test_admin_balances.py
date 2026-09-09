import unittest
from pathlib import Path


class AdminBalancePanelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = Path("docs/control/app.js").read_text(encoding="utf-8")
        cls.sections = Path("docs/control/live-sections.js").read_text(encoding="utf-8")

    def test_balance_page_is_available_in_navigation(self):
        self.assertIn("['balances','★','Балансы']", self.app)
        self.assertIn("const routes={documents,klokr,balances", self.sections)

    def test_spasibki_changes_are_written_to_the_transaction_ledger(self):
        self.assertIn('type:"balance_change"', self.sections)
        self.assertIn('comment:`АП: ${comment}`', self.sections)
        self.assertIn("admin_id:actorId()", self.sections)

    def test_negative_balances_are_rejected_before_write(self):
        self.assertIn("current+delta<0", self.sections)
        self.assertIn("Нельзя списать больше текущего баланса", self.sections)


if __name__ == "__main__":
    unittest.main()

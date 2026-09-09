import unittest
from pathlib import Path


class AdminCrudTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = Path("docs/control/live-data.js").read_text(encoding="utf-8")
        cls.sections = Path("docs/control/live-sections.js").read_text(encoding="utf-8")

    def test_employee_can_be_edited_archived_and_receive_a_new_code(self):
        self.assertIn('id="employeeArchive"', self.data)
        self.assertIn('activation_status:"archived"', self.data)
        self.assertIn('id="employeeNewCode"', self.data)

    def test_tasks_can_be_edited_completed_and_deleted(self):
        self.assertIn("data-task-edit", self.data)
        self.assertIn("data-task-toggle", self.data)
        self.assertIn("data-task-delete", self.data)

    def test_overview_async_result_does_not_overwrite_another_page(self):
        self.assertIn('textContent !== "Обзор"', self.data)

    def test_shop_catalog_can_be_created_edited_and_hidden(self):
        self.assertIn('id="shopItemAdd"', self.sections)
        self.assertIn('rpc/admin_save_shop_item', self.sections)
        self.assertIn("is_active:document.querySelector", self.sections)
        self.assertIn('id="shopItemDelete"', self.sections)
        self.assertIn("async function deleteShopItem", self.sections)
        self.assertIn("p_is_active:false", self.sections)


if __name__ == "__main__":
    unittest.main()

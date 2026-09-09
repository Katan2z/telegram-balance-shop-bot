import unittest
from pathlib import Path


class AdminPanelDocumentsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = Path("docs/control/live-sections.js").read_text(encoding="utf-8")

    def test_pvv_upload_accepts_only_supported_document_types(self):
        for mime in ("application/pdf", "image/jpeg", "image/png", "image/webp"):
            self.assertIn(mime, self.source)
        self.assertIn("15*1024*1024", self.source)

    def test_pvv_upload_uses_authenticated_storage_and_metadata_upsert(self):
        self.assertIn("active.access_token", self.source)
        self.assertIn("object/employee-pvv/${storagePath}", self.source)
        self.assertIn("employee_pvv_documents?on_conflict=employee_profile_id", self.source)
        self.assertIn('Prefer:"resolution=merge-duplicates,return=minimal"', self.source)

    def test_replaced_file_is_removed_only_after_metadata_save(self):
        metadata = self.source.index('await api("employee_pvv_documents?on_conflict=employee_profile_id"')
        cleanup = self.source.index('if(previous)await storage(`object/employee-pvv/${previous}`')
        self.assertLess(metadata, cleanup)

    def test_existing_pvv_can_be_deleted(self):
        self.assertIn("deletePvv", self.source)
        self.assertIn('method:"DELETE"', self.source)


if __name__ == "__main__":
    unittest.main()

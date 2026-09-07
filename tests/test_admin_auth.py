import unittest

from provision_admin_auth import auth_email


class AdminAuthTests(unittest.TestCase):
    def test_username_maps_to_internal_email(self):
        self.assertEqual(auth_email(" BK_08 "), "bk_08@admin.bk8.local")

    def test_unsafe_username_is_rejected(self):
        with self.assertRaises(ValueError):
            auth_email("admin@example.com")


if __name__ == "__main__":
    unittest.main()

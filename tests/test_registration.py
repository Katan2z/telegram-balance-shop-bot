import ast
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class RegistrationPolicyTests(unittest.TestCase):
    def test_bot_has_no_automatic_user_upsert(self):
        tree = ast.parse((ROOT / "bot_supabase.py").read_text(encoding="utf-8"))
        calls = [
            node for node in ast.walk(tree)
            if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr in {"upsert_user", "upsert_unknown_user"}
        ]
        self.assertEqual([], calls)

    def test_activation_uses_atomic_rpc(self):
        source = (ROOT / "docs" / "employee-activate.js").read_text(encoding="utf-8")
        self.assertIn("rpc/activate_employee", source)
        self.assertNotIn("users?on_conflict", source)
        self.assertNotIn("activation_status=eq.pending", source)


if __name__ == "__main__":
    unittest.main()

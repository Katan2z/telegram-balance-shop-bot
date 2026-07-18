import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ShopReceiptTests(unittest.TestCase):
    def test_confirmation_uses_redeem_rpc(self):
        source = (ROOT / "docs" / "shop.js").read_text(encoding="utf-8")
        self.assertIn('shopFetch("rpc/redeem_shop_purchase"', source)
        self.assertIn("p_purchase_id: String(id)", source)
        self.assertIn("p_manager_id: Number(userId)", source)
        self.assertIn("webApp.showConfirm(message, resolve)", source)
        self.assertNotIn('shopFetch(`shop_purchases?id=eq.${id}`', source)

    def test_legacy_shop_override_is_not_loaded(self):
        index = (ROOT / "docs" / "index.html").read_text(encoding="utf-8")
        self.assertNotIn("shop-admin-receipts.js", index)


if __name__ == "__main__":
    unittest.main()

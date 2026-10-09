import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch


class CoinConcurrencyTests(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location("coin_storage_test", Path("supabase_storage.py"))
        self.storage = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.storage)

    def convert(self, replies):
        with patch.object(self.storage, "request", side_effect=replies) as request, patch.object(self.storage, "headers", return_value={}):
            result = self.storage.auto_convert_user_balance(123)
            return result, request.call_args_list

    def test_purchase_during_conversion_does_not_get_overwritten(self):
        result, calls = self.convert([
            [{"balance": 10, "coins": 8, "coin_checkpoint": 0}], [],
            [{"balance": 10, "coins": 3, "coin_checkpoint": 0}], [{"coins": 5}],
        ])
        self.assertEqual(result["coins"], 5)
        self.assertIn("coins=eq.8", calls[1].args[1])
        self.assertIn("coins=eq.3", calls[3].args[1])

    def test_parallel_conversion_does_not_award_twice(self):
        result, calls = self.convert([
            [{"balance": 10, "coins": 8, "coin_checkpoint": 0}], [],
            [{"balance": 10, "coins": 10, "coin_checkpoint": 2}],
        ])
        self.assertEqual(result["added_coins"], 0)
        self.assertEqual(len(calls), 3)

    def test_missing_user_is_not_created(self):
        result, calls = self.convert([[]])
        self.assertEqual(result["coins"], 0)
        self.assertEqual(len(calls), 1)

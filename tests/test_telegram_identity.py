import hashlib
import hmac
import json
import unittest
from urllib.parse import urlencode

from telegram_identity import validate_init_data


class TelegramIdentityTests(unittest.TestCase):
    def signed(self, timestamp=1000):
        fields = {'auth_date': str(timestamp), 'user': json.dumps({'id': 42, 'first_name': 'Иван'})}
        secret = hmac.new(b'WebAppData', b'test-token', hashlib.sha256).digest()
        check = '\n'.join(f'{key}={value}' for key, value in sorted(fields.items()))
        fields['hash'] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
        return urlencode(fields)

    def test_valid_signature_returns_verified_identity(self):
        self.assertEqual(42, validate_init_data(self.signed(), 'test-token', now=1050)['id'])

    def test_wrong_token_rejected(self):
        with self.assertRaises(ValueError):
            validate_init_data(self.signed(), 'wrong-token', now=1050)

    def test_expired_session_rejected(self):
        with self.assertRaises(ValueError):
            validate_init_data(self.signed(), 'test-token', now=5000)

    def test_future_session_rejected(self):
        with self.assertRaises(ValueError):
            validate_init_data(self.signed(2000), 'test-token', now=1000)

    def test_duplicate_identity_rejected(self):
        with self.assertRaises(ValueError):
            validate_init_data(self.signed() + '&user=%7B%22id%22%3A1%7D', 'test-token', now=1050)

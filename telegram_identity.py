"""Server-side Telegram Mini App identity validation.

Call this at the authenticated API boundary, never in browser code.
"""
import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl


def validate_init_data(init_data: str, bot_token: str, *, now=None, max_age=3600):
    if not bot_token or not init_data or len(init_data) > 16384:
        raise ValueError('Invalid Telegram credentials')
    pairs = parse_qsl(init_data, keep_blank_values=True, strict_parsing=True)
    fields = dict(pairs)
    if len(fields) != len(pairs):
        raise ValueError('Duplicate Telegram fields')
    signature = fields.pop('hash', '')
    check = '\n'.join(f'{key}={value}' for key, value in sorted(fields.items()))
    secret = hmac.new(b'WebAppData', bot_token.encode(), hashlib.sha256).digest()
    expected = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise ValueError('Invalid Telegram signature')
    timestamp = int(fields.get('auth_date', '0'))
    current = time.time() if now is None else now
    if timestamp > current + 30 or current - timestamp > max_age:
        raise ValueError('Expired Telegram session')
    user = json.loads(fields.get('user', '{}'))
    if not isinstance(user, dict) or type(user.get('id')) is not int or user['id'] <= 0:
        raise ValueError('Invalid Telegram user')
    return user

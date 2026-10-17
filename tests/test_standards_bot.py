import importlib.util
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch


class StandardsBotTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location('standards_bot_test', Path('standards_bot.py'))
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)
        self.message = SimpleNamespace(from_user=SimpleNamespace(id=101), chat=SimpleNamespace(id=9), answer=AsyncMock())

    async def test_inactive_employee_cannot_search(self):
        with patch.object(self.module, 'allowed', return_value=False), patch.object(self.module, 'search') as search:
            await self.module.alert_command(self.message, SimpleNamespace(args='фритюр'))
            search.assert_not_called()
            self.message.answer.assert_awaited_once()

    async def test_single_match_sends_page(self):
        row = {'document': 'test.pdf', 'page': 0, 'title': 'Test'}
        with patch.object(self.module, 'allowed', return_value=True), patch.object(self.module, 'search', return_value=[row]), patch.object(self.module, 'send_page', new_callable=AsyncMock) as send:
            await self.module.alert_command(self.message, SimpleNamespace(args='фритюр'))
            send.assert_awaited_once_with(self.message, row)

    async def test_other_user_cannot_open_results(self):
        self.module.pending['token'] = {'owner': 202, 'chat': 9, 'expires': float('inf'), 'rows': []}
        callback = SimpleNamespace(data='al:token:0', from_user=SimpleNamespace(id=101), message=self.message, answer=AsyncMock())
        with patch.object(self.module, 'send_page', new_callable=AsyncMock) as send:
            await self.module.alert_page(callback)
            send.assert_not_awaited()
            callback.answer.assert_awaited_once()

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
            send.assert_awaited_once()
            self.assertEqual(send.call_args.args, (self.message, row))
            self.assertIn('фритюр', send.call_args.kwargs['caption'])

    async def test_multiple_matches_send_photo_immediately(self):
        rows = [{'document': 'Приготовление ингредиентов.pdf', 'page': 13, 'title': 'Томаты', 'category': 'Хранение/температура'},
                {'document': 'Позиции в меню.pdf', 'page': 5, 'title': 'Бургер', 'category': 'Рецептура'}]
        with patch.object(self.module, 'allowed', return_value=True), patch.object(self.module, 'search', return_value=rows), patch.object(self.module, 'send_page', new_callable=AsyncMock) as send:
            await self.module.alert_command(self.message, SimpleNamespace(args='томаты'))
            send.assert_awaited_once()
            self.assertEqual(send.call_args.args[1], rows[0])
            labels = [button.text for line in send.call_args.kwargs['keyboard'].inline_keyboard for button in line]
            self.assertTrue(any('Рецептуры' in label for label in labels))
            self.message.answer.assert_not_awaited()

    async def test_navigation_edits_same_photo(self):
        rows = [{'document': 'test.pdf', 'page': n, 'title': 'Test'} for n in range(2)]
        self.module.pending['token'] = {'owner': 101, 'chat': 9, 'expires': float('inf'), 'rows': rows, 'query': 'тест', 'current': ('n', 0)}
        callback = SimpleNamespace(data='al:token:n1', from_user=SimpleNamespace(id=101), message=self.message, answer=AsyncMock())
        with patch.object(self.module, 'allowed', return_value=True), patch.object(self.module, 'send_page', new_callable=AsyncMock) as send:
            await self.module.alert_page(callback)
            self.assertTrue(send.call_args.kwargs['edit'])
            self.assertEqual(send.call_args.args[1]['page'], 1)
            await self.module.alert_page(callback)
            self.assertEqual(send.await_count, 1)

    async def test_other_user_cannot_open_results(self):
        self.module.pending['token'] = {'owner': 202, 'chat': 9, 'expires': float('inf'), 'rows': []}
        callback = SimpleNamespace(data='al:token:0', from_user=SimpleNamespace(id=101), message=self.message, answer=AsyncMock())
        with patch.object(self.module, 'send_page', new_callable=AsyncMock) as send:
            await self.module.alert_page(callback)
            send.assert_not_awaited()
            callback.answer.assert_awaited_once()

import importlib.util
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch


class StorageImportBotTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location('sl_test_module', 'storage_import_bot.py')
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)
        self.owner = self.module.OWNER_ID

    async def test_only_primary_admin_can_start(self):
        message = SimpleNamespace(from_user=SimpleNamespace(id=123), answer=AsyncMock(), chat=SimpleNamespace(type='private', id=123))
        await self.module.storage_command(message)
        self.assertFalse(self.module.awaiting)

    async def test_cancel_never_writes(self):
        self.module.pending['token'] = {'owner': self.owner, 'chat': 9, 'expires': float('inf')}
        message = SimpleNamespace(chat=SimpleNamespace(id=9), edit_reply_markup=AsyncMock())
        callback = SimpleNamespace(from_user=SimpleNamespace(id=self.owner), message=message, data='sl_cancel:token', answer=AsyncMock())
        with patch.object(self.module, 'publish_catalog') as publish:
            await self.module.storage_confirm(callback)
            publish.assert_not_called()
        self.assertFalse(self.module.pending)

    async def test_other_user_cannot_apply(self):
        self.module.pending['token'] = {'owner': self.owner, 'chat': 9, 'expires': float('inf')}
        callback = SimpleNamespace(from_user=SimpleNamespace(id=123), message=SimpleNamespace(chat=SimpleNamespace(id=9)), data='sl_apply:token', answer=AsyncMock())
        with patch.object(self.module, 'publish_catalog') as publish:
            await self.module.storage_confirm(callback)
            publish.assert_not_called()

    async def test_success_is_consumed_and_duplicate_cannot_write(self):
        self.module.pending['token'] = {'owner': self.owner, 'chat': 9, 'expires': float('inf')}
        message = SimpleNamespace(chat=SimpleNamespace(id=9), edit_reply_markup=AsyncMock(), answer=AsyncMock())
        callback = SimpleNamespace(from_user=SimpleNamespace(id=self.owner), message=message, data='sl_apply:token', answer=AsyncMock())
        with patch.object(self.module, 'publish_catalog', return_value={'revision':'v1'}) as publish:
            await self.module.storage_confirm(callback)
            await self.module.storage_confirm(callback)
            self.assertEqual(publish.call_count, 1)

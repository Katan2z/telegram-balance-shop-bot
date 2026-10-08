import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import bot_runner


class TimesheetConfirmationTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        bot_runner.pending_timesheets.clear()
        self.message = SimpleNamespace(edit_reply_markup=AsyncMock(), answer=AsyncMock())
        self.callback = SimpleNamespace(
            data='timesheet_save:test', from_user=SimpleNamespace(id=42),
            message=self.message, answer=AsyncMock(),
        )
        bot_runner.pending_timesheets['test'] = {
            'owner': 42, 'expires': float('inf'), 'rows': [{'profile_id': 7, 'hours': 8}],
        }

    async def test_owner_can_save_only_once(self):
        with patch.object(bot_runner.app, 'is_admin', return_value=True), patch.object(bot_runner, 'save_current') as save:
            await bot_runner.timesheet_confirm(self.callback)
            await bot_runner.timesheet_confirm(self.callback)
            save.assert_called_once_with([{'profile_id': 7, 'hours': 8}])

    async def test_other_user_cannot_confirm(self):
        self.callback.from_user.id = 99
        with patch.object(bot_runner, 'save_current') as save:
            await bot_runner.timesheet_confirm(self.callback)
            save.assert_not_called()
        self.assertIn('test', bot_runner.pending_timesheets)

    async def test_failure_keeps_preview_for_retry(self):
        with patch.object(bot_runner.app, 'is_admin', return_value=True), patch.object(bot_runner, 'save_current', side_effect=RuntimeError('offline')):
            await bot_runner.timesheet_confirm(self.callback)
        self.assertFalse(bot_runner.pending_timesheets['test']['saving'])

    async def test_cancel_does_not_write(self):
        self.callback.data = 'timesheet_cancel:test'
        with patch.object(bot_runner.app, 'is_admin', return_value=True), patch.object(bot_runner, 'save_current') as save:
            await bot_runner.timesheet_confirm(self.callback)
            save.assert_not_called()
        self.assertNotIn('test', bot_runner.pending_timesheets)

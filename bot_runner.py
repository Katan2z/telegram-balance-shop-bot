import asyncio
import tempfile
import secrets
import time
from pathlib import Path

from aiogram import Bot, F, Router
from aiogram.filters import Command
from aiogram.types import Message, CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton

import bot_supabase as app
from timesheet_import import format_hours, parse_timesheet, save_current

priority_router = Router()
pending_timesheets = {}


def timesheet_profiles():
    return app.db.request(
        "GET",
        "employee_profiles?activation_status=eq.active&select=id,full_name,timesheet_name,telegram_id",
    ) or []


def timesheet_answer(rows):
    if not rows:
        return "Не нашёл сотрудников из профилей в этом табеле. Проверь ФИО или поле «Имя в табеле»."
    lines = ["🕒 Табель обработан", ""]
    for row in rows[:80]:
        lines.append(f"{row['full_name']} — {format_hours(row['hours'])} ч.")
    if len(rows) > 80:
        lines.append(f"…и ещё {len(rows) - 80}")
    return "\n".join(lines)


@priority_router.message(Command("status"))
async def status_command(message: Message):
    await app.answer(message, "✅ Бот работает. Версия: employee-registration-5")


@priority_router.message(F.document)
async def timesheet_document_handler(message: Message, bot: Bot):
    if message.chat.type != "private":
        return
    if not message.from_user or not await asyncio.to_thread(app.is_admin, message.from_user.id):
        await app.answer(message, "Загружать табель может только админ.")
        return

    document = message.document
    filename = Path(document.file_name or "timesheet.xlsx").name
    suffix = Path(filename).suffix.lower()
    if suffix not in {".xlsx", ".xlsm", ".csv"}:
        await app.answer(message, "Пришли табель файлом .xlsx, .xlsm или .csv")
        return

    await app.answer(message, "Принял табель, считаю часы по ФИО…")
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / filename
        file = await bot.get_file(document.file_id)
        await bot.download_file(file.file_path, destination=path)
        try:
            profiles = await asyncio.to_thread(timesheet_profiles)
            rows = await asyncio.to_thread(parse_timesheet, path, profiles)
            if not rows:
                await app.answer(message, timesheet_answer(rows))
                return
            now = time.monotonic()
            for old_token, pending in list(pending_timesheets.items()):
                if pending['expires'] < now:
                    del pending_timesheets[old_token]
            token = secrets.token_hex(8)
            pending_timesheets[token] = {'owner': message.from_user.id, 'rows': rows, 'expires': now + 900}
            keyboard = InlineKeyboardMarkup(inline_keyboard=[[
                InlineKeyboardButton(text='Сохранить актуальные часы', callback_data=f'timesheet_save:{token}'),
                InlineKeyboardButton(text='Отмена', callback_data=f'timesheet_cancel:{token}'),
            ]])
            await app.answer(message, timesheet_answer(rows) + '\n\nЭто предварительный просмотр. Подтверди сохранение.', reply_markup=keyboard)
        except Exception as error:
            await app.answer(message, f"Не получилось обработать табель:\n{error}")


@priority_router.callback_query(F.data.startswith('timesheet_'))
async def timesheet_confirm(callback: CallbackQuery):
    action, token = callback.data.split(':', 1)
    pending = pending_timesheets.get(token)
    if not pending or pending['expires'] < time.monotonic():
        pending_timesheets.pop(token, None)
        await callback.answer('Просмотр устарел. Загрузи файл заново.', show_alert=True)
        return
    if pending['owner'] != callback.from_user.id or not await asyncio.to_thread(app.is_admin, callback.from_user.id):
        await callback.answer('Нет доступа.', show_alert=True)
        return
    if pending.get('saving'):
        await callback.answer('Сохранение уже выполняется.')
        return
    if action == 'timesheet_cancel':
        pending_timesheets.pop(token, None)
        await callback.message.edit_reply_markup(reply_markup=None)
        await callback.answer('Сохранение отменено.')
        return
    pending['saving'] = True
    await callback.answer('Сохраняю…')
    try:
        await asyncio.to_thread(save_current, pending['rows'])
        pending_timesheets.pop(token, None)
        await callback.message.edit_reply_markup(reply_markup=None)
        await callback.message.answer('Актуальные часы сохранены.')
    except Exception:
        pending['saving'] = False
        await callback.message.answer('Не удалось сохранить часы. Попробуй ещё раз.')


async def main():
    await app.run_bot((priority_router,))


if __name__ == "__main__":
    asyncio.run(main())

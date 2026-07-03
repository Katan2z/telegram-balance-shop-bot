import asyncio
import tempfile
from pathlib import Path

from aiogram import Bot, Dispatcher, F, Router
from aiogram.filters import Command
from aiogram.types import Message

import bot_supabase as app
from timesheet_import import format_hours, parse_timesheet

priority_router = Router()


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
    await app.answer(message, "✅ Бот работает. Версия: timesheet-import-2")


@priority_router.message(F.document)
async def timesheet_document_handler(message: Message, bot: Bot):
    if message.chat.type != "private":
        return
    if not message.from_user or not app.is_admin(message.from_user.id):
        await app.answer(message, "Загружать табель может только админ.")
        return

    document = message.document
    filename = document.file_name or "timesheet.xlsx"
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
            rows = parse_timesheet(path, timesheet_profiles())
            await app.answer(message, timesheet_answer(rows))
        except Exception as error:
            await app.answer(message, f"Не получилось обработать табель:\n{error}")


async def main():
    token = app.os.getenv("BOT_TOKEN")
    if not token:
        raise RuntimeError("BOT_TOKEN не указан")
    if not app.db.enabled():
        raise RuntimeError("Supabase не настроен")
    print("Supabase storage enabled")
    print("Bot version: timesheet-import-2")
    bot = Bot(token=token)
    dp = Dispatcher()
    dp.include_router(priority_router)
    dp.include_router(app.router)
    asyncio.create_task(app.notify_new_tasks_loop(bot))
    asyncio.create_task(app.monthly_reset_loop(bot))
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())

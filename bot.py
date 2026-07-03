import asyncio
import os
import tempfile
from pathlib import Path

import requests
from aiogram import Bot, Dispatcher, Router, F
from aiogram.filters import Command, CommandStart
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message

from timesheet_import import format_hours, parse_timesheet

MINI_APP_URL = os.getenv("MINI_APP_URL", "https://katan2z.github.io/telegram-balance-shop-bot/?v=employees-3")
ROOT_ADMIN_IDS = {int(x) for x in os.getenv("ROOT_ADMIN_IDS", "818748106").split(",") if x.strip().isdigit()}
SUPABASE_URL = (os.getenv("SUPABASE_URL") or "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or os.getenv("SUPABASE_ANON_KEY") or ""
router = Router()


def app_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="Открыть BK8 Staff", url=MINI_APP_URL)]])


def sb_headers():
    return {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json"}


def load_profiles():
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("Не настроены SUPABASE_URL и SUPABASE_KEY")
    url = f"{SUPABASE_URL}/rest/v1/employee_profiles?select=id,full_name,timesheet_name,telegram_id,activation_status&activation_status=eq.active"
    response = requests.get(url, headers=sb_headers(), timeout=20)
    response.raise_for_status()
    return response.json()


def build_timesheet_answer(rows):
    if not rows:
        return "Не нашёл сотрудников из профилей в этом табеле. Проверь ФИО или поле “Имя в табеле”."
    lines = ["🕒 Табель обработан", ""]
    for row in rows[:80]:
        lines.append(f"{row['full_name']} — {format_hours(row['hours'])} ч.")
    if len(rows) > 80:
        lines.append(f"…и ещё {len(rows) - 80}")
    return "\n".join(lines)


@router.message(CommandStart())
async def start_handler(message: Message):
    await message.answer("Открывай BK8 Staff ниже.", reply_markup=app_keyboard())


@router.message(Command("app"))
async def app_handler(message: Message):
    await message.answer("Открыть BK8 Staff:", reply_markup=app_keyboard())


@router.message(F.document)
async def timesheet_document_handler(message: Message, bot: Bot):
    if message.chat.type != "private":
        return
    if message.from_user.id not in ROOT_ADMIN_IDS:
        await message.answer("Загружать табель может только админ.")
        return
    document = message.document
    filename = document.file_name or "timesheet.xlsx"
    suffix = Path(filename).suffix.lower()
    if suffix not in {".xlsx", ".xlsm", ".csv"}:
        await message.answer("Пришли табель файлом .xlsx, .xlsm или .csv")
        return
    await message.answer("Принял табель, считаю часы по ФИО…")
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / filename
        file = await bot.get_file(document.file_id)
        await bot.download_file(file.file_path, destination=path)
        try:
            profiles = load_profiles()
            rows = parse_timesheet(path, profiles)
            await message.answer(build_timesheet_answer(rows))
        except Exception as error:
            await message.answer(f"Не получилось обработать табель:\n{error}")


async def main():
    token = os.getenv("BOT_TOKEN")
    if not token:
        raise RuntimeError("BOT_TOKEN is missing")
    bot = Bot(token=token)
    dp = Dispatcher()
    dp.include_router(router)
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())

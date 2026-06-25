import asyncio
import os

from aiogram import Bot, Dispatcher, Router
from aiogram.filters import Command, CommandStart
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message

MINI_APP_URL = os.getenv("MINI_APP_URL", "https://katan2z.github.io/telegram-balance-shop-bot/?v=bk-staff-2")
router = Router()


def app_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="Открыть приложение", url=MINI_APP_URL)
    ]])


@router.message(CommandStart())
async def start_handler(message: Message):
    await message.answer("Привет! Открывай BK Staff ниже.", reply_markup=app_keyboard())


@router.message(Command("app"))
async def app_handler(message: Message):
    await message.answer("Открыть приложение:", reply_markup=app_keyboard())


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

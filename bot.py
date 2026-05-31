import asyncio
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any

from aiogram import Bot, Dispatcher, F, Router
from aiogram.filters import Command, CommandStart
from aiogram.types import (
    Message,
    CallbackQuery,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
)

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"

USERS_FILE = DATA_DIR / "users.json"
PRODUCTS_FILE = DATA_DIR / "products.json"
TRANSACTIONS_FILE = DATA_DIR / "transactions.json"
CHATS_FILE = DATA_DIR / "chats.json"


def now() -> str:
    return datetime.utcnow().isoformat()


def read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default

    try:
        with path.open("r", encoding="utf-8") as file:
            return json.load(file)
    except json.JSONDecodeError:
        return default


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)


def get_admin_ids() -> set[int]:
    raw = os.getenv("ADMIN_IDS", "")
    result = set()

    for item in raw.split(","):
        item = item.strip()
        if item.isdigit():
            result.add(int(item))

    return result


def is_admin(user_id: int) -> bool:
    return user_id in get_admin_ids()


def save_user(user) -> dict:
    users = read_json(USERS_FILE, {})

    telegram_id = str(user.id)

    if telegram_id not in users:
        users[telegram_id] = {
            "telegram_id": user.id,
            "username": user.username,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "balance": 0,
            "created_at": now(),
            "updated_at": now(),
        }
    else:
        users[telegram_id]["username"] = user.username
        users[telegram_id]["first_name"] = user.first_name
        users[telegram_id]["last_name"] = user.last_name
        users[telegram_id]["updated_at"] = now()

    write_json(USERS_FILE, users)
    return users[telegram_id]


def save_chat(chat) -> None:
    if chat.type == "private":
        return

    chats = read_json(CHATS_FILE, {})

    chat_id = str(chat.id)

    if chat_id not in chats:
        chats[chat_id] = {
            "chat_id": chat.id,
            "title": chat.title,
            "type": chat.type,
            "members": [],
            "created_at": now(),
            "updated_at": now(),
        }
    else:
        chats[chat_id]["title"] = chat.title
        chats[chat_id]["type"] = chat.type
        chats[chat_id]["updated_at"] = now()

    write_json(CHATS_FILE, chats)


def save_chat_member(chat, user) -> None:
    if chat.type == "private" or user.is_bot:
        return

    save_chat(chat)

    chats = read_json(CHATS_FILE, {})
    chat_id = str(chat.id)

    if chat_id not in chats:
        return

    members = chats[chat_id].setdefault("members", [])

    if user.id not in members:
        members.append(user.id)

    chats[chat_id]["updated_at"] = now()
    write_json(CHATS_FILE, chats)


def add_transaction(user_id: int, amount: int, transaction_type: str, comment: str = "") -> None:
    transactions = read_json(TRANSACTIONS_FILE, [])

    transactions.append(
        {
            "user_id": user_id,
            "amount": amount,
            "type": transaction_type,
            "comment": comment,
            "created_at": now(),
        }
    )

    write_json(TRANSACTIONS_FILE, transactions)


def change_balance(user_id: int, amount: int, comment: str = "") -> int:
    users = read_json(USERS_FILE, {})
    key = str(user_id)

    if key not in users:
        users[key] = {
            "telegram_id": user_id,
            "username": None,
            "first_name": None,
            "last_name": None,
            "balance": 0,
            "created_at": now(),
            "updated_at": now(),
        }

    new_balance = users[key].get("balance", 0) + amount

    if new_balance < 0:
        raise ValueError("Недостаточно средств")

    users[key]["balance"] = new_balance
    users[key]["updated_at"] = now()

    write_json(USERS_FILE, users)
    add_transaction(user_id, amount, "balance_change", comment)

    return new_balance


def get_balance(user_id: int) -> int:
    users = read_json(USERS_FILE, {})
    return users.get(str(user_id), {}).get("balance", 0)


def get_products() -> list[dict]:
    products = read_json(PRODUCTS_FILE, [])
    return [product for product in products if product.get("active", True)]


def buy_product(user_id: int, product_id: int) -> dict:
    products = get_products()

    product = None
    for item in products:
        if int(item["id"]) == product_id:
            product = item
            break

    if product is None:
        raise ValueError("Товар не найден")

    price = int(product["price"])

    if get_balance(user_id) < price:
        raise ValueError("Недостаточно средств")

    change_balance(user_id, -price, f"Покупка товара: {product['name']}")

    return product


def main_menu() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="💰 Баланс", callback_data="balance")],
            [InlineKeyboardButton(text="🛒 Магазин", callback_data="shop")],
            [InlineKeyboardButton(text="ℹ️ Помощь", callback_data="help")],
        ]
    )


def shop_keyboard() -> InlineKeyboardMarkup:
    buttons = []

    for product in get_products():
        buttons.append(
            [
                InlineKeyboardButton(
                    text=f"{product['name']} — {product['price']}",
                    callback_data=f"buy:{product['id']}",
                )
            ]
        )

    buttons.append([InlineKeyboardButton(text="⬅️ Назад", callback_data="menu")])

    return InlineKeyboardMarkup(inline_keyboard=buttons)


router = Router()


@router.message(CommandStart())
async def start_handler(message: Message):
    if message.from_user:
        save_user(message.from_user)
        save_chat_member(message.chat, message.from_user)

    await message.answer(
        "Привет! Я бот магазина.\n\nВыбери действие:",
        reply_markup=main_menu(),
    )


@router.message(F.new_chat_members)
async def new_members_handler(message: Message):
    for user in message.new_chat_members:
        if user.is_bot:
            continue

        save_user(user)
        save_chat_member(message.chat, user)

    await message.answer("✅ Новые участники добавлены в базу.")


@router.message(Command("add_balance"))
async def add_balance_handler(message: Message):
    if not message.from_user or not is_admin(message.from_user.id):
        await message.answer("⛔ У тебя нет доступа к этой команде.")
        return

    parts = message.text.split()

    if len(parts) != 3:
        await message.answer("Использование:\n/add_balance user_id amount")
        return

    try:
        user_id = int(parts[1])
        amount = int(parts[2])
    except ValueError:
        await message.answer("user_id и amount должны быть числами.")
        return

    new_balance = change_balance(
        user_id=user_id,
        amount=amount,
        comment=f"Начисление админом {message.from_user.id}",
    )

    await message.answer(
        f"✅ Баланс пользователя {user_id} изменен на {amount}.\n"
        f"Новый баланс: {new_balance}"
    )


@router.message(Command("users"))
async def users_handler(message: Message):
    if not message.from_user or not is_admin(message.from_user.id):
        await message.answer("⛔ У тебя нет доступа к этой команде.")
        return

    users = read_json(USERS_FILE, {})

    await message.answer(f"👥 Пользователей в базе: {len(users)}")


@router.message()
async def collect_user_handler(message: Message):
    if message.from_user:
        save_user(message.from_user)
        save_chat_member(message.chat, message.from_user)


@router.callback_query(F.data == "menu")
async def menu_callback(callback: CallbackQuery):
    await callback.message.edit_text(
        "Главное меню:",
        reply_markup=main_menu(),
    )
    await callback.answer()


@router.callback_query(F.data == "balance")
async def balance_callback(callback: CallbackQuery):
    if not callback.from_user:
        await callback.answer()
        return

    save_user(callback.from_user)

    balance = get_balance(callback.from_user.id)

    await callback.message.edit_text(
        f"💰 Твой баланс: {balance}",
        reply_markup=main_menu(),
    )
    await callback.answer()


@router.callback_query(F.data == "shop")
async def shop_callback(callback: CallbackQuery):
    products = get_products()

    if not products:
        await callback.message.edit_text(
            "🛒 Магазин пока пуст.",
            reply_markup=main_menu(),
        )
    else:
        text = "🛒 Магазин:\n\n"
        for product in products:
            text += (
                f"#{product['id']} — {product['name']}\n"
                f"{product.get('description', '')}\n"
                f"Цена: {product['price']}\n\n"
            )

        await callback.message.edit_text(
            text,
            reply_markup=shop_keyboard(),
        )

    await callback.answer()


@router.callback_query(F.data == "help")
async def help_callback(callback: CallbackQuery):
    await callback.message.edit_text(
        "ℹ️ Помощь\n\n"
        "💰 Баланс — проверить свой баланс.\n"
        "🛒 Магазин — посмотреть товары.\n\n"
        "Админ-команды:\n"
        "/add_balance user_id amount — начислить баланс\n"
        "/users — количество пользователей",
        reply_markup=main_menu(),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("buy:"))
async def buy_callback(callback: CallbackQuery):
    product_id = int(callback.data.split(":")[1])

    try:
        product = buy_product(callback.from_user.id, product_id)
    except ValueError as error:
        await callback.answer(str(error), show_alert=True)
        return

    await callback.message.edit_text(
        f"✅ Покупка успешна!\n\n"
        f"Товар: {product['name']}\n"
        f"Списано: {product['price']}\n"
        f"Баланс: {get_balance(callback.from_user.id)}",
        reply_markup=main_menu(),
    )

    await callback.answer("Покупка успешна!")


async def main():
    token = os.getenv("BOT_TOKEN")

    if not token:
        raise RuntimeError("Не указан BOT_TOKEN в переменных окружения")

    bot = Bot(token=token)
    dp = Dispatcher()
    dp.include_router(router)

    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())

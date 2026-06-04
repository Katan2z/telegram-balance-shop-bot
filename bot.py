import asyncio
import json
import os
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

from aiogram import Bot, Dispatcher, F, Router
from aiogram.filters import Command, CommandStart
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

from storage import sync_files_to_github

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DOCS_DIR = BASE_DIR / "docs"

USERS_FILE = DATA_DIR / "users.json"
PRODUCTS_FILE = DATA_DIR / "products.json"
TRANSACTIONS_FILE = DATA_DIR / "transactions.json"
CHATS_FILE = DATA_DIR / "chats.json"
PUBLIC_DATA_FILE = DOCS_DIR / "public-data.json"
MINI_APP_URL = os.getenv("MINI_APP_URL", "https://katan2z.github.io/telegram-balance-shop-bot/")

ADMIN_STATES: dict[int, str] = {}


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


def persist_data(message: str = "Update bot data") -> None:
    generate_public_data()
    try:
        sync_files_to_github(message)
    except Exception as error:
        print(f"GitHub sync failed: {error}")


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


def public_name(user: dict) -> str:
    if user.get("first_name"):
        return str(user["first_name"])
    if user.get("username"):
        return "@" + str(user["username"])
    return "Сотрудник"


def month_key(date_text: str | None = None) -> str:
    value = date_text or now()
    return value[:7]


def generate_public_data() -> None:
    users = read_json(USERS_FILE, {})
    products = read_json(PRODUCTS_FILE, [])
    transactions = read_json(TRANSACTIONS_FILE, [])
    current_month = month_key()
    received_total = defaultdict(int)
    received_month = defaultdict(int)
    total_given_month = 0

    for tx in transactions:
        user_id = str(tx.get("user_id"))
        amount = int(tx.get("amount", 0) or 0)
        created_at = str(tx.get("created_at", ""))
        comment = str(tx.get("comment", ""))
        is_positive_reward = amount > 0 and "Списание" not in comment and "Покупка" not in comment
        if not is_positive_reward:
            continue
        received_total[user_id] += amount
        if created_at.startswith(current_month):
            received_month[user_id] += amount
            total_given_month += amount

    public_users = {}
    for user_id, user in users.items():
        public_users[user_id] = {
            "name": public_name(user),
            "balance": int(user.get("balance", 0) or 0),
            "received_month": received_month[user_id],
            "received_total": received_total[user_id],
        }

    top_month = []
    for user_id, amount in sorted(received_month.items(), key=lambda item: item[1], reverse=True)[:3]:
        user = users.get(user_id, {})
        top_month.append({"user_id": user_id, "name": public_name(user), "amount": amount})

    public_data = {
        "updated_at": now(),
        "currency_name": "спасибки",
        "month": current_month,
        "top_month": top_month,
        "users": public_users,
        "admin_ids": [str(admin_id) for admin_id in get_admin_ids()],
        "products": [product for product in products if product.get("active", True)],
        "stats": {"users_count": len(users), "transactions_count": len(transactions), "total_given_month": total_given_month},
    }
    write_json(PUBLIC_DATA_FILE, public_data)


def save_user(user) -> dict:
    users = read_json(USERS_FILE, {})
    telegram_id = str(user.id)
    if telegram_id not in users:
        users[telegram_id] = {"telegram_id": user.id, "username": user.username, "first_name": user.first_name, "last_name": user.last_name, "balance": 0, "created_at": now(), "updated_at": now()}
    else:
        users[telegram_id]["username"] = user.username
        users[telegram_id]["first_name"] = user.first_name
        users[telegram_id]["last_name"] = user.last_name
        users[telegram_id]["updated_at"] = now()
    write_json(USERS_FILE, users)
    persist_data("Update user data")
    return users[telegram_id]


def save_chat(chat) -> None:
    if chat.type == "private":
        return
    chats = read_json(CHATS_FILE, {})
    chat_id = str(chat.id)
    if chat_id not in chats:
        chats[chat_id] = {"chat_id": chat.id, "title": chat.title, "type": chat.type, "members": [], "created_at": now(), "updated_at": now()}
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
    persist_data("Update chat data")


def add_transaction(user_id: int, amount: int, transaction_type: str, comment: str = "") -> None:
    transactions = read_json(TRANSACTIONS_FILE, [])
    transactions.append({"user_id": user_id, "amount": amount, "type": transaction_type, "comment": comment, "created_at": now()})
    write_json(TRANSACTIONS_FILE, transactions)


def change_balance(user_id: int, amount: int, comment: str = "") -> int:
    users = read_json(USERS_FILE, {})
    key = str(user_id)
    if key not in users:
        users[key] = {"telegram_id": user_id, "username": None, "first_name": None, "last_name": None, "balance": 0, "created_at": now(), "updated_at": now()}
    new_balance = int(users[key].get("balance", 0)) + amount
    if new_balance < 0:
        raise ValueError("Недостаточно средств")
    users[key]["balance"] = new_balance
    users[key]["updated_at"] = now()
    write_json(USERS_FILE, users)
    add_transaction(user_id, amount, "balance_change", comment)
    persist_data("Update balance and rating")
    return new_balance


def get_balance(user_id: int) -> int:
    users = read_json(USERS_FILE, {})
    return int(users.get(str(user_id), {}).get("balance", 0))


def get_products() -> list[dict]:
    products = read_json(PRODUCTS_FILE, [])
    return [product for product in products if product.get("active", True)]


def buy_product(user_id: int, product_id: int) -> dict:
    product = next((item for item in get_products() if int(item["id"]) == product_id), None)
    if product is None:
        raise ValueError("Товар не найден")
    price = int(product["price"])
    if get_balance(user_id) < price:
        raise ValueError("Недостаточно средств")
    change_balance(user_id, -price, f"Покупка товара: {product['name']}")
    return product


def main_menu(user_id: int | None = None) -> InlineKeyboardMarkup:
    buttons = [
        [InlineKeyboardButton(text="🚀 Открыть приложение", url=MINI_APP_URL)],
        [InlineKeyboardButton(text="💰 Баланс", callback_data="balance")],
        [InlineKeyboardButton(text="ℹ️ Помощь", callback_data="help")],
    ]
    if user_id and is_admin(user_id):
        buttons.append([InlineKeyboardButton(text="👑 Админка", callback_data="admin")])
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def admin_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="👥 Пользователи", callback_data="admin_users")],
        [InlineKeyboardButton(text="💰 Начислить спасибки", callback_data="admin_add_balance")],
        [InlineKeyboardButton(text="➖ Списать спасибки", callback_data="admin_remove_balance")],
        [InlineKeyboardButton(text="📊 Статистика", callback_data="admin_stats")],
        [InlineKeyboardButton(text="🧾 Последние операции", callback_data="admin_transactions")],
        [InlineKeyboardButton(text="⬅️ Назад", callback_data="menu")],
    ])


def admin_only_text() -> str:
    return "⛔ У тебя нет доступа к админке."


def format_user_line(user: dict) -> str:
    username = user.get("username")
    name = user.get("first_name") or "Без имени"
    user_id = user.get("telegram_id")
    balance = user.get("balance", 0)
    nick = f"@{username}" if username else "без username"
    return f"{user_id} | {name} | {nick} | спасибки: {balance}"


def get_users_text(limit: int = 20) -> str:
    users = list(read_json(USERS_FILE, {}).values())
    users.sort(key=lambda item: item.get("updated_at", ""), reverse=True)
    if not users:
        return "👥 Пользователей пока нет."
    text = f"👥 Пользователей в базе: {len(users)}\n\n"
    for user in users[:limit]:
        text += format_user_line(user) + "\n"
    if len(users) > limit:
        text += f"\nПоказаны последние {limit}."
    return text


def get_stats_text() -> str:
    persist_data("Update statistics")
    users = read_json(USERS_FILE, {})
    products = read_json(PRODUCTS_FILE, [])
    transactions = read_json(TRANSACTIONS_FILE, [])
    chats = read_json(CHATS_FILE, {})
    public_data = read_json(PUBLIC_DATA_FILE, {})
    total_balance = sum(int(user.get("balance", 0)) for user in users.values())
    return ("📊 Статистика\n\n" f"Пользователей: {len(users)}\n" f"Чатов: {len(chats)}\n" f"Товаров: {len(products)}\n" f"Операций: {len(transactions)}\n" f"Выдано за месяц: {public_data.get('stats', {}).get('total_given_month', 0)}\n" f"Общий баланс пользователей: {total_balance}")


def get_transactions_text(limit: int = 10) -> str:
    transactions = read_json(TRANSACTIONS_FILE, [])
    if not transactions:
        return "🧾 Операций пока нет."
    text = "🧾 Последние операции:\n\n"
    for item in transactions[-limit:][::-1]:
        text += f"user_id: {item.get('user_id')}\nсумма: {item.get('amount')}\nтип: {item.get('type')}\nкомментарий: {item.get('comment', '')}\n\n"
    return text


router = Router()


@router.message(CommandStart())
async def start_handler(message: Message):
    if message.from_user:
        save_user(message.from_user)
        save_chat_member(message.chat, message.from_user)
    await message.answer("Привет! Это мотивационный магазин спасибок.\n\nВыбери действие:", reply_markup=main_menu(message.from_user.id if message.from_user else None))


@router.message(F.web_app_data)
async def web_app_data_handler(message: Message):
    if not message.from_user or not is_admin(message.from_user.id):
        await message.answer(admin_only_text())
        return
    try:
        payload = json.loads(message.web_app_data.data)
    except Exception:
        await message.answer("Не удалось прочитать команду Mini App.")
        return
    if payload.get("action") != "admin_change_balance":
        await message.answer("Неизвестная команда Mini App.")
        return
    try:
        target_user_id = int(payload.get("target_user_id"))
        amount = int(payload.get("amount"))
    except (TypeError, ValueError):
        await message.answer("Неверные данные начисления.")
        return
    if amount == 0:
        await message.answer("Сумма не может быть 0.")
        return
    try:
        new_balance = change_balance(target_user_id, amount, f"Изменение через Mini App админом {message.from_user.id}")
    except ValueError as error:
        await message.answer(str(error))
        return
    await message.answer(f"✅ Готово.\nПользователь: {target_user_id}\nИзменение: {amount}\nНовый баланс: {new_balance}")


@router.message(F.new_chat_members)
async def new_members_handler(message: Message):
    for user in message.new_chat_members:
        if user.is_bot:
            continue
        save_user(user)
        save_chat_member(message.chat, user)
    await message.answer("✅ Новые участники добавлены в базу.")


@router.message(Command("admin"))
async def admin_command_handler(message: Message):
    if not message.from_user or not is_admin(message.from_user.id):
        await message.answer(admin_only_text())
        return
    await message.answer("👑 Админка", reply_markup=admin_keyboard())


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
    try:
        new_balance = change_balance(user_id, amount, f"Начисление спасибок админом {message.from_user.id}")
    except ValueError as error:
        await message.answer(str(error))
        return
    await message.answer(f"✅ Пользователь {user_id} получил {amount} спасибок.\nНовый баланс: {new_balance}")


@router.message(Command("users"))
async def users_handler(message: Message):
    if not message.from_user or not is_admin(message.from_user.id):
        await message.answer("⛔ У тебя нет доступа к этой команде.")
        return
    await message.answer(get_users_text())


@router.message(Command("sync"))
async def sync_handler(message: Message):
    if not message.from_user or not is_admin(message.from_user.id):
        await message.answer("⛔ У тебя нет доступа к этой команде.")
        return
    persist_data("Manual data sync")
    await message.answer("✅ Данные Mini App обновлены.")


@router.message()
async def collect_user_handler(message: Message):
    if message.from_user:
        save_user(message.from_user)
        save_chat_member(message.chat, message.from_user)
    if not message.from_user or not is_admin(message.from_user.id):
        return
    state = ADMIN_STATES.get(message.from_user.id)
    if not state:
        return
    parts = message.text.split()
    if len(parts) != 2:
        await message.answer("Нужно отправить так:\nuser_id сумма\n\nНапример:\n123456789 500")
        return
    try:
        user_id = int(parts[0])
        amount = int(parts[1])
    except ValueError:
        await message.answer("user_id и сумма должны быть числами.")
        return
    if amount <= 0:
        await message.answer("Сумма должна быть больше 0.")
        return
    if state == "add_balance":
        real_amount = amount
        comment = f"Начисление спасибок через админку админом {message.from_user.id}"
    else:
        real_amount = -amount
        comment = f"Списание спасибок через админку админом {message.from_user.id}"
    try:
        new_balance = change_balance(user_id, real_amount, comment)
    except ValueError as error:
        await message.answer(str(error))
        return
    ADMIN_STATES.pop(message.from_user.id, None)
    await message.answer(f"✅ Готово.\nПользователь: {user_id}\nИзменение: {real_amount}\nНовый баланс: {new_balance}", reply_markup=admin_keyboard())


@router.callback_query(F.data == "menu")
async def menu_callback(callback: CallbackQuery):
    await callback.message.edit_text("Главное меню:", reply_markup=main_menu(callback.from_user.id))
    await callback.answer()


@router.callback_query(F.data == "balance")
async def balance_callback(callback: CallbackQuery):
    save_user(callback.from_user)
    balance = get_balance(callback.from_user.id)
    await callback.message.edit_text(f"💰 Твои спасибки: {balance}", reply_markup=main_menu(callback.from_user.id))
    await callback.answer()


@router.callback_query(F.data == "help")
async def help_callback(callback: CallbackQuery):
    await callback.message.edit_text("ℹ️ Помощь\n\n🚀 Открыть приложение — Mini App со статистикой.\n💰 Баланс — проверить спасибки.\n\nАдмин-команды:\n/admin — открыть админку\n/add_balance user_id amount — начислить спасибки\n/users — список пользователей\n/sync — обновить данные Mini App", reply_markup=main_menu(callback.from_user.id))
    await callback.answer()


@router.callback_query(F.data == "admin")
async def admin_callback(callback: CallbackQuery):
    if not is_admin(callback.from_user.id):
        await callback.answer(admin_only_text(), show_alert=True)
        return
    await callback.message.edit_text("👑 Админка", reply_markup=admin_keyboard())
    await callback.answer()


@router.callback_query(F.data == "admin_users")
async def admin_users_callback(callback: CallbackQuery):
    if not is_admin(callback.from_user.id):
        await callback.answer(admin_only_text(), show_alert=True)
        return
    await callback.message.edit_text(get_users_text(), reply_markup=admin_keyboard())
    await callback.answer()


@router.callback_query(F.data == "admin_stats")
async def admin_stats_callback(callback: CallbackQuery):
    if not is_admin(callback.from_user.id):
        await callback.answer(admin_only_text(), show_alert=True)
        return
    await callback.message.edit_text(get_stats_text(), reply_markup=admin_keyboard())
    await callback.answer()


@router.callback_query(F.data == "admin_transactions")
async def admin_transactions_callback(callback: CallbackQuery):
    if not is_admin(callback.from_user.id):
        await callback.answer(admin_only_text(), show_alert=True)
        return
    await callback.message.edit_text(get_transactions_text(), reply_markup=admin_keyboard())
    await callback.answer()


@router.callback_query(F.data == "admin_add_balance")
async def admin_add_balance_callback(callback: CallbackQuery):
    if not is_admin(callback.from_user.id):
        await callback.answer(admin_only_text(), show_alert=True)
        return
    ADMIN_STATES[callback.from_user.id] = "add_balance"
    await callback.message.edit_text("💰 Начисление спасибок\n\nОтправь следующим сообщением:\nuser_id сумма\n\nНапример:\n123456789 500", reply_markup=admin_keyboard())
    await callback.answer()


@router.callback_query(F.data == "admin_remove_balance")
async def admin_remove_balance_callback(callback: CallbackQuery):
    if not is_admin(callback.from_user.id):
        await callback.answer(admin_only_text(), show_alert=True)
        return
    ADMIN_STATES[callback.from_user.id] = "remove_balance"
    await callback.message.edit_text("➖ Списание спасибок\n\nОтправь следующим сообщением:\nuser_id сумма\n\nНапример:\n123456789 100", reply_markup=admin_keyboard())
    await callback.answer()


async def main():
    token = os.getenv("BOT_TOKEN")
    if not token:
        raise RuntimeError("Не указан BOT_TOKEN в переменных окружения")
    persist_data("Start bot data sync")
    bot = Bot(token=token)
    dp = Dispatcher()
    dp.include_router(router)
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())

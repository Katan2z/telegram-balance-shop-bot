import asyncio
import json
import os
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

from aiogram import Bot, Dispatcher, F, Router
from aiogram.exceptions import TelegramNetworkError
from aiogram.filters import Command, CommandStart
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

import supabase_storage as db
from storage import sync_files_to_github

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DOCS_DIR = BASE_DIR / "docs"

USERS_FILE = DATA_DIR / "users.json"
PRODUCTS_FILE = DATA_DIR / "products.json"
TRANSACTIONS_FILE = DATA_DIR / "transactions.json"
CHATS_FILE = DATA_DIR / "chats.json"
PUBLIC_DATA_FILE = DOCS_DIR / "public-data.json"
MINI_APP_URL = os.getenv("MINI_APP_URL", "https://katan2z.github.io/telegram-balance-shop-bot/?v=bk-staff-2")
BOT_USERNAME = os.getenv("BOT_USERNAME", "bk8_shop_bot")
DEFAULT_ADMIN_IDS = {818748106, 747818163, 5311640125}
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


def get_admin_ids() -> set[int]:
    result = set(DEFAULT_ADMIN_IDS)
    raw = os.getenv("ADMIN_IDS", "")
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
    if db.enabled():
        users_list = db.list_users()
        public_users = {}
        for user in users_list:
            user_id = str(user.get("telegram_id"))
            name = user.get("first_name") or ("@" + user["username"] if user.get("username") else "Сотрудник")
            balance = int(user.get("balance", 0) or 0)
            public_users[user_id] = {
                "name": name,
                "balance": balance,
                "received_month": balance,
                "received_total": balance,
            }
        top_month = [
            {"user_id": user_id, "name": item["name"], "amount": item["balance"]}
            for user_id, item in public_users.items()
            if int(item["balance"]) > 0
        ]
        top_month.sort(key=lambda item: item["amount"], reverse=True)
        stats = db.get_stats()
        admin_ids = sorted(get_admin_ids())
        write_json(PUBLIC_DATA_FILE, {
            "updated_at": now(),
            "currency_name": "спасибки",
            "month": month_key(),
            "top_month": top_month[:3],
            "users": public_users,
            "admin_ids": [str(admin_id) for admin_id in admin_ids],
            "root_admin_ids": [str(admin_id) for admin_id in admin_ids],
            "extra_admin_ids": [],
            "products": [],
            "stats": stats,
        })
        return

    users = read_json(USERS_FILE, {})
    products = read_json(PRODUCTS_FILE, [])
    transactions = read_json(TRANSACTIONS_FILE, [])
    current_month = month_key()
    rating_total = defaultdict(int)
    for tx in transactions:
        user_id = str(tx.get("user_id"))
        amount = int(tx.get("amount", 0) or 0)
        comment = str(tx.get("comment", ""))
        if "Покупка" in comment:
            continue
        rating_total[user_id] += amount

    public_users = {}
    for user_id, user in users.items():
        balance = int(user.get("balance", 0) or 0)
        public_users[user_id] = {"name": public_name(user), "balance": balance, "received_month": balance, "received_total": rating_total[user_id]}

    top_month = [
        {"user_id": user_id, "name": public_name(users.get(user_id, {})), "amount": int(user.get("balance", 0) or 0)}
        for user_id, user in users.items()
        if int(user.get("balance", 0) or 0) > 0
    ]
    top_month.sort(key=lambda item: item["amount"], reverse=True)
    admin_ids = sorted(get_admin_ids())
    write_json(PUBLIC_DATA_FILE, {
        "updated_at": now(),
        "currency_name": "спасибки",
        "month": current_month,
        "top_month": top_month[:3],
        "users": public_users,
        "admin_ids": [str(admin_id) for admin_id in admin_ids],
        "root_admin_ids": [str(admin_id) for admin_id in admin_ids],
        "extra_admin_ids": [],
        "products": [product for product in products if product.get("active", True)],
        "stats": {"users_count": len(users), "transactions_count": len(transactions), "total_given_month": sum(item["amount"] for item in top_month[:3])},
    })


def persist_data(message: str = "Update bot data") -> bool:
    generate_public_data()
    if db.enabled():
        return True
    try:
        sync_files_to_github(message)
        return True
    except Exception as error:
        print(f"GitHub sync failed: {error}")
        return False


async def safe_answer(message: Message, text: str, **kwargs) -> None:
    try:
        await message.answer(text, **kwargs)
    except TelegramNetworkError as error:
        print(f"Telegram answer timeout/error: {error}")


def save_user(user) -> dict:
    if db.enabled():
        return db.upsert_user(user)
    users = read_json(USERS_FILE, {})
    telegram_id = str(user.id)
    if telegram_id not in users:
        users[telegram_id] = {"telegram_id": user.id, "username": user.username, "first_name": user.first_name, "last_name": user.last_name, "balance": 0, "created_at": now(), "updated_at": now()}
    else:
        users[telegram_id].update({"username": user.username, "first_name": user.first_name, "last_name": user.last_name, "updated_at": now()})
    write_json(USERS_FILE, users)
    generate_public_data()
    return users[telegram_id]

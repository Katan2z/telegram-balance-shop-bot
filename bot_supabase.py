import asyncio
import os

from aiogram import Bot, Dispatcher, F, Router
from aiogram.filters import Command, CommandStart
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

import supabase_storage as db

BOT_USERNAME = os.getenv("BOT_USERNAME", "bk8_shop_bot")
ROOT_ADMINS = {818748106, 747818163, 5311640125}
ADMIN_STATES = {}
router = Router()


def root_admin_ids():
    ids = set(ROOT_ADMINS)
    for part in os.getenv("ADMIN_IDS", "").split(","):
        part = part.strip()
        if part.isdigit():
            ids.add(int(part))
    return ids


def admin_ids():
    ids = root_admin_ids()
    if db.enabled():
        ids |= db.manager_ids()
    return ids


def is_admin(user_id):
    return int(user_id) in admin_ids()


def bot_url(payload="app"):
    return f"https://t.me/{BOT_USERNAME}?start={payload}"


def main_menu(user_id=None):
    rows = [
        [InlineKeyboardButton(text="Open app", url=bot_url())],
        [InlineKeyboardButton(text="Balance", callback_data="balance")],
        [InlineKeyboardButton(text="Help", callback_data="help")],
    ]
    if user_id and is_admin(user_id):
        rows.append([InlineKeyboardButton(text="Admin", callback_data="admin")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def admin_keyboard():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="Users", callback_data="admin_users")],
        [InlineKeyboardButton(text="Add points", callback_data="admin_add_balance")],
        [InlineKeyboardButton(text="Remove points", callback_data="admin_remove_balance")],
        [InlineKeyboardButton(text="Stats", callback_data="admin_stats")],
        [InlineKeyboardButton(text="Transactions", callback_data="admin_transactions")],
        [InlineKeyboardButton(text="Back", callback_data="menu")],
    ])


def done_keyboard():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="Back to bot", url=bot_url())],
        [InlineKeyboardButton(text="Admin", callback_data="admin")],
    ])


def name_for(user_id):
    try:
        return db.get_user_name(int(user_id))
    except Exception:
        return "Employee"


def users_text(limit=25):
    users = db.list_users() if db.enabled() else []
    if not users:
        return "No users yet."
    lines = [f"Users: {len(users)}", ""]
    for user in users[:limit]:
        username = user.get("username")
        nick = f"@{username}" if username else "no username"
        lines.append(f"{user.get('telegram_id')} | {user.get('first_name') or 'No name'} | {nick} | balance: {user.get('balance', 0)}")
    return "\n".join(lines)


def stats_text():
    stats = db.get_stats() if db.enabled() else {"users_count": 0, "chats_count": 0, "transactions_count": 0, "total_balance": 0}
    return (
        "Stats\n\n"
        f"Storage: Supabase\n"
        f"Users: {stats['users_count']}\n"
        f"Chats: {stats['chats_count']}\n"
        f"Transactions: {stats['transactions_count']}\n"
        f"Total balance: {stats['total_balance']}\n"
        f"Managers: {len(db.manager_ids()) if db.enabled() else 0}"
    )


def transactions_text(limit=10):
    rows = db.list_transactions(limit) if db.enabled() else []
    if not rows:
        return "No transactions yet."
    lines = ["Recent transactions", ""]
    for item in rows:
        lines.append(f"user_id: {item.get('user_id')}\namount: {item.get('amount')}\ncomment: {item.get('comment') or ''}\n")
    return "\n".join(lines)


async def answer(message, text, **kwargs):
    try:
        await message.answer(text, **kwargs)
    except Exception as error:
        print(f"Telegram answer error: {error}")


async def handle_payload(message, payload):
    if payload == "app":
        await answer(message, "Use the menu button to open the Mini App.", reply_markup=main_menu(message.from_user.id if message.from_user else None))
        return True

    if payload.startswith("manager_"):
        if not message.from_user or message.from_user.id not in root_admin_ids():
            await answer(message, "Only root admins can manage managers.")
            return True
        parts = payload.split("_")
        if len(parts) != 3 or parts[1] not in {"add", "remove"}:
            await answer(message, "Invalid manager command.")
            return True
        target = int(parts[2])
        if parts[1] == "add":
            db.add_manager(target, created_by=message.from_user.id)
            await answer(message, f"Manager added: {name_for(target)}\nID: {target}", reply_markup=done_keyboard())
        else:
            if target in root_admin_ids():
                await answer(message, "Root admin cannot be removed.")
                return True
            db.remove_manager(target)
            await answer(message, f"Manager removed: {name_for(target)}\nID: {target}", reply_markup=done_keyboard())
        return True

    if payload.startswith("admin_"):
        if not message.from_user or not is_admin(message.from_user.id):
            await answer(message, "No admin access.")
            return True
        try:
            _, target, amount_text = payload.split("_", 2)
            target_id = int(target)
            amount = int(amount_text)
            new_balance = db.change_balance(target_id, amount, admin_id=message.from_user.id, comment=f"Mini App admin {message.from_user.id}")
        except Exception as error:
            await answer(message, str(error))
            return True
        action = "added" if amount > 0 else "removed"
        await answer(message, f"Done.\nEmployee: {name_for(target_id)}\n{action}: {abs(amount)}\nNew balance: {new_balance}\nStorage: Supabase", reply_markup=done_keyboard())
        return True

    return False


@router.message(CommandStart())
async def start_handler(message: Message):
    if message.from_user and db.enabled():
        db.upsert_user(message.from_user)
        if message.chat.type != "private":
            db.save_chat(message.chat)
    args = message.text.split(maxsplit=1)
    if len(args) > 1 and await handle_payload(message, args[1].strip()):
        return
    await answer(message, "Hi. Open the Mini App from the menu button.", reply_markup=main_menu(message.from_user.id if message.from_user else None))


@router.message(Command("app"))
async def app_handler(message: Message):
    if message.from_user and db.enabled():
        db.upsert_user(message.from_user)
    await answer(message, "Open private chat with the bot and use the menu button.", reply_markup=InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="Open bot", url=bot_url())]]))


@router.message(F.new_chat_members)
async def new_members_handler(message: Message):
    if db.enabled():
        for user in message.new_chat_members:
            if not user.is_bot:
                db.upsert_user(user)
        if message.chat.type != "private":
            db.save_chat(message.chat)
    await answer(message, "New members saved.")


@router.message(Command("admin"))
async def admin_command(message: Message):
    if not message.from_user or not is_admin(message.from_user.id):
        await answer(message, "No admin access.")
        return
    await answer(message, "Admin", reply_markup=admin_keyboard())


@router.message(Command("add_balance"))
async def add_balance_command(message: Message):
    if not message.from_user or not is_admin(message.from_user.id):
        await answer(message, "No admin access.")
        return
    parts = message.text.split()
    if len(parts) != 3:
        await answer(message, "Usage: /add_balance user_id amount")
        return
    try:
        user_id = int(parts[1])
        amount = int(parts[2])
        new_balance = db.change_balance(user_id, amount, admin_id=message.from_user.id, comment=f"Bot admin {message.from_user.id}")
    except Exception as error:
        await answer(message, str(error))
        return
    await answer(message, f"Done. New balance: {new_balance}. Storage: Supabase")


@router.message(Command("users"))
async def users_command(message: Message):
    if not message.from_user or not is_admin(message.from_user.id):
        await answer(message, "No admin access.")
        return
    await answer(message, users_text())


@router.message(Command("sync"))
async def sync_command(message: Message):
    if not message.from_user or not is_admin(message.from_user.id):
        await answer(message, "No admin access.")
        return
    await answer(message, "Supabase works directly. GitHub sync is not needed.")


@router.message()
async def text_handler(message: Message):
    if message.from_user and db.enabled():
        db.upsert_user(message.from_user)
        if message.chat.type != "private":
            db.save_chat(message.chat)
    if not message.from_user or not is_admin(message.from_user.id):
        return
    state = ADMIN_STATES.get(message.from_user.id)
    if not state:
        return
    parts = message.text.split()
    if len(parts) != 2:
        await answer(message, "Send: user_id amount")
        return
    try:
        user_id = int(parts[0])
        amount = int(parts[1])
        if amount <= 0:
            raise ValueError("Amount must be greater than 0")
        real_amount = amount if state == "add" else -amount
        new_balance = db.change_balance(user_id, real_amount, admin_id=message.from_user.id, comment=f"Bot admin {message.from_user.id}")
    except Exception as error:
        await answer(message, str(error))
        return
    ADMIN_STATES.pop(message.from_user.id, None)
    await answer(message, f"Done. Change: {real_amount}. New balance: {new_balance}. Storage: Supabase", reply_markup=admin_keyboard())


@router.callback_query(F.data == "menu")
async def menu_callback(callback: CallbackQuery):
    await callback.message.edit_text("Menu", reply_markup=main_menu(callback.from_user.id))
    await callback.answer()


@router.callback_query(F.data == "balance")
async def balance_callback(callback: CallbackQuery):
    if db.enabled():
        db.upsert_user(callback.from_user)
    await callback.message.edit_text(f"Balance: {db.get_balance(callback.from_user.id) if db.enabled() else 0}", reply_markup=main_menu(callback.from_user.id))
    await callback.answer()


@router.callback_query(F.data == "help")
async def help_callback(callback: CallbackQuery):
    await callback.message.edit_text("/admin - admin panel\n/users - users\n/add_balance user_id amount", reply_markup=main_menu(callback.from_user.id))
    await callback.answer()


@router.callback_query(F.data == "admin")
async def admin_callback(callback: CallbackQuery):
    if not is_admin(callback.from_user.id):
        await callback.answer("No admin access.", show_alert=True)
        return
    await callback.message.edit_text("Admin", reply_markup=admin_keyboard())
    await callback.answer()


@router.callback_query(F.data == "admin_users")
async def admin_users_callback(callback: CallbackQuery):
    if not is_admin(callback.from_user.id):
        await callback.answer("No admin access.", show_alert=True)
        return
    await callback.message.edit_text(users_text(), reply_markup=admin_keyboard())
    await callback.answer()


@router.callback_query(F.data == "admin_stats")
async def admin_stats_callback(callback: CallbackQuery):
    if not is_admin(callback.from_user.id):
        await callback.answer("No admin access.", show_alert=True)
        return
    await callback.message.edit_text(stats_text(), reply_markup=admin_keyboard())
    await callback.answer()


@router.callback_query(F.data == "admin_transactions")
async def admin_transactions_callback(callback: CallbackQuery):
    if not is_admin(callback.from_user.id):
        await callback.answer("No admin access.", show_alert=True)
        return
    await callback.message.edit_text(transactions_text(), reply_markup=admin_keyboard())
    await callback.answer()


@router.callback_query(F.data == "admin_add_balance")
async def admin_add_callback(callback: CallbackQuery):
    if not is_admin(callback.from_user.id):
        await callback.answer("No admin access.", show_alert=True)
        return
    ADMIN_STATES[callback.from_user.id] = "add"
    await callback.message.edit_text("Send: user_id amount", reply_markup=admin_keyboard())
    await callback.answer()


@router.callback_query(F.data == "admin_remove_balance")
async def admin_remove_callback(callback: CallbackQuery):
    if not is_admin(callback.from_user.id):
        await callback.answer("No admin access.", show_alert=True)
        return
    ADMIN_STATES[callback.from_user.id] = "remove"
    await callback.message.edit_text("Send: user_id amount", reply_markup=admin_keyboard())
    await callback.answer()


async def main():
    token = os.getenv("BOT_TOKEN")
    if not token:
        raise RuntimeError("BOT_TOKEN is missing")
    if not db.enabled():
        raise RuntimeError("Supabase is not configured")
    print("Supabase storage enabled")
    bot = Bot(token=token)
    dp = Dispatcher()
    dp.include_router(router)
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())

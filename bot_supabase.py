import asyncio
import os
from datetime import datetime, timedelta
from html import escape

from aiogram import Bot, Dispatcher, F, Router
from aiogram.filters import Command, CommandStart
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    MenuButtonWebApp,
    Message,
    WebAppInfo,
)

import supabase_storage as db

BOT_USERNAME = os.getenv("BOT_USERNAME", "bk8_shop_bot")
MINI_APP_RELEASE = os.getenv("MINI_APP_RELEASE", "20260718-profile2")
MINI_APP_URL = os.getenv(
    "MINI_APP_URL",
    f"https://katan2z.github.io/telegram-balance-shop-bot/?v={MINI_APP_RELEASE}",
)
ROOT_ADMINS = {818748106, 747818163, 5311640125}
ADMIN_STATES = {}
TASK_NOTIFY_CHAT_TITLE = os.getenv("TASK_NOTIFY_CHAT_TITLE", "Администрация нбучей бутербродной")
TASK_NOTIFY_SETTING_KEY = "task_notify_chat_id"
MOSCOW_OFFSET = timedelta(hours=3)
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


def moscow_now():
    return datetime.utcnow() + MOSCOW_OFFSET


def previous_month_key_for(dt: datetime) -> str:
    first_day = dt.replace(day=1)
    previous = first_day - timedelta(days=1)
    return previous.strftime("%Y-%m")


def should_run_monthly_reset(dt: datetime | None = None) -> bool:
    local = dt or moscow_now()
    return local.day == 1


def safe_coin_sync(user_id: int) -> dict:
    """Give coins for each completed 5-spasibki step, but keep spasibki balance unchanged."""
    try:
        rows = db.request("GET", f"users?telegram_id=eq.{int(user_id)}&select=balance,coins,coin_checkpoint&limit=1") or []
        if not rows:
            return {"balance": 0, "coins": 0, "added_coins": 0, "coin_checkpoint": 0}
        row = rows[0]
        balance = int(row.get("balance", 0) or 0)
        coins = int(row.get("coins", 0) or 0)
        checkpoint = int(row.get("coin_checkpoint", 0) or 0)
        new_checkpoint = balance // 5
        added = max(0, new_checkpoint - checkpoint)
        if added > 0:
            coins += added
            db.request(
                "PATCH",
                f"users?telegram_id=eq.{int(user_id)}",
                headers=db.headers("return=minimal"),
                json={"coins": coins, "coin_checkpoint": new_checkpoint, "updated_at": db.now()},
            )
        return {"balance": balance, "coins": coins, "added_coins": added, "coin_checkpoint": max(checkpoint, new_checkpoint)}
    except Exception as error:
        print(f"Coin sync skipped: {error}")
        try:
            return {"balance": db.get_balance(int(user_id)), "coins": 0, "added_coins": 0, "coin_checkpoint": 0}
        except Exception:
            return {"balance": 0, "coins": 0, "added_coins": 0, "coin_checkpoint": 0}


def safe_monthly_reset(month_key: str) -> dict:
    """At the start of a new month burn current spasibki only; coins stay untouched."""
    if db.monthly_conversion_exists(month_key):
        return {"ok": False, "already_done": True, "month_key": month_key}
    users = db.request("GET", "users?select=telegram_id,balance,coins,coin_checkpoint") or []
    total_spasibki = 0
    total_burned = 0
    converted_users = 0
    for user in users:
        user_id = int(user["telegram_id"])
        balance = int(user.get("balance", 0) or 0)
        if balance > 0:
            converted_users += 1
            total_spasibki += balance
            total_burned += balance
        db.request(
            "PATCH",
            f"users?telegram_id=eq.{user_id}",
            headers=db.headers("return=minimal"),
            json={"balance": 0, "coin_checkpoint": 0, "updated_at": db.now()},
        )
    payload = {
        "month_key": month_key,
        "converted_users": converted_users,
        "total_spasibki": total_spasibki,
        "total_coins": 0,
        "total_burned": total_burned,
        "created_at": db.now(),
    }
    db.request("POST", "monthly_conversions", headers=db.headers("return=minimal"), json=payload)
    return {"ok": True, "already_done": False, **payload}


# Protect old storage logic: coins are awarded, but spasibki are not reduced.
db.auto_convert_user_balance = safe_coin_sync
db.run_monthly_coin_conversion = safe_monthly_reset


def conversion_text(result: dict) -> str:
    if result.get("already_done"):
        return f"🔥 Остатки спасибок за {result.get('month_key')} уже были обнулены."
    return (
        f"🔥 Остатки спасибок за {result.get('month_key')} обнулены\n\n"
        f"Сотрудников с остатком: {result.get('converted_users', 0)}\n"
        f"Сгорело спасибок: {result.get('total_burned', 0)}\n"
        "Монетки сохранены и не списывались."
    )


def main_menu(user_id=None):
    rows = [
        [InlineKeyboardButton(text="🚀 Открыть приложение", url=bot_url())],
        [InlineKeyboardButton(text="💰 Баланс", callback_data="balance")],
        [InlineKeyboardButton(text="ℹ️ Помощь", callback_data="help")],
    ]
    if user_id and is_admin(user_id):
        rows.append([InlineKeyboardButton(text="👑 Админка", callback_data="admin")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def admin_keyboard():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="👥 Пользователи", callback_data="admin_users")],
        [InlineKeyboardButton(text="💰 Начислить спасибки", callback_data="admin_add_balance")],
        [InlineKeyboardButton(text="➖ Списать спасибки", callback_data="admin_remove_balance")],
        [InlineKeyboardButton(text="📊 Статистика", callback_data="admin_stats")],
        [InlineKeyboardButton(text="🧾 Последние операции", callback_data="admin_transactions")],
        [InlineKeyboardButton(text="⬅️ Назад", callback_data="menu")],
    ])


def done_keyboard():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="↩️ Вернуться в бота", url=bot_url())],
        [InlineKeyboardButton(text="👑 Админка", callback_data="admin")],
    ])


def name_for(user_id):
    try:
        return db.get_user_name(int(user_id))
    except Exception:
        return "Сотрудник"


def format_task_due(value):
    if not value:
        return "без срока"
    text = str(value).replace("T", " ").replace("Z", "")
    return text[:16]


def task_notify_text(task: dict) -> str:
    title = escape(str(task.get("title") or "Без названия"))
    description = escape(str(task.get("description") or "").strip())
    assignee = escape(name_for(task.get("assigned_to"))) if task.get("assigned_to") else "Не назначен"
    creator = escape(name_for(task.get("created_by"))) if task.get("created_by") else "Неизвестно"
    due = escape(format_task_due(task.get("due_at")))
    lines = ["🧩 <b>Новая задача</b>", "", f"<b>{title}</b>"]
    if description:
        lines.extend(["", description])
    lines.extend(["", f"👤 Ответственный: <b>{assignee}</b>", f"🕒 Срок: <b>{due}</b>", f"✍️ Создал: <b>{creator}</b>", "", "Открой Mini App → Задачи"])
    return "\n".join(lines)


def users_text(limit=25):
    users = db.list_users() if db.enabled() else []
    if not users:
        return "Пользователей пока нет."
    lines = [f"Пользователей: {len(users)}", ""]
    for user in users[:limit]:
        username = user.get("username")
        nick = f"@{username}" if username else "без username"
        lines.append(f"{user.get('telegram_id')} | {user.get('first_name') or 'Без имени'} | {nick} | спасибки: {user.get('balance', 0)} | монетки: {user.get('coins', 0)}")
    return "\n".join(lines)


def stats_text():
    stats = db.get_stats() if db.enabled() else {"users_count": 0, "chats_count": 0, "transactions_count": 0, "total_balance": 0, "total_coins": 0}
    return (
        "📊 Статистика\n\n"
        f"Хранилище: Supabase\n"
        f"Пользователей: {stats['users_count']}\n"
        f"Чатов: {stats['chats_count']}\n"
        f"Операций: {stats['transactions_count']}\n"
        f"Спасибок у команды: {stats['total_balance']}\n"
        f"Монеток у команды: {stats.get('total_coins', 0)}\n"
        f"Менеджеров: {len(db.manager_ids()) if db.enabled() else 0}"
    )


def transactions_text(limit=10):
    rows = db.list_transactions(limit) if db.enabled() else []
    if not rows:
        return "Операций пока нет."
    lines = ["🧾 Последние операции", ""]
    for item in rows:
        lines.append(f"user_id: {item.get('user_id')}\nсумма: {item.get('amount')}\nкомментарий: {item.get('comment') or ''}\n")
    return "\n".join(lines)


async def answer(message, text, **kwargs):
    try:
        await message.answer(text, **kwargs)
    except Exception as error:
        print(f"Telegram answer error: {error}")


def get_task_notify_chat_id():
    saved = db.get_setting(TASK_NOTIFY_SETTING_KEY)
    if saved and saved.lstrip("-").isdigit():
        return int(saved)
    chat = db.find_chat_by_title(TASK_NOTIFY_CHAT_TITLE)
    if chat:
        return int(chat["chat_id"])
    return None


async def notify_new_tasks_loop(bot: Bot):
    await asyncio.sleep(5)
    while True:
        try:
            chat_id = get_task_notify_chat_id()
            if not chat_id:
                print("Task notify chat is not configured. Use /uved in target chat.")
                await asyncio.sleep(60)
                continue
            for task in db.list_unnotified_admin_tasks(limit=10):
                try:
                    await bot.send_message(chat_id, task_notify_text(task), parse_mode="HTML")
                    db.mark_admin_task_notified(int(task["id"]))
                except Exception as error:
                    print(f"Task notification send error: {error}")
            await asyncio.sleep(15)
        except Exception as error:
            print(f"Task notification loop error: {error}")
            await asyncio.sleep(30)


async def monthly_reset_loop(bot: Bot):
    await asyncio.sleep(10)
    while True:
        try:
            local = moscow_now()
            month_key = previous_month_key_for(local)
            if should_run_monthly_reset(local) and not db.monthly_conversion_exists(month_key):
                result = db.run_monthly_coin_conversion(month_key)
                chat_id = get_task_notify_chat_id()
                if chat_id:
                    await bot.send_message(chat_id, conversion_text(result))
            await asyncio.sleep(60)
        except Exception as error:
            print(f"Monthly reset loop error: {error}")
            await asyncio.sleep(60)


async def handle_payload(message, payload):
    if payload == "app":
        await answer(message, "Нажми кнопку меню «Спасибки» рядом с полем ввода, чтобы открыть Mini App.", reply_markup=main_menu(message.from_user.id if message.from_user else None))
        return True
    if payload.startswith("manager_"):
        if not message.from_user or message.from_user.id not in root_admin_ids():
            await answer(message, "⛔ Управлять менеджерами может только главный админ.")
            return True
        parts = payload.split("_")
        if len(parts) != 3 or parts[1] not in {"add", "remove"}:
            await answer(message, "Неверная команда менеджеров.")
            return True
        target = int(parts[2])
        if parts[1] == "add":
            db.add_manager(target, created_by=message.from_user.id)
            await answer(message, f"✅ Менеджер добавлен\nСотрудник: {name_for(target)}\nID: {target}", reply_markup=done_keyboard())
        else:
            if target in root_admin_ids():
                await answer(message, "Главного админа нельзя убрать.")
                return True
            db.remove_manager(target)
            await answer(message, f"✅ Менеджер убран\nСотрудник: {name_for(target)}\nID: {target}", reply_markup=done_keyboard())
        return True
    if payload.startswith("admin_"):
        if not message.from_user or not is_admin(message.from_user.id):
            await answer(message, "⛔ Нет доступа к админке.")
            return True
        try:
            _, target, amount_text = payload.split("_", 2)
            target_id = int(target)
            amount = int(amount_text)
            new_balance = db.change_balance(target_id, amount, admin_id=message.from_user.id, comment=f"Mini App admin {message.from_user.id}")
            coin_result = safe_coin_sync(target_id)
        except Exception as error:
            await answer(message, str(error))
            return True
        action = "начислено" if amount > 0 else "списано"
        coin_line = f"\n🪙 Добавлено монеток: {coin_result.get('added_coins', 0)}" if coin_result.get("added_coins", 0) else ""
        await answer(message, f"✅ Готово\nСотрудник: {name_for(target_id)}\n{action.capitalize()}: {abs(amount)}\nСпасибки: {new_balance}\nМонетки: {coin_result.get('coins', 0)}{coin_line}\nХранилище: Supabase", reply_markup=done_keyboard())
        return True
    return False


@router.message(CommandStart())
async def start_handler(message: Message):
    args = message.text.split(maxsplit=1)
    if len(args) > 1 and await handle_payload(message, args[1].strip()):
        return
    await answer(message, "Привет! Открой Mini App через кнопку меню «Спасибки».", reply_markup=main_menu(message.from_user.id if message.from_user else None))


@router.message(Command("app"))
async def app_handler(message: Message):
    await answer(message, "Открой личный чат с ботом и нажми кнопку меню «Спасибки».", reply_markup=InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="Открыть бота", url=bot_url())]]))


@router.message(Command("uved"))
async def uved_command(message: Message):
    if message.chat.type == "private":
        await answer(message, "Эту команду нужно отправить в беседе, куда должны приходить уведомления о задачах.")
        return
    if not message.from_user or not is_admin(message.from_user.id):
        await answer(message, "⛔ Команда доступна только админам и менеджерам.")
        return
    if db.enabled():
        db.save_chat(message.chat)
        db.set_setting(TASK_NOTIFY_SETTING_KEY, str(message.chat.id))
    await answer(message, f"✅ Уведомления о новых задачах будут приходить в эту беседу.\nЧат: {message.chat.title or message.chat.id}")


@router.message(Command("admin"))
async def admin_command(message: Message):
    if not message.from_user or not is_admin(message.from_user.id):
        await answer(message, "⛔ Нет доступа к админке.")
        return
    await answer(message, "👑 Админка", reply_markup=admin_keyboard())


@router.message(Command("add_balance"))
async def add_balance_command(message: Message):
    if not message.from_user or not is_admin(message.from_user.id):
        await answer(message, "⛔ Нет доступа к админке.")
        return
    parts = message.text.split()
    if len(parts) != 3:
        await answer(message, "Использование: /add_balance user_id сумма")
        return
    try:
        user_id = int(parts[1])
        amount = int(parts[2])
        new_balance = db.change_balance(user_id, amount, admin_id=message.from_user.id, comment=f"Bot admin {message.from_user.id}")
        coin_result = safe_coin_sync(user_id)
    except Exception as error:
        await answer(message, str(error))
        return
    coin_line = f" Добавлено монеток: {coin_result.get('added_coins', 0)}." if coin_result.get("added_coins", 0) else ""
    await answer(message, f"✅ Готово. Спасибки: {new_balance}. Монетки: {coin_result.get('coins', 0)}.{coin_line} Хранилище: Supabase")


@router.message(Command("reset_month"))
async def reset_month_command(message: Message):
    if not message.from_user or message.from_user.id not in root_admin_ids():
        await answer(message, "⛔ Обнулять месяц может только главный админ.")
        return
    month_key = previous_month_key_for(moscow_now())
    result = db.run_monthly_coin_conversion(month_key)
    await answer(message, conversion_text(result))


@router.message(Command("users"))
async def users_command(message: Message):
    if not message.from_user or not is_admin(message.from_user.id):
        await answer(message, "⛔ Нет доступа к админке.")
        return
    await answer(message, users_text())


@router.message(Command("sync"))
async def sync_command(message: Message):
    if not message.from_user or not is_admin(message.from_user.id):
        await answer(message, "⛔ Нет доступа к админке.")
        return
    await answer(message, "✅ Supabase работает напрямую. Синхронизация GitHub больше не нужна.")


@router.message()
async def text_handler(message: Message):
    if not message.from_user or not is_admin(message.from_user.id):
        return
    state = ADMIN_STATES.get(message.from_user.id)
    if not state:
        return
    parts = message.text.split()
    if len(parts) != 2:
        await answer(message, "Отправь так: user_id сумма")
        return
    try:
        user_id = int(parts[0])
        amount = int(parts[1])
        if amount <= 0:
            raise ValueError("Сумма должна быть больше 0")
        real_amount = amount if state == "add" else -amount
        new_balance = db.change_balance(user_id, real_amount, admin_id=message.from_user.id, comment=f"Bot admin {message.from_user.id}")
        coin_result = safe_coin_sync(user_id)
    except Exception as error:
        await answer(message, str(error))
        return
    ADMIN_STATES.pop(message.from_user.id, None)
    coin_line = f" Добавлено монеток: {coin_result.get('added_coins', 0)}." if coin_result.get("added_coins", 0) else ""
    await answer(message, f"✅ Готово. Изменение: {real_amount}. Спасибки: {new_balance}. Монетки: {coin_result.get('coins', 0)}.{coin_line} Хранилище: Supabase", reply_markup=admin_keyboard())


@router.callback_query(F.data == "menu")
async def menu_callback(callback: CallbackQuery):
    await callback.message.edit_text("Меню", reply_markup=main_menu(callback.from_user.id))
    await callback.answer()


@router.callback_query(F.data == "balance")
async def balance_callback(callback: CallbackQuery):
    balance = db.get_balance(callback.from_user.id) if db.enabled() else 0
    await callback.message.edit_text(f"Спасибки: {balance}", reply_markup=main_menu(callback.from_user.id))
    await callback.answer()


@router.callback_query(F.data == "help")
async def help_callback(callback: CallbackQuery):
    await callback.message.edit_text(
        "/admin — админка\n"
        "/users — пользователи\n"
        "/add_balance user_id сумма — начислить спасибки\n"
        "/uved — включить уведомления о задачах в текущей беседе\n"
        "/reset_month — вручную обнулить спасибки за месяц",
        reply_markup=main_menu(callback.from_user.id),
    )
    await callback.answer()


@router.callback_query(F.data == "admin")
async def admin_callback(callback: CallbackQuery):
    if not is_admin(callback.from_user.id):
        await callback.answer("⛔ Нет доступа к админке.", show_alert=True)
        return
    await callback.message.edit_text("👑 Админка", reply_markup=admin_keyboard())
    await callback.answer()


@router.callback_query(F.data == "admin_users")
async def admin_users_callback(callback: CallbackQuery):
    if not is_admin(callback.from_user.id):
        await callback.answer("⛔ Нет доступа к админке.", show_alert=True)
        return
    await callback.message.edit_text(users_text(), reply_markup=admin_keyboard())
    await callback.answer()


@router.callback_query(F.data == "admin_stats")
async def admin_stats_callback(callback: CallbackQuery):
    if not is_admin(callback.from_user.id):
        await callback.answer("⛔ Нет доступа к админке.", show_alert=True)
        return
    await callback.message.edit_text(stats_text(), reply_markup=admin_keyboard())
    await callback.answer()


@router.callback_query(F.data == "admin_transactions")
async def admin_transactions_callback(callback: CallbackQuery):
    if not is_admin(callback.from_user.id):
        await callback.answer("⛔ Нет доступа к админке.", show_alert=True)
        return
    await callback.message.edit_text(transactions_text(), reply_markup=admin_keyboard())
    await callback.answer()


@router.callback_query(F.data == "admin_add_balance")
async def admin_add_callback(callback: CallbackQuery):
    if not is_admin(callback.from_user.id):
        await callback.answer("⛔ Нет доступа к админке.", show_alert=True)
        return
    ADMIN_STATES[callback.from_user.id] = "add"
    await callback.message.edit_text("Отправь так: user_id сумма", reply_markup=admin_keyboard())
    await callback.answer()


@router.callback_query(F.data == "admin_remove_balance")
async def admin_remove_callback(callback: CallbackQuery):
    if not is_admin(callback.from_user.id):
        await callback.answer("⛔ Нет доступа к админке.", show_alert=True)
        return
    ADMIN_STATES[callback.from_user.id] = "remove"
    await callback.message.edit_text("Отправь так: user_id сумма", reply_markup=admin_keyboard())
    await callback.answer()


async def main():
    token = os.getenv("BOT_TOKEN")
    if not token:
        raise RuntimeError("BOT_TOKEN не указан")
    if not db.enabled():
        raise RuntimeError("Supabase не настроен")
    print("Supabase storage enabled")
    bot = Bot(token=token)
    await bot.set_chat_menu_button(
        menu_button=MenuButtonWebApp(
            text="Спасибки",
            web_app=WebAppInfo(url=MINI_APP_URL),
        )
    )
    print(f"Mini App menu updated: {MINI_APP_URL}")
    dp = Dispatcher()
    dp.include_router(router)
    asyncio.create_task(notify_new_tasks_loop(bot))
    asyncio.create_task(monthly_reset_loop(bot))
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())

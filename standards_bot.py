import asyncio
import html
import secrets
import time

from aiogram import F, Router
from aiogram.filters import Command, CommandObject
from aiogram.types import BufferedInputFile, InlineKeyboardButton, InlineKeyboardMarkup

import bot_supabase as app
from standards_library import search, render_page

router = Router()
pending = {}
busy = set()
last_search = {}


def allowed(user_id):
    if app.is_admin(user_id):
        return True
    return bool(app.db.request('GET', f'employee_profiles?telegram_id=eq.{int(user_id)}&activation_status=eq.active&select=id&limit=1'))


async def send_page(message, row):
    photo = await asyncio.to_thread(render_page, row['document'], row['page'])
    caption = html.escape(f"{row['document']}\nСтраница {row['page'] + 1}")[:950]
    await message.answer_photo(BufferedInputFile(photo, filename='standard.jpg'), caption=caption)


@router.message(Command('al'))
async def alert_command(message, command: CommandObject):
    if not message.from_user:
        return
    owner = message.from_user.id
    if owner in busy:
        await message.answer('Предыдущий запрос ещё обрабатывается.')
        return
    if time.monotonic() - last_search.get(owner, -100) < 3:
        return
    query = (command.args or '').strip()
    if not query:
        await message.answer('Напиши: /al ключевое слово\nНапример: /al фритюр')
        return
    busy.add(owner)
    last_search[owner] = time.monotonic()
    try:
        if not await asyncio.to_thread(allowed, owner):
            await message.answer('Поиск стандартов доступен активированным сотрудникам.')
            return
        rows = await asyncio.to_thread(search, query)
        if not rows:
            await message.answer('Совпадений нет. Попробуй другое слово или более короткую фразу.')
            return
        if len(rows) == 1:
            await send_page(message, rows[0])
            return
        now = time.monotonic()
        for token in list(pending):
            if pending[token]['expires'] < now:
                del pending[token]
        if len(pending) >= 100:
            del pending[next(iter(pending))]
        token = secrets.token_hex(8)
        pending[token] = {'owner': owner, 'chat': message.chat.id, 'rows': rows, 'expires': now + 600}
        buttons = [[InlineKeyboardButton(text=f"{row.get('category') or row['title'][:45]} · стр. {row['page'] + 1} · {row['title'][:30]}", callback_data=f'al:{token}:{index}')] for index, row in enumerate(rows)]
        await message.answer('Сначала — хранение, температура и подготовка продукта, затем остальные совпадения. Выбери страницу или уточни запрос.', reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons))
    except (ValueError, FileNotFoundError) as error:
        await message.answer(html.escape(str(error)))
    except Exception:
        await message.answer('Не удалось найти стандарт. Попробуй позже.')
    finally:
        busy.discard(owner)


@router.callback_query(F.data.startswith('al:'))
async def alert_page(callback):
    parts = callback.data.split(':')
    item = pending.get(parts[1]) if len(parts) == 3 else None
    if not item or item['expires'] < time.monotonic():
        await callback.answer('Поиск устарел. Отправь /al заново.', show_alert=True)
        return
    if not callback.message or callback.from_user.id != item['owner'] or callback.message.chat.id != item['chat']:
        await callback.answer('Это результаты другого сотрудника.', show_alert=True)
        return
    try:
        index = int(parts[2])
        if not 0 <= index < len(item['rows']):
            raise ValueError()
    except ValueError:
        await callback.answer('Страница не найдена.')
        return
    owner = callback.from_user.id
    if owner in busy:
        await callback.answer('Страница уже загружается.')
        return
    busy.add(owner)
    await callback.answer('Готовлю изображение…')
    try:
        if await asyncio.to_thread(allowed, owner):
            await send_page(callback.message, item['rows'][index])
        else:
            await callback.message.answer('Рабочий доступ отсутствует.')
    except Exception:
        await callback.message.answer('Не удалось отправить страницу. Попробуй ещё раз.')
    finally:
        busy.discard(owner)

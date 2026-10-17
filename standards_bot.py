import asyncio
import html
import secrets
import time

from aiogram import F, Router
from aiogram.filters import Command, CommandObject
from aiogram.types import BufferedInputFile, InlineKeyboardButton, InlineKeyboardMarkup, InputMediaPhoto

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


async def send_page(message, row, caption=None, keyboard=None, edit=False):
    photo = await asyncio.to_thread(render_page, row['document'], row['page'])
    caption = html.escape((caption or f"{row['document']}\nСтраница {row['page'] + 1}")[:950])
    file = BufferedInputFile(photo, filename='standard.jpg')
    if edit:
        await message.edit_media(InputMediaPhoto(media=file, caption=caption, parse_mode='HTML'), reply_markup=keyboard)
    else:
        await message.answer_photo(file, caption=caption, parse_mode='HTML', reply_markup=keyboard)


def group_indices(item, mode):
    rows = item['rows']
    if mode == 's':
        return [i for i, row in enumerate(rows) if row.get('category') == 'Хранение/температура']
    if mode == 'p':
        return [i for i, row in enumerate(rows) if 'приготовление ингредиентов' in row['document'].casefold()]
    if mode == 'r':
        return [i for i, row in enumerate(rows) if 'позиции в меню' in row['document'].casefold()]
    return [i for i, row in enumerate(rows) if 'позиции в меню' not in row['document'].casefold()]


async def show_result(message, item, token, mode='n', offset=0, edit=False):
    indices = group_indices(item, mode)
    if not indices or not 0 <= offset < len(indices):
        raise ValueError('В этом разделе больше нет страниц.')
    row = item['rows'][indices[offset]]
    buttons = []
    switches = []
    for code, label in [('s', '🌡 Хранение'), ('p', '🥬 Подготовка'), ('r', '🍔 Рецептуры')]:
        if group_indices(item, code):
            switches.append(InlineKeyboardButton(text=('✓ ' if code == mode else '') + label, callback_data=f'al:{token}:{code}0'))
    if switches:
        buttons.append(switches)
    arrows = []
    if offset:
        arrows.append(InlineKeyboardButton(text='← Назад', callback_data=f'al:{token}:{mode}{offset-1}'))
    if offset + 1 < len(indices):
        arrows.append(InlineKeyboardButton(text='Далее →', callback_data=f'al:{token}:{mode}{offset+1}'))
    if arrows:
        buttons.append(arrows)
    if group_indices(item, 'n'):
        buttons.append([InlineKeyboardButton(text='📚 Другие страницы', callback_data=f'al:{token}:n0')])
    section = {'s': 'Хранение и температура', 'p': 'Подготовка продукта', 'r': 'Рецептуры', 'n': 'Информация о продукте'}[mode]
    caption = f"🔎 {item['query']}\n{section} · {offset+1} из {len(indices)}\n\n📖 {row['document']}\nСтраница {row['page']+1}"
    await send_page(message, row, caption=caption, keyboard=InlineKeyboardMarkup(inline_keyboard=buttons) if buttons else None, edit=edit)
    item['current'] = (mode, offset)


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
        rows = await asyncio.to_thread(search, query, limit=100)
        if not rows:
            await message.answer('Совпадений нет. Попробуй другое слово или более короткую фразу.')
            return
        now = time.monotonic()
        for token in list(pending):
            if pending[token]['expires'] < now:
                del pending[token]
        if len(pending) >= 100:
            del pending[next(iter(pending))]
        token = secrets.token_hex(8)
        item = {'owner': owner, 'chat': message.chat.id, 'rows': rows, 'query': query, 'expires': now + 600}
        pending[token] = item
        mode = 'n' if group_indices(item, 'n') else 'r'
        if rows[0].get('category') == 'Хранение/температура':
            mode = 's'
        await show_result(message, item, token, mode)
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
        mode, offset = parts[2][:1], int(parts[2][1:])
        if mode not in {'n', 's', 'p', 'r'} or not 0 <= offset < len(group_indices(item, mode)):
            raise ValueError()
    except ValueError:
        await callback.answer('Страница не найдена.')
        return
    if item.get('current') == (mode, offset):
        await callback.answer('Эта страница уже открыта.')
        return
    owner = callback.from_user.id
    if owner in busy:
        await callback.answer('Страница уже загружается.')
        return
    busy.add(owner)
    await callback.answer('Готовлю изображение…')
    try:
        if await asyncio.to_thread(allowed, owner):
            await show_result(callback.message, item, parts[1], mode, offset, edit=True)
        else:
            await callback.message.answer('Рабочий доступ отсутствует.')
    except Exception:
        await callback.message.answer('Не удалось отправить страницу. Попробуй ещё раз.')
    finally:
        busy.discard(owner)

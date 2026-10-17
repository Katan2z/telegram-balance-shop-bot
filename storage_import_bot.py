import asyncio
import html
import logging
import secrets
import tempfile
import time
import uuid
from pathlib import Path

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import BufferedInputFile, InlineKeyboardButton, InlineKeyboardMarkup

from storage_catalog import OWNER_ID, load_catalog, publish_catalog, preview_text
from storage_catalog_import import parse_storage, merge_catalog

router = Router()
awaiting = {}
pending = {}
busy = set()
log = logging.getLogger(__name__)


def cleanup():
    now = time.monotonic()
    for collection in (awaiting, pending):
        for key in list(collection):
            if collection[key]['expires'] < now:
                del collection[key]


@router.message(Command('sl'))
async def storage_command(message):
    if not message.from_user or message.from_user.id != OWNER_ID:
        await message.answer('Обновлять сроки может только главный администратор.')
        return
    if message.chat.type != 'private':
        await message.answer('Отправь /sl в личную переписку с ботом.')
        return
    if OWNER_ID in busy:
        await message.answer('Обновление уже обрабатывается. Дождись результата.')
        return
    cleanup()
    awaiting[OWNER_ID] = {'chat': message.chat.id, 'expires': time.monotonic() + 900}
    pending.clear()
    await message.answer('Прикрепи Excel .xlsx со сроками хранения (до 10 МБ).\nСначала покажу изменения. Без кнопки «Применить» ничего не сохранится.\nОжидание файла — 15 минут.')


def expects_document(message):
    cleanup()
    return bool(message.from_user and message.from_user.id == OWNER_ID and
                message.chat.type == 'private' and awaiting.get(OWNER_ID, {}).get('chat') == message.chat.id)


@router.message(F.document, expects_document)
async def storage_document(message, bot):
    if not expects_document(message):
        return
    if OWNER_ID in busy:
        await message.answer('Файл уже обрабатывается. Подожди немного.')
        return
    document = message.document
    source = Path((document.file_name or '').replace('\\', '/')).name[:255]
    if Path(source).suffix.lower() != '.xlsx' or (document.file_size or 0) > 10_000_000:
        await message.answer('Нужен файл .xlsx размером до 10 МБ. Пришли другой файл.')
        return
    busy.add(OWNER_ID)
    try:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'storage.xlsx'
            await bot.download(document, destination=path)
            parsed = await asyncio.to_thread(parse_storage, path)
        snapshot = await asyncio.to_thread(load_catalog)
        items, changes, retained = merge_catalog(snapshot['items'], parsed['items'])
        token = secrets.token_hex(8)
        pending.clear()
        pending[token] = {'owner': OWNER_ID, 'chat': message.chat.id, 'items': items,
                          'revision': snapshot['revision'], 'source': source, 'sha256': parsed['sha256'],
                          'request_id': str(uuid.uuid4()), 'expires': time.monotonic() + 900}
        report = preview_text(changes, retained, parsed['warnings'])
        await message.answer_document(BufferedInputFile(report.encode('utf-8'), filename='storage-changes.txt'),
                                      caption='Полный список изменений и примечаний. Данные пока не изменены.')
        summary = f"Прочитано продуктов: {len(parsed['items'])}.\nНовых/изменённых: {len(changes)}.\nСохранено вне файла: {retained}.\n"
        summary += '\n'.join(parsed['warnings'])
        summary += '\n\nПроверь приложенный список. Применить эту версию? Подтверждение действует 15 минут.'
        keyboard = InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text='✅ Применить', callback_data=f'sl_apply:{token}'),
            InlineKeyboardButton(text='Отмена', callback_data=f'sl_cancel:{token}'),
        ]])
        await message.answer(html.escape(summary), reply_markup=keyboard)
        awaiting.pop(OWNER_ID, None)
    except ValueError as error:
        await message.answer(html.escape(f'Таблица не применена:\n{str(error)[:3300]}'))
    except Exception:
        log.exception('Storage import preview failed')
        await message.answer('Не удалось подготовить обновление. Текущие сроки не изменены. Если команда новая, сначала нужно применить миграцию 20261018_storage_times.sql.')
    finally:
        busy.discard(OWNER_ID)


@router.callback_query(F.data.startswith('sl_apply:') | F.data.startswith('sl_cancel:'))
async def storage_confirm(callback):
    cleanup()
    action, token = callback.data.split(':', 1)
    item = pending.get(token)
    if not item or not callback.message:
        await callback.answer('Подтверждение устарело. Начни с /sl заново.', show_alert=True)
        return
    if callback.from_user.id != OWNER_ID or callback.message.chat.id != item['chat']:
        await callback.answer('Нет доступа.', show_alert=True)
        return
    if OWNER_ID in busy:
        await callback.answer('Обновление уже обрабатывается.')
        return
    if action == 'sl_cancel':
        pending.pop(token, None)
        await callback.message.edit_reply_markup(reply_markup=None)
        await callback.answer('Отменено. Сроки не изменены.')
        return
    busy.add(OWNER_ID)
    await callback.answer('Сохраняю…')
    try:
        result = await asyncio.to_thread(publish_catalog, item)
        if not isinstance(result, dict) or not result.get('revision'):
            raise RuntimeError('No catalog revision returned')
        pending.pop(token, None)
        await callback.message.edit_reply_markup(reply_markup=None)
        await callback.message.answer('✅ Сроки обновлены. Калькулятор получит их при открытии раздела или обновлении страницы. Загруженная версия сохранена в истории.')
    except Exception as error:
        log.exception('Storage catalog publish failed')
        if 'CATALOG_CHANGED' in str(error):
            pending.pop(token, None)
            await callback.message.answer('Сроки уже изменились после предпросмотра. Отправь /sl и файл заново. Ничего не перезаписано.')
        else:
            await callback.message.answer('Сохранение не подтверждено. Можно повторить «Применить»: повторного обновления не будет.')
    finally:
        busy.discard(OWNER_ID)

"""Versioned storage-time catalog access; no writes during parsing/preview."""
import supabase_storage as db
from storage_catalog_import import baseline

OWNER_ID = 818748106


def load_catalog():
    rows = db.request('GET', 'storage_time_catalog?id=eq.true&select=revision,catalog,source,updated_at&limit=1') or []
    if not rows:
        return {'revision': None, 'items': baseline()}
    row = rows[0]
    items = row['catalog']['items']
    if not isinstance(items, list) or not items:
        raise ValueError('Сохранённый каталог повреждён.')
    return {**row, 'items': items}


def publish_catalog(pending):
    return db.request('POST', 'rpc/publish_storage_times', json={
        'p_expected_revision': pending['revision'], 'p_catalog': {'items': pending['items']},
        'p_actor_id': pending['owner'], 'p_source': pending['source'],
        'p_sha256': pending['sha256'], 'p_request_id': pending['request_id'],
    })


def preview_text(changes, retained, warnings):
    labels = {'prepRaw': 'Подготовка', 'defrostRaw': 'Разморозка', 'storageRaw': 'Хранение/место',
              'defrostType': 'Режим дефроста', 'prepLabel': 'Упаковка/маркировка', 'prepPlace': 'Место',
              'productionLabel': 'Производство', 'productionPlace': 'Место на производстве',
              'prepHours': 'Расчёт подготовки, ч', 'defrostHours': 'Расчёт разморозки, ч',
              'storageHours': 'Расчёт хранения, ч', 'productionHours': 'Расчёт производства, ч'}
    lines = [f'Изменений/новых продуктов: {len(changes)}. Продуктов вне файла сохранено: {retained}.', '']
    for change in changes:
        lines.append(('Новый: ' if change['old'] is None else 'Изменён: ') + change['name'])
        for field in change['fields']:
            before = str((change['old'] or {}).get(field) or '—')
            after = str(change['new'].get(field) or '—')
            lines.append(f"  {labels[field]}: {before} → {after}")
        lines.append('')
    if warnings:
        lines.extend(['Примечания:', *warnings])
    lines.append('Изменения ещё НЕ применены. Для сохранения нажми «Применить».')
    return '\n'.join(lines)

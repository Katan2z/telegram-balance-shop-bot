"""Bounded HTML messages and current active notification audiences."""
from html import escape


def recipients(notification, profiles):
    selected = {str(value) for value in notification.get('recipient_ids') or []}
    seen = set()
    result = []
    for profile in profiles:
        user_id = profile.get('telegram_id')
        if not user_id or profile.get('activation_status') != 'active':
            continue
        key = str(user_id)
        if key in seen or (notification.get('audience') != 'all' and key not in selected):
            continue
        seen.add(key)
        result.append(profile)
    return result


def messages(notification, profiles, limit=3800):
    chunks = []
    current = ''

    def append(piece):
        nonlocal current
        if current and len(current) + len(piece) + 1 > limit:
            chunks.append(current)
            current = ''
        current += ('\n' if current else '') + piece

    title = escape(str(notification.get('title') or 'Уведомление')[:100])
    append(f'🔔 <b>{title}</b>')
    # Escape individual characters before packing so entities are never split.
    line = ''
    for character in str(notification.get('message') or '').strip():
        encoded = escape(character)
        if len(line) + len(encoded) > limit - 300:
            append(line)
            line = ''
        line += encoded
    if line:
        append(line)
    for profile in recipients(notification, profiles):
        name = escape(str(profile.get('full_name') or 'Сотрудник')[:150])
        append(f'<a href="tg://user?id={int(profile["telegram_id"])}">{name}</a>')
    if current:
        chunks.append(current)
    return chunks

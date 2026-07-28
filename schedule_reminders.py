from datetime import date, datetime, timedelta, timezone
from html import escape


REMINDER_INTERVAL = timedelta(hours=4)


def target_week(local_now: datetime) -> str:
    days_until_next_monday = 7 - local_now.weekday()
    if local_now.weekday() > 2:
        days_until_next_monday += 7
    return (local_now.date() + timedelta(days=days_until_next_monday)).isoformat()


def reminder_is_due(last_sent: str | None, now_utc: datetime | None = None) -> bool:
    if not last_sent:
        return True
    try:
        sent_at = datetime.fromisoformat(last_sent.replace("Z", "+00:00"))
        if sent_at.tzinfo is None:
            sent_at = sent_at.replace(tzinfo=timezone.utc)
    except ValueError:
        return True
    current = now_utc or datetime.now(timezone.utc)
    return current - sent_at >= REMINDER_INTERVAL


def is_management_profile(profile: dict, root_ids: set[int], manager_ids: set[int] | None = None) -> bool:
    telegram_id = int(profile.get("telegram_id") or 0)
    position = str(profile.get("position") or "").lower()
    management_words = ("менеджер", "заместител", "управляющ", "администратор")
    return telegram_id in root_ids or telegram_id in (manager_ids or set()) or any(word in position for word in management_words)


def reminder_text(week_start: str, employees: list[dict]) -> str:
    start = date.fromisoformat(week_start)
    end = start + timedelta(days=6)
    mentions = [
        f'<a href="tg://user?id={int(employee["telegram_id"])}">{escape(str(employee.get("full_name") or "Сотрудник"))}</a>'
        for employee in employees
    ]
    return "\n".join([
        "📅 <b>Заполните временные возможности</b>",
        f"Неделя: <b>{start.strftime('%d.%m')}–{end.strftime('%d.%m')}</b>",
        "",
        *[f"• {mention}" for mention in mentions],
        "",
        "Откройте Mini App → Расписание.",
    ])

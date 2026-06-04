import os
from datetime import datetime
from typing import Any
from urllib.parse import urlparse

import requests


def normalize_supabase_url(value: str) -> str:
    raw = (value or "").strip().rstrip("/")
    if not raw:
        return ""
    parsed = urlparse(raw)
    path_parts = [part for part in parsed.path.split("/") if part]

    if parsed.netloc in {"supabase.com", "www.supabase.com"} and len(path_parts) >= 3:
        if path_parts[0] == "dashboard" and path_parts[1] == "project":
            return f"https://{path_parts[2]}.supabase.co"

    if parsed.netloc == "app.supabase.com" and len(path_parts) >= 2:
        if path_parts[0] == "project":
            return f"https://{path_parts[1]}.supabase.co"

    return raw


SUPABASE_URL = normalize_supabase_url(os.getenv("SUPABASE_URL", ""))
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY") or ""

DEFAULT_TIMEOUT = 15


class SupabaseNotConfigured(RuntimeError):
    pass


def enabled() -> bool:
    return bool(SUPABASE_URL and SUPABASE_KEY)


def now() -> str:
    return datetime.utcnow().isoformat()


def headers(prefer: str | None = None) -> dict[str, str]:
    if not enabled():
        raise SupabaseNotConfigured("Supabase is not configured")
    result = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        result["Prefer"] = prefer
    return result


def request(method: str, path: str, **kwargs) -> Any:
    if not SUPABASE_URL.endswith(".supabase.co"):
        raise RuntimeError(
            "SUPABASE_URL должен быть Project URL вида https://PROJECT_REF.supabase.co, "
            "а не ссылкой на dashboard."
        )
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    response = requests.request(method, url, headers=kwargs.pop("headers", headers()), timeout=DEFAULT_TIMEOUT, **kwargs)
    if response.status_code >= 400:
        body = response.text[:1000]
        raise RuntimeError(f"Supabase {method} {path} failed: {response.status_code} {body}")
    if response.text:
        return response.json()
    return None


def upsert_user_record(record: dict) -> dict:
    payload = {
        "telegram_id": int(record["telegram_id"]),
        "username": record.get("username"),
        "first_name": record.get("first_name"),
        "last_name": record.get("last_name"),
        "balance": int(record.get("balance", 0) or 0),
        "updated_at": record.get("updated_at") or now(),
    }
    rows = request(
        "POST",
        "users?on_conflict=telegram_id",
        headers=headers("resolution=merge-duplicates,return=representation"),
        json=payload,
    )
    return rows[0] if rows else payload


def upsert_user(user) -> dict:
    payload = {
        "telegram_id": user.id,
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "updated_at": now(),
    }
    rows = request(
        "POST",
        "users?on_conflict=telegram_id",
        headers=headers("resolution=merge-duplicates,return=representation"),
        json=payload,
    )
    return rows[0] if rows else payload


def upsert_unknown_user(user_id: int) -> None:
    payload = {
        "telegram_id": user_id,
        "updated_at": now(),
    }
    request(
        "POST",
        "users?on_conflict=telegram_id",
        headers=headers("resolution=merge-duplicates"),
        json=payload,
    )


def save_chat(chat) -> None:
    if chat.type == "private":
        return
    payload = {
        "chat_id": chat.id,
        "title": chat.title,
        "type": chat.type,
        "updated_at": now(),
    }
    request(
        "POST",
        "chats?on_conflict=chat_id",
        headers=headers("resolution=merge-duplicates"),
        json=payload,
    )


def change_balance(user_id: int, amount: int, admin_id: int | None = None, comment: str = "") -> int:
    if amount == 0:
        raise ValueError("Сумма не может быть 0")
    upsert_unknown_user(user_id)
    user_rows = request("GET", f"users?telegram_id=eq.{user_id}&select=balance")
    current_balance = int(user_rows[0].get("balance", 0)) if user_rows else 0
    if current_balance + amount < 0:
        raise ValueError("Недостаточно средств")
    payload = {
        "user_id": user_id,
        "amount": amount,
        "type": "balance_change",
        "comment": comment,
        "admin_id": admin_id,
        "created_at": now(),
    }
    request("POST", "transactions", headers=headers("return=representation"), json=payload)
    return get_balance(user_id)


def get_balance(user_id: int) -> int:
    rows = request("GET", f"users?telegram_id=eq.{user_id}&select=balance")
    return int(rows[0].get("balance", 0)) if rows else 0


def get_user_name(user_id: int) -> str:
    rows = request("GET", f"users?telegram_id=eq.{user_id}&select=first_name,username")
    if not rows:
        return "Сотрудник"
    row = rows[0]
    if row.get("first_name"):
        return str(row["first_name"])
    if row.get("username"):
        return "@" + str(row["username"])
    return "Сотрудник"


def list_users() -> list[dict]:
    return request("GET", "users?select=telegram_id,username,first_name,last_name,balance,updated_at&order=updated_at.desc") or []


def list_transactions(limit: int = 10) -> list[dict]:
    return request("GET", f"transactions?select=*&order=created_at.desc&limit={limit}") or []


def manager_ids() -> set[int]:
    try:
        rows = request("GET", "managers?select=telegram_id") or []
    except RuntimeError as error:
        print(f"Managers table unavailable: {error}")
        return set()
    return {int(row["telegram_id"]) for row in rows if row.get("telegram_id") is not None}


def add_manager(user_id: int, created_by: int | None = None) -> None:
    upsert_unknown_user(user_id)
    payload = {"telegram_id": user_id, "created_by": created_by, "created_at": now()}
    request(
        "POST",
        "managers?on_conflict=telegram_id",
        headers=headers("resolution=merge-duplicates"),
        json=payload,
    )


def remove_manager(user_id: int) -> None:
    request("DELETE", f"managers?telegram_id=eq.{user_id}")


def list_managers() -> list[dict]:
    try:
        return request("GET", "managers?select=telegram_id,created_by,created_at&order=created_at.desc") or []
    except RuntimeError as error:
        print(f"Managers table unavailable: {error}")
        return []


def get_stats() -> dict:
    users = request("GET", "users?select=telegram_id,balance") or []
    transactions = request("GET", "transactions?select=id") or []
    chats = request("GET", "chats?select=chat_id") or []
    return {
        "users_count": len(users),
        "transactions_count": len(transactions),
        "chats_count": len(chats),
        "total_balance": sum(int(user.get("balance", 0) or 0) for user in users),
    }

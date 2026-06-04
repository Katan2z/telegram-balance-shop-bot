import os
from datetime import datetime
from typing import Any

import requests

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
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
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    response = requests.request(method, url, headers=kwargs.pop("headers", headers()), timeout=DEFAULT_TIMEOUT, **kwargs)
    if response.status_code >= 400:
        raise RuntimeError(f"Supabase {method} {path} failed: {response.status_code} {response.text}")
    if response.text:
        return response.json()
    return None


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


def add_transaction(user_id: int, amount: int, admin_id: int | None = None, comment: str = "") -> int:
    upsert_unknown_user(user_id)
    payload = {
        "user_id": user_id,
        "amount": amount,
        "type": "balance_change",
        "comment": comment,
        "admin_id": admin_id,
        "created_at": now(),
    }
    rows = request(
        "POST",
        "transactions",
        headers=headers("return=representation"),
        json=payload,
    )
    user_rows = request("GET", f"users?telegram_id=eq.{user_id}&select=balance")
    return int(user_rows[0].get("balance", 0)) if user_rows else 0


def change_balance(user_id: int, amount: int, admin_id: int | None = None, comment: str = "") -> int:
    if amount == 0:
        raise ValueError("Сумма не может быть 0")
    upsert_unknown_user(user_id)
    user_rows = request("GET", f"users?telegram_id=eq.{user_id}&select=balance")
    current_balance = int(user_rows[0].get("balance", 0)) if user_rows else 0
    if current_balance + amount < 0:
        raise ValueError("Недостаточно средств")
    return add_transaction(user_id, amount, admin_id=admin_id, comment=comment)


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

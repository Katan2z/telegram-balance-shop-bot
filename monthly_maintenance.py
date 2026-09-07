"""Idempotent monthly balance maintenance for the Telegram bot watchdog."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from urllib.parse import quote
from zoneinfo import ZoneInfo

import supabase_storage as db


MOSCOW = ZoneInfo("Europe/Moscow")


def month_context(now: datetime | None = None) -> tuple[str, datetime]:
    local = (now or datetime.now(timezone.utc)).astimezone(MOSCOW)
    current_start = local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    previous_day = current_start - timedelta(days=1)
    return previous_day.strftime("%Y-%m"), current_start


def current_month_balances(transactions: list[dict]) -> dict[int, int]:
    balances: dict[int, int] = defaultdict(int)
    for transaction in transactions:
        if transaction.get("user_id") is not None:
            balances[int(transaction["user_id"])] += int(transaction.get("amount") or 0)
    return {user_id: max(amount, 0) for user_id, amount in balances.items()}


def build_reset_plan(users: list[dict], transactions: list[dict]) -> list[dict]:
    earned_this_month = current_month_balances(transactions)
    plan = []
    for user in users:
        user_id = int(user["telegram_id"])
        current = max(int(user.get("balance") or 0), 0)
        desired = min(earned_this_month.get(user_id, 0), current)
        plan.append({
            "telegram_id": user_id,
            "current_balance": current,
            "new_balance": desired,
            "burned": max(current - desired, 0),
            "coin_checkpoint": desired // 5,
        })
    return plan


def run(now: datetime | None = None) -> dict:
    if not db.enabled():
        raise RuntimeError("Supabase is not configured")
    month_key, current_start = month_context(now)
    if db.monthly_conversion_exists(month_key):
        result = {"ok": True, "already_done": True, "month_key": month_key}
        print(result)
        return result

    start_utc = quote(current_start.astimezone(timezone.utc).isoformat(), safe="")
    users = db.request("GET", "users?select=telegram_id,balance,coins,coin_checkpoint&order=telegram_id.asc") or []
    transactions = db.request(
        "GET",
        "transactions?type=eq.balance_change"
        f"&created_at=gte.{start_utc}"
        "&select=user_id,amount,created_at&order=created_at.asc&limit=10000",
    ) or []
    plan = build_reset_plan(users, transactions)

    for item in plan:
        if item["current_balance"] == item["new_balance"]:
            continue
        db.request(
            "PATCH",
            f"users?telegram_id=eq.{item['telegram_id']}",
            headers=db.headers("return=minimal"),
            json={"balance": item["new_balance"], "coin_checkpoint": item["coin_checkpoint"], "updated_at": db.now()},
        )

    payload = {
        "month_key": month_key,
        "converted_users": sum(1 for item in plan if item["burned"] > 0),
        "total_spasibki": sum(item["burned"] for item in plan),
        "total_coins": 0,
        "total_burned": sum(item["burned"] for item in plan),
        "created_at": db.now(),
    }
    db.request("POST", "monthly_conversions", headers=db.headers("return=minimal"), json=payload)
    result = {"ok": True, "already_done": False, **payload}
    print(result)
    return result


if __name__ == "__main__":
    run()

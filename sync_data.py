import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DOCS_DIR = BASE_DIR / "docs"

USERS_FILE = DATA_DIR / "users.json"
PRODUCTS_FILE = DATA_DIR / "products.json"
TRANSACTIONS_FILE = DATA_DIR / "transactions.json"
PUBLIC_DATA_FILE = DOCS_DIR / "public-data.json"


def now() -> str:
    return datetime.utcnow().isoformat()


def read_json(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return default


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def public_name(user: dict) -> str:
    if user.get("first_name"):
        return str(user["first_name"])
    if user.get("username"):
        return "@" + str(user["username"])
    return "Сотрудник"


def main() -> None:
    users = read_json(USERS_FILE, {})
    products = read_json(PRODUCTS_FILE, [])
    transactions = read_json(TRANSACTIONS_FILE, [])
    current_month = now()[:7]

    received_total = defaultdict(int)
    received_month = defaultdict(int)
    total_given_month = 0

    for tx in transactions:
        user_id = str(tx.get("user_id"))
        amount = int(tx.get("amount", 0) or 0)
        created_at = str(tx.get("created_at", ""))
        comment = str(tx.get("comment", ""))
        if amount <= 0 or "Списание" in comment or "Покупка" in comment:
            continue
        received_total[user_id] += amount
        if created_at.startswith(current_month):
            received_month[user_id] += amount
            total_given_month += amount

    public_users = {
        str(user_id): {
            "name": public_name(user),
            "balance": int(user.get("balance", 0) or 0),
            "received_month": received_month[str(user_id)],
            "received_total": received_total[str(user_id)],
        }
        for user_id, user in users.items()
    }

    top_month = [
        {
            "user_id": user_id,
            "name": public_name(users.get(user_id, {})),
            "amount": amount,
        }
        for user_id, amount in sorted(received_month.items(), key=lambda item: item[1], reverse=True)[:3]
    ]

    write_json(PUBLIC_DATA_FILE, {
        "updated_at": now(),
        "currency_name": "спасибки",
        "month": current_month,
        "top_month": top_month,
        "users": public_users,
        "products": [product for product in products if product.get("active", True)],
        "stats": {
            "users_count": len(users),
            "transactions_count": len(transactions),
            "total_given_month": total_given_month,
        },
    })


if __name__ == "__main__":
    main()

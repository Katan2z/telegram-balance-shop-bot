import json
from pathlib import Path

import supabase_storage as db

BASE_DIR = Path(__file__).resolve().parent
USERS_FILE = BASE_DIR / "data" / "users.json"


def read_json(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return default


def main() -> None:
    if not db.enabled():
        print("Supabase is not configured, migration skipped")
        return

    users = read_json(USERS_FILE, {})
    for user in users.values():
        db.upsert_user_record(user)
    print(f"Migrated users: {len(users)}")


if __name__ == "__main__":
    main()

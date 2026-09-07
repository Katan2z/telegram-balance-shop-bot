"""Provision the initial BK8 admin accounts through Supabase Auth."""

from __future__ import annotations

import os

import requests


def auth_email(username: str) -> str:
    normalized = username.strip().lower()
    if not normalized or not all(char.isalnum() or char in "_-" for char in normalized):
        raise ValueError("Invalid admin username")
    return f"{normalized}@admin.bk8.local"


def provision(username: str, password: str, role: str, display_name: str, restaurant_name: str | None = None) -> dict:
    url = os.environ["SUPABASE_URL"].rstrip("/")
    service_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}", "Content-Type": "application/json"}
    email = auth_email(username)
    metadata = {"admin_role": role, "display_name": display_name}
    if restaurant_name:
        metadata["restaurant_key"] = "bk8"
        metadata["restaurant_name"] = restaurant_name
    response = requests.post(
        f"{url}/auth/v1/admin/users",
        headers=headers,
        json={"email": email, "password": password, "email_confirm": True, "app_metadata": metadata},
        timeout=30,
    )
    if response.status_code == 422 and "already" in response.text.lower():
        return {"username": username, "status": "already_exists"}
    response.raise_for_status()
    return {"username": username, "status": "created", "role": role}


def main() -> None:
    results = [
        provision(
            os.environ["SUPER_ADMIN_USERNAME"],
            os.environ["SUPER_ADMIN_PASSWORD"],
            "super_admin",
            "Иванов Константин",
        ),
        provision(
            os.environ["RESTAURANT_ADMIN_USERNAME"],
            os.environ["RESTAURANT_ADMIN_PASSWORD"],
            "restaurant_admin",
            "Администратор BK8",
            "BK8",
        ),
    ]
    print({"ok": True, "accounts": results})


if __name__ == "__main__":
    main()

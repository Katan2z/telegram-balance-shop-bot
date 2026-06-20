import os
from datetime import datetime
from typing import Any
from urllib.parse import quote, urlparse

import requests


def normalize_supabase_url(value: str) -> str:
    raw = (value or "").strip().rstrip("/")
    if not raw:
        return ""
    parsed = urlparse(raw)
    path_parts = [part for part in parsed.path.split("/") if part]

    if parsed.netloc in {"supabase.com", "www.supabase.com"} and len(path_parts) >= 3:
        if
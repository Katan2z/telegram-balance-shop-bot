import json
import os
from pathlib import Path

DOCS_DIR = Path(__file__).resolve().parent / "docs"
CONFIG_FILE = DOCS_DIR / "config.js"

supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
supabase_anon_key = os.getenv("SUPABASE_ANON_KEY", "")

DOCS_DIR.mkdir(parents=True, exist_ok=True)

CONFIG_FILE.write_text(
    "window.APP_CONFIG = "
    + json.dumps(
        {
            "SUPABASE_URL": supabase_url,
            "SUPABASE_ANON_KEY": supabase_anon_key,
        },
        ensure_ascii=False,
    )
    + ";\n",
    encoding="utf-8",
)

print("Frontend config generated")

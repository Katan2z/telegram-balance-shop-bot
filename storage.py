import base64
import json
import os
from pathlib import Path

from github import Github

REPO_FULL_NAME = os.getenv("GITHUB_REPOSITORY", "Katan2z/telegram-balance-shop-bot")
BRANCH = os.getenv("GITHUB_REF_NAME", "main")
PATHS_TO_SYNC = [
    "data/users.json",
    "data/transactions.json",
    "data/chats.json",
    "data/admins.json",
    "docs/public-data.json",
]


def github_available() -> bool:
    return bool(os.getenv("GITHUB_TOKEN"))


def sync_files_to_github(message: str = "Update bot data") -> None:
    token = os.getenv("GITHUB_TOKEN")
    if not token:
        return

    gh = Github(token)
    repo = gh.get_repo(REPO_FULL_NAME)

    for path in PATHS_TO_SYNC:
        local_path = Path(path)
        if not local_path.exists():
            continue

        content = local_path.read_text(encoding="utf-8")
        try:
            current = repo.get_contents(path, ref=BRANCH)
            remote_content = base64.b64decode(current.content).decode("utf-8")
            if remote_content == content:
                continue
            repo.update_file(path, message, content, current.sha, branch=BRANCH)
        except Exception as error:
            if "404" in str(error):
                repo.create_file(path, message, content, branch=BRANCH)
            else:
                raise

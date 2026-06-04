import os
import subprocess
import time
from pathlib import Path

PATHS_TO_SYNC = [
    "data/users.json",
    "data/transactions.json",
    "data/chats.json",
    "data/admins.json",
    "docs/public-data.json",
]


def github_available() -> bool:
    return bool(os.getenv("GITHUB_TOKEN"))


def run_git(args: list[str], check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", *args],
        check=check,
        text=True,
        capture_output=True,
    )


def sync_files_to_github(message: str = "Update bot data") -> None:
    if not github_available():
        return

    existing_paths = [path for path in PATHS_TO_SYNC if Path(path).exists()]
    if not existing_paths:
        return

    run_git(["config", "user.name", "github-actions"])
    run_git(["config", "user.email", "github-actions@github.com"])

    for attempt in range(3):
        run_git(["add", *existing_paths])
        diff = run_git(["diff", "--cached", "--quiet"], check=False)
        if diff.returncode == 0:
            return

        commit = run_git(["commit", "-m", message], check=False)
        if commit.returncode != 0 and "nothing to commit" not in (commit.stdout + commit.stderr).lower():
            raise RuntimeError(commit.stderr or commit.stdout)

        pull = run_git(["pull", "--rebase"], check=False)
        if pull.returncode != 0:
            run_git(["rebase", "--abort"], check=False)
            run_git(["pull", "--no-rebase", "--strategy-option=ours"], check=False)

        push = run_git(["push"], check=False)
        if push.returncode == 0:
            return

        if attempt < 2:
            time.sleep(1.2 * (attempt + 1))
            continue
        raise RuntimeError(push.stderr or push.stdout)

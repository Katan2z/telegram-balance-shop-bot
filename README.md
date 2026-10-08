# BK8 STAFF

## Development checks

Use Python 3.11 or 3.12 and Node.js 22. Create a virtual environment,
install `requirements.txt`, and run `python -m unittest discover -s tests -v`.
The `Project checks` workflow runs the tests and Python/JavaScript syntax checks.

## Bot runtime

The supported entry point is `python bot_runner.py`. It configures the Telegram
menu and starts task notifications, schedule reminders, custom notifications,
and monthly balance maintenance through one shared runtime.
Required environment variables: `BOT_TOKEN`, `SUPABASE_URL`, and
`SUPABASE_SERVICE_ROLE_KEY`. Never publish these values in frontend configuration.

Timesheet uploads produce a preview. Only the uploading administrator can confirm
saving current hours within 15 minutes. Restarting the bot expires pending previews;
upload the file again. Parsing a timesheet alone never writes to the database.

## Stabilization status

The initial runtime and timesheet changes are complete. Server authentication,
atomic balance/shop operations, notification queue claims and retries, frontend
lifecycle cleanup, and visual previews remain separate rollout stages.
Historical SQL files are retained. Do not apply historical scripts as a batch.
Before changing policies, inspect the deployed schema and validate on a test database.

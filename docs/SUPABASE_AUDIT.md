# Supabase read-only audit

Observed in the authenticated project dashboard on 2026-10-09.
Project: Katan2z's Project (`dhqqvkdaujjxogkfrtul`). Status: Healthy.

The public table menu marks these tables UNRESTRICTED:

- employee_profiles
- employee_pvv_documents
- employee_timesheets
- instructors
- klokr_assessments

The Advisor reports five security issues concerning disabled row-level security.
The table menu also confirms admin_notifications, admin_tasks, bot_feedback,
bot_settings, chats, closing_assignments, closing_checks, employee_medical_records,
managers, monthly_conversions, schedule_entries, schedule_preferences,
schedule_settings, schedule_weeks, shop_items, shop_purchases, transactions, users.

The overview labels the migration history and scheduled backups as absent.
This does not prove that no manual SQL changes or external backups exist.

No database rows or policies were changed during this inspection.
SQL inspection confirmed unconditional public INSERT/UPDATE policies for tasks,
closing checklists and bot settings; medical records accept anonymous INSERT/UPDATE.
RLS enabled alone does not restrict these operations.
Purchase uses a user row lock and one transaction for debit and receipt creation.
Redeem accepts an active, unexpired UUID receipt and changes its status to redeemed.
The panel previously checked pending, which did not match the deployed function.
Before remediation, inspect actual function definitions, grants, policies,
foreign keys and triggers; test the authenticated API and migration together.
Enabling RLS without the replacement access path could break current clients.

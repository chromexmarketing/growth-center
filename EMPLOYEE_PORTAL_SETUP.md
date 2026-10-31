# Chromex Employee Workspace — activation

The code is deployed as part of the existing Chromex portal, using the same sign-in URL and Supabase authentication. **The database migration must also be applied.** GitHub/Vercel deployment does not automatically execute Supabase SQL migrations.

## One-time database setup

1. Sign in to the Chromex Supabase project.
2. Open **SQL Editor → New query**.
3. Copy the complete contents of [supabase/migrations/20261031_employee_tasks.sql](supabase/migrations/20261031_employee_tasks.sql) into the query editor and run it.
4. Confirm there are no SQL errors. Reload the portal and have team members refresh or sign out and back in.

This migration creates a task table with row-level security, stores employee roles, and adds database guards so employees cannot reassign tasks or change their access roles. All existing staff are assigned the **Account Manager** role to preserve their client workspace access.

## Owner workflow

1. Open the existing portal with the admin login.
2. Open **Clients** → **Chromex team assignments**. Set each employee's role to **Account Manager**, **Designer**, or **Strategist**. Assign client accounts only to account managers.
3. Create new staff accounts under **Clients → Create portal account → Chromex team member**, choose the employee role, then provide their login securely.
4. Open **Team tasks** in the owner navigation. Assign a task with a title, employee, optional client, due date, and instructions.
5. To check team progress, use **Team tasks → Assigned work**. The owner can mark tasks complete, reopen, or remove them.

## Employee workflow

- Employees use the **same portal sign-in URL**.
- Designers and strategists land on **My tasks**, where they see only work assigned to them.
- Account managers land on **My tasks** but can enter their previously assigned **Client workspace** with the Clients navigation item.
- Staff can check off tasks, reopen them, filter today/overdue/upcoming/completed work, and update their personal profile.
- Completion is stored in Supabase. It does not yet trigger the next person's task; the saved status and completion timestamp provide the basis for that later workflow automation.

## Safeguards / scope

- Only owners can assign, remove, or change task content.
- Employees can only see their own task records and can only change their completion status, enforced by Supabase RLS and a database guard trigger.
- Client roles and client portal routing are unchanged. Designers and strategists are not given client workspace navigation or account assignments.
- If the migration is missing, existing staff still open their previous client workspace, and the owner task screen shows a setup warning instead of crashing.
- V1 does not send task notifications, auto-create recurring tasks, or advance interdependent task sequences.

For a future workflow engine, add task templates and dependency/handoff events driven by `employee_tasks.status` and `completed_at`.

# Personal Ops Center

Small React + Vite + TypeScript task manager connected to Supabase. This version uses Supabase Auth with a sign-in-only flow and Row Level Security so only the signed-in user can access their own projects and tasks.

## Stack

- React
- Vite
- TypeScript
- Supabase JavaScript client
- Plain CSS

## Features

- Email/password sign-in screen
- Sign-out button in the main app
- Project cards on the home screen
- Drag projects into your preferred order
- Create, rename, and delete project categories
- Open a project to see its task list
- Add tasks, select tasks for bulk actions, complete tasks, delete tasks, and drag tasks into your preferred order
- Move tasks into a top-level Daily Tasks bucket
- Swipe active tasks left on mobile to send them to Daily Tasks
- Swipe tasks right on mobile to delete them
- Completed tasks grouped into a collapsible section
- Mobile-first layout with plain CSS

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a local `.env.local` file in the project root.

3. Paste your Supabase project values into `.env.local`:

   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. Start the app:

   ```bash
   npm run dev
   ```

5. Open the local Vite URL shown in the terminal, usually `http://localhost:5173`.
6. If you change `.env.local`, stop and restart the dev server so Vite picks up the new values.

## Supabase SQL migration

Paste this into the Supabase SQL editor. It clears the old test data, adds project ownership, removes anonymous access, and creates authenticated-only RLS policies.

```sql
create extension if not exists pgcrypto;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer,
  created_at timestamptz default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  text text not null,
  completed boolean not null default false,
  is_daily boolean not null default false,
  daily_added_at timestamptz,
  sort_order integer,
  created_at timestamptz default now()
);

delete from public.tasks;
delete from public.projects;

alter table public.projects
add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.projects
add column if not exists card_color text;

alter table public.projects
add column if not exists card_icon text;

alter table public.projects
add column if not exists sort_order integer;

alter table public.tasks
add column if not exists is_daily boolean not null default false;

alter table public.tasks
add column if not exists daily_added_at timestamptz;

alter table public.tasks
add column if not exists sort_order integer;

with ordered_projects as (
  select
    id,
    row_number() over (
      partition by user_id
      order by created_at desc nulls last, id
    ) - 1 as next_sort_order
  from public.projects
)
update public.projects
set sort_order = ordered_projects.next_sort_order
from ordered_projects
where projects.id = ordered_projects.id
  and projects.sort_order is null;

with ordered_tasks as (
  select
    id,
    row_number() over (
      partition by project_id
      order by created_at asc nulls last, id
    ) - 1 as next_sort_order
  from public.tasks
)
update public.tasks
set sort_order = ordered_tasks.next_sort_order
from ordered_tasks
where tasks.id = ordered_tasks.id
  and tasks.sort_order is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_card_color_check'
  ) then
    alter table public.projects
    add constraint projects_card_color_check
    check (
      card_color is null
      or card_color in ('red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet')
    );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_card_icon_check'
  ) then
    alter table public.projects
    add constraint projects_card_icon_check
    check (
      card_icon is null
      or card_icon in ('house', 'bicycle', 'lightbulb', 'car', 'running', 'euro', 'shopping')
    );
  end if;
end $$;

alter table public.projects
alter column user_id set not null;

alter table public.projects enable row level security;
alter table public.tasks enable row level security;

drop policy if exists "Allow anon read for connection test" on public.projects;
drop policy if exists "Allow anon select projects" on public.projects;
drop policy if exists "Allow anon insert projects" on public.projects;
drop policy if exists "Allow anon update projects" on public.projects;
drop policy if exists "Allow anon delete projects" on public.projects;
drop policy if exists "Allow anon select tasks" on public.tasks;
drop policy if exists "Allow anon insert tasks" on public.tasks;
drop policy if exists "Allow anon update tasks" on public.tasks;
drop policy if exists "Allow anon delete tasks" on public.tasks;

drop policy if exists "Users can view their own projects" on public.projects;
drop policy if exists "Users can create their own projects" on public.projects;
drop policy if exists "Users can update their own projects" on public.projects;
drop policy if exists "Users can delete their own projects" on public.projects;
drop policy if exists "Users can view tasks in their own projects" on public.tasks;
drop policy if exists "Users can create tasks in their own projects" on public.tasks;
drop policy if exists "Users can update tasks in their own projects" on public.tasks;
drop policy if exists "Users can delete tasks in their own projects" on public.tasks;

create policy "Users can view their own projects"
on public.projects
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can create their own projects"
on public.projects
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update their own projects"
on public.projects
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete their own projects"
on public.projects
for delete
to authenticated
using (user_id = auth.uid());

create policy "Users can view tasks in their own projects"
on public.tasks
for select
to authenticated
using (
  exists (
    select 1
    from public.projects
    where projects.id = tasks.project_id
      and projects.user_id = auth.uid()
  )
);

create policy "Users can create tasks in their own projects"
on public.tasks
for insert
to authenticated
with check (
  exists (
    select 1
    from public.projects
    where projects.id = tasks.project_id
      and projects.user_id = auth.uid()
  )
);

create policy "Users can update tasks in their own projects"
on public.tasks
for update
to authenticated
using (
  exists (
    select 1
    from public.projects
    where projects.id = tasks.project_id
      and projects.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.projects
    where projects.id = tasks.project_id
      and projects.user_id = auth.uid()
  )
);

create policy "Users can delete tasks in their own projects"
on public.tasks
for delete
to authenticated
using (
  exists (
    select 1
    from public.projects
    where projects.id = tasks.project_id
      and projects.user_id = auth.uid()
  )
);
```

If you already ran an earlier migration and want to keep your existing data, run just the `sort_order` parts from the block above: add `sort_order` to `projects` and `tasks`, then run the two `with ordered_... update ...` backfill statements.

## Manually create your user in Supabase

This app does not expose public sign-up.

1. Open your Supabase project dashboard.
2. Go to `Authentication`.
3. Open `Users`.
4. Click `Add user`.
5. Enter your email address and password.
6. Create a confirmed user so the account can sign in immediately.

If your dashboard shows email sign-up controls, keep public self-service sign-up disabled for this app.

## Why the anon key is still okay

The frontend still uses `VITE_SUPABASE_ANON_KEY`, which is normal for Supabase client apps.

- The anon key is not a secret server key.
- Security now comes from authentication plus Row Level Security.
- Signed-out users should not be able to read or write your project data because the RLS policies block them.

## What to test locally

1. Run the SQL migration above.
2. Create your user manually in Supabase.
3. Start the app with `npm run dev`.
4. Confirm the signed-out screen only shows:
   - email field
   - password field
   - `Sign In` button
5. Try a wrong password and confirm you get a clear error.
6. Sign in with the correct email/password and confirm:
   - the project screen appears
   - you can create a project
   - you can open the project
   - you can create tasks
   - clicking task text completes a task
   - checking tasks selects them for bulk send-to-daily, complete, or delete actions
   - moving a task to Daily removes it from Active Tasks and shows it in both Daily Tasks and Tasks on Daily Task
7. Refresh the page and confirm the session persists.
8. Sign out and confirm the app returns to the sign-in screen.

Optional stronger RLS check:

1. Manually create a second Supabase user.
2. Sign in as user A and create some data.
3. Sign out, then sign in as user B.
4. Confirm user B cannot see user A's projects or tasks.

## What you should see

If everything is wired correctly:

- Signed out: a simple sign-in card
- Signed in on desktop: a centered app panel with a signed-in header, project cards, and task lists
- Signed in on phone: the same flow in a single-column, tap-friendly layout

If something is wrong:

- Missing `.env.local` values show a readable configuration error
- Wrong password shows an auth error from Supabase
- Missing `user_id` column or missing RLS policy shows a database error in the UI

## Deploying to Vercel

1. Push this repo to GitHub, GitLab, or Bitbucket.
2. In Vercel, create a new project and import the repository.
3. Let Vercel detect the project as Vite.
4. In the Vercel project settings, add:

   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

5. Add those variables for at least `Production` and `Preview`.
6. Click `Deploy`.

## Redeploying on Vercel

- Push a new commit to the connected branch to trigger another deployment
- Or open the project in Vercel and redeploy the latest deployment after changing environment variables

## What to test on Vercel

1. Open the deployed app signed out and confirm the sign-in screen appears.
2. Sign in with your manually created user.
3. Create a project and a few tasks.
4. Refresh the deployed app and confirm your session and data still work.
5. Sign out and confirm the app returns to the sign-in screen.

## Most likely errors and how to debug them

- `Invalid login credentials`
  - Check the email and password for the manually created user.
- `Email not confirmed`
  - Make sure the dashboard-created user is confirmed or created in a way that allows immediate sign-in.
- `Missing Supabase environment variables`
  - Check `.env.local` locally or Vercel environment variables in production.
- `column "user_id" does not exist`
  - The SQL migration did not run successfully.
- `new row violates row-level security policy`
  - Confirm you are signed in and that the SQL policies were pasted exactly.
- Empty project list after sign-in
  - This can be normal if you have not created any projects yet.
  - If not expected, verify you are signed into the same Supabase project you migrated.

## Useful commands

```bash
npm install
npm run dev
npm run build
```

# Personal Ops Center

Small React + Vite + TypeScript task manager connected to Supabase. This version keeps the app intentionally simple: project cards on the home screen and a task list inside each project.

## Stack

- React
- Vite
- TypeScript
- Supabase JavaScript client
- Plain CSS

## Features

- Project cards on the home screen
- Create, rename, and delete project categories
- Open a project to see its task list
- Add tasks, check tasks complete, and delete tasks
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

## Supabase setup SQL

Paste this into the Supabase SQL editor to create or update the schema and temporary test policies:

```sql
create extension if not exists pgcrypto;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  text text not null,
  completed boolean not null default false,
  created_at timestamptz default now()
);

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

create policy "Allow anon select projects"
on public.projects
for select
to anon
using (true);

create policy "Allow anon insert projects"
on public.projects
for insert
to anon
with check (true);

create policy "Allow anon update projects"
on public.projects
for update
to anon
using (true)
with check (true);

create policy "Allow anon delete projects"
on public.projects
for delete
to anon
using (true);

create policy "Allow anon select tasks"
on public.tasks
for select
to anon
using (true);

create policy "Allow anon insert tasks"
on public.tasks
for insert
to anon
with check (true);

create policy "Allow anon update tasks"
on public.tasks
for update
to anon
using (true)
with check (true);

create policy "Allow anon delete tasks"
on public.tasks
for delete
to anon
using (true);
```

Optional sample seed data:

```sql
with inserted_project as (
  insert into public.projects (name)
  values ('Apartment')
  returning id
)
insert into public.tasks (project_id, text, completed)
select id, 'Replace kitchen light bulb', false from inserted_project
union all
select id, 'Call plumber', true from inserted_project;
```

## Temporary security warning

The current row level security policies allow public anonymous read/write access for local testing.

- Do not use this setup for real private task data yet.
- Before real use, add authentication and replace these anonymous policies with user-scoped rules.

## What you should see locally

If everything is wired correctly:

- The home screen shows the `Personal Ops Center` title and a form to add projects
- Existing projects appear as big cards that are easy to tap on a phone
- Each card has `Edit` and `Delete` buttons
- Tapping a card opens that project's task screen
- The task screen shows active tasks first and a collapsible `Completed` section below

If something is wrong:

- Missing `.env.local` values show a readable configuration error
- Missing tables or missing policies show the Supabase error returned by the API

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
7. If you add or change environment variables later, redeploy from the Vercel dashboard so the new values are used.

## Redeploying on Vercel

- Push a new commit to the connected branch to trigger another deployment
- Or open the project in Vercel and use the redeploy action from the latest deployment

## Useful commands

```bash
npm install
npm run dev
npm run build
```

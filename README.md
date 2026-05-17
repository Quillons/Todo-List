# Personal Ops Center

Small React + Vite + TypeScript starter app for testing a local Supabase connection before adding real task-manager features.

## Stack

- React
- Vite
- TypeScript
- Supabase JavaScript client
- Plain CSS

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a local `.env` file in the project root.

3. Paste your Supabase project values into `.env`:

   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. Start the app:

   ```bash
   npm run dev
   ```

5. Open the local Vite URL shown in the terminal, usually `http://localhost:5173`.

## Supabase table for the test

Run this SQL in the Supabase SQL editor:

```sql
create extension if not exists pgcrypto;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

alter table public.projects enable row level security;

drop policy if exists "Allow anon read for connection test" on public.projects;
create policy "Allow anon read for connection test"
on public.projects
for select
to anon
using (true);

insert into public.projects (name)
values ('Apartment');
```

## What the app does

- Renders a simple mobile-friendly screen titled `Personal Ops Center`
- Reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from your local `.env`
- Calls `public.projects` when you press `Test Supabase Connection`
- Shows a success message, an empty-state message, or a readable error
- Displays returned project rows if any exist

## Expected browser result

If everything is set up correctly:

- The page loads with a single centered panel
- You see the `Personal Ops Center` title
- You can click `Test Supabase Connection`
- After the request finishes, you should see a success message
- If you inserted the sample row, you should see `Apartment` in the project list

If something is wrong:

- Missing `.env` values show a clear configuration error
- Missing table or missing policy shows the Supabase error message on screen

## Useful commands

```bash
npm install
npm run dev
npm run build
```

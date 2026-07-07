# AstraLite

AstraLite is a Vite + React desktop web app with an Astra-themed workspace, calendar, notebook, Pomodoro, Smartra, and Supabase authentication gate.

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env.local
   ```

3. Fill `.env.local` with your Supabase project values:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your-publishable-key
   ```

4. Start the app:

   ```bash
   npm run dev
   ```

## Connect Supabase Auth

1. Create a project in Supabase.
2. Open **Project Settings → API** and copy:
   - **Project URL** into `NEXT_PUBLIC_SUPABASE_URL`.
   - **Publishable key** (`sb_publishable_...`) into `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. Open **Authentication → Providers → Email**.
4. Enable Email provider.
5. For easiest first test, turn off email confirmation. If email confirmation stays on, sign-up will show a message asking the user to confirm their email before logging in.
6. Add the same two variables in Vercel under **Project Settings → Environment Variables** for Production, Preview, and Development.

## Connect app data to Supabase tables

The app also accepts the older `VITE_SUPABASE_URL` plus `VITE_SUPABASE_PUBLISHABLE_KEY`/`VITE_SUPABASE_ANON_KEY` names, but Vercel values copied from the current Supabase dashboard can be used directly as `NEXT_PUBLIC_*`.

The login session stores a Supabase access token in `localStorage` under `astralite.supabase.session`. Use that token when reading or writing user-owned data.

Example table for notes:

```sql
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  body text not null default '',
  created_at timestamptz not null default now()
);

alter table public.notes enable row level security;

create policy "Users can read their notes"
on public.notes for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their notes"
on public.notes for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their notes"
on public.notes for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their notes"
on public.notes for delete
to authenticated
using (auth.uid() = user_id);
```

Example browser request after login:

```ts
const stored = localStorage.getItem('astralite.supabase.session')
const session = stored ? JSON.parse(stored) : null

const response = await fetch(`${import.meta.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/notes`, {
  headers: {
    apikey: import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${session.access_token}`,
  },
})

const notes = await response.json()
```

Use the same pattern for `tasks`, `calendar_events`, and user profile tables: every row should include `user_id uuid references auth.users(id)`, and every policy should restrict access with `auth.uid() = user_id`.

## Vercel deployment

This repository is a Vite app, not a Next.js app. `vercel.json` pins the framework to Vite, uses `npm run build`, and deploys `dist`.

If Vercel still says “No Next.js version detected”, check that the Vercel project **Root Directory** points to the folder containing this `package.json` and `vercel.json`.

## Scripts

- `npm run dev` — start Vite locally.
- `npm run build` — type-check and build production files.
- `npm run lint` — run Oxlint.
- `npm run preview` — preview the production build locally.

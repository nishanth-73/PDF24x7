-- ==============================================================================
-- PDF24x7: Feedback System Schema & Row Level Security (RLS)
-- ==============================================================================

-- 1. Create feedback table
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  category text not null default 'General',
  message text not null check (char_length(trim(message)) >= 10),
  app_version text default '2.1.0',
  created_at timestamptz not null default now()
);

-- Index for querying by user_id and submission date
create index if not exists idx_feedback_user_id on public.feedback(user_id);
create index if not exists idx_feedback_created_at on public.feedback(created_at desc);

-- 2. Enable Row Level Security (RLS)
alter table public.feedback enable row level security;

-- Drop existing policies if re-running
drop policy if exists "Allow insert feedback for all users" on public.feedback;
drop policy if exists "Users can read own feedback" on public.feedback;
drop policy if exists "Service role has full access to feedback" on public.feedback;

-- 3. Policy: Anyone (authenticated or anonymous) can submit feedback
create policy "Allow insert feedback for all users"
  on public.feedback
  for insert
  with check (true);

-- 4. Policy: Users can strictly only read their own feedback submissions
create policy "Users can read own feedback"
  on public.feedback
  for select
  using (
    (auth.uid() is not null and auth.uid() = user_id)
  );

-- 5. Policy: Service role (backend functions & admin) has full access
create policy "Service role has full access to feedback"
  on public.feedback
  for all
  using (auth.role() = 'service_role');

-- ==============================================================================
-- Comment metadata
-- ==============================================================================
comment on table public.feedback is 'Stores in-app user feedback, bug reports, and feature requests for PDF24x7';
comment on column public.feedback.user_id is 'Optional Supabase Auth user ID if logged in at the time of submission';
comment on column public.feedback.email is 'Optional contact email for feedback replies';


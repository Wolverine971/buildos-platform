-- supabase/migrations/20260428000020_add_message_to_cron_logs.sql
ALTER TABLE IF EXISTS public.cron_logs
ADD COLUMN IF NOT EXISTS message text;

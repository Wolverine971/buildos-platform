-- supabase/migrations/20260730050000_phase1_drop_notification_preferences_backup.sql
-- Phase 1: drop the expired notification-preferences backup only after the
-- external export tool has written a checksummed receipt for the current rows.

begin;

do $block$
declare
	v_live_count bigint;
	v_receipt_count bigint;
	v_receipt_sha256 text;
begin
	if to_regclass('public.user_notification_preferences_backup') is not null then
		-- Prevent writes between the receipt/count check and the drop.
		execute 'lock table public.user_notification_preferences_backup in access exclusive mode';
		execute 'select count(*) from public.user_notification_preferences_backup'
			into v_live_count;

		select row_count, sha256
		into v_receipt_count, v_receipt_sha256
		from private.phase1_archive_receipts
		where table_name = 'user_notification_preferences_backup';

		if v_receipt_count is null or v_receipt_sha256 is null then
			raise exception 'Refusing to drop user_notification_preferences_backup: archive receipt missing'
				using errcode = '55000';
		end if;

		if v_receipt_count <> v_live_count then
			raise exception 'Refusing to drop user_notification_preferences_backup: receipt has % rows, table has %',
				v_receipt_count, v_live_count
				using errcode = '40001';
		end if;

		execute 'drop table public.user_notification_preferences_backup';
	end if;
end;
$block$;

drop function if exists public.record_phase1_archive_receipt(text, bigint, text);

commit;

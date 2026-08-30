-- Source-aware ontology calendar writes upsert one mapping per event, user, and provider.
-- The application has used this conflict target since multi-calendar routing shipped, but the
-- database only retained the older project-calendar/external-event uniqueness contract.

CREATE UNIQUE INDEX IF NOT EXISTS onto_event_sync_event_user_provider_uidx
	ON public.onto_event_sync (event_id, user_id, provider);

COMMENT ON INDEX public.onto_event_sync_event_user_provider_uidx IS
	'Supports idempotent source-aware calendar mapping upserts by ontology event, user, and provider.';

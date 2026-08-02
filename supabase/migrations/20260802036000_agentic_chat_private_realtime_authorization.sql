-- supabase/migrations/20260802036000_agentic_chat_private_realtime_authorization.sql
-- Agentic Chat Worker migration, Phase 2C Slice 4: exact private per-user
-- Realtime Broadcast authorization.
--
-- Authenticated clients may receive only the exact topic matching their user
-- identity. No INSERT policy is added: browser clients cannot publish worker
-- events. Service-role publication continues through the platform's existing
-- RLS-bypass boundary. This package adds no subscription code, queue consumer,
-- provider/model execution, or enabled worker route.

DROP POLICY IF EXISTS agentic_chat_realtime_messages_select ON realtime.messages;

CREATE POLICY agentic_chat_realtime_messages_select
	ON realtime.messages
	FOR SELECT
	TO authenticated
	USING (
		realtime.messages.extension = 'broadcast'
		AND CASE
			WHEN (SELECT realtime.topic()) ~* '^chat-user:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
			THEN split_part((SELECT realtime.topic()), ':', 2)::uuid = (SELECT auth.uid())
			ELSE false
		END
	);

COMMENT ON POLICY agentic_chat_realtime_messages_select ON realtime.messages IS
	'Allows an authenticated user to receive private Agentic Chat Broadcast messages only from chat-user:<auth.uid()>; clients receive no publish policy.';

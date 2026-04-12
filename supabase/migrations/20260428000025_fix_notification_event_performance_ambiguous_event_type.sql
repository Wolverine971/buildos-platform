-- Fix ambiguous PL/pgSQL output variable references in notification event performance analytics.

CREATE OR REPLACE FUNCTION public.get_notification_event_performance(
	p_interval text DEFAULT '30 days'::text
)
RETURNS TABLE(
	event_type text,
	total_events bigint,
	total_deliveries bigint,
	unique_subscribers bigint,
	avg_delivery_time_seconds numeric,
	open_rate numeric,
	click_rate numeric
)
LANGUAGE plpgsql
AS $function$
BEGIN
	RETURN QUERY
	WITH scoped_events AS (
		SELECT ne.id, ne.event_type AS event_type_key
		FROM notification_events ne
		WHERE ne.created_at > NOW() - p_interval::INTERVAL
	),
	event_counts AS (
		SELECT
			se.event_type_key,
			COUNT(*) AS total_events
		FROM scoped_events se
		GROUP BY se.event_type_key
	),
	delivery_metrics AS (
		SELECT
			se.event_type_key,
			COUNT(nd.id) AS total_deliveries,
			COUNT(DISTINCT nd.recipient_user_id) AS unique_recipients,
			ROUND(
				AVG(EXTRACT(EPOCH FROM (nd.sent_at - nd.created_at)))
					FILTER (WHERE nd.sent_at IS NOT NULL)::NUMERIC,
				2
			) AS avg_delivery_time_seconds,
			ROUND(
				(
					COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL)::NUMERIC
					/ NULLIF(
						COUNT(*) FILTER (WHERE nd.status IN ('sent', 'delivered', 'opened', 'clicked'))::NUMERIC,
						0
					)
					* 100
				),
				2
			) AS open_rate,
			ROUND(
				(
					COUNT(*) FILTER (WHERE nd.clicked_at IS NOT NULL)::NUMERIC
					/ NULLIF(COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL)::NUMERIC, 0)
					* 100
				),
				2
			) AS click_rate
		FROM scoped_events se
		LEFT JOIN notification_deliveries nd ON nd.event_id = se.id
		GROUP BY se.event_type_key
	)
	SELECT
		ec.event_type_key AS event_type,
		ec.total_events,
		COALESCE(dm.total_deliveries, 0) AS total_deliveries,
		COALESCE(dm.unique_recipients, 0) AS unique_subscribers,
		dm.avg_delivery_time_seconds,
		dm.open_rate,
		dm.click_rate
	FROM event_counts ec
	LEFT JOIN delivery_metrics dm ON dm.event_type_key = ec.event_type_key
	ORDER BY ec.total_events DESC;
END;
$function$;

// apps/web/src/lib/services/agentic-chat/shared/timing-metrics.ts
import type { Json } from '@buildos/shared-types';

export type TimingMetricSessionSource = 'agent_chat_sessions' | 'chat_sessions';

type TimingMetricMetadata = Record<string, Json | undefined>;

export function normalizeTimingMetricSessionReference(params: {
	source: TimingMetricSessionSource;
	sessionId?: string | null;
	metadata?: TimingMetricMetadata;
}): {
	session_id: string | null;
	metadata: TimingMetricMetadata;
} {
	const sessionId =
		typeof params.sessionId === 'string' && params.sessionId.trim().length > 0
			? params.sessionId.trim()
			: null;
	const metadata: TimingMetricMetadata = { ...(params.metadata ?? {}) };

	if (!sessionId) {
		return { session_id: null, metadata };
	}

	if (params.source === 'agent_chat_sessions') {
		return { session_id: sessionId, metadata };
	}

	metadata.source_session_id = sessionId;
	metadata.source_session_table = params.source;

	return {
		session_id: null,
		metadata
	};
}

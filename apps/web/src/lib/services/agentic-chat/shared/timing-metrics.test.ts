import { describe, expect, it } from 'vitest';

import { normalizeTimingMetricSessionReference } from './timing-metrics';

describe('normalizeTimingMetricSessionReference', () => {
	it('preserves agent chat session ids for timing metrics rows', () => {
		const result = normalizeTimingMetricSessionReference({
			source: 'agent_chat_sessions',
			sessionId: 'agent-session-123',
			metadata: {
				stream_version: 'agent'
			}
		});

		expect(result).toEqual({
			session_id: 'agent-session-123',
			metadata: {
				stream_version: 'agent'
			}
		});
	});

	it('moves chat session ids into metadata to avoid the agent session foreign key', () => {
		const result = normalizeTimingMetricSessionReference({
			source: 'chat_sessions',
			sessionId: 'chat-session-123',
			metadata: {
				stream_version: 'v2'
			}
		});

		expect(result).toEqual({
			session_id: null,
			metadata: {
				stream_version: 'v2',
				source_session_id: 'chat-session-123',
				source_session_table: 'chat_sessions'
			}
		});
	});

	it('leaves session_id null when no session id is available', () => {
		const result = normalizeTimingMetricSessionReference({
			source: 'chat_sessions',
			sessionId: null,
			metadata: {
				stream_version: 'v2'
			}
		});

		expect(result).toEqual({
			session_id: null,
			metadata: {
				stream_version: 'v2'
			}
		});
	});
});

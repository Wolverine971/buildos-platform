import { describe, expect, it } from 'vitest';
import { repairTruncatedJSONResponse } from './response-parsing';

describe('repairTruncatedJSONResponse', () => {
	it('repairs truncated JSON with unterminated string at the end', () => {
		const broken = '{"items":[{"title":"Complete"},{"title":"Part';
		const repaired = repairTruncatedJSONResponse(broken);

		expect(repaired).not.toBeNull();
		expect(JSON.parse(repaired ?? '{}')).toEqual({
			items: [{ title: 'Complete' }]
		});
	});

	it('closes missing braces when JSON ends early', () => {
		const broken = '{"agent_state_updates":{"current_understanding":{"entities":["task-a","task-b"]';
		const repaired = repairTruncatedJSONResponse(broken);

		expect(repaired).not.toBeNull();
		expect(JSON.parse(repaired ?? '{}')).toEqual({
			agent_state_updates: {
				current_understanding: {
					entities: ['task-a', 'task-b']
				}
			}
		});
	});

	it('returns null for non-JSON input', () => {
		expect(repairTruncatedJSONResponse('not-json-response')).toBeNull();
	});
});

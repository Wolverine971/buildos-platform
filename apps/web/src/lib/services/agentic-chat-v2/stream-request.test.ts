// apps/web/src/lib/services/agentic-chat-v2/stream-request.test.ts
import { describe, expect, it } from 'vitest';
import { agenticChatProjectFocusSchema } from './stream-request';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

function focus(overrides: Record<string, unknown> = {}) {
	return {
		focusType: 'task',
		focusEntityId: '22222222-2222-4222-8222-222222222222',
		focusEntityName: 'Task',
		projectId: PROJECT_ID,
		projectName: 'Project',
		...overrides
	};
}

describe('agenticChatProjectFocusSchema', () => {
	it('accepts a valid focus and lowercases its identifiers', () => {
		const result = agenticChatProjectFocusSchema.safeParse(
			focus({ projectId: PROJECT_ID.toUpperCase() })
		);
		expect(result.success).toBe(true);
		expect(result.data?.projectId).toBe(PROJECT_ID);
	});

	it('accepts a project-wide focus with no focused entity', () => {
		expect(
			agenticChatProjectFocusSchema.safeParse(
				focus({ focusType: 'project-wide', focusEntityId: null, focusEntityName: null })
			).success
		).toBe(true);
	});

	it('rejects non-UUID project and focus identifiers', () => {
		expect(
			agenticChatProjectFocusSchema.safeParse(focus({ focusEntityId: 'not-a-uuid' })).success
		).toBe(false);
		expect(
			agenticChatProjectFocusSchema.safeParse(focus({ projectId: 'project-1' })).success
		).toBe(false);
	});

	it('rejects unknown focus types and extra keys', () => {
		expect(
			agenticChatProjectFocusSchema.safeParse(focus({ focusType: 'workspace' })).success
		).toBe(false);
		expect(agenticChatProjectFocusSchema.safeParse(focus({ extra: true })).success).toBe(false);
	});
});

// apps/worker/tests/agenticChatUnappliedWriteCopy.test.ts
import { describe, expect, it } from 'vitest';
import { describeUnappliedWrites } from '../src/workers/agentic-chat/provider/turn-provider';

describe('describeUnappliedWrites', () => {
	it('names what was held and says nothing changed', () => {
		expect(describeUnappliedWrites(['update_onto_document', 'update_onto_task'])).toBe(
			"I didn't apply this: my safety check couldn't confirm that the plan to update a document and update a task matched exactly what you asked. Nothing was changed. Try again, or tell me the exact text to change."
		);
	});

	it('counts repeated writes and ignores tools it cannot name', () => {
		expect(
			describeUnappliedWrites([
				'create_onto_task',
				'create_onto_task',
				'request_proposal_revision'
			])
		).toContain('the plan to create 2 tasks matched');
	});

	it('falls back to "this change" without held calls', () => {
		expect(describeUnappliedWrites([])).toContain('confirm that this change matched');
	});
});

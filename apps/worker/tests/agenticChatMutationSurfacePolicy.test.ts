// apps/worker/tests/agenticChatMutationSurfacePolicy.test.ts
import { describe, expect, it } from 'vitest';
import {
	AGENTIC_CHAT_DEFERRED_MUTATION_TOOLS_V1,
	AGENTIC_CHAT_MUTATION_SURFACE_AUDIT_V1,
	AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1,
	normalizeAgenticChatMutationCapabilitiesV1
} from '../src/workers/agentic-chat/mutationToolCatalog';

describe('Agentic Chat mutation surface policy', () => {
	it('partitions every signed write into the reviewed or explicitly deferred surface', () => {
		expect(AGENTIC_CHAT_MUTATION_SURFACE_AUDIT_V1.signedToolNames).toHaveLength(39);
		expect(AGENTIC_CHAT_MUTATION_SURFACE_AUDIT_V1.reviewedToolNames).toHaveLength(20);
		expect(AGENTIC_CHAT_MUTATION_SURFACE_AUDIT_V1.deferredToolNames).toHaveLength(19);
		expect(AGENTIC_CHAT_DEFERRED_MUTATION_TOOLS_V1.request_email_account_connection).toBe(
			'browser_user_action_handoff'
		);
		expect(AGENTIC_CHAT_MUTATION_SURFACE_AUDIT_V1.deferredToolNames).toEqual(
			Object.keys(AGENTIC_CHAT_DEFERRED_MUTATION_TOOLS_V1).sort()
		);
		expect(
			[
				...AGENTIC_CHAT_MUTATION_SURFACE_AUDIT_V1.reviewedToolNames,
				...AGENTIC_CHAT_MUTATION_SURFACE_AUDIT_V1.deferredToolNames
			].sort()
		).toEqual(AGENTIC_CHAT_MUTATION_SURFACE_AUDIT_V1.signedToolNames);
	});

	it('keeps all reviewed mutation capabilities disabled unless explicitly supplied', () => {
		const capabilities = normalizeAgenticChatMutationCapabilitiesV1(undefined);

		expect(Object.keys(capabilities)).toHaveLength(20);
		expect(Object.values(capabilities).every((enabled) => enabled === false)).toBe(true);
	});

	it('limits downstream replay claims to the two exact queryable/idempotent adapters', () => {
		const replayable = Object.entries(AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1)
			.filter(([, spec]) => spec.downstreamIdempotencySupported)
			.map(([toolName]) => toolName)
			.sort();

		expect(replayable).toEqual(['create_onto_task', 'create_task_document']);
	});
});

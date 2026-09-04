// apps/worker/tests/agenticChatMutationSurfacePolicy.test.ts
import { describe, expect, it } from 'vitest';
import { AGENTIC_CHAT_WORKER_EXECUTABLE_MUTATION_TOOL_NAMES_V1 } from '@buildos/agentic-chat-runtime';
import {
	AGENTIC_CHAT_CUSTOM_MUTATION_ADAPTERS_V1,
	AGENTIC_CHAT_DEFERRED_MUTATION_TOOLS_V1,
	AGENTIC_CHAT_MUTATION_SURFACE_AUDIT_V1,
	AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1,
	AGENTIC_CHAT_TABLE_MUTATION_TOOL_NAMES_V1,
	normalizeAgenticChatMutationCapabilitiesV1
} from '../src/workers/agentic-chat/mutationToolCatalog';
import {
	AGENTIC_CHAT_MUTATION_ARGUMENT_NORMALIZERS_V1,
	AGENTIC_CHAT_MUTATION_RECEIPT_BUILDERS_V1,
	AGENTIC_CHAT_MUTATION_RECEIPT_POST_PROCESSORS_V1
} from '../src/workers/agentic-chat/mutation-argument-normalizers';

describe('Agentic Chat mutation surface policy', () => {
	it('partitions every signed write into the reviewed or explicitly deferred surface', () => {
		expect(AGENTIC_CHAT_MUTATION_SURFACE_AUDIT_V1.signedToolNames).toHaveLength(39);
		expect(AGENTIC_CHAT_MUTATION_SURFACE_AUDIT_V1.reviewedToolNames).toHaveLength(21);
		expect(AGENTIC_CHAT_MUTATION_SURFACE_AUDIT_V1.deferredToolNames).toHaveLength(18);
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

		expect(Object.keys(capabilities)).toHaveLength(21);
		expect(Object.values(capabilities).every((enabled) => enabled === false)).toBe(true);
	});

	it('matches the shared admission capability contract exactly', () => {
		expect(Object.keys(AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1).sort()).toEqual(
			[...AGENTIC_CHAT_WORKER_EXECUTABLE_MUTATION_TOOL_NAMES_V1].sort()
		);
	});

	it('resolves one executor for every reviewed mutation', () => {
		const withoutExecutor = Object.entries(AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1)
			.filter(([, spec]) => !['table', 'custom'].includes(spec.execution.executor))
			.map(([toolName]) => toolName);

		expect(withoutExecutor).toEqual([]);
		expect(
			[
				...AGENTIC_CHAT_TABLE_MUTATION_TOOL_NAMES_V1,
				...AGENTIC_CHAT_CUSTOM_MUTATION_ADAPTERS_V1.map(([toolName]) => toolName)
			].sort()
		).toEqual([...AGENTIC_CHAT_MUTATION_SURFACE_AUDIT_V1.reviewedToolNames].sort());
		expect(
			AGENTIC_CHAT_CUSTOM_MUTATION_ADAPTERS_V1.map(([toolName]) => toolName).sort()
		).toEqual(['create_onto_project', 'delegate_task']);
	});

	it('keeps every table row pointing at a resolvable named function', () => {
		for (const [toolName, spec] of Object.entries(AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1)) {
			const execution = spec.execution;
			if (execution.executor !== 'table') continue;
			for (const normalizerId of execution.argumentNormalizers ?? []) {
				expect(
					typeof AGENTIC_CHAT_MUTATION_ARGUMENT_NORMALIZERS_V1[normalizerId],
					`${toolName} normalizer ${normalizerId}`
				).toBe('function');
			}
			for (const postProcessorId of execution.receiptPostProcessors ?? []) {
				expect(
					typeof AGENTIC_CHAT_MUTATION_RECEIPT_POST_PROCESSORS_V1[postProcessorId],
					`${toolName} post-processor ${postProcessorId}`
				).toBe('function');
			}
			if (execution.receipt.kind === 'builder') {
				expect(
					typeof AGENTIC_CHAT_MUTATION_RECEIPT_BUILDERS_V1[execution.receipt.builder],
					`${toolName} receipt builder`
				).toBe('function');
			}
		}
	});

	it('keeps every table entity receipt anchored to its canonical operation result', () => {
		for (const [toolName, spec] of Object.entries(AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1)) {
			const execution = spec.execution;
			if (execution.executor !== 'table' || execution.receipt.kind !== 'entity') continue;
			const receipt = execution.receipt;
			// `onto.<entity>.<verb>` names the row the canonical op returns, so the
			// receipt root key cannot drift from the operation it executes.
			const entitySegment = spec.operationName.split('.')[1];

			expect(receipt.rootKey, `${toolName} receipt root key`).toBe(entitySegment);
			if (receipt.expectedIdArgument !== null) {
				expect(
					spec.reviewedArgumentNames,
					`${toolName} receipt expectedIdArgument`
				).toContain(receipt.expectedIdArgument);
				expect(spec.requiredNames, `${toolName} receipt expectedIdArgument`).toContain(
					receipt.expectedIdArgument
				);
			}
			if (receipt.displayField !== null) {
				expect(['name', 'title'], `${toolName} receipt displayField`).toContain(
					receipt.displayField
				);
			}
			expect(receipt.message.length, `${toolName} receipt message`).toBeGreaterThan(0);
		}
	});

	it('limits downstream replay claims to the two exact queryable/idempotent adapters', () => {
		const replayable = Object.entries(AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1)
			.filter(([, spec]) => spec.downstreamIdempotencySupported)
			.map(([toolName]) => toolName)
			.sort();

		expect(replayable).toEqual(['create_onto_task', 'create_task_document']);
	});
});

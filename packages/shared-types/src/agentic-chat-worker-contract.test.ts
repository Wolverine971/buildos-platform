// packages/shared-types/src/agentic-chat-worker-contract.test.ts
import { describe, expect, it } from 'vitest';
import {
	AGENTIC_CHAT_INPUT_ARTIFACT_VERSION,
	AGENTIC_CHAT_REQUEST_HASH_VERSION,
	canonicalizeAgenticChatJson,
	createAgentStreamEventIdV1,
	decideTerminalFinalizationV1,
	freezeTurnInputHistoryV1,
	hashCanonicalAdmissionRequestV1,
	hashTurnInputArtifactContentV1,
	parseAgentStreamEventIdV1,
	type CanonicalAdmissionRequestV1,
	type NormalizedChatAttachmentV1,
	type TurnInputArtifactV1
} from './agentic-chat-worker-contract';

const ATTACHMENT_A: NormalizedChatAttachmentV1 = {
	attachment_kind: 'onto_asset',
	media_type: 'image',
	asset_id: '10000000-0000-4000-8000-000000000001',
	temporary_attachment_id: null,
	project_id: '20000000-0000-4000-8000-000000000001',
	role: 'attachment',
	display_order: 2,
	file_name: 'diagram.png',
	content_type: 'image/png',
	file_size_bytes: 2048,
	width: 1200,
	height: 800,
	checksum_sha256: 'a'.repeat(64),
	ocr_status: 'completed',
	extraction_summary: null,
	extracted_text_preview: 'Release plan'
};

const ATTACHMENT_B: NormalizedChatAttachmentV1 = {
	...ATTACHMENT_A,
	asset_id: '10000000-0000-4000-8000-000000000002',
	display_order: 1,
	file_name: 'timeline.png',
	checksum_sha256: 'b'.repeat(64)
};

function admissionFixture(overrides: Partial<CanonicalAdmissionRequestV1> = {}) {
	return {
		version: AGENTIC_CHAT_REQUEST_HASH_VERSION,
		sessionId: '30000000-0000-4000-8000-000000000001',
		clientTurnId: '40000000-0000-4000-8000-000000000001',
		streamRunId: '50000000-0000-4000-8000-000000000001',
		context: {
			type: 'project',
			entityId: '20000000-0000-4000-8000-000000000001',
			projectId: '20000000-0000-4000-8000-000000000001',
			projectFocus: { title: 'Launch', state: { lane: 2, active: true } }
		},
		message: '  Re\u0301sume\r\nthis plan.  ',
		attachments: [ATTACHMENT_A, ATTACHMENT_B],
		lastTurnContext: { selected: ['timeline', 'risks'], count: 2 },
		voiceNoteGroupId: null,
		preparedPromptLineage: {
			id: '60000000-0000-4000-8000-000000000001',
			acceptedSurfaceProfile: 'project_default'
		},
		...overrides
	} satisfies CanonicalAdmissionRequestV1;
}

function artifactFixture(): TurnInputArtifactV1 {
	return {
		artifactVersion: AGENTIC_CHAT_INPUT_ARTIFACT_VERSION,
		history: [
			{
				sourceMessageId: '70000000-0000-4000-8000-000000000001',
				role: 'user',
				content: 'Keep the exact historical text.',
				attachments: [],
				toolCalls: [],
				toolCallId: null
			},
			{
				sourceMessageId: '70000000-0000-4000-8000-000000000002',
				role: 'assistant',
				content: 'Acknowledged.',
				attachments: [ATTACHMENT_B],
				toolCalls: [{ function: { name: 'onto_project_read' }, id: 'call-1' }],
				toolCallId: null
			}
		],
		prepared: {
			sourcePreparedPromptId: '60000000-0000-4000-8000-000000000001',
			contextPayload: { project: { id: ATTACHMENT_A.project_id, title: 'Launch' } },
			conversationSummary: 'The user is preparing a launch.',
			surfaceProfile: 'project_default',
			systemPrompt: 'You are the BuildOS project agent.',
			promptSections: [{ id: 'context', enabled: true }],
			toolSurface: { names: ['onto_project_read'] }
		},
		createdAt: '2026-07-29T20:00:00.000Z',
		retainUntil: '2026-08-05T20:00:00.000Z',
		contentHash: 'not-part-of-the-content-hash'
	};
}

describe('agentic chat worker v1 contract fixtures', () => {
	it('canonicalizes JSON recursively while preserving array order and explicit null', () => {
		expect(
			canonicalizeAgenticChatJson({
				z: null,
				omit: undefined,
				nested: { b: 2, a: 1 },
				array: [{ y: true, x: false }, 'second']
			})
		).toBe('{"array":[{"x":false,"y":true},"second"],"nested":{"a":1,"b":2},"z":null}');
		expect(() => canonicalizeAgenticChatJson([undefined] as never)).toThrow(/Undefined/);
		expect(() => canonicalizeAgenticChatJson({ value: Number.NaN })).toThrow(/Non-finite/);
	});

	it('pins the normalized semantic admission request SHA-256 fixture', async () => {
		const equivalent = admissionFixture({
			message: 'R\u00e9sume\nthis plan.',
			attachments: [ATTACHMENT_B, ATTACHMENT_A],
			context: {
				projectFocus: { state: { active: true, lane: 2 }, title: 'Launch' },
				type: 'project',
				projectId: '20000000-0000-4000-8000-000000000001',
				entityId: '20000000-0000-4000-8000-000000000001'
			}
		});

		const hash = await hashCanonicalAdmissionRequestV1(admissionFixture());
		expect(await hashCanonicalAdmissionRequestV1(equivalent)).toBe(hash);
		expect(
			await hashCanonicalAdmissionRequestV1({
				...admissionFixture(),
				transportDecisionId: 'excluded-decision',
				executionMode: 'worker_realtime',
				correlationId: 'excluded-correlation'
			} as CanonicalAdmissionRequestV1)
		).toBe(hash);
		expect(hash).toBe('36a2bed38e61d91d942887c3fb82e18b9a49fa666d143cc3e546f2801b5e4b3e');
		expect(
			await hashCanonicalAdmissionRequestV1(
				admissionFixture({ message: 'Resume another plan.' })
			)
		).not.toBe(hash);
	});

	it('hashes immutable execution inputs without retention metadata', async () => {
		const artifact = artifactFixture();
		const hash = await hashTurnInputArtifactContentV1(artifact);
		const sameContentDifferentRetention = {
			...artifact,
			createdAt: '2030-01-01T00:00:00.000Z',
			retainUntil: '2030-01-08T00:00:00.000Z',
			contentHash: 'different-stored-value'
		};

		expect(await hashTurnInputArtifactContentV1(sameContentDifferentRetention)).toBe(hash);
		expect(hash).toBe('d60cad10bd8031720251e36c91cbe685ca79198b2cc59dafec1a7286b8430e2f');

		const changedHistory = artifactFixture();
		changedHistory.history[0]!.content = 'Source history changed after admission.';
		expect(await hashTurnInputArtifactContentV1(changedHistory)).not.toBe(hash);
	});

	it('freezes exact history and excludes the newly admitted user message', () => {
		const source = artifactFixture().history;
		source.push({
			sourceMessageId: '70000000-0000-4000-8000-000000000099',
			role: 'user',
			content: 'This is the newly admitted message.',
			attachments: [],
			toolCalls: [],
			toolCallId: null
		});

		const frozen = freezeTurnInputHistoryV1(source, '70000000-0000-4000-8000-000000000099');
		expect(frozen.map((message) => message.sourceMessageId)).toEqual([
			'70000000-0000-4000-8000-000000000001',
			'70000000-0000-4000-8000-000000000002'
		]);

		source[0]!.content = 'Mutated after the immutable snapshot was built.';
		(source[1]!.toolCalls[0]!.function as { name: string }).name = 'mutated_tool';
		expect(frozen[0]!.content).toBe('Keep the exact historical text.');
		expect(frozen[1]!.toolCalls[0]).toEqual({
			function: { name: 'onto_project_read' },
			id: 'call-1'
		});
	});

	it('uses generation-aware deterministic event identities', () => {
		const turnRunId = '80000000-0000-4000-8000-000000000001';
		expect(createAgentStreamEventIdV1(turnRunId, 0, 1)).toBe(`${turnRunId}:0:1`);
		expect(createAgentStreamEventIdV1(turnRunId, 1, 1)).toBe(`${turnRunId}:1:1`);
		expect(parseAgentStreamEventIdV1(`${turnRunId}:7:42`)).toEqual({
			turnRunId,
			executionGeneration: 7,
			sequenceIndex: 42
		});
		expect(parseAgentStreamEventIdV1(`${turnRunId}:1:0`)).toBeNull();
		expect(() => createAgentStreamEventIdV1(turnRunId, -1, 1)).toThrow(/nonnegative/);
	});

	it('pins the terminal race and stale-generation decisions', () => {
		expect(
			decideTerminalFinalizationV1({
				currentStatus: 'running',
				currentGeneration: 2,
				requestedGeneration: 2,
				requestedStatus: 'completed',
				cancelRequestedAt: '2026-07-29T20:00:00.000Z'
			})
		).toEqual({ decision: 'cancel_requested' });
		expect(
			decideTerminalFinalizationV1({
				currentStatus: 'completed',
				currentGeneration: 2,
				requestedGeneration: 1,
				requestedStatus: 'cancelled',
				cancelRequestedAt: null
			})
		).toEqual({ decision: 'already_terminal', status: 'completed' });
		expect(
			decideTerminalFinalizationV1({
				currentStatus: 'running',
				currentGeneration: 3,
				requestedGeneration: 2,
				requestedStatus: 'failed',
				cancelRequestedAt: null
			})
		).toEqual({ decision: 'stale_generation' });
		expect(
			decideTerminalFinalizationV1({
				currentStatus: 'queued',
				currentGeneration: 0,
				requestedGeneration: 0,
				requestedStatus: 'cancelled',
				cancelRequestedAt: null
			})
		).toEqual({ decision: 'commit', status: 'cancelled' });
		expect(
			decideTerminalFinalizationV1({
				currentStatus: 'queued',
				currentGeneration: 0,
				requestedGeneration: 0,
				requestedStatus: 'completed',
				cancelRequestedAt: null
			})
		).toEqual({ decision: 'invalid_status' });
	});
});
